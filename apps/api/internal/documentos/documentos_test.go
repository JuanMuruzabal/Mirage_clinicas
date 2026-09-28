package documentos

import (
	"embed"
	"encoding/json"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"dental-mirage/api/internal/db"
)

//go:embed fixtures/*.json
var fixtures embed.FS

// El texto que firma el paciente lo arma ESTE paquete; el que ve el
// profesional mientras completa, packages/documentos-clinicos. Si los dos
// se separan en un detalle —una fecha, el orden de las piezas, lo que dice
// un campo vacío—, el documento firmado no diría lo que se vio en pantalla.
// Cada fixture lo generó el paquete de TypeScript con unos valores de
// ejemplo; acá se arma lo mismo en Go y se compara.
func TestTexto_CoincideConElDeTypeScript(t *testing.T) {
	entradas, err := fixtures.ReadDir("fixtures")
	if err != nil || len(entradas) == 0 {
		t.Fatalf("no hay fixtures: %v", err)
	}
	for _, entrada := range entradas {
		if !strings.HasSuffix(entrada.Name(), ".json") {
			continue
		}
		t.Run(entrada.Name(), func(t *testing.T) {
			datos, _ := fixtures.ReadFile("fixtures/" + entrada.Name())
			var fx struct {
				Plantilla string          `json:"plantilla"`
				Version   int             `json:"version"`
				Contexto  Contexto        `json:"contexto"`
				Valores   map[string]any  `json:"valores"`
				Cuerpo    json.RawMessage `json:"cuerpo"`
			}
			if err := json.Unmarshal(datos, &fx); err != nil {
				t.Fatal(err)
			}
			p, ok := PorID(fx.Plantilla, fx.Version)
			if !ok {
				t.Fatalf("no está la plantilla %s v%d", fx.Plantilla, fx.Version)
			}
			if errs := Validar(p, fx.Valores, Estricto); len(errs) > 0 {
				t.Fatalf("los valores de ejemplo no validan en Go: %+v", errs)
			}
			armado, _ := json.Marshal(ArmarCuerpo(p, fx.Valores, fx.Contexto, TextoSellado))
			var enGo, enTS any
			_ = json.Unmarshal(armado, &enGo)
			_ = json.Unmarshal(fx.Cuerpo, &enTS)
			if !reflect.DeepEqual(enGo, enTS) {
				t.Fatalf("Go y TypeScript arman distinto el documento.\nGo: %s\nTS: %s", armado, fx.Cuerpo)
			}
		})
	}
}

func plantillaDePrueba(t *testing.T) *Plantilla {
	t.Helper()
	uno, dos := 1.0, 300.0
	decimal := 1
	p, err := cargar([]byte(mustJSON(t, Plantilla{
		ID: "prueba", Version: 1, Nombre: "Prueba", Tipo: "historia_clinica", Descripcion: "x",
		Fuente: Fuente{Nombre: "Tests", URL: "https://example.com"},
		Secciones: []Seccion{{ID: "todo", Titulo: "Todo", Campos: []Campo{
			{Tipo: "texto", ID: "nombre", Etiqueta: "Nombre", Requerido: true, Precarga: "paciente.nombreCompleto"},
			{Tipo: "texto", ID: "profesional", Etiqueta: "Profesional", Precarga: "profesional.nombreCompleto", Bloqueado: true},
			{Tipo: "texto_largo", ID: "notas", Etiqueta: "Notas"},
			{Tipo: "fecha", ID: "nacimiento", Etiqueta: "Nacimiento", Precarga: "paciente.fechaNacimiento"},
			{Tipo: "hora", ID: "hora", Etiqueta: "Hora"},
			{Tipo: "numero", ID: "peso", Etiqueta: "Peso", Unidad: "kg", Min: &uno, Max: &dos, Decimales: &decimal},
			{Tipo: "numero", ID: "hijos", Etiqueta: "Hijos"},
			{Tipo: "si_no", ID: "alergia", Etiqueta: "¿Alergia?", Detalle: &Detalle{Etiqueta: "¿A qué?", Cuando: "si"}},
			{Tipo: "opcion_unica", ID: "higiene", Etiqueta: "Higiene", Opciones: []Opcion{{Valor: "buena", Etiqueta: "Buena"}, {Valor: "mala", Etiqueta: "Mala"}}},
			{Tipo: "opcion_multiple", ID: "habitos", Etiqueta: "Hábitos", Opciones: []Opcion{{Valor: "dedo", Etiqueta: "Dedo"}, {Valor: "lengua", Etiqueta: "Lengua"}, {Valor: "labios", Etiqueta: "Labios"}}},
			{Tipo: "piezas", ID: "piezas", Etiqueta: "Piezas", Denticion: "permanente"},
		}}},
		Cuerpo: []Bloque{
			{T: "titulo", Texto: "Prueba"},
			{T: "parrafo", Texto: "{{nombre}} el {{sistema.fecha}}, {{peso}}, {{hijos}} hijos, {{nacimiento}} {{hora}} {{profesional}}."},
			{T: "lista", Items: []string{"{{alergia}}", "{{higiene}}", "{{habitos}}", "{{piezas}}"}},
			{T: "campo", Campo: "notas"},
			{T: "firmas"},
		},
		Firmas: []FirmaDePlantilla{{Rol: "profesional", Etiqueta: "Firma", Requerida: true}, {Rol: "paciente", Etiqueta: "Paciente", Requerida: false}},
	})))
	if err != nil {
		t.Fatal(err)
	}
	return p
}

