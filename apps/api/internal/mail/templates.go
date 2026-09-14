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
	turnoConfirmadoTpl   = template.Must(template.ParseFS(templatesFS, "templates/turno_confirmado.html"))
	invitacionTpl        = template.Must(template.ParseFS(templatesFS, "templates/invitacion_colaborador.html"))
)

type verificationData struct{ Code string }
type passwordResetData struct{ ResetURL string }
type welcomeData struct{ Nombre string }

// InvitacionColaboradorInfo — los datos del mail con el que una clínica
// suma a alguien a su equipo (Fase 3.2.4). Va en un struct por el mismo
// motivo que TurnoConfirmadoInfo: una firma con seis strings sueltos se
// equivoca de orden tarde o temprano.
type InvitacionColaboradorInfo struct {
	NombreClinica string
	// InvitadoPor — nombre de quien invita. Vacío si no se pudo resolver;
	// el texto se adapta.
	InvitadoPor string
	// Rol tal como se le muestra a la persona ("Profesional",
	// "Recepcionista"), no el valor interno.
	Rol   string
	Email string
	URL   string
	// Vence ya formateada, ej. "20 de septiembre de 2026".
	Vence string
}
type turnoVerificacionData struct {
	Code          string
	NombreClinica string
}

func renderVerificationEmail(code string) (subject, html string, err error) {
	var buf bytes.Buffer
	if err := verificationTpl.Execute(&buf, verificationData{Code: code}); err != nil {
		return "", "", fmt.Errorf("no se pudo renderizar el mail de verificación: %w", err)
	}
	return "Tu código de confirmación de PRISMA", buf.String(), nil
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

// renderTurnoConfirmadoEmail — pedido textual del cliente: "cada vez que
// se saque un turno, enviar una notificación por mail, al mail con el
// que se hizo el turno".
func renderTurnoConfirmadoEmail(info TurnoConfirmadoInfo) (subject, html string, err error) {
	var buf bytes.Buffer
	if err := turnoConfirmadoTpl.Execute(&buf, info); err != nil {
		return "", "", fmt.Errorf("no se pudo renderizar el mail de turno confirmado: %w", err)
	}
	return fmt.Sprintf("Turno confirmado en %s", info.NombreClinica), buf.String(), nil
}

func renderPasswordResetEmail(resetURL string) (subject, html string, err error) {
	var buf bytes.Buffer
	if err := passwordResetTpl.Execute(&buf, passwordResetData{ResetURL: resetURL}); err != nil {
		return "", "", fmt.Errorf("no se pudo renderizar el mail de recuperación: %w", err)
	}
	return "Recuperá tu contraseña de PRISMA", buf.String(), nil
}

func renderInvitacionColaboradorEmail(info InvitacionColaboradorInfo) (subject, html string, err error) {
	var buf bytes.Buffer
	if err := invitacionTpl.Execute(&buf, info); err != nil {
		return "", "", fmt.Errorf("no se pudo renderizar el mail de invitación: %w", err)
	}
	return fmt.Sprintf("Te invitaron a %s en PRISMA", info.NombreClinica), buf.String(), nil
}

func renderWelcomeEmail(nombre string) (subject, html string, err error) {
	var buf bytes.Buffer
	if err := welcomeTpl.Execute(&buf, welcomeData{Nombre: nombre}); err != nil {
		return "", "", fmt.Errorf("no se pudo renderizar el mail de bienvenida: %w", err)
	}
	return "¡Bienvenido/a a PRISMA!", buf.String(), nil
}
