package http

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/clock"
	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/imagenes"
	"dental-mirage/api/internal/prismaengine"
	"dental-mirage/api/internal/security"
	"dental-mirage/api/internal/storage"
)

// registerPaginaPublicaRoutes monta /panel/pagina — el editor de página
// pública (spec §5, Fase 4). Fase 4.1/4.2: barra de acciones
// (Ocultar/Deployar) + contenido completo (bio, tema, módulos, fotos).
func registerPaginaPublicaRoutes(r chi.Router, gdb *gorm.DB, store storage.Storage) {
	r.Get("/panel/pagina", getPaginaPublicaHandler(gdb))
	r.Patch("/panel/pagina", actualizarPaginaPublicaHandler(gdb))
	registerHorariosClinicaRoutes(r, gdb)
	r.Patch("/panel/pagina/ocultar", ocultarPaginaPublicaHandler(gdb))
	// PE-8: "Publicar" reemplaza a "Deployar" (PATCH /panel/pagina/deployar
	// ya no existe) — POST porque deja de ser idempotente: cada llamada crea
	// una versión nueva, no solo marca una fecha.
	r.Post("/panel/pagina/publicar", publicarPaginaPublicaHandler(gdb))
	r.Get("/panel/pagina/versiones", historialPaginaPublicaHandler(gdb))
	r.Post("/panel/pagina/versiones/{numero}/restaurar", restaurarVersionPaginaPublicaHandler(gdb))
	r.Post("/panel/pagina/fotos", subirFotoPaginaPublicaHandler(store))
}

// Qué tipo de módulo es válido, y qué forma tiene su config, se resuelve
// contra el esquema generado (PE-1, internal/prismaengine) — ya no hay un
// catálogo ni un switch escritos a mano acá. "portada" y "turno" siguen
// afuera a propósito (no tienen esquema): son estructurales y fijos, los
// renderiza el frontend directo (Fase 4.5), nunca una fila acá. El tope de
// la galería (8 fotos) tampoco tiene espejo acá por la misma razón: vive
// solo en packages/prisma-engine/src/modulos/galeria/schema.ts.
//
// topeFotosSueltasPorPagina sigue siendo una constante de Go porque cuenta
// módulos "foto" ENTRE SÍ en toda la página — algo que un esquema por
// módulo no puede expresar (no es la config de UN módulo). maxLargoBio/
// maxLargoRed validan campos de la PÁGINA (bio, redes), tampoco de un
// módulo.
//
// maxLargoTituloTexto/maxLargoTextoLibre/maxLargoNombreModulo ya no validan
// nada acá (eso lo hace el esquema, con los mismos números — ver
// packages/prisma-engine/src/constantes.ts y schema-base.ts): siguen
// definidas SOLO para que los tests de este paquete puedan construir un
// texto "uno más largo que el límite" sin repetir el número a mano. Si se
// cambia un largo, cambiarlo en el paquete y acá en el mismo commit.
const (
	topeFotosSueltasPorPagina = 10

	maxLargoBio          = 2000
	maxLargoTituloTexto  = 80
	maxLargoTextoLibre   = 2000
	maxLargoRed          = 100
	maxLargoNombreModulo = 60
	maxLargoURLFoto      = 500 // el de la columna foto_portada_url
	// El de la columna foto_portada_alt (PP-4); espejo de MAX_LARGO_ALT_FOTO
	// del paquete, que valida el de las fotos de los módulos.
	maxLargoAltFoto = 150
	// Los de las columnas seo_titulo/seo_descripcion (PE-9).
	maxLargoSeoTitulo      = 70
	maxLargoSeoDescripcion = 160
)

// textoSeo — un título o una descripción para buscadores es UNA línea: los
// saltos y los espacios repetidos se colapsan (Google los muestra igual, y
// en una etiqueta <meta> un salto de línea no significa nada).
func textoSeo(s string) string {
	return strings.Join(strings.Fields(s), " ")
}

// redesSocialesValidas — lista cerrada, igual criterio que las
// estadísticas: la página muestra estas tres y nada más.
var redesSocialesValidas = map[string]bool{"instagram": true, "facebook": true, "whatsapp": true}

// coloresNombreValidos — el color del nombre sobre la portada es un set
// curado y no un hex libre (la individualización de la página vive dentro de
// opciones ya resueltas, decisión #5 de fase4-personalizar-pagina.md). "" =
// sin elegir: el frontend usa blanco. Espejo de COLORES_NOMBRE en
// apps/web/src/lib/pagina-publica/portada.ts y del CHECK
// chk_pagina_publica_nombre_color (db/migrate.go) — los tres cambian juntos.
var coloresNombreValidos = map[string]bool{"": true, "blanco": true, "negro": true, "dorado": true, "celeste": true}

// urlDeFotoValida — una foto de la página viene de nuestro propio upload
// (POST /panel/pagina/fotos), que devuelve una URL absoluta (http/https) o
// una ruta bajo /uploads/. Nada de `javascript:`/`data:` ni de esquemas
// raros: el frontend las pone en un `src`, y sin este filtro cualquier
// admin de una clínica podría guardar lo que quiera en una página que ve
// el público. Vacía vale (= sin foto).
func urlDeFotoValida(u string) bool {
	if u == "" {
		return true
	}
	if len(u) > maxLargoURLFoto {
		return false
	}
	return strings.HasPrefix(u, "/uploads/") || strings.HasPrefix(u, "https://") || strings.HasPrefix(u, "http://")
}

// validarRedesSociales — la clave tiene que ser una de las tres, y el valor
// es un usuario/número o una URL http(s): un valor con esquema que no sea
// http(s) (`javascript:...`) se rechaza porque el frontend lo va a
// convertir en un link clickeable de la vidriera pública.
func validarRedesSociales(redes map[string]string) error {
	for clave, valor := range redes {
		if !redesSocialesValidas[clave] {
			return fmt.Errorf("red social no soportada: %q", clave)
		}
		valor = strings.TrimSpace(valor)
		if len(valor) > maxLargoRed {
			return fmt.Errorf("el valor de %s es demasiado largo (máximo %d caracteres)", clave, maxLargoRed)
		}
		if strings.Contains(valor, ":") && !strings.HasPrefix(valor, "https://") && !strings.HasPrefix(valor, "http://") {
			return fmt.Errorf("el valor de %s tiene un formato inválido", clave)
		}
	}
	return nil
}

