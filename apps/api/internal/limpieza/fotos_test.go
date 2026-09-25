package limpieza_test

import (
	"context"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/limpieza"
	"dental-mirage/api/internal/storage"
	"dental-mirage/api/internal/testdb"
)

// Una página con fotos en los tres lugares donde puede haber una: la
// portada, la config de un módulo y la foto jsonb de una versión publicada.
func paginaConFotos(t *testing.T, gdb *gorm.DB, portada, modulo, version string) {
	t.Helper()
	owner := db.User{Email: uuid.NewString() + "@example.com", OnboardingStep: "completo"}
	if err := gdb.Create(&owner).Error; err != nil {
		t.Fatal(err)
	}
	clinica := db.Clinic{Nombre: "Clínica de prueba", Tipo: "individual", Slug: uuid.NewString(), OwnerID: owner.ID}
	if err := gdb.Create(&clinica).Error; err != nil {
		t.Fatal(err)
	}
	pagina := db.PaginaPublica{ClinicID: clinica.ID, FotoPortadaURL: &portada}
	if err := gdb.Create(&pagina).Error; err != nil {
		t.Fatal(err)
	}
	mod := db.PaginaPublicaModulo{PaginaPublicaID: pagina.ID, Tipo: "galeria", Visible: true, Config: map[string]any{"fotoUrls": []any{modulo}}}
	if err := gdb.Create(&mod).Error; err != nil {
		t.Fatal(err)
	}
	v := db.PaginaPublicaVersion{
		PaginaPublicaID: pagina.ID, Numero: 1, PublicadaEn: time.Now(),
		Contenido: db.PaginaPublicaContenidoVersion{Modulos: []db.PaginaPublicaContenidoModulo{{Tipo: "foto", Visible: true, Config: map[string]any{"fotoUrl": version}}}},
	}
	if err := gdb.Create(&v).Error; err != nil {
		t.Fatal(err)
	}
}

// Un archivo en el storage local, con la fecha de escritura que se le pida.
func archivo(t *testing.T, dir, nombre string, edad time.Duration) {
	t.Helper()
	ruta := filepath.Join(dir, nombre)
	if err := os.WriteFile(ruta, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	cuando := time.Now().Add(-edad)
	if err := os.Chtimes(ruta, cuando, cuando); err != nil {
		t.Fatal(err)
	}
}

func quedan(t *testing.T, dir string) []string {
	t.Helper()
	entradas, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	var nombres []string
	for _, e := range entradas {
		nombres = append(nombres, e.Name())
	}
	sort.Strings(nombres)
	return nombres
}

func TestFotosHuerfanas_BorraSoloLoQueNadieUsaYTieneMasDe24h(t *testing.T) {
	gdb := testdb.New(t)
	dir := t.TempDir()
	store, err := storage.NewLocalStorage(dir, "/uploads")
	if err != nil {
		t.Fatal(err)
	}
	viejo := 48 * time.Hour
	paginaConFotos(t, gdb, "/uploads/portada.w1600.webp", "/uploads/galeria.jpg", "/uploads/version.png")

	archivo(t, dir, "portada.w1600.webp", viejo)
	archivo(t, dir, "portada.w480.webp", viejo) // variante de una foto en uso: se queda con ella
	archivo(t, dir, "galeria.jpg", viejo)
	archivo(t, dir, "version.png", viejo) // solo la usa una versión publicada: restaurarla la necesita
	archivo(t, dir, "huerfana.w960.webp", viejo)
	archivo(t, dir, "huerfana.w480.webp", viejo)
	archivo(t, dir, "recien-subida.jpg", time.Hour) // nadie la usa todavía, pero puede estar por guardarse
	archivo(t, dir, "notas.txt", viejo)             // no tiene forma de foto subida: no es de la app

	res, err := limpieza.FotosHuerfanas(context.Background(), gdb, store, time.Now())
	if err != nil {
		t.Fatalf("FotosHuerfanas: %v", err)
	}
	if res.Borradas != 2 || res.Revisadas != 7 {
		t.Errorf("resultado = %+v, esperaba 7 revisadas y 2 borradas", res)
	}
	esperado := []string{"galeria.jpg", "notas.txt", "portada.w1600.webp", "portada.w480.webp", "recien-subida.jpg", "version.png"}
	if got := quedan(t, dir); strings.Join(got, ",") != strings.Join(esperado, ",") {
		t.Errorf("quedaron %v, esperaba %v", got, esperado)
	}
}

func TestFotosHuerfanas_SinArchivosNoHaceNada(t *testing.T) {
	gdb := testdb.New(t)
	store, err := storage.NewLocalStorage(t.TempDir(), "/uploads")
	if err != nil {
		t.Fatal(err)
	}
	res, err := limpieza.FotosHuerfanas(context.Background(), gdb, store, time.Now())
	if err != nil || res.Borradas != 0 || res.Revisadas != 0 {
		t.Errorf("res = %+v, err = %v", res, err)
	}
}
