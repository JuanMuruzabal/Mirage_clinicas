package mail

import (
	"bytes"
	"embed"
	"fmt"
	"html/template"
)

//go:embed templates/*.html
var templatesFS embed.FS

var (
	verificationTpl      = template.Must(template.ParseFS(templatesFS, "templates/verification.html"))
	passwordResetTpl     = template.Must(template.ParseFS(templatesFS, "templates/password_reset.html"))
	welcomeTpl           = template.Must(template.ParseFS(templatesFS, "templates/welcome.html"))
	turnoVerificacionTpl = template.Must(template.ParseFS(templatesFS, "templates/turno_verificacion.html"))
)

type verificationData struct{ Code string }
type passwordResetData struct{ ResetURL string }
type welcomeData struct{ Nombre string }
type turnoVerificacionData struct {
	Code          string
	NombreClinica string
}

func renderVerificationEmail(code string) (subject, html string, err error) {
	var buf bytes.Buffer
	if err := verificationTpl.Execute(&buf, verificationData{Code: code}); err != nil {
		return "", "", fmt.Errorf("no se pudo renderizar el mail de verificación: %w", err)
	}
	return "Tu código de confirmación de Dental Mirage", buf.String(), nil
}

// renderTurnoVerificacionEmail — Extra 2.3.5 (E5.6): "Confirmanos que sos
// vos" del wizard público de pedido de turno, distinto del mail de
// verificación de CUENTA de arriba (otro texto, otro asunto — acá no hay
// ninguna cuenta de por medio, es un visitante anónimo pidiendo un turno).
func renderTurnoVerificacionEmail(code, nombreClinica string) (subject, html string, err error) {
	var buf bytes.Buffer
	if err := turnoVerificacionTpl.Execute(&buf, turnoVerificacionData{Code: code, NombreClinica: nombreClinica}); err != nil {
		return "", "", fmt.Errorf("no se pudo renderizar el mail de verificación de turno: %w", err)
	}
	return fmt.Sprintf("Tu código para pedir turno en %s", nombreClinica), buf.String(), nil
}

func renderPasswordResetEmail(resetURL string) (subject, html string, err error) {
	var buf bytes.Buffer
	if err := passwordResetTpl.Execute(&buf, passwordResetData{ResetURL: resetURL}); err != nil {
		return "", "", fmt.Errorf("no se pudo renderizar el mail de recuperación: %w", err)
	}
	return "Recuperá tu contraseña de Dental Mirage", buf.String(), nil
}

func renderWelcomeEmail(nombre string) (subject, html string, err error) {
	var buf bytes.Buffer
	if err := welcomeTpl.Execute(&buf, welcomeData{Nombre: nombre}); err != nil {
		return "", "", fmt.Errorf("no se pudo renderizar el mail de bienvenida: %w", err)
	}
	return "¡Bienvenido/a a Dental Mirage!", buf.String(), nil
}
