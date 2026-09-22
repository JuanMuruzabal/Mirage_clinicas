package db_test

import (
	"strings"
	"testing"

	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/testdb"
)

// CHECK del catálogo de temas de la página pública (Fase 4.3, ver
// internal/http/temas_pagina_publica.go y el comentario grande en
// migrate.go). Mismo criterio que migrate_fk_test.go: la única prueba que
// vale es intentar la operación prohibida y ver que la base la rechaza —
// no alcanza con confirmar que la constraint existe.
//
// Ojo: el CHECK valida que cada columna pertenezca a SU PROPIO catálogo
// plano (todas las variantes válidas de cualquier tema, por ejemplo) — no
// que la variante pertenezca al tema elegido en esa misma fila. Esa
// relación cruzada (ej. "clinico-1" con tema="calido") la valida
// `temaEsValido` en el handler, no la base, y ya tiene su propio test en
// pagina_publica_test.go (TestActualizarPaginaPublica_RechazaVarianteDeOtroTema).

func TestCheck_RechazaTemaFueraDelCatalogo(t *testing.T) {
	gdb := testdb.New(t)
	clinicaID, _ := crearProfesionalDePrueba(t, gdb)

	pagina := db.PaginaPublica{ClinicID: clinicaID, Tema: "no-existe"}
	err := gdb.Create(&pagina).Error
	if err == nil {
		t.Fatal("se creó una página con un tema fuera del catálogo — chk_pagina_publica_tema no está mordiendo")
	}
	if !strings.Contains(err.Error(), "chk_pagina_publica_tema") {
		t.Errorf("el rechazo no vino de chk_pagina_publica_tema: %v", err)
	}
}

func TestCheck_RechazaVarianteFueraDelCatalogo(t *testing.T) {
	gdb := testdb.New(t)
	clinicaID, _ := crearProfesionalDePrueba(t, gdb)

	pagina := db.PaginaPublica{ClinicID: clinicaID, TemaVariante: "no-existe"}
	err := gdb.Create(&pagina).Error
	if err == nil {
		t.Fatal("se creó una página con una variante fuera del catálogo — chk_pagina_publica_tema_variante no está mordiendo")
	}
	if !strings.Contains(err.Error(), "chk_pagina_publica_tema_variante") {
		t.Errorf("el rechazo no vino de chk_pagina_publica_tema_variante: %v", err)
	}
}

func TestCheck_RechazaTipografiaFueraDelCatalogo(t *testing.T) {
	gdb := testdb.New(t)
	clinicaID, _ := crearProfesionalDePrueba(t, gdb)

	pagina := db.PaginaPublica{ClinicID: clinicaID, TemaTipografia: "comic-sans"}
	err := gdb.Create(&pagina).Error
	if err == nil {
		t.Fatal("se creó una página con una tipografía fuera del catálogo — chk_pagina_publica_tema_tipografia no está mordiendo")
	}
	if !strings.Contains(err.Error(), "chk_pagina_publica_tema_tipografia") {
		t.Errorf("el rechazo no vino de chk_pagina_publica_tema_tipografia: %v", err)
	}
}

// TestCheck_PaginaAceptaTemaVarianteYTipografiaReales — el contrapeso: el
// camino legítimo (y el default "" de la Fase 4.1, sin elegir todavía)
// siguen funcionando.
func TestCheck_PaginaAceptaTemaVarianteYTipografiaReales(t *testing.T) {
	gdb := testdb.New(t)
	clinicaID, _ := crearProfesionalDePrueba(t, gdb)

	pagina := db.PaginaPublica{ClinicID: clinicaID, Tema: "clinico", TemaVariante: "clinico-2", TemaTipografia: "serif-clasica"}
	if err := gdb.Create(&pagina).Error; err != nil {
		t.Fatalf("una página con un tema/variante/tipografía REALES tiene que poder crearse: %v", err)
	}
}

func TestCheck_PaginaAceptaSinTemaElegidoTodavia(t *testing.T) {
	gdb := testdb.New(t)
	clinicaID, _ := crearProfesionalDePrueba(t, gdb)

	pagina := db.PaginaPublica{ClinicID: clinicaID}
	if err := gdb.Create(&pagina).Error; err != nil {
		t.Fatalf("una página sin tema elegido todavía (\"\", default de la Fase 4.1) tiene que poder crearse: %v", err)
	}
}

// PE-2: el CHECK se arma desde el catálogo en cada corrida (DROP + ADD), así
// que un tema sumado al catálogo la base lo acepta sin tocar SQL a mano. Con
// el patrón viejo (`EXCEPTION WHEN duplicate_object`) este test fallaba: la
// constraint quedaba con la lista del día en que se creó.
func TestCheck_AceptaLosTemasNuevosDelCatalogo(t *testing.T) {
	gdb := testdb.New(t)
	clinicaID, _ := crearProfesionalDePrueba(t, gdb)

	pagina := db.PaginaPublica{ClinicID: clinicaID, Tema: "oscuro", TemaVariante: "oscuro-1", TemaTipografia: "editorial-suave"}
	if err := gdb.Create(&pagina).Error; err != nil {
		t.Fatalf("la base rechazó un tema del catálogo: %v", err)
	}
}
