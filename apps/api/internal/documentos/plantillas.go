// Package documentos — el lado Go de las plantillas de documentos clínicos
// (Fase 5, TR-183). Las plantillas se escriben en
// packages/documentos-clinicos (TypeScript) y `pnpm documentos:generar` las
// copia acá como JSON, junto con un fixture de texto por plantilla: NO se
// editan a mano (CI regenera y falla si difieren de lo commiteado).
//
// Lo que hace este paquete con ellas:
//   - valida lo que carga el profesional (valores.go), con las mismas
//     reglas y los mismos mensajes que la pantalla;
//   - arma el texto del documento (texto.go) — el que se congela al
//     terminar y firma el paciente;
//   - congela el contenido en JSON canónico y calcula huellas y sellos
//     (canonico.go, sello.go).
//
// El texto lo arma la API, no la pantalla, porque lo que se firma tiene que
// salir de quien sella. La pantalla arma el suyo para el calco en vivo, y el
// test de fixtures (texto_test.go) garantiza que los dos coinciden.
package documentos

import (
	"embed"
	"encoding/json"
	"fmt"
	"slices"
	"sort"
	"strings"
)

//go:embed plantillas/*.json
var archivos embed.FS

// Fuente — de dónde sale el modelo (el Colegio).
type Fuente struct {
	Nombre string `json:"nombre"`
	URL    string `json:"url"`
}

// Opcion — una opción de un campo de opción única o múltiple.
type Opcion struct {
	Valor    string `json:"valor"`
	Etiqueta string `json:"etiqueta"`
}

// Detalle — la aclaración de un SI/NO ("¿cuál?"), pedida cuando la
// respuesta es Cuando.
type Detalle struct {
	Etiqueta string `json:"etiqueta"`
	Cuando   string `json:"cuando"`
}

// Campo — un campo del documento. Los punteros son lo opcional de cada tipo.
type Campo struct {
	Tipo      string   `json:"tipo"`
	ID        string   `json:"id"`
	Etiqueta  string   `json:"etiqueta"`
	Requerido bool     `json:"requerido,omitempty"`
	Ayuda     string   `json:"ayuda,omitempty"`
	Precarga  string   `json:"precarga,omitempty"`
	Bloqueado bool     `json:"bloqueado,omitempty"`
	Unidad    string   `json:"unidad,omitempty"`
	Min       *float64 `json:"min,omitempty"`
	Max       *float64 `json:"max,omitempty"`
	Decimales *int     `json:"decimales,omitempty"`
	Detalle   *Detalle `json:"detalle,omitempty"`
	Opciones  []Opcion `json:"opciones,omitempty"`
	Denticion string   `json:"denticion,omitempty"`
	// Leyenda y Existentes — los de un odontograma (odontograma.go).
	Leyenda    string `json:"leyenda,omitempty"`
	Existentes bool   `json:"existentes,omitempty"`
}

// Seccion — un grupo de campos del sidebar.
type Seccion struct {
	ID     string  `json:"id"`
	Titulo string  `json:"titulo"`
	Campos []Campo `json:"campos"`
}

// Bloque — un pedazo del cuerpo del documento.
type Bloque struct {
	T     string   `json:"t"`
	Texto string   `json:"texto,omitempty"`
	Items []string `json:"items,omitempty"`
	Campo string   `json:"campo,omitempty"`
}

// FirmaDePlantilla — un firmante que la plantilla pide.
type FirmaDePlantilla struct {
	Rol       string `json:"rol"`
	Etiqueta  string `json:"etiqueta"`
	Requerida bool   `json:"requerida"`
}

// Plantilla — la misma forma que `Plantilla` de packages/documentos-clinicos.
type Plantilla struct {
	ID          string             `json:"id"`
	Version     int                `json:"version"`
	Nombre      string             `json:"nombre"`
	Tipo        string             `json:"tipo"`
	Descripcion string             `json:"descripcion"`
	Fuente      Fuente             `json:"fuente"`
	Secciones   []Seccion          `json:"secciones"`
	Cuerpo      []Bloque           `json:"cuerpo"`
	Firmas      []FirmaDePlantilla `json:"firmas"`
	// Lamina — dónde va cada dato sobre la página original (lamina.go).
	Lamina *Lamina `json:"lamina,omitempty"`

	campos map[string]*Campo
}

// Campos — todos los campos, en el orden de las secciones.
func (p *Plantilla) Campos() []*Campo {
	var todos []*Campo
	for i := range p.Secciones {
		for j := range p.Secciones[i].Campos {
			todos = append(todos, &p.Secciones[i].Campos[j])
		}
	}
	return todos
}

// Campo — el campo con ese id, o nil.
func (p *Plantilla) Campo(id string) *Campo {
	return p.campos[id]
}

// SeFirmaEnPapel — un consentimiento informado se completa para imprimir
// y se firma a mano, en papel (TR-188): el cliente averiguó que la firma
// del paciente tiene que ser física, y una firma electrónica no la
// reemplaza. Al terminarse no espera firmas en el sistema ni se sella:
// queda "para imprimir". Mismo criterio que `seFirmaEnPapel` del paquete de
// TypeScript.
func (p *Plantilla) SeFirmaEnPapel() bool {
	return p.Tipo == "consentimiento"
}

