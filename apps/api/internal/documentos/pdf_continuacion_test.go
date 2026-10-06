package documentos

import (
	"bytes"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"dental-mirage/api/internal/db"
)

// Los anexos de continuación (Fase 5.6d) sin base: la cadena de asientos que
// recalcula VerificarAsientos y el PDF que arma GenerarPDFDeContinuacion.

var autorDeAsientos = uuid.MustParse("dddddddd-0000-4000-8000-000000000004")

func anexoDeContinuacionDePrueba(t *testing.T) db.DocumentoClinico {
	t.Helper()
	id := uuid.MustParse("eeeeeeee-0000-4000-8000-000000000005")
	historia := uuid.MustParse("ffffffff-0000-4000-8000-000000000006")
	terminado := time.Date(2026, 10, 5, 13, 0, 0, 0, time.UTC)
	seccion, numero := "plan", 2
	contenido := ContenidoCongelado{
		Formato: FormatoContenido, DocumentoID: id.String(),
		Plantilla: PlantillaCongelada{ID: PlantillaDeContinuacion, Version: 1, Nombre: "Anexo de continuación", Tipo: TipoAnexo},
		Clinica:   ClinicaCongelada{ID: "aaaaaaaa-0000-4000-8000-000000000001", Nombre: "Clínica del Sol"},
		Paciente:  pacienteDePrueba,
		Fecha:     "2026-10-05", TerminadoEn: "2026-10-05T10:00:00-03:00",
		Valores: map[string]any{},
		Continuacion: &ContinuacionCongelada{
			HistoriaID: historia.String(), Historia: "Historia clínica general", Seccion: seccion, Numero: numero,
		},
	}
	canonico, huella, err := Congelar(contenido)
	if err != nil {
		t.Fatal(err)
	}
	return db.DocumentoClinico{
		ID: id, PlantillaID: PlantillaDeContinuacion, PlantillaVersion: 1, Estado: db.DocumentoAbierto,
		AnexoDe: &historia, AnexoSeccion: &seccion, AnexoNumero: &numero, TerminadoEn: &terminado,
		ContenidoCanonico: &canonico, HashContenido: &huella,
	}
}

// asientosEncadenados — un asiento por texto, cada uno encadenado al
// anterior (el primero, al contenido del anexo), como los arma la API.
func asientosEncadenados(t *testing.T, d db.DocumentoClinico, textos ...string) []db.DocumentoAsiento {
	t.Helper()
	anterior := *d.HashContenido
	inicio := time.Date(2026, 10, 5, 14, 0, 0, 123456789, time.UTC)
	out := make([]db.DocumentoAsiento, len(textos))
	for i, texto := range textos {
		a := db.DocumentoAsiento{
			DocumentoID: d.ID, Numero: i + 1, Texto: texto, AutorUserID: autorDeAsientos, AutorNombre: "Lucía Gómez",
			CreadoEn:     MomentoDeFirma(inicio.Add(time.Duration(i) * time.Hour)),
			HashAnterior: anterior,
		}
		h, err := HuellaDelAsiento(a)
		if err != nil {
			t.Fatal(err)
		}
		a.Hash = h
		anterior = h
		out[i] = a
	}
	return out
}