// vacioANil — un texto vacío (tras recortar) se guarda como NULL, no como
// "". Un `*string` de un JSON no distingue "null" de "ausente" (los dos
// llegan como nil), así que la forma de VACIAR un campo opcional es mandar
// "" — y no queremos una columna llena de cadenas vacías que después haya
// que distinguir de NULL en cada lectura.
func vacioANil(s *string) *string {
	if s == nil {
		return nil
	}
	t := strings.TrimSpace(*s)
	if t == "" {
		return nil
	}
	return &t
}

type moduloResponse struct {
	ID         string         `json:"id,omitempty"`
	Tipo       string         `json:"tipo"`
	Orden      int            `json:"orden"`
	Visible    bool           `json:"visible"`
	Config     map[string]any `json:"config,omitempty"`
	DatosVista map[string]any `json:"datosVista,omitempty"`
}

func toModuloResponse(m db.PaginaPublicaModulo) moduloResponse {
	return moduloResponse{ID: m.ID.String(), Tipo: m.Tipo, Orden: m.Orden, Visible: m.Visible, Config: m.Config}
}

type paginaPublicaResponse struct {
	Oculta         bool    `json:"oculta"`
	DeployadaEn    *string `json:"deployadaEn,omitempty"`
	Bio            *string `json:"bio,omitempty"`
	Tema           string  `json:"tema"`
	TemaVariante   string  `json:"temaVariante"`
	TemaTipografia string  `json:"temaTipografia"`
	FotoPortadaURL *string `json:"fotoPortadaUrl,omitempty"`
	// FotoPortadaAlt (PP-4): "" = el alt genérico de la web.
	FotoPortadaAlt    string            `json:"fotoPortadaAlt"`
	RedesSociales     map[string]string `json:"redesSociales"`
	MostrarMapa       bool              `json:"mostrarMapa"`
	DireccionOverride *string           `json:"direccionOverride,omitempty"`
	// NombreSobrePortada/NombreColor: el nombre de la clínica sobre la foto de
	// portada y su color (set curado, ver coloresNombreValidos).
	NombreSobrePortada bool   `json:"nombreSobrePortada"`
	NombreColor        string `json:"nombreColor"`
	// TemaTokens (PE-2): overrides de los tokens de diseño del tema. Siempre
	// un objeto (nunca null), aunque no haya ninguno elegido.
	TemaTokens map[string]any `json:"temaTokens"`
	// SeoTitulo/SeoDescripcion (PE-9): "" = el default de la web.
	SeoTitulo      string `json:"seoTitulo"`
	SeoDescripcion string `json:"seoDescripcion"`
	// DireccionClinica — la de la Clinic, SIN el override. El editor
	// calcula la efectiva (override si hay, si no esta) del lado del
	// cliente para previsualizar el módulo de contacto mientras se
	// tipea; si viniera ya resuelta, borrar el override en el editor
	// dejaría la previsualización sin saber a qué volver.
	DireccionClinica *string `json:"direccionClinica,omitempty"`
	// CiudadClinica/EspecialidadesClinica (PE-9): con qué arma la web el
	// título y la descripción por defecto para buscadores — el editor los
	// muestra como sugerencia con los MISMOS datos que la página pública
	// (las especialidades son la unión de todos los profesionales activos,
	// no las de quien edita).
	CiudadClinica         *string                      `json:"ciudadClinica,omitempty"`
	EspecialidadesClinica []string                     `json:"especialidadesClinica"`
	Modulos               []moduloResponse             `json:"modulos"`
	Estadisticas          map[string]int               `json:"estadisticas"`
	EquipoElegible        []equipoElegibleResponse     `json:"equipoElegible"`
	HorariosClinica       horariosClinicaResponse      `json:"horariosClinica"`
	ServiciosDisponibles  []servicioDisponibleResponse `json:"serviciosDisponibles"`
	// Revision/ActualizadaPor*/UltimaVersionPublicada (PE-8): el candado
	// optimista del borrador y lo necesario para que el editor calcule
	// "hay cambios sin publicar" sin un segundo viaje al servidor.
	Revision               int              `json:"revision"`
	ActualizadaEn          string           `json:"actualizadaEn"`
	ActualizadaPorNombre   *string          `json:"actualizadaPorNombre,omitempty"`
	UltimaVersionPublicada *versionResponse `json:"ultimaVersionPublicada,omitempty"`
}

// moduloContenidoResponse — un módulo dentro de una VERSIÓN publicada: sin
// `id` (una versión no referencia filas de pagina_publica_modulos, ver el
// comentario de PaginaPublicaContenidoModulo en models.go).
type moduloContenidoResponse struct {
	Tipo    string         `json:"tipo"`
	Orden   int            `json:"orden"`
	Visible bool           `json:"visible"`
	Config  map[string]any `json:"config,omitempty"`
}

// contenidoVersionResponse — mismo shape que paginaPublicaResponse menos lo
// que una versión no guarda (Oculta, DeployadaEn, Estadisticas, Revision):
// esas son del borrador o se calculan siempre en vivo, nunca de una foto
// vieja.
type contenidoVersionResponse struct {
	Bio                *string                   `json:"bio,omitempty"`
	Tema               string                    `json:"tema"`
	TemaVariante       string                    `json:"temaVariante"`
	TemaTipografia     string                    `json:"temaTipografia"`
	FotoPortadaURL     *string                   `json:"fotoPortadaUrl,omitempty"`
	FotoPortadaAlt     string                    `json:"fotoPortadaAlt"`
	RedesSociales      map[string]string         `json:"redesSociales"`
	MostrarMapa        bool                      `json:"mostrarMapa"`
	DireccionOverride  *string                   `json:"direccionOverride,omitempty"`
	NombreSobrePortada bool                      `json:"nombreSobrePortada"`
	NombreColor        string                    `json:"nombreColor"`
	TemaTokens         map[string]any            `json:"temaTokens"`
	SeoTitulo          string                    `json:"seoTitulo"`
	SeoDescripcion     string                    `json:"seoDescripcion"`
	Modulos            []moduloContenidoResponse `json:"modulos"`
}

