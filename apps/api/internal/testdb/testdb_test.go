package testdb_test

import (
	"testing"

	"dental-mirage/api/internal/testdb"
)

func TestNew_DevuelveUnaConexionUtilizableYAislada(t *testing.T) {
	gdb := testdb.New(t)

	var result int
	if err := gdb.Raw("SELECT 1").Scan(&result).Error; err != nil {
		t.Fatalf("query de humo falló: %v", err)
	}
	if result != 1 {
		t.Errorf("result = %d, esperaba 1", result)
	}
}

func TestShared_DevuelveLaConexionRealNoTransaccional(t *testing.T) {
	gdb := testdb.Shared(t)

	var result int
	if err := gdb.Raw("SELECT 1").Scan(&result).Error; err != nil {
		t.Fatalf("query de humo falló: %v", err)
	}
	if result != 1 {
		t.Errorf("result = %d, esperaba 1", result)
	}
}
