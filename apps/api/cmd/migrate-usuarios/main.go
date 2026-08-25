// Command migrate-usuarios corre, una sola vez, la migración de datos que
// traslada cada Profesional existente (esquema viejo) a User +
// ProfessionalProfile + Clinic + ClinicMember (esquema nuevo,
// docs/feature-sumarte-login.md). A propósito NO es parte de `go run
// ./cmd/migrate` (que aplica AutoMigrate y es idempotente/automático en
// cada deploy) — esto es una migración de datos explícita, se corre a
// mano una vez. Es seguro reintentarla: internal/db.MigrateProfesionalesToUsers
// saltea los Profesional que ya tienen un User con el mismo email.
//
// Uso:
//
//	go run ./cmd/migrate-usuarios
package main

import (
	"log"

	"github.com/joho/godotenv"

	"dental-mirage/api/internal/config"
	"dental-mirage/api/internal/db"
)

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("no se encontró .env, usando variables de entorno del sistema")
	}

	cfg := config.Load()

	gormDB, err := db.Connect(cfg.DBUrl)
	if err != nil {
		log.Fatalf("error conectando a la base de datos: %v", err)
	}

	migrated, skipped, err := db.MigrateProfesionalesToUsers(gormDB)
	if err != nil {
		log.Fatalf("error migrando profesionales existentes: %v", err)
	}

	log.Printf("migración de usuarios completa: %d migrados, %d ya estaban migrados (saltados)", migrated, skipped)
}