type versionResponse struct {
	Numero             int                      `json:"numero"`
	PublicadaEn        string                   `json:"publicadaEn"`
	PublicadaPorNombre string                   `json:"publicadaPorNombre"`
	Contenido          contenidoVersionResponse `json:"contenido"`
}

func toContenidoVersionResponse(c db.PaginaPublicaContenidoVersion) contenidoVersionResponse {
	modulos := make([]moduloContenidoResponse, len(c.Modulos))
	for i, m := range c.Modulos {
		modulos[i] = moduloContenidoResponse{Tipo: m.Tipo, Orden: m.Orden, Visible: m.Visible, Config: m.Config}
	}
	redes := c.RedesSociales
	if redes == nil {
		redes = map[string]string{}
	}
	return contenidoVersionResponse{
		Bio: c.Bio, Tema: c.Tema, TemaVariante: c.TemaVariante, TemaTipografia: c.TemaTipografia,
		FotoPortadaURL: c.FotoPortadaURL, FotoPortadaAlt: c.FotoPortadaAlt, RedesSociales: redes, MostrarMapa: c.MostrarMapa,
		DireccionOverride: c.DireccionOverride, NombreSobrePortada: c.NombreSobrePortada, NombreColor: c.NombreColor,
		TemaTokens: tokensOVacio(c.TemaTokens),
		SeoTitulo:  c.SeoTitulo, SeoDescripcion: c.SeoDescripcion,
		Modulos: modulos,
	}
}

// tokensOVacio — los tokens de diseño viajan siempre como objeto: una página
// (o una versión publicada) anterior a PE-2 no los tiene, y eso significa
// "ningún override", no "dato ausente".
func tokensOVacio(t map[string]any) map[string]any {
	if t == nil {
		return map[string]any{}
	}
	return t
}

func toVersionResponse(gdb *gorm.DB, v db.PaginaPublicaVersion) versionResponse {
	return versionResponse{
		Numero:             v.Numero,
		PublicadaEn:        v.PublicadaEn.UTC().Format(time.RFC3339),
		PublicadaPorNombre: nombreDelProfesional(gdb, v.PublicadaPorUserID),
		Contenido:          toContenidoVersionResponse(v.Contenido),
	}
}

// ultimaVersionPublicada — la de mayor Numero, o nil si la página nunca se
// publicó. Se usa tanto en respuestaDePagina (para "hay cambios sin
// publicar") como en publicarPaginaPublicaHandler (para el próximo Numero).
func ultimaVersionPublicada(gdb *gorm.DB, paginaID uuid.UUID) (*db.PaginaPublicaVersion, error) {
	var version db.PaginaPublicaVersion
	err := gdb.Where("pagina_publica_id = ?", paginaID).Order("numero DESC").First(&version).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &version, nil
}

// respuestaDePagina arma la respuesta completa de /panel/pagina — el único
// lugar que junta la página con sus estadísticas y con la dirección de la
// clínica, para que los cuatro handlers respondan igual.
func respuestaDePagina(gdb *gorm.DB, clinicID uuid.UUID, p db.PaginaPublica) (paginaPublicaResponse, error) {
	resp := toPaginaPublicaResponse(p, estadisticasDeLaClinica(gdb, clinicID))
	var err error
	resp.EquipoElegible, err = equipoElegibleDeLaClinica(gdb, clinicID)
	if err != nil {
		return paginaPublicaResponse{}, err
	}
	resp.ServiciosDisponibles, err = serviciosDisponiblesDeLaClinica(gdb, clinicID)
	if err != nil {
		return paginaPublicaResponse{}, err
	}
	resp.HorariosClinica, err = leerHorariosClinica(gdb, clinicID)
	if err != nil {
		return paginaPublicaResponse{}, err
	}
	var clinic db.Clinic
	if err := gdb.Where("id = ?", clinicID).First(&clinic).Error; err == nil {
		resp.DireccionClinica = clinic.Direccion
		resp.CiudadClinica = clinic.Ciudad
	}
	resp.EspecialidadesClinica = especialidadesUnicasDe(profesionalesActivosDeLaClinica(gdb, clinicID))
	resp.ActualizadaEn = p.UpdatedAt.UTC().Format(time.RFC3339)
	if p.ActualizadaPorUserID != nil {
		nombre := nombreDelProfesional(gdb, p.ActualizadaPorUserID)
		resp.ActualizadaPorNombre = &nombre
	}
	if ultima, err := ultimaVersionPublicada(gdb, p.ID); err == nil && ultima != nil {
		v := toVersionResponse(gdb, *ultima)
		resp.UltimaVersionPublicada = &v
	}
	return resp, nil
}

func toPaginaPublicaResponse(p db.PaginaPublica, estadisticas map[string]int) paginaPublicaResponse {
	resp := paginaPublicaResponse{
		Oculta:             p.Oculta,
		Bio:                p.Bio,
		Tema:               p.Tema,
		TemaVariante:       p.TemaVariante,
		TemaTipografia:     p.TemaTipografia,
		FotoPortadaURL:     p.FotoPortadaURL,
		FotoPortadaAlt:     p.FotoPortadaAlt,
		RedesSociales:      p.RedesSociales,
		MostrarMapa:        p.MostrarMapa,
		DireccionOverride:  p.DireccionOverride,
		NombreSobrePortada: p.NombreSobrePortada,
		NombreColor:        p.NombreColor,
		TemaTokens:         tokensOVacio(p.TemaTokens),
		SeoTitulo:          p.SeoTitulo,
		SeoDescripcion:     p.SeoDescripcion,
		Modulos:            make([]moduloResponse, len(p.Modulos)),
		Estadisticas:       estadisticas,
		Revision:           p.Revision,
	}
	if resp.RedesSociales == nil {
		resp.RedesSociales = map[string]string{}
	}
	for i, m := range p.Modulos {
		resp.Modulos[i] = toModuloResponse(m)
	}
	if p.DeployadaEn != nil {
		iso := p.DeployadaEn.UTC().Format(time.RFC3339)
		resp.DeployadaEn = &iso
	}
	return resp
}

