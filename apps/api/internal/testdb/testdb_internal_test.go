package testdb

import "testing"

func TestRequireTestDatabaseName_RechazaBaseSinSufijoTest(t *testing.T) {
	_, err := requireTestDatabaseName("postgres://user:pass@localhost:5432/dental_mirage?sslmode=disable")
	if err == nil {
		t.Fatal("esperaba que rechazara una base que no termina en \"_test\" (red de seguridad de spec §9.6)")
	}
}

func TestRequireTestDatabaseName_AceptaBaseDeTest(t *testing.T) {
	name, err := requireTestDatabaseName("postgres://user:pass@localhost:5432/dental_mirage_test?sslmode=disable")
	if err != nil {
		t.Fatalf("no esperaba error: %v", err)
	}
	if name != "dental_mirage_test" {
		t.Errorf("name = %q, esperaba %q", name, "dental_mirage_test")
	}
}

func TestRequireTestDatabaseName_DSNInvalida(t *testing.T) {
	if _, err := requireTestDatabaseName("://no-es-una-url"); err == nil {
		t.Fatal("esperaba error con una DSN malformada")
	}
}
