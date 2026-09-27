// Package push manda avisos a los navegadores donde una persona activó las
// notificaciones (Web Push, TR-179): el celular con PRISMA instalado, o la
// compu con el navegador cerrado.
//
// Mismo patrón que internal/mail (spec §9.4): una interfaz, una
// implementación de desarrollo que solo loguea, y la real, que se activa
// con VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY (ver buildPush en cmd/api). Sin
// esas variables nada se rompe: la bandeja de notificaciones funciona
// igual, y el botón para activar avisos no aparece.
package push

import (
	"bytes"
	"context"
	"crypto/ecdh"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Suscripcion — lo que el navegador entrega al activar los avisos.
type Suscripcion struct {
	Endpoint string
	P256dh   string // clave pública del navegador, base64url
	Auth     string // secreto de autenticación, base64url
}

// Mensaje — lo que muestra el aviso. El service worker de la web
// (apps/web/public/sw.js) lo recibe como JSON con estos mismos nombres.
type Mensaje struct {
	Titulo string `json:"titulo"`
	Cuerpo string `json:"cuerpo"`
	// URL — adónde lleva tocar el aviso (una ruta de la web, relativa).
	URL string `json:"url"`
	// Tag — avisos con el mismo tag se reemplazan en vez de apilarse.
	Tag string `json:"tag,omitempty"`
}

// ErrSuscripcionVencida — el servicio de push dice que ese navegador ya no
// existe (la persona revocó el permiso o desinstaló). Hay que borrarla: si
// no, cada aviso le vuelve a pegar a un endpoint muerto.
var ErrSuscripcionVencida = errors.New("push: la suscripción ya no existe")

type Enviador interface {
	Enviar(ctx context.Context, s Suscripcion, m Mensaje) error
	// ClavePublica — la que el navegador necesita para suscribirse. Vacía
	// = los avisos no están configurados.
	ClavePublica() string
}

// LogEnviador — desarrollo y tests: no manda nada.
type LogEnviador struct{}

func (LogEnviador) Enviar(_ context.Context, s Suscripcion, m Mensaje) error {
	slog.Info("push (sin configurar, no se envía)", "titulo", m.Titulo, "endpoint", recortar(s.Endpoint))
	return nil
}

func (LogEnviador) ClavePublica() string { return "" }

// VAPIDEnviador — el envío real, firmado con VAPID (RFC 8292) y cifrado con
// RFC 8291 (cifrado.go).
type VAPIDEnviador struct {
	privada      *ecdsa.PrivateKey
	clavePublica string
	sujeto       string
	cliente      *http.Client
}

// NuevoVAPID — `publica` y `privada` en base64url (las que imprime
// `go run ./cmd/vapid`); `sujeto` es un `mailto:` o una URL https de
// contacto, que los servicios de push exigen.
func NuevoVAPID(publica, privada, sujeto string) (*VAPIDEnviador, error) {
	crudaPrivada, err := base64.RawURLEncoding.DecodeString(strings.TrimSpace(privada))
	if err != nil {
		return nil, fmt.Errorf("push: VAPID_PRIVATE_KEY no es base64url: %w", err)
	}
	clave, err := ecdsa.ParseRawPrivateKey(elliptic.P256(), crudaPrivada)
	if err != nil {
		return nil, fmt.Errorf("push: VAPID_PRIVATE_KEY inválida: %w", err)
	}
	derivada, err := clave.PublicKey.Bytes()
	if err != nil {
		return nil, err
	}
	if base64.RawURLEncoding.EncodeToString(derivada) != strings.TrimSpace(publica) {
		return nil, errors.New("push: VAPID_PUBLIC_KEY no corresponde a VAPID_PRIVATE_KEY")
	}
	if !strings.HasPrefix(sujeto, "mailto:") && !strings.HasPrefix(sujeto, "https://") {
		return nil, errors.New("push: VAPID_SUBJECT tiene que ser un mailto: o una URL https")
	}
	return &VAPIDEnviador{
		privada:      clave,
		clavePublica: strings.TrimSpace(publica),
		sujeto:       sujeto,
		cliente:      &http.Client{Timeout: 10 * time.Second},
	}, nil
}

func (v *VAPIDEnviador) ClavePublica() string { return v.clavePublica }

func (v *VAPIDEnviador) Enviar(ctx context.Context, s Suscripcion, m Mensaje) error {
	uaPublica, err := base64.RawURLEncoding.DecodeString(strings.TrimRight(s.P256dh, "="))
	if err != nil {
		return fmt.Errorf("push: p256dh inválido: %w", err)
	}
	auth, err := base64.RawURLEncoding.DecodeString(strings.TrimRight(s.Auth, "="))
	if err != nil {
		return fmt.Errorf("push: auth inválido: %w", err)
	}
	contenido, err := json.Marshal(m)
	if err != nil {
		return err
	}
	efimera, salt, err := nuevosParametros()
	if err != nil {
		return err
	}
	cuerpo, err := cifrarMensaje(contenido, uaPublica, auth, salt, efimera)
	if err != nil {
		return err
	}
	jwt, err := v.firmar(s.Endpoint, time.Now())
	if err != nil {
		return err
	}

	pedido, err := http.NewRequestWithContext(ctx, http.MethodPost, s.Endpoint, bytes.NewReader(cuerpo))
	if err != nil {
		return err
	}
	pedido.Header.Set("Content-Encoding", "aes128gcm")
	pedido.Header.Set("Content-Type", "application/octet-stream")
	// Un día: un turno nuevo que llega con el celular apagado sigue
	// valiendo la pena al prenderlo; más tarde ya no.
	pedido.Header.Set("TTL", "86400")
	pedido.Header.Set("Urgency", "high")
	pedido.Header.Set("Authorization", "vapid t="+jwt+", k="+v.clavePublica)

	respuesta, err := v.cliente.Do(pedido)
	if err != nil {
		return fmt.Errorf("push: no se pudo contactar al servicio: %w", err)
	}
	defer func() { _ = respuesta.Body.Close() }()
	_, _ = io.Copy(io.Discard, io.LimitReader(respuesta.Body, 4096))

	switch {
	case respuesta.StatusCode >= 200 && respuesta.StatusCode < 300:
		return nil
	case respuesta.StatusCode == http.StatusNotFound || respuesta.StatusCode == http.StatusGone:
		return ErrSuscripcionVencida
	default:
		return fmt.Errorf("push: el servicio respondió %d", respuesta.StatusCode)
	}
}

// firmar arma el JWT de VAPID (RFC 8292 §2): ES256, con la audiencia en el
// ORIGEN del servicio de push (no la URL completa del endpoint) y una
// validez de 12 h — el máximo que aceptan es 24.
func (v *VAPIDEnviador) firmar(endpoint string, ahora time.Time) (string, error) {
	u, err := url.Parse(endpoint)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return "", fmt.Errorf("push: endpoint inválido")
	}
	encabezado := base64.RawURLEncoding.EncodeToString([]byte(`{"typ":"JWT","alg":"ES256"}`))
	reclamos, err := json.Marshal(map[string]any{
		"aud": u.Scheme + "://" + u.Host,
		"exp": ahora.Add(12 * time.Hour).Unix(),
		"sub": v.sujeto,
	})
	if err != nil {
		return "", err
	}
	aFirmar := encabezado + "." + base64.RawURLEncoding.EncodeToString(reclamos)
	resumen := sha256.Sum256([]byte(aFirmar))
	r, s, err := ecdsa.Sign(rand.Reader, v.privada, resumen[:])
	if err != nil {
		return "", err
	}
	// ES256 = r y s de 32 bytes cada uno, uno detrás del otro (RFC 7518),
	// no la codificación ASN.1 que devuelve SignASN1.
	firma := make([]byte, 64)
	r.FillBytes(firma[:32])
	s.FillBytes(firma[32:])
	return aFirmar + "." + base64.RawURLEncoding.EncodeToString(firma), nil
}

// GenerarClaves — un par VAPID nuevo, en base64url, para cargar en las
// variables de entorno. Lo usa `go run ./cmd/vapid`.
func GenerarClaves() (publica, privada string, err error) {
	clave, err := ecdh.P256().GenerateKey(rand.Reader)
	if err != nil {
		return "", "", err
	}
	return base64.RawURLEncoding.EncodeToString(clave.PublicKey().Bytes()),
		base64.RawURLEncoding.EncodeToString(clave.Bytes()), nil
}

// recortar — el endpoint identifica un dispositivo: en los logs alcanza
// con el principio.
func recortar(s string) string {
	if len(s) > 40 {
		return s[:40] + "…"
	}
	return s
}