func TestVerificarAsientos(t *testing.T) {
	d := anexoDeContinuacionDePrueba(t)
	if err := VerificarAsientos(d, nil); err != nil {
		t.Fatalf("un anexo sin asientos es una cadena válida: %v", err)
	}
	validos := asientosEncadenados(t, d, "Primero.", "Segundo.", "Tercero.")
	if err := VerificarAsientos(d, validos); err != nil {
		t.Fatalf("una cadena válida: %v", err)
	}

	casos := []struct {
		nombre, mensaje string
		romper          func([]db.DocumentoAsiento) []db.DocumentoAsiento
	}{
		{"un asiento alterado", "no coincide con su huella", func(a []db.DocumentoAsiento) []db.DocumentoAsiento {
			a[1].Texto = "Otro texto."
			return a
		}},
		{"un salto de número", "falta el asiento 2", func(a []db.DocumentoAsiento) []db.DocumentoAsiento {
			return []db.DocumentoAsiento{a[0], a[2]}
		}},
		{"una cadena cortada (el asiento es coherente consigo mismo)", "cortada en el asiento 2", func(a []db.DocumentoAsiento) []db.DocumentoAsiento {
			a[1].HashAnterior = strings.Repeat("0", 64)
			a[1].Hash, _ = HuellaDelAsiento(a[1])
			return a
		}},
		{"el primero encadenado a otra cosa que el contenido", "cortada en el asiento 1", func(a []db.DocumentoAsiento) []db.DocumentoAsiento {
			a[0].HashAnterior = a[2].Hash
			a[0].Hash, _ = HuellaDelAsiento(a[0])
			return a
		}},
		{"un asiento de otro documento", "de otro documento", func(a []db.DocumentoAsiento) []db.DocumentoAsiento {
			a[0].DocumentoID = uuid.New()
			return a
		}},
		{"falta el primero", "falta el asiento 1", func(a []db.DocumentoAsiento) []db.DocumentoAsiento {
			return a[1:]
		}},
	}
	for _, c := range casos {
		t.Run(c.nombre, func(t *testing.T) {
			copia := append([]db.DocumentoAsiento(nil), validos...)
			err := VerificarAsientos(d, c.romper(copia))
			if err == nil || !strings.Contains(err.Error(), c.mensaje) {
				t.Fatalf("se esperaba %q, dio %v", c.mensaje, err)
			}
		})
	}

	sinContenido := d
	sinContenido.HashContenido = nil
	if VerificarAsientos(sinContenido, validos) == nil {
		t.Fatal("un anexo sin contenido congelado no se puede verificar")
	}
	// La huella se recalcula desde lo guardado: el instante con más precisión
	// que la de Postgres da la misma huella.
	conNanos := validos[0]
	conNanos.CreadoEn = conNanos.CreadoEn.Add(999 * time.Nanosecond)
	if h, _ := HuellaDelAsiento(conNanos); h != validos[0].Hash {
		t.Fatal("la huella depende de los nanosegundos que Postgres no guarda")
	}
}

// Los asientos no llevan firma dibujada: la huella sale de esos siete datos y
// de nada más (ningún trazo).
func TestHuellaDelAsiento_SinTrazo(t *testing.T) {
	a := asientosEncadenados(t, anexoDeContinuacionDePrueba(t), "Control.")[0]
	esperada, err := HuellaDe(map[string]any{
		"documentoId": a.DocumentoID.String(), "numero": a.Numero, "texto": a.Texto,
		"autorUserId": a.AutorUserID.String(), "autorNombre": a.AutorNombre,
		"creadoEn": a.CreadoEn.Format(time.RFC3339Nano), "hashAnterior": a.HashAnterior,
	})
	if err != nil {
		t.Fatal(err)
	}
	if a.Hash != esperada {
		t.Fatalf("la huella del asiento no es la de sus siete datos: %s != %s", a.Hash, esperada)
	}
}

func generarContinuacion(t *testing.T, f FuenteDeContinuacion) []byte {
	t.Helper()
	datos, err := GenerarPDFDeContinuacion(f)
	if err != nil {
		t.Fatalf("GenerarPDFDeContinuacion: %v", err)
	}
	if !bytes.HasPrefix(datos, []byte("%PDF-")) || !bytes.HasSuffix(datos, []byte("%%EOF\n")) {
		t.Fatal("no es un PDF")
	}
	return datos
}

