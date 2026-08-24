package db

import (
	"fmt"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// CatalogoEspecialidades es la lista cerrada predefinida por Mirage
// (TR-004 en docs/tradeoffs.md) — el profesional selecciona de acá al
// registrarse (spec §3), no crea especialidades libres. El catálogo entero
// se siembra siempre; cuáles quedan VISIBLES hoy lo decide
// EspecialidadesVisibles, más abajo (TR-011).
var CatalogoEspecialidades = []string{
	"Odontología general",
	"Ortodoncia",
	"Periodoncia",
	"Endodoncia",
	"Odontopediatría",
	"Cirugía maxilofacial",
	"Implantología",
	"Estética dental",
	"Prótesis dental",
	"Odontología preventiva",
}

// EspecialidadesVisibles (TR-011, 2026-08-22): subconjunto de
// CatalogoEspecialidades que GET /especialidades expone hoy — el resto
// queda sembrado pero oculto (Especialidad.Activa = false) hasta que el
// cliente confirme la lista completa (spec §7.4). Ampliar la lista visible
// más adelante es cambiar este slice, no una migración de datos.
var EspecialidadesVisibles = []string{
	"Odontología general",
}

// SeedEspecialidadesCatalogo asegura que el catálogo cerrado exista y
// sincroniza qué especialidades quedan activas — idempotente, se llama
// desde RunMigrations en cada arranque/migración, no solo la primera vez.
func SeedEspecialidadesCatalogo(gdb *gorm.DB) error {
	especialidades := make([]Especialidad, len(CatalogoEspecialidades))
	for i, nombre := range CatalogoEspecialidades {
		especialidades[i] = Especialidad{Nombre: nombre}
	}
	if err := gdb.Clauses(clause.OnConflict{DoNothing: true}).Create(&especialidades).Error; err != nil {
		return fmt.Errorf("seed de especialidades falló: %w", err)
	}

	// ON CONFLICT DO NOTHING no toca filas ya existentes — sin este paso,
	// una fila sembrada antes de un cambio en EspecialidadesVisibles se
	// quedaría con el Activa viejo para siempre.
	if err := gdb.Model(&Especialidad{}).Where("nombre IN ?", EspecialidadesVisibles).Update("activa", true).Error; err != nil {
		return fmt.Errorf("no se pudo activar el catálogo visible: %w", err)
	}
	if err := gdb.Model(&Especialidad{}).Where("nombre NOT IN ?", EspecialidadesVisibles).Update("activa", false).Error; err != nil {
		return fmt.Errorf("no se pudo ocultar el resto del catálogo: %w", err)
	}
	return nil
}