// getOrCrearPaginaPublica — PaginaPublica es 1:1 con Clinic pero la fila no
// se crea al registrarse (ver internal/db/models.go) — se crea la primera
// vez que hace falta.
func getOrCrearPaginaPublica(gdb *gorm.DB, clinicID uuid.UUID) (*db.PaginaPublica, error) {
	var pagina db.PaginaPublica
	err := gdb.Preload("Modulos", func(tx *gorm.DB) *gorm.DB { return tx.Order("orden") }).
		Where("clinic_id = ?", clinicID).First(&pagina).Error
	if err == nil {
		return &pagina, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	pagina = db.PaginaPublica{ClinicID: clinicID}
	if err := gdb.Create(&pagina).Error; err != nil {
		return nil, err
	}
	return &pagina, nil
}

// estadisticasDeLaClinica — valores REALES, calculados en el momento
// (nunca un número cargado a mano, decisión cerrada en
// docs/Fases post MVP/Fase 4/fase4-personalizar-pagina.md: "solo
// estadísticas reales del sistema"). Clínica-wide a propósito — es un dato
// de la vidriera pública de la clínica entera, no del profesional que
// mira el editor.
func estadisticasDeLaClinica(gdb *gorm.DB, clinicID uuid.UUID) map[string]int {
	var pacientesAtendidos int64
	gdb.Model(&db.Turno{}).
		Where("clinic_id = ? AND asistencia = ?", clinicID, "asistio").
		Distinct("paciente_id").Count(&pacientesAtendidos)

	var turnosRealizados int64
	gdb.Model(&db.Turno{}).
		Where("clinic_id = ? AND asistencia = ?", clinicID, "asistio").
		Count(&turnosRealizados)

	return map[string]int{
		"pacientes_atendidos": int(pacientesAtendidos),
		"turnos_realizados":   int(turnosRealizados),
	}
}

func getPaginaPublicaHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clinicID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}
		pagina, err := getOrCrearPaginaPublica(gdb, clinicID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo obtener la página")
			return
		}
		resp, err := respuestaDePagina(gdb, clinicID, *pagina)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo obtener la configuración de los módulos")
			return
		}
		writeJSON(w, http.StatusOK, resp)
	}
}

// ---------------------------------------------------------------------
// PATCH /panel/pagina — contenido completo (Fase 4.2)
// ---------------------------------------------------------------------

type moduloRequest struct {
	Tipo    string         `json:"tipo"`
	Orden   int            `json:"orden"`
	Visible bool           `json:"visible"`
	Config  map[string]any `json:"config"`
}

type actualizarPaginaPublicaRequest struct {
	Bio               *string           `json:"bio"`
	Tema              *string           `json:"tema"`
	TemaVariante      *string           `json:"temaVariante"`
	TemaTipografia    *string           `json:"temaTipografia"`
	RedesSociales     map[string]string `json:"redesSociales"`
	MostrarMapa       *bool             `json:"mostrarMapa"`
	DireccionOverride *string           `json:"direccionOverride"`
	FotoPortadaURL    *string           `json:"fotoPortadaUrl"`
	// FotoPortadaAlt (PP-4): "" vuelve al alt genérico.
	FotoPortadaAlt     *string `json:"fotoPortadaAlt"`
	NombreSobrePortada *bool   `json:"nombreSobrePortada"`
	NombreColor        *string `json:"nombreColor"`
	// TemaTokens (PE-2) — puntero al mapa por el mismo motivo que Modulos:
	// nil = no vino (no tocar); `{}` = sacar todos los overrides (volver a
	// los tokens del tema).
	TemaTokens *map[string]any `json:"temaTokens"`
	// SeoTitulo/SeoDescripcion (PE-9): "" vuelve al default de la web.
	SeoTitulo      *string `json:"seoTitulo"`
	SeoDescripcion *string `json:"seoDescripcion"`
	// Modulos — puntero al slice, no el slice solo: distingue "no vino en
	// el body" (nil, no tocar los módulos existentes) de "vino una lista
	// vacía" (reemplazar por CERO módulos, ej. el owner borró todos).
	Modulos *[]moduloRequest `json:"modulos"`
	// Revision (PE-8): la que el cliente cree que tiene el borrador AHORA.
	// Obligatoria — sin ella no hay forma de detectar que alguien más
	// guardó antes (edición simultánea, admin delegable). Si no coincide
	// con la guardada, el handler responde 409 en vez de pisar el cambio
	// ajeno.
	Revision *int `json:"revision"`
}

// validarModulos (PE-1) — cada Tipo tiene que tener un esquema generado
// (internal/prismaengine) y su Config validar contra él: ahí vive lo que
// antes era un `switch` a mano por tipo (subtipo de foto obligatorio, tope
// de la galería, estadísticas del catálogo cerrado, largos de texto,
// nombre propio). Lo único que sigue acá es lo que un esquema POR MÓDULO no
// puede expresar: el tope de fotos SUELTAS cuenta módulos "foto" entre sí,
// en toda la lista.
func validarModulos(modulos []moduloRequest) error {
	fotosSueltas := 0
	for _, m := range modulos {
		if err := prismaengine.ValidarConfigDeModulo(m.Tipo, m.Config); err != nil {
			return err
		}
		if m.Tipo == "foto" {
			fotosSueltas++
		}
	}
	if fotosSueltas > topeFotosSueltasPorPagina {
		return fmt.Errorf("la página admite hasta %d módulos de foto sueltos", topeFotosSueltasPorPagina)
	}
	return nil
}

