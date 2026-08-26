package http

import (
	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/db"
)

// recordAuditEvent persiste un evento sensible (spec §7: "log de auditoría
// de eventos sensibles [...] con userId, IP, user-agent y timestamp — sin
// datos sensibles ni secretos"). userID puede ser nil (ej. login fallido
// contra un email que no existe — ver el comentario en db.AuditEvent).
//
// Best-effort, igual que el envío de mails (createAndSendVerificationToken):
// un problema para escribir el registro de auditoría nunca tumba el
// request que lo originó, solo se silencia — no hay logger estructurado
// inyectado en este paquete todavía.
func recordAuditEvent(gdb *gorm.DB, userID *uuid.UUID, eventType, ip, userAgent string) {
	event := db.AuditEvent{UserID: userID, EventType: eventType, IP: ip, UserAgent: userAgent}
	_ = gdb.Create(&event).Error
}
