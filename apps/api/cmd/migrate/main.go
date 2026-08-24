// Command migrate aplica el esquema de base de datos. Uso:
//
//	go run ./cmd/migrate
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

	if err := db.RunMigrations(gormDB); err != nil {
		log.Fatalf("error aplicando migraciones: %v", err)
	}

	log.Println("migraciones aplicadas correctamente")
}
