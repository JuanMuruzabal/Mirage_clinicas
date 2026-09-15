package http

// Repertorio de tipos de consulta odontológicos (Fase 3.2.5, 2026-09-15).
//
// Cuando una clínica arranca, o cuando el único colega tiene armados dos
// tipos, "Tipos de consulta ya creados" quedaba casi vacío y no ayudaba a
// nadie. Este repertorio da un punto de partida con nombres que un
// odontólogo reconoce, en vez de dejarlo inventar la nomenclatura.
//
// NO es una tabla ni una semilla: es una lista de SUGERENCIAS. Elegir una
// rellena el formulario y el tipo se crea por el alta de siempre, así que
// nace propio y editable — el mismo criterio que el de un colega. Si
// fuera una semilla en la base, toda clínica arrancaría con quince tipos
// que nadie pidió y habría que borrarlos a mano.
//
// Las duraciones son el punto de partida habitual de cada práctica, no
// una regla: cada profesional las ajusta antes de guardar. Los colores
// salen de la paleta del sistema de diseño (globals.css), no inventados.
type tipoConsultaSugerido struct {
	Nombre          string
	Color           string
	DuracionMinutos int
}

// Ordenado por frecuencia real en un consultorio, no alfabéticamente: lo
// que más se usa, primero — la lista se scrollea en horizontal y lo que
// queda al final casi no se ve.
var catalogoTiposConsulta = []tipoConsultaSugerido{
	{Nombre: "Consulta general", Color: "#E7D9BE", DuracionMinutos: 30},
	{Nombre: "Urgencia", Color: "#D6563A", DuracionMinutos: 30},
	{Nombre: "Limpieza dental", Color: "#6E8F72", DuracionMinutos: 45},
	{Nombre: "Arreglo", Color: "#C97F5A", DuracionMinutos: 45},
	{Nombre: "Endodoncia", Color: "#8A4B2E", DuracionMinutos: 90},
	{Nombre: "Extracción", Color: "#D6563A", DuracionMinutos: 45},
	{Nombre: "Control", Color: "#E7DFD1", DuracionMinutos: 20},
	{Nombre: "Ortodoncia", Color: "#3F5943", DuracionMinutos: 30},
	{Nombre: "Prótesis", Color: "#C97F5A", DuracionMinutos: 60},
	{Nombre: "Implante", Color: "#35312B", DuracionMinutos: 90},
	{Nombre: "Blanqueamiento", Color: "#E7D9BE", DuracionMinutos: 60},
	{Nombre: "Periodoncia", Color: "#6E8F72", DuracionMinutos: 60},
	{Nombre: "Radiografía", Color: "#E7DFD1", DuracionMinutos: 15},
	{Nombre: "Primera consulta", Color: "#3F5943", DuracionMinutos: 45},
}
