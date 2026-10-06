package documentos

import (
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"dental-mirage/api/internal/db"
)

// La prueba de que nadie tocó nada (TR-182).
//
//   - hash_contenido: la huella del contenido congelado al terminar.
//   - hash_firma: la huella de cada firma — quién, cómo, cuándo, el trazo y
//     la huella del contenido que firmó.
//   - hash_sello: la huella de todo lo anterior MÁS el sello del documento
//     previo de la misma clínica. Es una cadena: cambiar un documento viejo
//     rompe su sello y el de todos los que vienen después.

// FormatoContenido — la versión de la forma de ContenidoCongelado. Si algún
// día cambia, los documentos viejos se siguen verificando con la suya.
const FormatoContenido = 1

// PlantillaCongelada — qué plantilla y qué versión leyó el paciente.
type PlantillaCongelada struct {
	ID      string `json:"id"`
	Version int    `json:"version"`
	Nombre  string `json:"nombre"`
	Tipo    string `json:"tipo"`
	Fuente  Fuente `json:"fuente"`
}

// ClinicaCongelada, PacienteCongelado, ProfesionalCongelado — una foto de
// quiénes eran al terminar: la ficha o el perfil pueden cambiar después, el
// documento no.
type ClinicaCongelada struct {
	ID     string `json:"id"`
	Nombre string `json:"nombre"`
}

type PacienteCongelado struct {
	ID       string `json:"id"`
	Nombre   string `json:"nombre"`
	Apellido string `json:"apellido"`
	DNI      string `json:"dni"`
}

type ProfesionalCongelado struct {
	UserID          string `json:"userId"`
	Nombre          string `json:"nombre"`
	Apellido        string `json:"apellido"`
	MatriculaTipo   string `json:"matriculaTipo"`
	MatriculaNumero string `json:"matriculaNumero"`
}

// ContenidoCongelado — el documento terminado: lo que el paciente lee y
// firma.
type ContenidoCongelado struct {
	Formato     int                  `json:"formato"`
	DocumentoID string               `json:"documentoId"`
	Plantilla   PlantillaCongelada   `json:"plantilla"`
	Clinica     ClinicaCongelada     `json:"clinica"`
	Paciente    PacienteCongelado    `json:"paciente"`
	Profesional ProfesionalCongelado `json:"profesional"`
	// Fecha — el día del documento (AAAA-MM-DD, Córdoba); TerminadoEn, el
	// instante exacto (RFC 3339 con el huso de Córdoba).
	Fecha       string             `json:"fecha"`
	TerminadoEn string             `json:"terminadoEn"`
	Valores     map[string]any     `json:"valores"`
	Cuerpo      []BloqueArmado     `json:"cuerpo"`
	Firmas      []FirmaDePlantilla `json:"firmas"`
	// Lamina — lo cargado ya compuesto sobre la página original: lo que se
	// ve y lo que irá al PDF, congelado como se vio (TR-187). Sin lámina
	// (una plantilla sin original), se omite y la huella no cambia.
	Lamina []ZonaCompuesta `json:"lamina,omitempty"`
	// Figuras — los odontogramas compuestos sobre la página (Fase 5.5).
	// Con omitempty, un documento sin odontograma conserva su huella.
	Figuras []Figura `json:"figuras,omitempty"`
	// Continuacion — en un anexo de continuación (Fase 5.6d), de qué historia
	// es. Con omitempty, los demás documentos conservan su huella.
	Continuacion *ContinuacionCongelada `json:"continuacion,omitempty"`
}

// ContinuacionCongelada — la historia que continúa un anexo, como era al
// crearlo: su nombre, la sección y el número del anexo. Su PDF sale de esto y
// no de la historia de hoy, que no todos los que ven el anexo pueden ver; lo
// único que lee de ella es su folio actual, que es solo un número (FolioDe).
type ContinuacionCongelada struct {
	HistoriaID string `json:"historiaId"`
	Historia   string `json:"historia"`
	Seccion    string `json:"seccion"`
	Numero     int    `json:"numero"`
}

