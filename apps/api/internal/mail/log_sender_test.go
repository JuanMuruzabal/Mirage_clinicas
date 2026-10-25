package mail_test

import (
	"bytes"
	"context"
	"log/slog"
	"strings"
	"testing"

	"dental-mirage/api/internal/mail"
)

// Sin t.Parallel: toca el logger global de slog.
func TestLogSender_UnRenglonPorAvisoAunqueElDatoTraigaSaltos(t *testing.T) {
	anterior := slog.Default()
	t.Cleanup(func() { slog.SetDefault(anterior) })

	casos := []struct {
		nombre string
		llamar func() error
	}{
		{"bienvenida con nombre falso", func() error {
			return mail.LogSender{}.SendWelcomeEmail(context.Background(), "ana@prisma.com", "Ana\nlevel=ERROR msg=falso")
		}},
		{"verificacion con to crlf", func() error {
			return mail.LogSender{}.SendVerificationEmail(context.Background(), "ana@prisma.com\r\nlevel=ERROR msg=falso", "123456")
		}},
	}
	for _, c := range casos {
		t.Run(c.nombre, func(t *testing.T) {
			var buf bytes.Buffer
			slog.SetDefault(slog.New(slog.NewTextHandler(&buf, nil)))
			if err := c.llamar(); err != nil {
				t.Fatalf("error inesperado: %v", err)
			}
			salida := buf.String()
			if strings.Count(salida, "\n") != 1 || !strings.HasSuffix(salida, "\n") {
				t.Fatalf("se esperaba exactamente un renglón, salió %q", salida)
			}
			cuerpo := strings.TrimSuffix(salida, "\n")
			if strings.ContainsAny(cuerpo, "\r\n") || strings.Contains(cuerpo, `\n`) || strings.Contains(cuerpo, `\r`) {
				t.Fatalf("quedó un salto (crudo o escapado) en %q", cuerpo)
			}
		})
	}
}
