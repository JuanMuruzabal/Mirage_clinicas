package documentos

import (
	"bytes"
	"compress/zlib"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"regexp"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"golang.org/x/text/encoding/charmap"

	"dental-mirage/api/internal/db"
)

// --- CodigoDeVerificacion ------------------------------------------------

var formatoDeCodigo = regexp.MustCompile(`^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$`)

func TestCodigoDeVerificacion_FormatoYAlfabeto(t *testing.T) {
	sellos := []string{
		strings.Repeat("0", 64),
		strings.Repeat("f", 64),
		Huella([]byte("uno")),
		Huella([]byte("dos")),
		"  " + Huella([]byte("con espacios")) + "  ",
	}
	for _, s := range sellos {
		c := CodigoDeVerificacion(s)
		if !formatoDeCodigo.MatchString(c) {
			t.Errorf("CodigoDeVerificacion(%q) = %q: no tiene la forma XXXX-XXXX en Crockford", s, c)
		}
		if strings.ContainsAny(c, "ILOU") {
			t.Errorf("el código %q tiene una letra que se confunde (I, L, O, U)", c)
		}
	}
	if got := CodigoDeVerificacion(strings.Repeat("0", 64)); got != "0000-0000" {
		t.Errorf("todo ceros = %q", got)
	}
	if got := CodigoDeVerificacion(strings.Repeat("f", 64)); got != "ZZZZ-ZZZZ" {
		t.Errorf("todo unos = %q", got)
	}
	// 40 bits: 0x0123456789 = 00000 00100 10001 10100 01010 11001 11100 01001
	// → 0 4 17 20 10 25 28 9 → "04HM-ASW9".
	if got := CodigoDeVerificacion("0123456789" + strings.Repeat("0", 54)); got != "04HM-ASW9" {
		t.Errorf("0x0123456789 = %q, esperaba 04HM-ASW9", got)
	}
}

func TestCodigoDeVerificacion_EstableYDistinto(t *testing.T) {
	a, b := Huella([]byte("sello a")), Huella([]byte("sello b"))
	primero, segundo := CodigoDeVerificacion(a), CodigoDeVerificacion(strings.ToUpper(a))
	if primero != segundo || primero != CodigoDeVerificacion(" "+a+"\t") {
		t.Fatal("el mismo sello (en mayúsculas, con espacios) tiene que dar siempre el mismo código")
	}
	if CodigoDeVerificacion(a) == CodigoDeVerificacion(b) {
		t.Fatal("dos sellos distintos dieron el mismo código")
	}
	// Solo cuentan los primeros 40 bits.
	if CodigoDeVerificacion("abcdef0123"+strings.Repeat("0", 54)) != CodigoDeVerificacion("abcdef0123"+strings.Repeat("9", 54)) {
		t.Fatal("el código tiene que salir de los primeros 40 bits del sello")
	}
	for _, malo := range []string{"", "zz", "abcd", "abcdef01"} {
		if got := CodigoDeVerificacion(malo); got != "" {
			t.Errorf("CodigoDeVerificacion(%q) = %q, esperaba vacío", malo, got)
		}
	}
}

// --- El PDF --------------------------------------------------------------