// actualizarPaginaPublicaHandler — PATCH /panel/pagina: reemplazo del
// estado completo, mismo criterio que PUT /horario-atencion/general (no un
// PATCH parcial por módulo — no hay precedente de eso en el repo, y calza
// con el botón "Guardar cambios" del editor: se arma todo del lado del
// cliente y se guarda de una vez, Fase 4.4). `Modulos`, si vino, reemplaza
// TODAS las filas existentes (DELETE + INSERT en una transacción).
func actualizarPaginaPublicaHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clinicID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}
		var req actualizarPaginaPublicaRequest
		if err := decodeJSON(w, r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "cuerpo de la request inválido")
			return
		}

		tema, temaVariante, tipografia := "", "", ""
		if req.Tema != nil {
			tema = strings.TrimSpace(*req.Tema)
		}
		if req.TemaVariante != nil {
			temaVariante = strings.TrimSpace(*req.TemaVariante)
		}
		if req.TemaTipografia != nil {
			tipografia = strings.TrimSpace(*req.TemaTipografia)
		}
		// Si Tema/TemaVariante no vinieron en este PATCH, validar contra lo
		// que la página ya tiene guardado — no contra "" (que siempre pasa).
		if req.Tema == nil || req.TemaVariante == nil {
			var actual db.PaginaPublica
			if err := gdb.Where("clinic_id = ?", clinicID).First(&actual).Error; err == nil {
				if req.Tema == nil {
					tema = actual.Tema
				}
				if req.TemaVariante == nil {
					temaVariante = actual.TemaVariante
				}
			}
		}
		if !temaEsValido(tema, temaVariante) {
			writeError(w, http.StatusBadRequest, "tema o variante de color inválidos")
			return
		}
		if req.TemaTipografia != nil && !tipografiaEsValida(tipografia) {
			writeError(w, http.StatusBadRequest, "tipografía inválida")
			return
		}

		if req.Bio != nil && len([]rune(*req.Bio)) > maxLargoBio {
			writeError(w, http.StatusBadRequest, fmt.Sprintf("la bio admite hasta %d caracteres", maxLargoBio))
			return
		}
		if req.FotoPortadaURL != nil && !urlDeFotoValida(strings.TrimSpace(*req.FotoPortadaURL)) {
			writeError(w, http.StatusBadRequest, "la URL de la foto de portada no es válida")
			return
		}
		fotoPortadaAlt := ""
		if req.FotoPortadaAlt != nil {
			// Una línea, como un título: un alt con saltos se lee igual.
			fotoPortadaAlt = textoSeo(*req.FotoPortadaAlt)
			if len([]rune(fotoPortadaAlt)) > maxLargoAltFoto {
				writeError(w, http.StatusBadRequest, fmt.Sprintf("la descripción de la foto de portada admite hasta %d caracteres", maxLargoAltFoto))
				return
			}
		}
		if req.NombreColor != nil && !coloresNombreValidos[strings.TrimSpace(*req.NombreColor)] {
			writeError(w, http.StatusBadRequest, "color del nombre inválido")
			return
		}
		if req.TemaTokens != nil {
			if err := prismaengine.ValidarTokensDeTema(*req.TemaTokens); err != nil {
				writeError(w, http.StatusBadRequest, err.Error())
				return
			}
		}
		seoTitulo, seoDescripcion := "", ""
		if req.SeoTitulo != nil {
			seoTitulo = textoSeo(*req.SeoTitulo)
			if len([]rune(seoTitulo)) > maxLargoSeoTitulo {
				writeError(w, http.StatusBadRequest, fmt.Sprintf("el título para buscadores admite hasta %d caracteres", maxLargoSeoTitulo))
				return
			}
		}
		if req.SeoDescripcion != nil {
			seoDescripcion = textoSeo(*req.SeoDescripcion)
			if len([]rune(seoDescripcion)) > maxLargoSeoDescripcion {
				writeError(w, http.StatusBadRequest, fmt.Sprintf("la descripción para buscadores admite hasta %d caracteres", maxLargoSeoDescripcion))
				return
			}
		}
		if req.RedesSociales != nil {
			if err := validarRedesSociales(req.RedesSociales); err != nil {
				writeError(w, http.StatusBadRequest, err.Error())
				return
			}
		}

		if req.Modulos != nil {
			if err := validarModulos(*req.Modulos); err != nil {
				writeError(w, http.StatusBadRequest, err.Error())
				return
			}
			if err := validarServiciosSeleccionados(*req.Modulos); err != nil {
				writeError(w, http.StatusBadRequest, err.Error())
				return
			}
			if err := validarSeleccionDeEquipo(gdb, clinicID, *req.Modulos); err != nil {
				writeError(w, http.StatusBadRequest, err.Error())
				return
			}
		}

		// Revision (PE-8): obligatoria, ver el comentario del campo en
		// actualizarPaginaPublicaRequest.
		if req.Revision == nil {
			writeError(w, http.StatusBadRequest, "falta la revisión del borrador")
			return
		}
		userID, ok := usuarioDeLaSesion(r)
		if !ok {
			writeError(w, http.StatusUnauthorized, "falta el token de autenticación")
			return
		}

		pagina, err := getOrCrearPaginaPublica(gdb, clinicID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo obtener la página")
			return
		}

		err = gdb.Transaction(func(tx *gorm.DB) error {
			// Struct + Select explícito, no un map[string]any — mismo
			// patrón que updateMeHandler (me.go): es el camino ya probado
			// en el repo para un update parcial de campos que incluyen un
			// jsonb con serializer (RedesSociales), y actualizar por mapa
			// es terreno sin probar acá para ese caso.
			//
			// Revision/ActualizadaPorUserID SIEMPRE están en campos — a
			// diferencia del resto, no son opcionales: todo PATCH exitoso
			// avanza el candado optimista, aunque no haya cambiado ningún
			// otro campo.
			updates := db.PaginaPublica{Revision: *req.Revision + 1, ActualizadaPorUserID: &userID}
			campos := []string{"Revision", "ActualizadaPorUserID"}
			if req.Bio != nil {
				updates.Bio = vacioANil(req.Bio)
				campos = append(campos, "Bio")
			}
			if req.Tema != nil {
				updates.Tema = tema
				campos = append(campos, "Tema")
			}
			if req.TemaVariante != nil {
				updates.TemaVariante = temaVariante
				campos = append(campos, "TemaVariante")
			}
			if req.TemaTipografia != nil {
				updates.TemaTipografia = tipografia
				campos = append(campos, "TemaTipografia")
			}
			if req.RedesSociales != nil {
				// Sin entradas vacías: una red que el admin borró no
				// tiene que sobrevivir como {"instagram": ""}.
				limpias := make(map[string]string, len(req.RedesSociales))
				for clave, valor := range req.RedesSociales {
					if v := strings.TrimSpace(valor); v != "" {
						limpias[clave] = v
					}
				}
				updates.RedesSociales = limpias
				campos = append(campos, "RedesSociales")
			}
			if req.MostrarMapa != nil {
				updates.MostrarMapa = *req.MostrarMapa
				campos = append(campos, "MostrarMapa")
			}
			if req.DireccionOverride != nil {
				updates.DireccionOverride = vacioANil(req.DireccionOverride)
				campos = append(campos, "DireccionOverride")
			}
			if req.FotoPortadaURL != nil {
				updates.FotoPortadaURL = vacioANil(req.FotoPortadaURL)
				campos = append(campos, "FotoPortadaURL")
			}
			if req.FotoPortadaAlt != nil {
				updates.FotoPortadaAlt = fotoPortadaAlt
				campos = append(campos, "FotoPortadaAlt")
			}
			if req.NombreSobrePortada != nil {
				updates.NombreSobrePortada = *req.NombreSobrePortada
				campos = append(campos, "NombreSobrePortada")
			}
			if req.NombreColor != nil {
				updates.NombreColor = strings.TrimSpace(*req.NombreColor)
				campos = append(campos, "NombreColor")
			}
			if req.TemaTokens != nil {
				updates.TemaTokens = tokensOVacio(*req.TemaTokens)
				campos = append(campos, "TemaTokens")
			}
			if req.SeoTitulo != nil {
				updates.SeoTitulo = seoTitulo
				campos = append(campos, "SeoTitulo")
			}
			if req.SeoDescripcion != nil {
				updates.SeoDescripcion = seoDescripcion
				campos = append(campos, "SeoDescripcion")
			}
			// "AND revision = ?" hace del UPDATE el candado entero: una sola
			// sentencia atómica, no un SELECT-luego-UPDATE con ventana para
			// que otra request se cuele en el medio. 0 filas afectadas =
			// alguien más guardó antes (la fila existe, la Revision ya no
			// coincide) — se corta ACÁ, antes de tocar los módulos, para no
			// dejar la página a mitad de camino entre dos guardados.
			resultado := tx.Model(&db.PaginaPublica{}).
				Where("id = ? AND revision = ?", pagina.ID, *req.Revision).
				Select(campos).Updates(updates)
			if resultado.Error != nil {
				return resultado.Error
			}
			if resultado.RowsAffected == 0 {
				return errRevisionDesactualizada
			}
			if req.Modulos != nil {
				if err := tx.Where("pagina_publica_id = ?", pagina.ID).Delete(&db.PaginaPublicaModulo{}).Error; err != nil {
					return err
				}
				for _, m := range *req.Modulos {
					fila := db.PaginaPublicaModulo{
						PaginaPublicaID: pagina.ID, Tipo: m.Tipo, Orden: m.Orden, Visible: m.Visible, Config: m.Config,
					}
					if err := tx.Create(&fila).Error; err != nil {
						return err
					}
					// Visible=false hay que escribirlo aparte: el modelo
					// tiene `default:true` y GORM trata el false como "no
					// vino" al crear (ni Select("*") lo evita) — ocultar un
					// módulo se guardaba como visible y nadie lo notaba (lo
					// encontró el test de `personalizada`).
					if !m.Visible {
						if err := tx.Model(&fila).Update("visible", false).Error; err != nil {
							return err
						}
					}
				}
			}
			return nil
		})
		if errors.Is(err, errRevisionDesactualizada) {
			actual, errLectura := getOrCrearPaginaPublica(gdb, clinicID)
			if errLectura != nil {
				writeError(w, http.StatusInternalServerError, "no se pudo actualizar la página")
				return
			}
			writeJSON(w, http.StatusConflict, conflictoRevisionResponse(gdb, *actual))
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo actualizar la página")
			return
		}

		pagina, err = getOrCrearPaginaPublica(gdb, clinicID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "página actualizada pero no se pudo leerla de vuelta")
			return
		}
		resp, err := respuestaDePagina(gdb, clinicID, *pagina)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "página actualizada pero no se pudo leer la configuración de los módulos")
			return
		}
		writeJSON(w, http.StatusOK, resp)
	}
}