// LimpiarValores — saca los campos vacíos: el contenido congelado guarda lo
// que se cargó, y un "" guardado o no guardado tiene que dar la misma huella.
func LimpiarValores(p *Plantilla, valores map[string]any) map[string]any {
	limpios := map[string]any{}
	for clave, valor := range valores {
		if c := p.Campo(clave); c != nil && !EstaVacio(c, valor) {
			limpios[clave] = valor
		}
	}
	return limpios
}

// Congelar — el contenido en JSON canónico y su huella.
func Congelar(c ContenidoCongelado) (canonico string, huella string, err error) {
	datos, err := Canonico(c)
	if err != nil {
		return "", "", err
	}
	return string(datos), Huella(datos), nil
}

// EntradaDeFirma — lo que entra en la huella de una firma.
type EntradaDeFirma struct {
	DocumentoID      string          `json:"documentoId"`
	Rol              string          `json:"rol"`
	Nombre           string          `json:"nombre"`
	DNI              string          `json:"dni"`
	EnRepresentacion bool            `json:"enRepresentacion"`
	Vinculo          string          `json:"vinculo"`
	Metodo           string          `json:"metodo"`
	UserID           string          `json:"userId"`
	Trazo            db.TrazoDeFirma `json:"trazo"`
	HashContenido    string          `json:"hashContenido"`
	IP               string          `json:"ip"`
	UserAgent        string          `json:"userAgent"`
	FirmadoEn        string          `json:"firmadoEn"`
}

// MomentoDeFirma — el instante de una firma, con la precisión que guarda
// Postgres (microsegundos) y en UTC: la huella se recalcula desde lo
// guardado, así que tiene que calcularse sobre lo mismo.
func MomentoDeFirma(t time.Time) time.Time {
	return t.UTC().Truncate(time.Microsecond)
}