func TestGenerarPDFDeContinuacion_SinAsientosYDeterminista(t *testing.T) {
	folioHistoria := 3
	d := anexoDeContinuacionDePrueba(t)
	uno := generarContinuacion(t, FuenteDeContinuacion{Documento: d, FolioDeLaHistoria: &folioHistoria})
	if !bytes.Equal(uno, generarContinuacion(t, FuenteDeContinuacion{Documento: d, FolioDeLaHistoria: &folioHistoria})) {
		t.Fatal("el mismo anexo dio bytes distintos")
	}
	paginas := paginasDelPDF(t, uno)
	if len(paginas) != 1 {
		t.Fatalf("sin asientos, una hoja: %d", len(paginas))
	}
	textos := textosDe(paginas[0])
	for _, esperado := range []string{
		"Anexo Nº 2 · Continuación de plan de tratamiento · Historia clínica general · Folio 3",
		"Anexo de continuación Nº 2", "Sin anotaciones todavía.", "Folio 3.2 · Hoja 1 de 1", "30111222",
	} {
		if !strings.Contains(textos, esperado) {
			t.Errorf("la hoja no dice %q:\n%s", esperado, textos)
		}
	}

	// Sin folio de la historia (está en borrador), ni el encabezado ni el pie
	// lo dicen: el anexo es "Anexo Nº 2". Cuando la historia recibe su folio,
	// el PDF cambia; sin cambios, dos descargas dan lo mismo.
	sinFolioPDF := generarContinuacion(t, FuenteDeContinuacion{Documento: d})
	if !bytes.Equal(sinFolioPDF, generarContinuacion(t, FuenteDeContinuacion{Documento: d})) {
		t.Fatal("sin folio de la historia, dos descargas dieron bytes distintos")
	}
	if bytes.Equal(sinFolioPDF, uno) {
		t.Fatal("el PDF no cambió cuando la historia recibió su folio")
	}
	sinFolio := textosDe(paginasDelPDF(t, sinFolioPDF)[0])
	if !strings.Contains(sinFolio, "Historia clínica general\n") || strings.Contains(sinFolio, "Folio") ||
		!strings.Contains(sinFolio, "Anexo Nº 2 · Hoja 1 de 1") {
		t.Errorf("sin folio de la historia:\n%s", sinFolio)
	}

	// Con asientos: determinista, y distinto si cambia un asiento.
	asientos := asientosEncadenados(t, d, "Control.", "Otro control.")
	con := generarContinuacion(t, FuenteDeContinuacion{Documento: d, Asientos: asientos})
	if !bytes.Equal(con, generarContinuacion(t, FuenteDeContinuacion{Documento: d, Asientos: asientos})) {
		t.Fatal("los mismos asientos dieron bytes distintos")
	}
	if bytes.Equal(con, uno) {
		t.Fatal("sumar asientos no cambió el PDF")
	}
	otro := asientosEncadenados(t, d, "Control.", "Otro control distinto.")
	if bytes.Equal(con, generarContinuacion(t, FuenteDeContinuacion{Documento: d, Asientos: otro})) {
		t.Fatal("un asiento distinto dio los mismos bytes")
	}
	// Caracteres fuera de Windows-1252 no rompen el PDF.
	generarContinuacion(t, FuenteDeContinuacion{Documento: d, Asientos: asientosEncadenados(t, d, "Dolor ≥ 7 😀 → controlar")})
}

func TestGenerarPDFDeContinuacion_MuchosAsientosPasanDeHoja(t *testing.T) {
	d := anexoDeContinuacionDePrueba(t)
	var textos []string
	for i := range 25 {
		textos = append(textos, fmt.Sprintf("Control %d: evolución favorable, sin dolor a la percusión ni a la palpación.\nSe indica higiene y nuevo control en siete días. Renglón largo para que el texto se parta en varios renglones dentro del ancho útil.", i+1))
	}
	// Un asiento más largo que una hoja entera (el tope de 4000 caracteres).
	textos = append(textos, strings.Repeat("Palabra larga de prueba ", 166))
	asientos := asientosEncadenados(t, d, textos...)
	paginas := paginasDelPDF(t, generarContinuacion(t, FuenteDeContinuacion{Documento: d, Asientos: asientos}))

	contenido := ContenidoCongelado{Paciente: pacienteDePrueba}
	hojas := repartirEnHojas(gruposDeLaContinuacion(2, FolioDe(d, nil), contenido.Paciente, asientos))
	if len(paginas) < 3 || len(paginas) != len(hojas) {
		t.Fatalf("hojas del PDF %d, hojas repartidas %d", len(paginas), len(hojas))
	}

	// Ningún renglón se sale del área útil: ni arriba (el encabezado) ni
	// abajo (el pie).
	limite := altoA4 - margenA4
	for i, hoja := range hojas {
		for _, r := range hoja {
			arriba := r.y
			if !r.regla {
				arriba = r.y - r.tamano
			}
			if arriba < margenA4-0.01 || r.y > limite+0.01 {
				t.Errorf("hoja %d: un renglón fuera del área útil (%q, y=%.1f)", i+1, r.texto, r.y)
			}
		}
	}

	todo := ""
	for i, pag := range paginas {
		tx := textosDe(pag)
		if !strings.Contains(tx, fmt.Sprintf("Anexo Nº 2 · Hoja %d de %d", i+1, len(paginas))) {
			t.Errorf("hoja %d con el pie mal numerado", i+1)
		}
		if !strings.Contains(tx, "Anexo Nº 2 · Continuación de plan de tratamiento") {
			t.Errorf("hoja %d sin el encabezado", i+1)
		}
		todo += tx
	}
	// Cada renglón de cada asiento aparece entero, una vez: ninguno se cortó.
	for _, a := range asientos {
		if !strings.Contains(todo, fmt.Sprintf("Anotación %d · Registrado digitalmente por Lucía Gómez · ", a.Numero)) {
			t.Errorf("falta la cabecera del asiento %d", a.Numero)
		}
		for _, l := range Envolver(a.Texto, anchoUtilA4, tamanoAsiento, anchoUtilA4) {
			if l != "" && !strings.Contains(todo, l+"\n") {
				t.Errorf("el asiento %d perdió o cortó el renglón %q", a.Numero, l)
			}
		}
	}
	if n := strings.Count(todo, "Registrado digitalmente por Lucía Gómez · "); n != len(asientos) {
		t.Errorf("un registro digital por asiento: %d de %d", n, len(asientos))
	}
}