// errRevisionDesactualizada — sentinela interno: nunca sale del paquete, es
// solo para distinguir "conflicto de revisión" (409) de un error de verdad
// (500) al volver del gdb.Transaction de arriba.
var errRevisionDesactualizada = errors.New("revision desactualizada")

type conflictoRevisionBody struct {
	Error                string  `json:"error"`
	RevisionActual       int     `json:"revisionActual"`
	ActualizadaEn        string  `json:"actualizadaEn"`
	ActualizadaPorNombre *string `json:"actualizadaPorNombre,omitempty"`
}

// conflictoRevisionResponse — "quién y cuándo" (plan Prisma Engine, PE-8):
// lo que el editor necesita para ofrecer "recargar" o "quedarte con tu
// copia" sin adivinar.
func conflictoRevisionResponse(gdb *gorm.DB, actual db.PaginaPublica) conflictoRevisionBody {
	body := conflictoRevisionBody{
		Error:          "otra persona guardó cambios en esta página mientras editabas",
		RevisionActual: actual.Revision,
		ActualizadaEn:  actual.UpdatedAt.UTC().Format(time.RFC3339),
	}
	if actual.ActualizadaPorUserID != nil {
		nombre := nombreDelProfesional(gdb, actual.ActualizadaPorUserID)
		body.ActualizadaPorNombre = &nombre
	}
	return body
}

// ---------------------------------------------------------------------
// POST /panel/pagina/fotos — upload (Fase 4.2)
// ---------------------------------------------------------------------

const maxFotoBytes = 5 << 20 // 5 MiB — decodeJSON usa 1 MiB, pero eso es solo para JSON, no archivos.

var contentTypesFotoValidos = map[string]string{
	"image/jpeg": ".jpg",
	"image/png":  ".png",
	"image/webp": ".webp",
}

type subirFotoResponse struct {
	URL string `json:"url"`
}

