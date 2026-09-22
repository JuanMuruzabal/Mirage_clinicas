package prismaengine

import "testing"

// El init() del paquete ya habría hecho panic al cargar el paquete si algún
// JSON generado estuviera roto — estos tests fijan el contrato que
// internal/http/pagina_publica.go y temas_pagina_publica.go dan por
// sentado, así que si algo se rompe, se nota acá primero.

func TestTipoDeModuloValido(t *testing.T) {
	// "horarios" es válido pero sin Editor/render todavía (PE-6 lo resuelve,
	// ver el comentario de ESQUEMAS_MODULOS en packages/prisma-engine/src/schemas.ts)
	for _, tipo := range []string{"sobre_nosotros", "texto_libre", "especialidades", "foto", "galeria", "estadisticas", "contacto", "horarios"} {
		if !TipoDeModuloValido(tipo) {
			t.Errorf("%q debería ser un tipo de módulo válido", tipo)
		}
	}
	for _, tipo := range []string{"portada", "turno", "inventado"} {
		if TipoDeModuloValido(tipo) {
			t.Errorf("%q no debería ser un tipo de módulo válido", tipo)
		}
	}
}

func TestValidarConfigDeModulo(t *testing.T) {
	casos := []struct {
		nombre string
		tipo   string
		config map[string]any
		valido bool
	}{
		{"tipo inexistente", "inventado", map[string]any{}, false},
		{"horarios sin config (sin editor todavía, PE-6)", "horarios", map[string]any{}, true},
		{"sobre_nosotros sin config", "sobre_nosotros", map[string]any{}, true},
		{"sobre_nosotros con nombre válido", "sobre_nosotros", map[string]any{"nombre": "Institucional"}, true},
		{"sobre_nosotros con nombre de otro tipo", "sobre_nosotros", map[string]any{"nombre": 5}, false},
		{"sobre_nosotros con clave desconocida", "sobre_nosotros", map[string]any{"bio": "x"}, false},
		{"foto con subtipo válido", "foto", map[string]any{"fotoUrl": "/uploads/x.jpg", "subtipo": "banner"}, true},
		{"foto sin subtipo (obligatorio)", "foto", map[string]any{"fotoUrl": "/uploads/x.jpg"}, false},
		{"foto con subtipo inválido", "foto", map[string]any{"subtipo": "cuadrada"}, false},
		{"foto con URL insegura", "foto", map[string]any{"subtipo": "banner", "fotoUrl": "javascript:alert(1)"}, false},
		{"galeria dentro del tope", "galeria", map[string]any{"fotoUrls": []any{"/uploads/a.jpg", "/uploads/b.jpg"}}, true},
		{"galeria arriba del tope", "galeria", map[string]any{"fotoUrls": []any{"a", "b", "c", "d", "e", "f", "g", "h", "i"}}, false},
		{"estadisticas con id válido", "estadisticas", map[string]any{"mostrar": []any{"pacientes_atendidos"}}, true},
		{"estadisticas con id inválido", "estadisticas", map[string]any{"mostrar": []any{"turnos_inventados"}}, false},
		{"texto_libre dentro de los largos", "texto_libre", map[string]any{"titulo": "Hola", "texto": "Texto corto"}, true},
		// PE-3: variantes y opciones de sección.
		{"galeria con variante válida y opciones de sección", "galeria", map[string]any{"variante": "mosaico", "fondoSeccion": "acento", "tituloPublico": "Fotos"}, true},
		{"galeria con variante de otro módulo", "galeria", map[string]any{"variante": "franja"}, false},
		{"fondo de sección inventado", "contacto", map[string]any{"fondoSeccion": "neon"}, false},
		{"sobre_nosotros con foto al costado", "sobre_nosotros", map[string]any{"variante": "con-foto", "fotoUrl": "/uploads/x.jpg"}, true},
		{"sobre_nosotros con foto insegura", "sobre_nosotros", map[string]any{"variante": "con-foto", "fotoUrl": "javascript:alert(1)"}, false},
	}
	for _, c := range casos {
		t.Run(c.nombre, func(t *testing.T) {
			err := ValidarConfigDeModulo(c.tipo, c.config)
			if c.valido && err != nil {
				t.Errorf("esperaba config válida, dio error: %v", err)
			}
			if !c.valido && err == nil {
				t.Errorf("esperaba error de validación, no dio ninguno")
			}
		})
	}
}

func TestTemaEsValido(t *testing.T) {
	if !TemaEsValido("", "") {
		t.Error(`"" + "" debería ser válido (sin elegir)`)
	}
	if !TemaEsValido("clasico", "clasico-2") {
		t.Error("clasico/clasico-2 debería ser válido")
	}
	if TemaEsValido("clasico", "calido-1") {
		t.Error("una variante de otro tema no debería ser válida")
	}
	if TemaEsValido("inventado", "x") {
		t.Error("un tema inexistente no debería ser válido")
	}
}

func TestTipografiaEsValida(t *testing.T) {
	if !TipografiaEsValida("") {
		t.Error(`"" debería ser válida (sin elegir)`)
	}
	if !TipografiaEsValida("serif-clasica") {
		t.Error("serif-clasica debería ser válida")
	}
	if TipografiaEsValida("inventada") {
		t.Error("una tipografía inexistente no debería ser válida")
	}
}

func TestValidarTokensDeTema(t *testing.T) {
	if err := ValidarTokensDeTema(map[string]any{}); err != nil {
		t.Errorf("sin overrides tiene que ser válido: %v", err)
	}
	if err := ValidarTokensDeTema(map[string]any{"forma": "recta", "menu": "barra", "portada": "fondo"}); err != nil {
		t.Errorf("tokens válidos rechazados: %v", err)
	}
	if ValidarTokensDeTema(map[string]any{"forma": "triangular"}) == nil {
		t.Error("aceptó una opción fuera del catálogo")
	}
	if ValidarTokensDeTema(map[string]any{"colorLibre": "#ff0000"}) == nil {
		t.Error("aceptó una clave desconocida (nada de valores libres)")
	}
}

func TestIDsDelCatalogo_IncluyenLosTemasNuevos(t *testing.T) {
	// Los CHECK de la base se arman con esto (internal/db, checksDelCatalogoDeTemas):
	// si un tema del catálogo no aparece, la base lo rechazaría.
	temas := map[string]bool{}
	for _, id := range IDsDeTemas() {
		temas[id] = true
	}
	for _, id := range []string{"calido", "editorial", "oscuro"} {
		if !temas[id] {
			t.Errorf("IDsDeTemas no incluye %q", id)
		}
	}
	if !TemaEsValido("oscuro", "oscuro-3") || TemaEsValido("oscuro", "editorial-1") {
		t.Error("la relación tema↔variante de los temas nuevos no se respeta")
	}
}
