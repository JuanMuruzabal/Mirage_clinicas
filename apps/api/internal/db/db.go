// Package db maneja la conexión a PostgreSQL vía GORM.
package db

import (
	"fmt"
	"log"
	"os"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// gormLogger — mismo `logger.Default` de GORM (mensaje "\r\n", 200ms de
// umbral para queries lentas, colores), salvo `IgnoreRecordNotFoundError:
// true`. Sin esto, GORM logueaba como si fuera un error cada `First()`/
// `Find()` que legítimamente no encuentra nada — la enorme mayoría del
// código de este proyecto usa "no encontrado" como resultado válido
// (¿ya existe un contador de rate limit para esta clave?, ¿ya hay un
// paciente con este DNI?, ¿este slug es una clínica real?), nunca como un
// fallo real — y esos logs en rojo en Render alarmaban sin que hubiera
// ningún problema de verdad. Un error de Postgres genuino (conexión
// caída, columna inexistente, etc.) sigue logueándose igual, esto no
// silencia nada más que ese caso puntual.
var gormLogger = logger.New(
	log.New(os.Stdout, "\r\n", log.LstdFlags),
	logger.Config{
		SlowThreshold:             200 * time.Millisecond,
		LogLevel:                  logger.Warn,
		IgnoreRecordNotFoundError: true,
		Colorful:                  true,
	},
)

// Connect abre la conexión a Postgres y configura el pool de conexiones.
func Connect(dsn string) (*gorm.DB, error) {
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: gormLogger,
	})
	if err != nil {
		return nil, fmt.Errorf("no se pudo conectar a postgres: %w", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, fmt.Errorf("no se pudo obtener *sql.DB desde gorm: %w", err)
	}

	sqlDB.SetMaxOpenConns(20)
	sqlDB.SetMaxIdleConns(5)
	sqlDB.SetConnMaxLifetime(30 * time.Minute)

	return db, nil
}