// subirFotoPaginaPublicaHandler — sin Storage (dev sin configurar o
// AuthDeps.Storage nil), responde 501, mismo criterio que Google/Turnstile
// cuando faltan sus credenciales.
func subirFotoPaginaPublicaHandler(store storage.Storage) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if _, ok := profesionalIDFromRequest(w, r); !ok {
			return
		}
		if store == nil {
			writeError(w, http.StatusNotImplemented, "el storage de archivos no está configurado")
			return
		}

		r.Body = http.MaxBytesReader(w, r.Body, maxFotoBytes)
		if err := r.ParseMultipartForm(maxFotoBytes); err != nil {
			writeError(w, http.StatusBadRequest, "el archivo supera el tamaño máximo permitido (5 MB)")
			return
		}
		archivo, header, err := r.FormFile("foto")
		if err != nil {
			writeError(w, http.StatusBadRequest, "falta el archivo (campo \"foto\")")
			return
		}
		defer func() { _ = archivo.Close() }()

		contentType := header.Header.Get("Content-Type")
		extension, ok := contentTypesFotoValidos[contentType]
		if !ok {
			writeError(w, http.StatusBadRequest, "formato de imagen no soportado — usá JPEG, PNG o WebP")
			return
		}

		datos, err := io.ReadAll(archivo)
		if err != nil {
			writeError(w, http.StatusBadRequest, "no se pudo leer el archivo")
			return
		}

		rawToken, _, err := security.NewToken()
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo generar el nombre del archivo")
			return
		}

		// PE-9: se guardan las variantes WebP (imagenes.Anchos), no el
		// original, y la URL que vuelve es la de la MÁS GRANDE: la plantilla
		// reconoce el patrón "<token>.w<ancho>.webp" y arma el `srcset` con
		// las otras. El original no se guarda: nadie lo sirve, y re-codificar
		// descarta sus metadatos EXIF (GPS incluido), que no tienen por qué
		// quedar publicados.
		variantes, err := imagenes.GenerarVariantes(datos)
		switch {
		case errors.Is(err, imagenes.ErrImagenInvalida):
			writeError(w, http.StatusBadRequest, "no pudimos leer la imagen — probá con otro archivo JPEG, PNG o WebP")
			return
		case errors.Is(err, imagenes.ErrImagenDemasiadoGrande):
			writeError(w, http.StatusBadRequest, "la imagen tiene demasiados píxeles — achicala antes de subirla")
			return
		case errors.Is(err, imagenes.ErrSinCodificadorWebP):
			// Solo Go windows/386 (ver internal/imagenes): el comportamiento
			// de antes de PE-9, el original tal cual y sin variantes.
			variantes = nil
		case err != nil:
			writeError(w, http.StatusInternalServerError, "no se pudo procesar la imagen")
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
		defer cancel()
		var url string
		if variantes == nil {
			url, err = store.Save(ctx, rawToken+extension, bytes.NewReader(datos))
		} else {
			for _, v := range variantes {
				url, err = store.Save(ctx, imagenes.NombreDeVariante(rawToken, v.Ancho), bytes.NewReader(v.Datos))
				if err != nil {
					break
				}
			}
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo guardar el archivo")
			return
		}
		writeJSON(w, http.StatusOK, subirFotoResponse{URL: url})
	}
}

// ---------------------------------------------------------------------
// Ocultar / Deployar — sin cambios de la Fase 4.1
// ---------------------------------------------------------------------

type ocultarPaginaPublicaRequest struct {
	Oculta bool `json:"oculta"`
}

// ocultarPaginaPublicaHandler — PATCH /panel/pagina/ocultar: modo
// "en mantenimiento" para los visitantes (spec §5.2) — no borra ni
// des-deploya nada, solo cambia lo que ve un visitante de `/{slug}` (ver
// getClinicaPublicaHandler en clinicas.go).
func ocultarPaginaPublicaHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clinicID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}
		var req ocultarPaginaPublicaRequest
		if err := decodeJSON(w, r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "cuerpo de la request inválido")
			return
		}
		pagina, err := getOrCrearPaginaPublica(gdb, clinicID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo obtener la página")
			return
		}
		pagina.Oculta = req.Oculta
		if err := gdb.Model(&db.PaginaPublica{}).Where("id = ?", pagina.ID).Update("oculta", pagina.Oculta).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo actualizar la página")
			return
		}
		resp, err := respuestaDePagina(gdb, clinicID, *pagina)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "página actualizada pero no se pudo leer la configuración de los módulos")
			return
		}
		writeJSON(w, http.StatusOK, resp)
	}
}

// publicarPaginaPublicaHandler — POST /panel/pagina/publicar (PE-8,
// reemplaza a PATCH /panel/pagina/deployar): copia el BORRADOR actual a una
// PaginaPublicaVersion nueva, numerada — GET /clinicas/{slug} pasa a servir
// esa versión, no la fila en vivo (ver clinicas.go). La primera vez además
// marca `deployada_en` (lo mismo que hacía "Deployar"), que sigue siendo lo
// único que el buscador público mira — ver el filtro en
// buscarClinicasHandler, sin cambios acá.
//
// Todo en una transacción: calcular el próximo Numero (MAX+1) y crearlo
// tiene que ser atómico con el resto, o dos "Publicar" casi simultáneos
// podrían calcular el mismo próximo número antes de que el índice único
// (idx_pagina_publica_versiones_numero) frene al segundo — con la
// transacción, el segundo espera y recalcula sobre el número que el primero
// ya usó.
func publicarPaginaPublicaHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clinicID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}
		userID, ok := usuarioDeLaSesion(r)
		if !ok {
			writeError(w, http.StatusUnauthorized, "falta el token de autenticación")
			return
		}
		pagina, err := getOrCrearPaginaPublica(gdb, clinicID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo obtener la página")
			return
		}

		err = gdb.Transaction(func(tx *gorm.DB) error {
			var maxNumero int
			if err := tx.Model(&db.PaginaPublicaVersion{}).
				Where("pagina_publica_id = ?", pagina.ID).
				Select("COALESCE(MAX(numero), 0)").Scan(&maxNumero).Error; err != nil {
				return err
			}
			version := db.PaginaPublicaVersion{
				PaginaPublicaID:    pagina.ID,
				Numero:             maxNumero + 1,
				Contenido:          pagina.ContenidoVersion(),
				PublicadaEn:        clock.Now(),
				PublicadaPorUserID: &userID,
			}
			if err := tx.Create(&version).Error; err != nil {
				return err
			}
			if pagina.DeployadaEn == nil {
				ahora := clock.Now()
				if err := tx.Model(&db.PaginaPublica{}).Where("id = ?", pagina.ID).Update("deployada_en", ahora).Error; err != nil {
					return err
				}
			}
			return nil
		})
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo publicar la página")
			return
		}

		pagina, err = getOrCrearPaginaPublica(gdb, clinicID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "página publicada pero no se pudo leerla de vuelta")
			return
		}
		resp, err := respuestaDePagina(gdb, clinicID, *pagina)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "página publicada pero no se pudo leer la configuración de los módulos")
			return
		}
		writeJSON(w, http.StatusOK, resp)
	}
}

