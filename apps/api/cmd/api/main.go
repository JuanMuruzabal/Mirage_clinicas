// Command api arranca el backend HTTP de Dental Mirage.
package main

import (
	"log"
	"net/http"

	"github.com/joho/godotenv"

	"dental-mirage/api/internal/config"
	"dental-mirage/api/internal/db"
	apihttp "dental-mirage/api/internal/http"
)

func main() {
	// .env es opcional (útil en desarrollo local); en producción las
	// variables de entorno las provee la plataforma de deploy.
	if err := godotenv.Load(); err != nil {
		log.Println("no se encontró .env, usando variables de entorno del sistema")
	}

	cfg := config.Load()

	gormDB, err := db.Connect(cfg.DBUrl)
	if err != nil {
		log.Fatalf("error conectando a la base de datos: %v", err)
	}

	router := apihttp.NewRouter(gormDB, cfg.JWTSecret, cfg.CORSAllowedOrigins)

	log.Printf("dental-mirage api escuchando en :%s (env=%s)", cfg.Port, cfg.Env)
	if err := http.ListenAndServe(":"+cfg.Port, router); err != nil {
		log.Fatalf("error arrancando el servidor: %v", err)
	}
}