// En el lugar de la firma, cada asiento lleva el renglón de su registro
// digital: ni recuadro ni trazo, así que la hoja no tiene más caminos cerrados
// (h) ni curvas (c) que la de un anexo sin asientos (el fondo del pie).
func TestGenerarPDFDeContinuacion_RegistroDigitalSinFirma(t *testing.T) {
	d := anexoDeContinuacionDePrueba(t)
	asientos := asientosEncadenados(t, d, "Control.", "Otro control.")
	pagina := paginasDelPDF(t, generarContinuacion(t, FuenteDeContinuacion{Documento: d, Asientos: asientos}))[0]
	textos := textosDe(pagina)
	for _, esperado := range []string{
		"Anotación 1 · Registrado digitalmente por Lucía Gómez · 05/10/2026 11:00:00 (hora de Córdoba)",
		"Anotación 2 · Registrado digitalmente por Lucía Gómez · 05/10/2026 12:00:00 (hora de Córdoba)",
	} {
		if !strings.Contains(textos, esperado+"\n") {
			t.Errorf("la hoja no dice %q:\n%s", esperado, textos)
		}
	}
	if strings.Contains(textos, "Firma de") {
		t.Errorf("un asiento no lleva firma:\n%s", textos)
	}
	caminos := regexp.MustCompile(`(?m)(^|\s)[hc](\s|$)`)
	sinAsientos := paginasDelPDF(t, generarContinuacion(t, FuenteDeContinuacion{Documento: d}))[0]
	if con, sin := len(caminos.FindAllString(pagina, -1)), len(caminos.FindAllString(sinAsientos, -1)); con != sin {
		t.Errorf("la hoja dibuja un recuadro o un trazo de firma: %d caminos cerrados o curvas con asientos, %d sin (el pie)", con, sin)
	}
}

func TestGenerarPDFDeContinuacion_Errores(t *testing.T) {
	base := anexoDeContinuacionDePrueba(t)
	casos := []struct {
		nombre    string
		romper    func(*db.DocumentoClinico)
		noEsAnexo bool
	}{
		{"un documento que no está abierto", func(d *db.DocumentoClinico) { d.Estado = db.DocumentoSellado }, true},
		{"un abierto sin sección", func(d *db.DocumentoClinico) { d.AnexoSeccion = nil }, true},
		{"sin contenido congelado", func(d *db.DocumentoClinico) { d.ContenidoCanonico = nil }, false},
		{"un abierto sin historia", func(d *db.DocumentoClinico) { d.AnexoDe = nil }, true},
		{"un contenido ilegible", func(d *db.DocumentoClinico) { s := "{"; d.ContenidoCanonico = &s }, false},
		{"un contenido que no dice de qué historia es", func(d *db.DocumentoClinico) { s := `{"formato":1}`; d.ContenidoCanonico = &s }, false},
		{"una huella que no es hexadecimal", func(d *db.DocumentoClinico) { s := "zz"; d.HashContenido = &s }, false},
	}
	for _, c := range casos {
		t.Run(c.nombre, func(t *testing.T) {
			d := base
			c.romper(&d)
			_, err := GenerarPDFDeContinuacion(FuenteDeContinuacion{Documento: d})
			var incompleto *DocumentoIncompletoError
			switch {
			case c.noEsAnexo && !errors.Is(err, ErrNoEsContinuacion):
				t.Fatalf("se esperaba ErrNoEsContinuacion: %v", err)
			case !c.noEsAnexo && !errors.As(err, &incompleto):
				t.Fatalf("se esperaba un documento incompleto: %v", err)
			}
		})
	}
}

func TestTienePDF_UnAnexoAbierto(t *testing.T) {
	d := anexoDeContinuacionDePrueba(t)
	if !TienePDF(d, nil) {
		t.Fatal("un anexo de continuación abierto tiene PDF desde que nace")
	}
	sinSeccion := d
	sinSeccion.AnexoSeccion = nil
	sinContenido := d
	sinContenido.ContenidoCanonico = nil
	if TienePDF(sinSeccion, nil) || TienePDF(sinContenido, nil) {
		t.Fatal("un abierto sin sección o sin contenido no tiene PDF")
	}
}