// historialPaginaPublicaHandler — GET /panel/pagina/versiones: todas las
// versiones publicadas, más nueva primero.
func historialPaginaPublicaHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clinicID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}
		pagina, err := getOrCrearPaginaPublica(gdb, clinicID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo obtener la página")
			return
		}
		var versiones []db.PaginaPublicaVersion
		if err := gdb.Where("pagina_publica_id = ?", pagina.ID).Order("numero DESC").Find(&versiones).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo obtener el historial")
			return
		}
		resp := make([]versionResponse, len(versiones))
		for i, v := range versiones {
			resp[i] = toVersionResponse(gdb, v)
		}
		writeJSON(w, http.StatusOK, resp)
	}
}

// restaurarVersionPaginaPublicaHandler — POST
// /panel/pagina/versiones/{numero}/restaurar: copia el CONTENIDO de esa
// versión al borrador — nunca publica directo (plan Prisma Engine, PE-8:
// "Restaurar copia una versión al borrador y nunca publica directo"). Cuenta
// como un guardado más: avanza Revision y pide la revisión actual, mismo
// candado optimista que el PATCH.
func restaurarVersionPaginaPublicaHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clinicID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}
		userID, ok := usuarioDeLaSesion(r)
		if !ok {
			writeError(w, http.StatusUnauthorized, "falta el token de autenticación")
			return
		}
		numero, err := strconv.Atoi(chi.URLParam(r, "numero"))
		if err != nil {
			writeError(w, http.StatusBadRequest, "número de versión inválido")
			return
		}
		var req struct {
			Revision *int `json:"revision"`
		}
		if err := decodeJSON(w, r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "cuerpo de la request inválido")
			return
		}
		if req.Revision == nil {
			writeError(w, http.StatusBadRequest, "falta la revisión del borrador")
			return
		}

		pagina, err := getOrCrearPaginaPublica(gdb, clinicID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo obtener la página")
			return
		}

		err = gdb.Transaction(func(tx *gorm.DB) error {
			var version db.PaginaPublicaVersion
			if err := tx.Where("pagina_publica_id = ? AND numero = ?", pagina.ID, numero).First(&version).Error; err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					return errVersionNoEncontrada
				}
				return err
			}
			return aplicarContenidoAlBorrador(tx, pagina.ID, *req.Revision, userID, version.Contenido)
		})
		if errors.Is(err, errVersionNoEncontrada) {
			writeError(w, http.StatusNotFound, "esa versión no existe")
			return
		}
		if errors.Is(err, errRevisionDesactualizada) {
			actual, errLectura := getOrCrearPaginaPublica(gdb, clinicID)
			if errLectura != nil {
				writeError(w, http.StatusInternalServerError, "no se pudo restaurar la versión")
				return
			}
			writeJSON(w, http.StatusConflict, conflictoRevisionResponse(gdb, *actual))
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo restaurar la versión")
			return
		}

		pagina, err = getOrCrearPaginaPublica(gdb, clinicID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "versión restaurada pero no se pudo leer la página de vuelta")
			return
		}
		resp, err := respuestaDePagina(gdb, clinicID, *pagina)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "versión restaurada pero no se pudo leer la configuración de los módulos")
			return
		}
		writeJSON(w, http.StatusOK, resp)
	}
}

var errVersionNoEncontrada = errors.New("versión no encontrada")

// aplicarContenidoAlBorrador — reemplazo COMPLETO del borrador por un
// PaginaPublicaContenidoVersion (restaurar), mismo candado optimista y
// mismo reemplazo de módulos (DELETE + INSERT) que actualizarPaginaPublicaHandler,
// factorizado acá porque los dos casos necesitan exactamente esto.
func aplicarContenidoAlBorrador(tx *gorm.DB, paginaID uuid.UUID, revisionEsperada int, userID uuid.UUID, c db.PaginaPublicaContenidoVersion) error {
	updates := db.PaginaPublica{
		Bio: c.Bio, Tema: c.Tema, TemaVariante: c.TemaVariante, TemaTipografia: c.TemaTipografia,
		FotoPortadaURL: c.FotoPortadaURL, FotoPortadaAlt: c.FotoPortadaAlt, RedesSociales: c.RedesSociales, MostrarMapa: c.MostrarMapa,
		DireccionOverride: c.DireccionOverride, NombreSobrePortada: c.NombreSobrePortada, NombreColor: c.NombreColor,
		// Una versión anterior a PE-2 no trae tokens: restaurarla vuelve a
		// "sin overrides", que es como se veía cuando se publicó.
		TemaTokens: tokensOVacio(c.TemaTokens),
		// Una versión anterior a PE-9 no trae SEO: "" = el default.
		SeoTitulo: c.SeoTitulo, SeoDescripcion: c.SeoDescripcion,
		Revision: revisionEsperada + 1, ActualizadaPorUserID: &userID,
	}
	campos := []string{
		"Bio", "Tema", "TemaVariante", "TemaTipografia", "FotoPortadaURL", "FotoPortadaAlt", "RedesSociales", "MostrarMapa",
		"DireccionOverride", "NombreSobrePortada", "NombreColor", "TemaTokens", "SeoTitulo", "SeoDescripcion",
		"Revision", "ActualizadaPorUserID",
	}
	resultado := tx.Model(&db.PaginaPublica{}).Where("id = ? AND revision = ?", paginaID, revisionEsperada).Select(campos).Updates(updates)
	if resultado.Error != nil {
		return resultado.Error
	}
	if resultado.RowsAffected == 0 {
		return errRevisionDesactualizada
	}
	if err := tx.Where("pagina_publica_id = ?", paginaID).Delete(&db.PaginaPublicaModulo{}).Error; err != nil {
		return err
	}
	for _, m := range c.Modulos {
		fila := db.PaginaPublicaModulo{PaginaPublicaID: paginaID, Tipo: m.Tipo, Orden: m.Orden, Visible: m.Visible, Config: m.Config}
		if err := tx.Create(&fila).Error; err != nil {
			return err
		}
		// Mismo motivo que en actualizarPaginaPublicaHandler: default:true
		// en el modelo hace que GORM ignore un false explícito al crear.
		if !m.Visible {
			if err := tx.Model(&fila).Update("visible", false).Error; err != nil {
				return err
			}
		}
	}
	return nil
}
