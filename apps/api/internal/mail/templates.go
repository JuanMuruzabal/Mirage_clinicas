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
	verificationTpl  = template.Must(template.ParseFS(templatesFS, "templates/verification.html"))
	passwordResetTpl = template.Must(template.ParseFS(templatesFS, "templates/password_reset.html"))
	welcomeTpl       = template.Must(template.ParseFS(templatesFS, "templates/welcome.html"))
)

type verificationData struct{ Code string }
type passwordResetData struct{ ResetURL string }
type welcomeData struct{ Nombre string }

func renderVerificationEmail(code string) (subject, html string, err error) {
	var buf bytes.Buffer
	if err := verificationTpl.Execute(&buf, verificationData{Code: code}); err != nil {
		return "", "", fmt.Errorf("no se pudo renderizar el mail de verificación: %w", err)
	}
	return "Tu código de confirmación de Dental Mirage", buf.String(), nil
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
