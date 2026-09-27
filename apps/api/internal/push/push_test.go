package push

import (
	"context"
	"crypto/ecdh"
	"crypto/ecdsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"math/big"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func enviadorDePrueba(t *testing.T) *VAPIDEnviador {
	t.Helper()
	publica, privada, err := GenerarClaves()
	if err != nil {
		t.Fatal(err)
	}
	v, err := NuevoVAPID(publica, privada, "mailto:soporte@example.com")
	if err != nil {
		t.Fatalf("NuevoVAPID: %v", err)
	}
	return v
}

func TestNuevoVAPID_Validaciones(t *testing.T) {
	publica, privada, _ := GenerarClaves()
	otraPublica, _, _ := GenerarClaves()

	if _, err := NuevoVAPID(otraPublica, privada, "mailto:a@b.com"); err == nil {
		t.Error("una clave pública que no corresponde a la privada tendría que fallar")
	}
	if _, err := NuevoVAPID(publica, "no-es-base64!!", "mailto:a@b.com"); err == nil {
		t.Error("una privada que no es base64url tendría que fallar")
	}
	if _, err := NuevoVAPID(publica, privada, "soporte@b.com"); err == nil {
		t.Error("un sujeto sin mailto: ni https:// tendría que fallar")
	}
	if _, err := NuevoVAPID(publica, privada, "https://miragesoftware.online"); err != nil {
		t.Errorf("un sujeto https tendría que andar: %v", err)
	}
}

// El JWT de VAPID: audiencia = origen del endpoint, vence en 12 h, y una
// firma ES256 (r||s) que valida con la clave pública.
func TestFirmar_JWTValido(t *testing.T) {
	v := enviadorDePrueba(t)
	ahora := time.Date(2026, 9, 26, 12, 0, 0, 0, time.UTC)
	jwt, err := v.firmar("https://fcm.googleapis.com/fcm/send/abc123", ahora)
	if err != nil {
		t.Fatal(err)
	}
	partes := strings.Split(jwt, ".")
	if len(partes) != 3 {
		t.Fatalf("el JWT tiene %d partes", len(partes))
	}
	crudo, _ := base64.RawURLEncoding.DecodeString(partes[1])
	var reclamos struct {
		Aud string `json:"aud"`
		Exp int64  `json:"exp"`
		Sub string `json:"sub"`
	}
	if err := json.Unmarshal(crudo, &reclamos); err != nil {
		t.Fatal(err)
	}
	if reclamos.Aud != "https://fcm.googleapis.com" {
		t.Errorf("aud = %q, esperaba el origen del servicio", reclamos.Aud)
	}
	if reclamos.Exp != ahora.Add(12*time.Hour).Unix() {
		t.Errorf("exp = %d", reclamos.Exp)
	}
	if reclamos.Sub != "mailto:soporte@example.com" {
		t.Errorf("sub = %q", reclamos.Sub)
	}

	firma, _ := base64.RawURLEncoding.DecodeString(partes[2])
	if len(firma) != 64 {
		t.Fatalf("la firma mide %d bytes, ES256 son 64", len(firma))
	}
	resumen := sha256.Sum256([]byte(partes[0] + "." + partes[1]))
	r := new(big.Int).SetBytes(firma[:32])
	s := new(big.Int).SetBytes(firma[32:])
	if !ecdsa.Verify(&v.privada.PublicKey, resumen[:], r, s) {
		t.Error("la firma no valida con la clave pública")
	}
}

// Un navegador de mentira: el servicio de push recibe el aviso cifrado y
// firmado, y según el status del servicio, Enviar devuelve lo que
// corresponde.
func TestEnviar_ContraUnServicioDePrueba(t *testing.T) {
	v := enviadorDePrueba(t)
	navegador, _ := ecdh.P256().GenerateKey(nil)
	sub := Suscripcion{
		P256dh: base64.RawURLEncoding.EncodeToString(navegador.PublicKey().Bytes()),
		Auth:   base64.RawURLEncoding.EncodeToString([]byte("0123456789abcdef")),
	}

	casos := []struct {
		status int
		quiere error
	}{
		{http.StatusCreated, nil},
		{http.StatusGone, ErrSuscripcionVencida},
		{http.StatusNotFound, ErrSuscripcionVencida},
	}
	for _, c := range casos {
		var recibido *http.Request
		var cuerpo []byte
		servicio := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			recibido = r
			cuerpo, _ = io.ReadAll(r.Body)
			w.WriteHeader(c.status)
		}))
		sub.Endpoint = servicio.URL + "/push/xyz"
		err := v.Enviar(context.Background(), sub, Mensaje{Titulo: "Turno nuevo", Cuerpo: "Juan", URL: "/panel"})
		servicio.Close()

		if !errors.Is(err, c.quiere) {
			t.Errorf("status %d: err = %v, esperaba %v", c.status, err, c.quiere)
		}
		if recibido.Header.Get("Content-Encoding") != "aes128gcm" {
			t.Errorf("Content-Encoding = %q", recibido.Header.Get("Content-Encoding"))
		}
		if !strings.HasPrefix(recibido.Header.Get("Authorization"), "vapid t=") ||
			!strings.Contains(recibido.Header.Get("Authorization"), ", k="+v.ClavePublica()) {
			t.Errorf("Authorization = %q", recibido.Header.Get("Authorization"))
		}
		if recibido.Header.Get("TTL") == "" {
			t.Error("falta el TTL")
		}
		// El cuerpo empieza con el salt (16) + tamaño de registro 4096.
		if len(cuerpo) < 21 || cuerpo[16] != 0 || cuerpo[17] != 0 || cuerpo[18] != 0x10 || cuerpo[19] != 0 {
			t.Errorf("el encabezado aes128gcm no tiene el tamaño de registro esperado")
		}
		if strings.Contains(string(cuerpo), "Turno nuevo") {
			t.Error("el aviso viajó sin cifrar")
		}
	}

	servicio := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer servicio.Close()
	sub.Endpoint = servicio.URL
	if err := v.Enviar(context.Background(), sub, Mensaje{Titulo: "x"}); err == nil || errors.Is(err, ErrSuscripcionVencida) {
		t.Errorf("un 500 del servicio tendría que ser un error común, no una suscripción vencida: %v", err)
	}
}

func TestLogEnviador_NoManda(t *testing.T) {
	var e Enviador = LogEnviador{}
	if e.ClavePublica() != "" {
		t.Error("sin configurar, la clave pública tiene que estar vacía")
	}
	if err := e.Enviar(context.Background(), Suscripcion{Endpoint: "https://x"}, Mensaje{}); err != nil {
		t.Error(err)
	}
}