// Los tipos de plantilla con reglas propias en la API: un anexo pertenece a
// una historia clínica del mismo paciente (5.6b). Los mismos que
// TIPOS_DE_PLANTILLA del paquete de TypeScript.
const (
	TipoHistoriaClinica = "historia_clinica"
	TipoAnexo           = "anexo"
)

// IDsDeTipo — los ids de las plantillas de ese tipo, sin repetir (todas sus
// versiones comparten el id).
func IDsDeTipo(tipo string) []string {
	var ids []string
	for _, p := range Todas() {
		if p.Tipo == tipo && !slices.Contains(ids, p.ID) {
			ids = append(ids, p.ID)
		}
	}
	return ids
}

// FirmasRequeridas — los roles que tienen que firmar para sellar.
func (p *Plantilla) FirmasRequeridas() []string {
	var roles []string
	for _, f := range p.Firmas {
		if f.Requerida {
			roles = append(roles, f.Rol)
		}
	}
	return roles
}

// Firma — la definición de un rol de firma de esta plantilla, o nil.
func (p *Plantilla) Firma(rol string) *FirmaDePlantilla {
	for i := range p.Firmas {
		if p.Firmas[i].Rol == rol {
			return &p.Firmas[i]
		}
	}
	return nil
}

var registro = map[string]*Plantilla{}

func clave(id string, version int) string { return fmt.Sprintf("%s@%d", id, version) }

// init carga todas las plantillas al arrancar. Una rota tumba el proceso en
// el boot, con un mensaje claro, en vez de en el primer documento.
func init() {
	entradas, err := archivos.ReadDir("plantillas")
	if err != nil {
		panic(fmt.Sprintf("documentos: no se pudo leer plantillas/: %v", err))
	}
	for _, entrada := range entradas {
		if !strings.HasSuffix(entrada.Name(), ".json") {
			continue
		}
		datos, err := archivos.ReadFile("plantillas/" + entrada.Name())
		if err != nil {
			panic(fmt.Sprintf("documentos: no se pudo leer %s: %v", entrada.Name(), err))
		}
		p, err := cargar(datos)
		if err != nil {
			panic(fmt.Sprintf("documentos: %s: %v", entrada.Name(), err))
		}
		registro[clave(p.ID, p.Version)] = p
	}
	if len(registro) == 0 {
		panic("documentos: no hay ninguna plantilla — ¿corriste pnpm documentos:generar?")
	}
}

func cargar(datos []byte) (*Plantilla, error) {
	var p Plantilla
	if err := json.Unmarshal(datos, &p); err != nil {
		return nil, err
	}
	if p.ID == "" || p.Version <= 0 {
		return nil, fmt.Errorf("plantilla sin id o sin versión")
	}
	p.campos = map[string]*Campo{}
	for _, c := range p.Campos() {
		if _, repetido := p.campos[c.ID]; repetido {
			return nil, fmt.Errorf("campo repetido: %s", c.ID)
		}
		p.campos[c.ID] = c
	}
	if p.Firma("profesional") == nil {
		return nil, fmt.Errorf("sin firma del profesional")
	}
	return &p, nil
}

// RegistrarPlantillaDePrueba — suma una plantilla al registro. SOLO PARA
// LOS TESTS de otros paquetes: la API la usa para probar el circuito de
// firma electrónica y sellado con una historia clínica, que todavía no
// tiene plantilla real (el consentimiento se firma en papel, TR-188).
// Llamarla desde un init() del test: el registro no admite escrituras con
// los tests ya corriendo.
func RegistrarPlantillaDePrueba(p Plantilla) error {
	datos, err := json.Marshal(p)
	if err != nil {
		return err
	}
	cargada, err := cargar(datos)
	if err != nil {
		return err
	}
	registro[clave(cargada.ID, cargada.Version)] = cargada
	return nil
}

// PorID — una versión puntual de una plantilla.
func PorID(id string, version int) (*Plantilla, bool) {
	p, ok := registro[clave(id, version)]
	return p, ok
}

// Ultima — la última versión de una plantilla: la que usa un documento nuevo.
func Ultima(id string) (*Plantilla, bool) {
	var ultima *Plantilla
	for _, p := range registro {
		if p.ID == id && (ultima == nil || p.Version > ultima.Version) {
			ultima = p
		}
	}
	return ultima, ultima != nil
}

// Todas — todas las plantillas y versiones, ordenadas por id y versión.
func Todas() []*Plantilla {
	todas := make([]*Plantilla, 0, len(registro))
	for _, p := range registro {
		todas = append(todas, p)
	}
	sort.Slice(todas, func(i, j int) bool {
		if todas[i].ID != todas[j].ID {
			return todas[i].ID < todas[j].ID
		}
		return todas[i].Version < todas[j].Version
	})
	return todas
}
