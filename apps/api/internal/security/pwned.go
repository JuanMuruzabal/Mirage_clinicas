package security

import (
	"bufio"
	"context"
	"crypto/sha1" //nolint:gosec // SHA-1 es el algoritmo que exige la API de HaveIBeenPwned (k-anonymity), no se usa para nada criptográfico propio.
	"encoding/hex"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// pwnedRangeURL sigue el protocolo k-anonymity de HaveIBeenPwned: solo se
// manda el prefijo de 5 caracteres del hash SHA-1 de la contraseña, nunca
// la contraseña ni el hash completo (spec §7).
const pwnedRangeURL = "https://api.pwnedpasswords.com/range/"

// PwnedChecker decide si una contraseña aparece en una filtración conocida.
// Interfaz para poder mockear en tests sin pegarle a la red real.
type PwnedChecker interface {
	IsPwned(ctx context.Context, password string) (bool, error)
}

// HTTPPwnedChecker es la implementación real, contra la API pública de
// HaveIBeenPwned. Best-effort: cualquier error de red/timeout no debe
// bloquear un registro — el caller decide fail-open (ver IsPwnedFailOpen).
type HTTPPwnedChecker struct {
	Client *http.Client
	// BaseURL: vacío usa pwnedRangeURL (la API real). Solo se pisa en
	// tests, contra un httptest.Server — nunca en código de producción.
	BaseURL string
}

func NewHTTPPwnedChecker() *HTTPPwnedChecker {
	return &HTTPPwnedChecker{Client: &http.Client{Timeout: 3 * time.Second}}
}

func (c *HTTPPwnedChecker) IsPwned(ctx context.Context, password string) (bool, error) {
	sum := sha1.Sum([]byte(password)) //nolint:gosec // ver comentario del import más arriba
	full := strings.ToUpper(hex.EncodeToString(sum[:]))
	prefix, suffix := full[:5], full[5:]

	base := c.BaseURL
	if base == "" {
		base = pwnedRangeURL
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, base+prefix, nil)
	if err != nil {
		return false, fmt.Errorf("no se pudo armar la request a HaveIBeenPwned: %w", err)
	}
	// Header recomendado por la propia API para pedir que no cuente
	// contraseñas con padding (ruido) en la respuesta — simplifica el parseo.
	req.Header.Set("Add-Padding", "false")

	resp, err := c.Client.Do(req)
	if err != nil {
		return false, fmt.Errorf("no se pudo consultar HaveIBeenPwned: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return false, fmt.Errorf("HaveIBeenPwned respondió %d", resp.StatusCode)
	}

	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		hashSuffix, countStr, ok := strings.Cut(line, ":")
		if !ok {
			continue
		}
		if !strings.EqualFold(hashSuffix, suffix) {
			continue
		}
		count, err := strconv.Atoi(strings.TrimSpace(countStr))
		if err != nil {
			return false, fmt.Errorf("respuesta de HaveIBeenPwned con formato inesperado: %w", err)
		}
		return count > 0, nil
	}
	if err := scanner.Err(); err != nil {
		return false, fmt.Errorf("no se pudo leer la respuesta de HaveIBeenPwned: %w", err)
	}
	return false, nil
}

// IsPwnedFailOpen envuelve un PwnedChecker para el caso de uso real
// (registro/reset de password): si el chequeo falla por cualquier motivo
// (HIBP caído, timeout, red), NO bloquea el flujo — se loguea la falla vía
// onError y se sigue como si la contraseña no estuviera filtrada. Bloquear
// un registro entero porque un servicio de terceros no respondió sería
// peor que dejar pasar el chequeo esa vez (decisión documentada en el plan
// aprobado / docs/tradeoffs.md).
func IsPwnedFailOpen(ctx context.Context, checker PwnedChecker, password string, onError func(error)) bool {
	pwned, err := checker.IsPwned(ctx, password)
	if err != nil {
		if onError != nil {
			onError(err)
		}
		return false
	}
	return pwned
}