func textoDe(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

// EntradaDesde — la entrada de la huella a partir de una firma guardada.
func EntradaDesde(f db.DocumentoFirma) EntradaDeFirma {
	userID := ""
	if f.UserID != nil {
		userID = f.UserID.String()
	}
	return EntradaDeFirma{
		DocumentoID: f.DocumentoID.String(), Rol: f.Rol, Nombre: f.Nombre, DNI: textoDe(f.DNI),
		EnRepresentacion: f.EnRepresentacion, Vinculo: textoDe(f.Vinculo), Metodo: f.Metodo, UserID: userID,
		Trazo: f.Trazo, HashContenido: f.HashContenido, IP: textoDe(f.IP), UserAgent: textoDe(f.UserAgent),
		FirmadoEn: MomentoDeFirma(f.FirmadoEn).Format(time.RFC3339Nano),
	}
}

// Sello — la huella del documento entero, encadenada al anterior de la
// clínica (hashAnterior vacío para el primero).
func Sello(hashContenido string, huellasPorRol map[string]string, hashAnterior string) string {
	roles := make([]string, 0, len(huellasPorRol))
	for rol := range huellasPorRol {
		roles = append(roles, rol)
	}
	sort.Strings(roles)
	var b strings.Builder
	b.WriteString("contenido:" + hashContenido + "\n")
	for _, rol := range roles {
		b.WriteString("firma:" + rol + ":" + huellasPorRol[rol] + "\n")
	}
	b.WriteString("anterior:" + hashAnterior)
	return Huella([]byte(b.String()))
}

// Verificar — recalcula todo desde lo guardado y dice qué no coincide. Es
// lo que detecta una alteración hecha por fuera de la app (con los
// triggers desactivados): el trigger impide, esto delata.
func Verificar(d db.DocumentoClinico, firmas []db.DocumentoFirma, hashAnteriorEsperado string) error {
	if d.ContenidoCanonico == nil || d.HashContenido == nil {
		return fmt.Errorf("el documento no tiene contenido congelado")
	}
	if Huella([]byte(*d.ContenidoCanonico)) != *d.HashContenido {
		return fmt.Errorf("el contenido no coincide con su huella")
	}
	huellas := map[string]string{}
	for _, f := range firmas {
		if f.HashContenido != *d.HashContenido {
			return fmt.Errorf("la firma %s es de otro contenido", f.Rol)
		}
		recalculada, err := HuellaDe(EntradaDesde(f))
		if err != nil {
			return err
		}
		if recalculada != f.HashFirma {
			return fmt.Errorf("la firma %s no coincide con su huella", f.Rol)
		}
		huellas[f.Rol] = f.HashFirma
	}
	if d.Estado != db.DocumentoSellado {
		return nil
	}
	if textoDe(d.HashAnterior) != hashAnteriorEsperado {
		return fmt.Errorf("la cadena está cortada: el anterior no es el que dice")
	}
	if d.HashSello == nil || Sello(*d.HashContenido, huellas, hashAnteriorEsperado) != *d.HashSello {
		return fmt.Errorf("el sello no coincide")
	}
	return nil
}

// Límites de una firma dibujada: una firma real tiene decenas o cientos de
// puntos; esto deja margen de sobra y corta un cuerpo inflado a propósito.
const (
	trazosMaximos = 200
	puntosMinimos = 10
	puntosMaximos = 10000
	ladoMinimo    = 50
	ladoMaximo    = 4000
)

func redondear(v float64, decimales int) float64 {
	escala := math.Pow(10, float64(decimales))
	return math.Round(v*escala) / escala
}

// NormalizarTrazo — valida una firma dibujada y la deja en una forma
// estable (coordenadas con dos decimales, tiempos en milisegundos
// enteros), para que la huella no dependa de la precisión del navegador.
func NormalizarTrazo(t db.TrazoDeFirma) (db.TrazoDeFirma, error) {
	if t.Ancho < ladoMinimo || t.Ancho > ladoMaximo || t.Alto < ladoMinimo || t.Alto > ladoMaximo {
		return t, fmt.Errorf("el lienzo de la firma tiene un tamaño inválido")
	}
	if len(t.Trazos) == 0 || len(t.Trazos) > trazosMaximos {
		return t, fmt.Errorf("la firma está vacía o tiene demasiados trazos")
	}
	total := 0
	normalizado := db.TrazoDeFirma{Ancho: t.Ancho, Alto: t.Alto, Trazos: make([][][3]float64, 0, len(t.Trazos))}
	for _, trazo := range t.Trazos {
		if len(trazo) == 0 {
			return t, fmt.Errorf("la firma tiene un trazo vacío")
		}
		anterior := -1.0
		nuevo := make([][3]float64, 0, len(trazo))
		for _, p := range trazo {
			x, y, ms := p[0], p[1], p[2]
			if math.IsNaN(x) || math.IsNaN(y) || math.IsNaN(ms) ||
				x < 0 || y < 0 || x > float64(t.Ancho) || y > float64(t.Alto) || ms < 0 {
				return t, fmt.Errorf("la firma tiene un punto fuera del lienzo")
			}
			ms = math.Round(ms)
			if ms < anterior {
				return t, fmt.Errorf("los tiempos de un trazo van hacia atrás")
			}
			anterior = ms
			nuevo = append(nuevo, [3]float64{redondear(x, 2), redondear(y, 2), ms})
		}
		total += len(trazo)
		normalizado.Trazos = append(normalizado.Trazos, nuevo)
	}
	if total < puntosMinimos {
		return t, fmt.Errorf("la firma es demasiado corta: dibujala completa")
	}
	if total > puntosMaximos {
		return t, fmt.Errorf("la firma tiene demasiados puntos")
	}
	return normalizado, nil
}