// selladoDePrueba — un documento sellado armado en memoria, con la lámina
// compuesta como la congela la API al terminar.
func selladoDePrueba(t *testing.T, p *Plantilla, paciente PacienteCongelado) FuenteDelPDF {
	t.Helper()
	datos, err := fixtures.ReadFile("fixtures/consentimiento-tratamiento-conducto.v1.json")
	if err != nil {
		t.Fatal(err)
	}
	var fx struct {
		Contexto Contexto       `json:"contexto"`
		Valores  map[string]any `json:"valores"`
	}
	if err := json.Unmarshal(datos, &fx); err != nil {
		t.Fatal(err)
	}
	docID := uuid.MustParse("11111111-2222-4333-8444-555555555555")
	terminado := time.Date(2026, 9, 27, 15, 4, 5, 0, time.UTC)
	contenido := ContenidoCongelado{
		Formato: FormatoContenido, DocumentoID: docID.String(),
		Plantilla: PlantillaCongelada{ID: p.ID, Version: p.Version, Nombre: p.Nombre, Tipo: p.Tipo, Fuente: p.Fuente},
		Clinica:   ClinicaCongelada{ID: "aaaaaaaa-0000-4000-8000-000000000001", Nombre: "Clínica del Sol"},
		Paciente:  paciente,
		Profesional: ProfesionalCongelado{
			UserID: "bbbbbbbb-0000-4000-8000-000000000002", Nombre: "Lucía", Apellido: "Gómez", MatriculaTipo: "provincial", MatriculaNumero: "4321",
		},
		Fecha: fx.Contexto.Fecha, TerminadoEn: terminado.Format(time.RFC3339),
		Valores: fx.Valores, Cuerpo: ArmarCuerpo(p, fx.Valores, fx.Contexto, TextoSellado),
		Firmas: p.Firmas, Lamina: ArmarLamina(p, fx.Valores, fx.Contexto, TextoSellado),
	}
	canonico, hashContenido, err := Congelar(contenido)
	if err != nil {
		t.Fatal(err)
	}
	trazo := db.TrazoDeFirma{Ancho: 300, Alto: 150, Trazos: [][][3]float64{
		{{10, 100, 0}, {60, 40, 20}, {120, 110, 40}, {200, 30, 60}},
		{{240, 90, 80}}, // un toque solo
	}}
	dni := "30111222"
	ip := "200.1.2.3"
	ua := "Mozilla/5.0 (Prueba)"
	firmas := []db.DocumentoFirma{}
	huellas := map[string]string{}
	for i, def := range p.Firmas {
		f := db.DocumentoFirma{
			DocumentoID: docID, Rol: def.Rol, Nombre: fmt.Sprintf("Firmante %d", i+1), DNI: &dni,
			Metodo: db.MetodoPresencial, Trazo: trazo, HashContenido: hashContenido,
			IP: &ip, UserAgent: &ua, FirmadoEn: terminado.Add(time.Duration(i+1) * time.Minute),
		}
		f.HashFirma, _ = HuellaDe(EntradaDesde(f))
		huellas[def.Rol] = f.HashFirma
		firmas = append(firmas, f)
	}
	sello := Sello(hashContenido, huellas, "")
	folio, cadena := 7, int64(3)
	sellado := terminado.Add(10 * time.Minute)
	return FuenteDelPDF{
		Documento: db.DocumentoClinico{
			ID: docID, ClinicID: uuid.MustParse("aaaaaaaa-0000-4000-8000-000000000001"), PlantillaID: p.ID, PlantillaVersion: p.Version,
			Estado: db.DocumentoSellado, ContenidoCanonico: &canonico, HashContenido: &hashContenido,
			TerminadoEn: &terminado, Folio: &folio, CadenaN: &cadena, HashSello: &sello, SelladoEn: &sellado,
		},
		Firmas:    firmas,
		Plantilla: p,
	}
}

func conducto(t *testing.T) *Plantilla {
	t.Helper()
	p, ok := PorID("consentimiento-tratamiento-conducto", 1)
	if !ok {
		t.Fatal("no está el consentimiento de conducto v1")
	}
	return p
}

// copiaSinOriginal — la misma plantilla con otro id: no tiene original
// embebido (como la historia clínica de prueba de la API).
func copiaSinOriginal(t *testing.T) *Plantilla {
	t.Helper()
	c := *conducto(t)
	c.ID = "historia-sin-original"
	c.Tipo = "historia_clinica"
	return &c
}

var pacienteDePrueba = PacienteCongelado{ID: "cccccccc-0000-4000-8000-000000000003", Nombre: "Ana Congelada", Apellido: "Paz", DNI: "30111222"}