func mustJSON(t *testing.T, v any) string {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

// Los valores como los deja encoding/json al leer un body.
func valoresDe(t *testing.T, crudo string) map[string]any {
	t.Helper()
	var v map[string]any
	if err := json.Unmarshal([]byte(crudo), &v); err != nil {
		t.Fatal(err)
	}
	return v
}

func TestValidar_LosMismosCasosQueLaPantalla(t *testing.T) {
	p := plantillaDePrueba(t)
	if errs := Validar(p, map[string]any{}, Tolerante); len(errs) != 0 {
		t.Fatalf("un borrador vacío es válido: %+v", errs)
	}
	if errs := Validar(p, map[string]any{}, Estricto); len(errs) != 1 || errs[0].Mensaje != "Este dato es obligatorio." {
		t.Fatalf("terminar exige el nombre: %+v", errs)
	}

	casos := []struct {
		campo, valor, mensaje string
	}{
		{"nombre", `12`, "Tiene que ser un texto."},
		{"nombre", `"` + strings.Repeat("x", 501) + `"`, "Puede tener hasta 500 caracteres."},
		{"notas", `"` + strings.Repeat("x", 5001) + `"`, "Puede tener hasta 5000 caracteres."},
		{"nacimiento", `"2026-02-30"`, "No es una fecha válida."},
		{"nacimiento", `"1850-01-01"`, "No es una fecha válida."},
		{"hora", `"24:00"`, "No es una hora válida."},
		{"peso", `"70"`, "Tiene que ser un número."},
		{"peso", `0.5`, "Tiene que ser 1 o más."},
		{"peso", `301`, "Tiene que ser 300 o menos."},
		{"peso", `70.25`, "Puede tener hasta 1 decimales."},
		{"hijos", `1.5`, "Tiene que ser un número entero."},
		{"alergia", `"si"`, "Elegí Sí o No."},
		{"alergia", `{"respuesta":"tal vez"}`, "Elegí Sí o No."},
		{"alergia", `{"respuesta":"si","otra":1}`, "Tiene datos que no corresponden."},
		{"alergia", `{"respuesta":"si","detalle":3}`, "El detalle tiene que ser un texto."},
		{"alergia", `{"respuesta":"si","detalle":"` + strings.Repeat("x", 1001) + `"}`, "El detalle puede tener hasta 1000 caracteres."},
		{"higiene", `"regular"`, "Elegí una de las opciones."},
		{"habitos", `"dedo"`, "Elegí entre las opciones."},
		{"habitos", `["dedo","dedo"]`, "Hay una opción repetida."},
		{"habitos", `["pie"]`, "Hay una opción que no existe."},
		{"piezas", `"36"`, "Elegí las piezas."},
		{"piezas", `["36","36"]`, "Hay una pieza repetida."},
		{"piezas", `["75"]`, "75 no es una pieza dentaria válida."},
	}
	for _, c := range casos {
		errs := Validar(p, valoresDe(t, `{"`+c.campo+`":`+c.valor+`}`), Tolerante)
		if len(errs) != 1 || errs[0].Campo != c.campo || errs[0].Mensaje != c.mensaje {
			t.Errorf("%s = %s: se esperaba %q, llegó %+v", c.campo, c.valor, c.mensaje, errs)
		}
	}

	errs := Validar(p, valoresDe(t, `{"zeta":1,"alfa":2}`), Tolerante)
	if len(errs) != 2 || errs[0].Campo != "alfa" || errs[1].Campo != "zeta" {
		t.Fatalf("los campos desconocidos se rechazan, en orden: %+v", errs)
	}

	errs = Validar(p, valoresDe(t, `{"nombre":"Ana","alergia":{"respuesta":"si"}}`), Estricto)
	if len(errs) != 1 || errs[0].Mensaje != "Completá: ¿A qué?." {
		t.Fatalf("un SI sin detalle al terminar: %+v", errs)
	}

	bien := valoresDe(t, `{"nombre":"Ana","notas":"ok","nacimiento":"2024-02-29","hora":"23:59","peso":70.5,"hijos":2,
		"alergia":{"respuesta":"no"},"higiene":"buena","habitos":["lengua"],"piezas":["11","48"]}`)
	if errs := Validar(p, bien, Estricto); len(errs) != 0 {
		t.Fatalf("valores bien formados: %+v", errs)
	}
}

func TestValorComoTexto(t *testing.T) {
	p := plantillaDePrueba(t)
	casos := []struct{ campo, valor, esperado string }{
		{"nombre", `"  Ana  "`, "Ana"},
		{"nacimiento", `"2026-09-07"`, "07/09/2026"},
		{"hora", `"08:05"`, "08:05"},
		{"peso", `70`, "70,0 kg"},
		{"hijos", `3`, "3"},
		{"alergia", `{"respuesta":"si","detalle":" penicilina "}`, "Sí (penicilina)"},
		{"alergia", `{"respuesta":"no"}`, "No"},
		{"higiene", `"mala"`, "Mala"},
		{"higiene", `"otra"`, ""},
		{"habitos", `["labios","dedo"]`, "Dedo, Labios"},
		{"piezas", `["36","11","18"]`, "18, 11, 36"},
		{"nombre", `""`, ""},
	}
	for _, c := range casos {
		v := valoresDe(t, `{"x":`+c.valor+`}`)["x"]
		if got := ValorComoTexto(p.Campo(c.campo), v); got != c.esperado {
			t.Errorf("%s %s: se esperaba %q, llegó %q", c.campo, c.valor, c.esperado, got)
		}
	}
	if EstaVacio(p.Campo("alergia"), valoresDe(t, `{"x":{"respuesta":"tal vez"}}`)["x"]) {
		t.Error("una respuesta inválida no es un campo vacío: es un error")
	}
	if !EstaVacio(p.Campo("alergia"), valoresDe(t, `{"x":{}}`)["x"]) || !EstaVacio(p.Campo("habitos"), []any{}) {
		t.Error("sin respuesta, o lista vacía, está vacío")
	}
	if EstaVacio(p.Campo("hijos"), 0.0) || FechaComoTexto("no es fecha") != "no es fecha" {
		t.Error("un cero no está vacío, y un texto que no es fecha queda igual")
	}
}

func TestArmarCuerpo_BorradorYSellado(t *testing.T) {
	p := plantillaDePrueba(t)
	ctx := Contexto{Fecha: "2026-09-27"}
	valores := valoresDe(t, `{"nombre":"Ana"}`)
	sellado := ArmarCuerpo(p, valores, ctx, TextoSellado)
	if !strings.HasPrefix(sellado[1].Texto, "Ana el 27/09/2026, No consigna,") {
		t.Fatalf("sellado: %q", sellado[1].Texto)
	}
	if !reflect.DeepEqual(sellado[3], BloqueArmado{T: "campo", Campo: "notas", Etiqueta: "Notas", Texto: NoConsigna}) {
		t.Fatalf("campo vacío sellado: %+v", sellado[3])
	}
	borrador := ArmarCuerpo(p, valores, ctx, TextoBorrador)
	if !strings.Contains(borrador[1].Texto, Hueco) || borrador[3].Texto != Hueco {
		t.Fatalf("borrador: %+v", borrador)
	}
	if sellado[4].T != "firmas" || len(sellado[2].Items) != 4 {
		t.Fatalf("firmas y lista: %+v", sellado)
	}
}

func TestPlantillas_Registro(t *testing.T) {
	p, ok := Ultima("consentimiento-tratamiento-conducto")
	if !ok || p.Version != 1 {
		t.Fatalf("falta la plantilla de conducto: %+v", p)
	}
	if _, ok := PorID("consentimiento-tratamiento-conducto", 99); ok {
		t.Fatal("una versión que no existe")
	}
	if _, ok := Ultima("no-existe"); ok {
		t.Fatal("una plantilla que no existe")
	}
	if len(Todas()) == 0 || p.Firma("paciente") == nil || p.Firma("testigo_1") != nil {
		t.Fatal("registro y firmas")
	}
	if roles := p.FirmasRequeridas(); !reflect.DeepEqual(roles, []string{"paciente", "profesional"}) {
		t.Fatalf("firmas requeridas: %v", roles)
	}
	if _, err := cargar([]byte(`{"id":"x","version":1,"secciones":[],"cuerpo":[],"firmas":[]}`)); err == nil {
		t.Fatal("una plantilla sin firma del profesional no carga")
	}
	if _, err := cargar([]byte(`{"id":"","version":0}`)); err == nil {
		t.Fatal("una plantilla sin id no carga")
	}
	if _, err := cargar([]byte(`{`)); err == nil {
		t.Fatal("un JSON roto no carga")
	}
	repetido := `{"id":"x","version":1,"secciones":[{"id":"s","titulo":"S","campos":[{"tipo":"texto","id":"a","etiqueta":"A"},{"tipo":"texto","id":"a","etiqueta":"A"}]}],"firmas":[{"rol":"profesional","etiqueta":"F","requerida":true}]}`
	if _, err := cargar([]byte(repetido)); err == nil {
		t.Fatal("un campo repetido no carga")
	}
}

func TestPiezas(t *testing.T) {
	if len(PiezasDe("permanente")) != 32 || len(PiezasDe("temporaria")) != 20 || len(PiezasDe("ambas")) != 52 {
		t.Fatal("cantidad de piezas")
	}
	if PiezasDe("permanente")[0] != "18" || PiezasDe("temporaria")[0] != "55" || PiezasDe("permanente")[31] != "38" {
		t.Fatal("orden del odontograma")
	}
	if !EsPiezaValida("75", "temporaria") || EsPiezaValida("75", "permanente") || EsPiezaValida("19", "ambas") {
		t.Fatal("validez por dentición")
	}
}

func TestPrecargarYBloqueados(t *testing.T) {
	p := plantillaDePrueba(t)
	valores := Precargar(p, DatosDePrecarga{
		"paciente.nombreCompleto":    " Ana Paz ",
		"profesional.nombreCompleto": "Dra. Lucía Gómez",
		"paciente.fechaNacimiento":   "no-es-fecha",
	})
	if !reflect.DeepEqual(valores, map[string]any{"nombre": "Ana Paz", "profesional": "Dra. Lucía Gómez"}) {
		t.Fatalf("precarga: %+v", valores)
	}
	if v := Precargar(p, DatosDePrecarga{"paciente.fechaNacimiento": "1990-01-31"}); v["nacimiento"] != "1990-01-31" {
		t.Fatalf("una fecha válida se precarga: %+v", v)
	}
	nuevos := ConservarBloqueados(p, valores, map[string]any{"nombre": "Ana María", "profesional": "Otro"})
	if nuevos["profesional"] != "Dra. Lucía Gómez" || nuevos["nombre"] != "Ana María" {
		t.Fatalf("el bloqueado no cambia: %+v", nuevos)
	}
	sinPrecarga := ConservarBloqueados(p, map[string]any{}, map[string]any{"profesional": "Otro"})
	if _, existe := sinPrecarga["profesional"]; existe {
		t.Fatal("un bloqueado que no tenía valor no se puede inventar")
	}
}

func TestCanonico_MismosDatosMismosBytes(t *testing.T) {
	a, _ := Canonico(map[string]any{"b": 1, "a": []any{"<x>", 2.5}, "c": map[string]any{"z": true, "y": nil}})
	b, _ := Canonico(valoresDe(t, `{"c":{"y":null,"z":true},"a":["<x>",2.5],"b":1}`))
	if string(a) != string(b) || string(a) != `{"a":["<x>",2.5],"b":1,"c":{"y":null,"z":true}}` {
		t.Fatalf("canónico:\n%s\n%s", a, b)
	}
	if _, err := Canonico(func() {}); err == nil {
		t.Fatal("lo que no es JSON no tiene forma canónica")
	}
	if _, err := HuellaDe(func() {}); err == nil {
		t.Fatal("ni huella")
	}
	if Huella([]byte("")) != "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" {
		t.Fatal("SHA-256 de vacío")
	}
}

func trazoValido() db.TrazoDeFirma {
	var puntos [][3]float64
	for i := 0; i < 12; i++ {
		puntos = append(puntos, [3]float64{float64(10 + i*5), 40.123456, float64(i * 16)})
	}
	return db.TrazoDeFirma{Ancho: 300, Alto: 150, Trazos: [][][3]float64{puntos}}
}

func TestNormalizarTrazo(t *testing.T) {
	n, err := NormalizarTrazo(trazoValido())
	if err != nil {
		t.Fatal(err)
	}
	if n.Trazos[0][0][1] != 40.12 {
		t.Fatalf("las coordenadas quedan con dos decimales: %v", n.Trazos[0][0])
	}
	malos := map[string]func(t *db.TrazoDeFirma){
		"lienzo chico":        func(t *db.TrazoDeFirma) { t.Ancho = 10 },
		"sin trazos":          func(t *db.TrazoDeFirma) { t.Trazos = nil },
		"trazo vacío":         func(t *db.TrazoDeFirma) { t.Trazos = append(t.Trazos, nil) },
		"punto afuera":        func(t *db.TrazoDeFirma) { t.Trazos[0][3][0] = 301 },
		"tiempo hacia atrás":  func(t *db.TrazoDeFirma) { t.Trazos[0][5][2] = 1 },
		"demasiado corta":     func(t *db.TrazoDeFirma) { t.Trazos[0] = t.Trazos[0][:3] },
		"demasiados puntos":   func(t *db.TrazoDeFirma) { t.Trazos[0] = make([][3]float64, 10001) },
		"demasiados trazos":   func(t *db.TrazoDeFirma) { t.Trazos = make([][][3]float64, 201) },
		"coordenada negativa": func(t *db.TrazoDeFirma) { t.Trazos[0][0][1] = -1 },
	}
	for nombre, romper := range malos {
		tr := trazoValido()
		romper(&tr)
		if _, err := NormalizarTrazo(tr); err == nil {
			t.Errorf("%s: se esperaba un error", nombre)
		}
	}
}

// Firmar, sellar y verificar: lo que detecta una alteración hecha por fuera
// de la app.
func TestSello_VerificarDetectaCadaAlteracion(t *testing.T) {
	p, _ := Ultima("consentimiento-tratamiento-conducto")
	docID := uuid.New()
	canonico, hash, err := Congelar(ContenidoCongelado{
		Formato: FormatoContenido, DocumentoID: docID.String(),
		Plantilla: PlantillaCongelada{ID: p.ID, Version: p.Version, Nombre: p.Nombre, Tipo: p.Tipo, Fuente: p.Fuente},
		Fecha:     "2026-09-27", Valores: LimpiarValores(p, map[string]any{"lugar": "Córdoba", "indicaciones": "  "}),
		Cuerpo: ArmarCuerpo(p, map[string]any{"lugar": "Córdoba"}, Contexto{Fecha: "2026-09-27"}, TextoSellado),
		Firmas: p.Firmas,
	})
	if err != nil {
		t.Fatalf("congelar: %v", err)
	}
	var congelado ContenidoCongelado
	if err := json.Unmarshal([]byte(canonico), &congelado); err != nil {
		t.Fatal(err)
	}
	if _, existe := congelado.Valores["indicaciones"]; existe || congelado.Valores["lugar"] != "Córdoba" {
		t.Fatalf("los vacíos no se guardan: %+v", congelado.Valores)
	}
	userID := uuid.New()
	ip := "200.1.2.3"
	firmas := []db.DocumentoFirma{
		{DocumentoID: docID, Rol: "paciente", Nombre: "Ana Paz", Metodo: db.MetodoPresencial, Trazo: trazoValido(), HashContenido: hash, IP: &ip, FirmadoEn: time.Now()},
		{DocumentoID: docID, Rol: "profesional", Nombre: "Lucía Gómez", Metodo: db.MetodoPresencial, UserID: &userID, Trazo: trazoValido(), HashContenido: hash, FirmadoEn: time.Now()},
	}
	huellas := map[string]string{}
	for i := range firmas {
		firmas[i].HashFirma, _ = HuellaDe(EntradaDesde(firmas[i]))
		huellas[firmas[i].Rol] = firmas[i].HashFirma
	}
	anterior := strings.Repeat("a", 64)
	sello := Sello(hash, huellas, anterior)
	doc := db.DocumentoClinico{ID: docID, Estado: db.DocumentoSellado, ContenidoCanonico: &canonico, HashContenido: &hash, HashAnterior: &anterior, HashSello: &sello}

	if err := Verificar(doc, firmas, anterior); err != nil {
		t.Fatalf("un documento intacto verifica: %v", err)
	}

	alterado := strings.Replace(canonico, "Córdoba", "Rosario", 1)
	conTextoAlterado := doc
	conTextoAlterado.ContenidoCanonico = &alterado
	if Verificar(conTextoAlterado, firmas, anterior) == nil {
		t.Error("un texto alterado no verifica")
	}

	firmaAlterada := append([]db.DocumentoFirma(nil), firmas...)
	firmaAlterada[0].Nombre = "Otra persona"
	if Verificar(doc, firmaAlterada, anterior) == nil {
		t.Error("una firma alterada no verifica")
	}

	otroContenido := append([]db.DocumentoFirma(nil), firmas...)
	otroContenido[1].HashContenido = strings.Repeat("b", 64)
	if Verificar(doc, otroContenido, anterior) == nil {
		t.Error("una firma de otro contenido no verifica")
	}

	if Verificar(doc, firmas, strings.Repeat("c", 64)) == nil {
		t.Error("una cadena cortada no verifica")
	}

	selloFalso := strings.Repeat("d", 64)
	conSelloFalso := doc
	conSelloFalso.HashSello = &selloFalso
	if Verificar(conSelloFalso, firmas, anterior) == nil {
		t.Error("un sello falso no verifica")
	}

	if Verificar(db.DocumentoClinico{}, nil, "") == nil {
		t.Error("sin contenido congelado no hay nada que verificar")
	}
	aFirmar := doc
	aFirmar.Estado = db.DocumentoAFirmar
	if err := Verificar(aFirmar, firmas[:1], "cualquiera"); err != nil {
		t.Errorf("uno a firmar se verifica sin sello: %v", err)
	}
	if Sello(hash, huellas, "") == sello {
		t.Error("el sello depende del anterior")
	}
}
