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

	// La política de migraciones destructivas se resuelve UNA SOLA VEZ,
	// acá, a partir de la Config ya cargada — nunca leyendo variables de
	// entorno desde internal/db. Es la lección de TR-125: dos lugares
	// decidiendo "¿estamos en producción?" con criterios propios terminan
	// discrepando, y el hueco entre los dos es donde vive el bug.
	//
	// En `development` va permitido (borrar datos de prueba no le importa
	// a nadie). Fuera de ahí hace falta DB_ALLOW_DESTRUCTIVE=true, puesta
	// a conciencia para ESA corrida y con un backup hecho — ver
	// PoliticaDestructiva en internal/db/migrate_destructiva.go.
	politica := db.PoliticaDestructiva{
		Permitir: cfg.Env == "development" || cfg.AllowDestructiveMigrations,
		Entorno:  cfg.Env,
	}
	if err := db.RunMigrationsConPolitica(gormDB, politica); err != nil {
		log.Fatalf("error aplicando migraciones: %v", err)
	}

	log.Println("migraciones aplicadas correctamente")
}