// paginasDelPDF — el texto de cada página, descomprimido y pasado de
// Windows-1252 a UTF-8 (las cadenas de un Tj van en WinAnsi).
func paginasDelPDF(t *testing.T, datos []byte) []string {
	t.Helper()
	re := regexp.MustCompile(`<< /Filter /FlateDecode /Length (\d+) >>\nstream\n`)
	var out []string
	for _, idx := range re.FindAllSubmatchIndex(datos, -1) {
		largo, _ := strconv.Atoi(string(datos[idx[2]:idx[3]]))
		z, err := zlib.NewReader(bytes.NewReader(datos[idx[1] : idx[1]+largo]))
		if err != nil {
			t.Fatal(err)
		}
		plano, err := io.ReadAll(z)
		if err != nil {
			t.Fatal(err)
		}
		texto, err := charmap.Windows1252.NewDecoder().Bytes(plano)
		if err != nil {
			t.Fatal(err)
		}
		out = append(out, string(texto))
	}
	return out
}

// textosDe — solo lo que se escribe con Tj, sin los escapes.
func textosDe(pagina string) string {
	var b strings.Builder
	for _, m := range regexp.MustCompile(`\(((?:\\.|[^\\)])*)\) Tj`).FindAllStringSubmatch(pagina, -1) {
		s := strings.NewReplacer(`\(`, "(", `\)`, ")", `\\`, `\`).Replace(m[1])
		b.WriteString(s)
		b.WriteByte('\n')
	}
	return b.String()
}

func generarPDF(t *testing.T, f FuenteDelPDF) []byte {
	t.Helper()
	datos, err := GenerarPDF(f)
	if err != nil {
		t.Fatalf("GenerarPDF: %v", err)
	}
	if !bytes.HasPrefix(datos, []byte("%PDF-")) || !bytes.HasSuffix(datos, []byte("%%EOF\n")) {
		t.Fatalf("no es un PDF")
	}
	return datos
}

func TestGenerarPDF_EsDeterminista(t *testing.T) {
	f := selladoDePrueba(t, conducto(t), pacienteDePrueba)
	a := generarPDF(t, f)
	b := generarPDF(t, f)
	if !bytes.Equal(a, b) {
		t.Fatal("generar dos veces el mismo documento dio bytes distintos")
	}
	// Otra copia armada desde cero (otros punteros, mismos datos).
	if !bytes.Equal(a, generarPDF(t, selladoDePrueba(t, conducto(t), pacienteDePrueba))) {
		t.Fatal("el PDF depende de algo que no es el documento (reloj, punteros, orden de mapas)")
	}
}

func TestGenerarPDF_CambiarUnaFirmaOElSelloCambiaLosBytes(t *testing.T) {
	base := selladoDePrueba(t, conducto(t), pacienteDePrueba)
	original := generarPDF(t, base)

	otraFirma := selladoDePrueba(t, conducto(t), pacienteDePrueba)
	otraFirma.Firmas[0].Trazo.Trazos[0][1] = [3]float64{70, 45, 20}
	if bytes.Equal(original, generarPDF(t, otraFirma)) {
		t.Error("cambiar el trazo de una firma no cambió el PDF")
	}

	otroNombre := selladoDePrueba(t, conducto(t), pacienteDePrueba)
	otroNombre.Firmas[1].Nombre = "Otra persona"
	if bytes.Equal(original, generarPDF(t, otroNombre)) {
		t.Error("cambiar el nombre de quien firmó no cambió el PDF")
	}

	otroSello := selladoDePrueba(t, conducto(t), pacienteDePrueba)
	s := Huella([]byte("otro sello"))
	otroSello.Documento.HashSello = &s
	conOtroSello := generarPDF(t, otroSello)
	if bytes.Equal(original, conOtroSello) {
		t.Error("cambiar el sello no cambió el PDF")
	}
	if !strings.Contains(strings.Join(paginasDelPDF(t, conOtroSello), ""), CodigoDeVerificacion(s)) {
		t.Error("el código impreso no sale del sello")
	}
}

func TestGenerarPDF_HojasPieYConstancia(t *testing.T) {
	p := conducto(t)
	f := selladoDePrueba(t, p, pacienteDePrueba)
	datos := generarPDF(t, f)
	paginas := paginasDelPDF(t, datos)
	laminas := len(p.Lamina.Paginas)
	total := len(paginas)
	if got := bytes.Count(datos, []byte("/Type /Page /Parent")); got != total {
		t.Fatalf("%d páginas declaradas y %d streams", got, total)
	}
	if total < laminas+1 {
		t.Fatalf("%d hojas: tiene que haber las %d de la lámina más al menos una de constancia", total, laminas)
	}
	codigo := CodigoDeVerificacion(*f.Documento.HashSello)
	for i, pag := range paginas {
		textos := textosDe(pag)
		pie := fmt.Sprintf("Folio 7 · Código de verificación %s · Hoja %d de %d", codigo, i+1, total)
		if !strings.Contains(textos, pie) {
			t.Errorf("hoja %d sin el pie %q", i+1, pie)
		}
		esConstancia := strings.Contains(textos, "Constancia de firmas electrónicas")
		if i < laminas && esConstancia {
			t.Errorf("la hoja %d es de la lámina y tiene la constancia", i+1)
		}
		if i == laminas && !esConstancia {
			t.Errorf("la hoja %d tendría que abrir la constancia", i+1)
		}
		if strings.Contains(strings.ToLower(textos), "digital") {
			t.Errorf("la hoja %d dice \"digital\": lo que hay es firma electrónica, no digital (TR-184)", i+1)
		}
	}
	// Las hojas de constancia son A4.
	if !bytes.Contains(datos, []byte("/MediaBox [0 0 595.28 841.89]")) {
		t.Error("la constancia no va en A4")
	}
	if !bytes.Contains(datos, []byte("/MediaBox [0 0 612 792]")) {
		t.Error("la lámina no va al tamaño del original")
	}

	constancia := ""
	for _, pag := range paginas[laminas:] {
		constancia += textosDe(pag)
	}
	for _, esperado := range []string{
		"Ana Congelada Paz · DNI 30111222",
		"Clínica del Sol",
		"Lucía Gómez · M.P. 4321",
		"Firmante 1", "Firmante 2", "200.1.2.3", "Mozilla/5.0 (Prueba)",
		"En persona, en el dispositivo del consultorio",
		"N° 3 de la clínica",
		"— (primer documento sellado de la clínica)",
		"(hora de Córdoba)",
		codigo,
	} {
		if !strings.Contains(constancia, esperado) {
			t.Errorf("la constancia no dice %q", esperado)
		}
	}
	// La lámina lleva lo compuesto y congelado, y las firmas dibujadas.
	lamina := paginas[0]
	if !strings.Contains(textosDe(lamina), "Ejemplo de lugar") {
		t.Error("la lámina no tiene lo cargado")
	}
	if !strings.Contains(lamina, "re W n") || !strings.Contains(lamina, "0.9 w") {
		t.Error("las firmas no se dibujaron recortadas a su lugar y con el grosor de una birome")
	}
}

// Los datos del paciente salen del contenido CONGELADO, no de una ficha
// que pudo cambiar: con otro paciente en lo congelado, otra constancia.
func TestGenerarPDF_LaConstanciaUsaLoCongelado(t *testing.T) {
	otro := PacienteCongelado{ID: "dddddddd-0000-4000-8000-000000000004", Nombre: "Beatriz", Apellido: "Núñez", DNI: "20999888"}
	f := selladoDePrueba(t, conducto(t), otro)
	todo := ""
	for _, pag := range paginasDelPDF(t, generarPDF(t, f)) {
		todo += textosDe(pag)
	}
	if !strings.Contains(todo, "Beatriz Núñez · DNI 20999888") || strings.Contains(todo, "Ana Congelada") {
		t.Fatal("la constancia no sale del contenido congelado")
	}
}

func TestGenerarPDF_ConstanciaLargaSeReparteEnHojas(t *testing.T) {
	p := *conducto(t)
	p.Firmas = nil
	for _, rol := range []string{db.FirmaPaciente, db.FirmaRepresentante, db.FirmaAsentimiento, db.FirmaProfesional,
		db.FirmaOtroProfesional, db.FirmaTestigo1, db.FirmaTestigo2} {
		p.Firmas = append(p.Firmas, FirmaDePlantilla{Rol: rol, Etiqueta: "Firma de " + rol, Requerida: true})
	}
	f := selladoDePrueba(t, &p, pacienteDePrueba)
	vinculo := "madre"
	f.Firmas[1].EnRepresentacion = true
	f.Firmas[1].Vinculo = &vinculo
	mail := "tutor@example.com"
	f.Firmas[1].MailVerificado = &mail
	f.Firmas[1].Metodo = db.MetodoVinculo
	f.Firmas = f.Firmas[:len(f.Firmas)-1] // el último testigo no firmó
	paginas := paginasDelPDF(t, generarPDF(t, f))
	if len(paginas) < len(p.Lamina.Paginas)+2 {
		t.Fatalf("con siete firmas la constancia tendría que ocupar más de una hoja: %d hojas", len(paginas))
	}
	todo := ""
	for i, pag := range paginas {
		textos := textosDe(pag)
		if !strings.Contains(textos, fmt.Sprintf("Hoja %d de %d", i+1, len(paginas))) {
			t.Errorf("hoja %d con el pie mal numerado", i+1)
		}
		todo += textos
	}
	for _, esperado := range []string{"Sin firmar (firma opcional)", "vínculo: madre", "tutor@example.com", "A distancia"} {
		if !strings.Contains(todo, esperado) {
			t.Errorf("la constancia no dice %q", esperado)
		}
	}
}

func TestGenerarPDF_OriginalEmbebidoYSinOriginal(t *testing.T) {
	p := conducto(t)
	jpeg, ok := PaginaOriginal(p.ID, p.Version, 1)
	if !ok {
		t.Fatal("el conducto v1 no tiene su página original embebida")
	}
	con := generarPDF(t, selladoDePrueba(t, p, pacienteDePrueba))
	if !bytes.Contains(con, jpeg) || !bytes.Contains(con, []byte("/Filter /DCTDecode")) {
		t.Fatal("el PDF no lleva la página original de fondo")
	}

	sin := copiaSinOriginal(t)
	if _, ok := PaginaOriginal(sin.ID, sin.Version, 1); ok {
		t.Fatal("la copia de prueba no debería tener original")
	}
	datos := generarPDF(t, selladoDePrueba(t, sin, pacienteDePrueba))
	if bytes.Contains(datos, []byte("/Subtype /Image")) {
		t.Fatal("sin original, la página va en blanco (sin imagen)")
	}
	if !strings.Contains(textosDe(paginasDelPDF(t, datos)[0]), "Ejemplo de lugar") {
		t.Fatal("sin original, la composición igual va encima")
	}
	if !strings.Contains(strings.Join(paginasDelPDF(t, datos), ""), "Historia clínica: ") {
		t.Fatal("el nombre del documento lleva su tipo adelante")
	}
	if _, ok := PaginaOriginal(p.ID, p.Version, 99); ok {
		t.Fatal("una página que no existe no tiene original")
	}
}

func TestGenerarPDF_Errores(t *testing.T) {
	p := conducto(t)

	sinPlantilla := selladoDePrueba(t, p, pacienteDePrueba)
	sinPlantilla.Plantilla = nil
	if _, err := GenerarPDF(sinPlantilla); err == nil {
		t.Error("sin plantilla tiene que fallar")
	}

	sinLamina := *p
	sinLamina.Lamina = nil
	f := selladoDePrueba(t, p, pacienteDePrueba)
	f.Plantilla = &sinLamina
	if _, err := GenerarPDF(f); !errors.Is(err, ErrPlantillaSinLamina) {
		t.Errorf("una plantilla sin lámina = %v, esperaba ErrPlantillaSinLamina", err)
	}
	laminaVacia := *p
	laminaVacia.Lamina = &Lamina{}
	f.Plantilla = &laminaVacia
	if _, err := GenerarPDF(f); !errors.Is(err, ErrPlantillaSinLamina) {
		t.Errorf("una lámina sin páginas = %v, esperaba ErrPlantillaSinLamina", err)
	}

	for nombre, romper := range map[string]func(d *db.DocumentoClinico){
		"a firmar":            func(d *db.DocumentoClinico) { d.Estado = db.DocumentoAFirmar },
		"borrador":            func(d *db.DocumentoClinico) { d.Estado = db.DocumentoBorrador },
		"sin sello":           func(d *db.DocumentoClinico) { d.HashSello = nil },
		"sin folio":           func(d *db.DocumentoClinico) { d.Folio = nil },
		"sin fecha de sello":  func(d *db.DocumentoClinico) { d.SelladoEn = nil },
		"sin contenido":       func(d *db.DocumentoClinico) { d.ContenidoCanonico = nil },
		"contenido roto":      func(d *db.DocumentoClinico) { s := "{no es json"; d.ContenidoCanonico = &s },
		"sello que no es hex": func(d *db.DocumentoClinico) { s := "no-es-una-huella"; d.HashSello = &s },
	} {
		f := selladoDePrueba(t, p, pacienteDePrueba)
		romper(&f.Documento)
		if _, err := GenerarPDF(f); err == nil {
			t.Errorf("%s: se esperaba un error", nombre)
		}
	}
}

func TestNombreConTipo(t *testing.T) {
	casos := map[[2]string]string{
		{"historia_clinica", "Odontología general"}: "Historia clínica: Odontología general",
		{"consentimiento", "Conducto"}:              "Consentimiento informado: Conducto",
		{"anexo", "Odontograma"}:                    "Anexo: Odontograma",
		{"otro", "Suelto"}:                          "Suelto",
	}
	for in, want := range casos {
		if got := NombreConTipo(in[0], in[1]); got != want {
			t.Errorf("NombreConTipo(%q, %q) = %q", in[0], in[1], got)
		}
	}
	if matriculaLegible("nacional", "99") != "M.N. 99" || matriculaLegible("x", "5") != "5" || matriculaLegible("provincial", "") != "" {
		t.Error("matriculaLegible")
	}
}

// Toda plantilla VIGENTE con lámina necesita su página original embebida
// para cada hoja: todo documento terminado tiene PDF (un consentimiento
// para imprimir y una historia sellada), y sin original sale sobre una
// página en blanco. El consentimiento de conducto v1 también, porque tiene
// documentos sellados antes de TR-188. Mismo espíritu que el test web
// "cada documento vigente tiene sus páginas renderizadas".
func TestOriginales_CadaPlantillaVigenteTieneSusPaginas(t *testing.T) {
	revisadas := 0
	for _, p := range Todas() {
		if p.Lamina == nil || len(p.Lamina.Paginas) == 0 {
			continue
		}
		ultima, _ := Ultima(p.ID)
		esElConductoV1 := p.ID == "consentimiento-tratamiento-conducto" && p.Version == 1
		if ultima.Version != p.Version && !esElConductoV1 {
			continue
		}
		// Las plantillas de prueba que registran otros paquetes no están
		// en este binario: acá solo hay plantillas reales.
		revisadas++
		for n := 1; n <= len(p.Lamina.Paginas); n++ {
			if _, ok := PaginaOriginal(p.ID, p.Version, n); !ok {
				t.Errorf("%s v%d: falta originales/%s/v%d/pagina-%d.jpg (scripts/originales-para-la-api.py)", p.ID, p.Version, p.ID, p.Version, n)
			}
		}
	}
	if revisadas < 15 {
		t.Fatalf("se revisaron %d plantillas: tendrían que ser al menos las 14 vigentes más el conducto v1", revisadas)
	}
}
