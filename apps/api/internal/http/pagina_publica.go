package http

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/clock"
	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/security"
	"dental-mirage/api/internal/storage"
)

// registerPaginaPublicaRoutes monta /panel/pagina — el editor de página
// pública (spec §5, Fase 4). Fase 4.1/4.2: barra de acciones
// (Ocultar/Deployar) + contenido completo (bio, tema, módulos, fotos).
func registerPaginaPublicaRoutes(r chi.Router, gdb *gorm.DB, store storage.Storage) {
	r.Get("/panel/pagina", getPaginaPublicaHandler(gdb))
	r.Patch("/panel/pagina", actualizarPaginaPublicaHandler(gdb))
	r.Patch("/panel/pagina/ocultar", ocultarPaginaPublicaHandler(gdb))
	r.Patch("/panel/pagina/deployar", deployarPaginaPublicaHandler(gdb))
	r.Post("/panel/pagina/fotos", subirFotoPaginaPublicaHandler(store))
}

// tiposModuloValidos — catálogo cerrado de módulos que SE PERSISTEN (Fase
// 4.2, docs/Fases post MVP/Fase 4/fase4-personalizar-pagina.md). "portada"
// y "turno" quedan afuera a propósito: son estructurales y fijos, los
// renderiza el frontend directo (Fase 4.5), nunca una fila acá.
var tiposModuloValidos = map[string]bool{
	"sobre_nosotros": true,
	"texto_libre":    true,
	"especialidades": true,
	"foto":           true,
	"galeria":        true,
	"estadisticas":   true,
	"contacto":       true,
	"horarios":       true,
}

var subtiposFotoValidos = map[string]bool{"retrato": true, "banner": true, "franja": true}

// estadisticasValidas — lista cerrada de estadísticas reales que un
// módulo "estadisticas" puede mostrar (ver estadisticasDeLaClinica más
// abajo) — nunca un valor cargado a mano.
var estadisticasValidas = map[string]bool{"pacientes_atendidos": true, "turnos_realizados": true}

const (
	topeFotosGaleria          = 8
	topeFotosSueltasPorPagina = 10

	maxLargoBio         = 2000
	maxLargoTituloTexto = 80
	maxLargoTextoLibre  = 2000
	maxLargoRed         = 100
	// maxLargoNombreModulo: el nombre que el admin le pone a un módulo para
	// reconocerlo en el editor ("Foto de la sala de espera"). Vive en
	// config.nombre de cualquier tipo de módulo.
	maxLargoNombreModulo = 60
	maxLargoURLFoto      = 500 // el de la columna foto_portada_url
)

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
	ID      string         `json:"id"`
	Tipo    string         `json:"tipo"`
	Orden   int            `json:"orden"`
	Visible bool           `json:"visible"`
	Config  map[string]any `json:"config,omitempty"`
}

func toModuloResponse(m db.PaginaPublicaModulo) moduloResponse {
	return moduloResponse{ID: m.ID.String(), Tipo: m.Tipo, Orden: m.Orden, Visible: m.Visible, Config: m.Config}
}

type paginaPublicaResponse struct {
	Oculta            bool              `json:"oculta"`
	DeployadaEn       *string           `json:"deployadaEn,omitempty"`
	Bio               *string           `json:"bio,omitempty"`
	Tema              string            `json:"tema"`
	TemaVariante      string            `json:"temaVariante"`
	TemaTipografia    string            `json:"temaTipografia"`
	FotoPortadaURL    *string           `json:"fotoPortadaUrl,omitempty"`
	RedesSociales     map[string]string `json:"redesSociales"`
	MostrarMapa       bool              `json:"mostrarMapa"`
	DireccionOverride *string           `json:"direccionOverride,omitempty"`
	// NombreSobrePortada/NombreColor: el nombre de la clínica sobre la foto de
	// portada y su color (set curado, ver coloresNombreValidos).
	NombreSobrePortada bool   `json:"nombreSobrePortada"`
	NombreColor        string `json:"nombreColor"`
	// DireccionClinica — la de la Clinic, SIN el override. El editor
	// calcula la efectiva (override si hay, si no esta) del lado del
	// cliente para previsualizar el módulo de contacto mientras se
	// tipea; si viniera ya resuelta, borrar el override en el editor
	// dejaría la previsualización sin saber a qué volver.
	DireccionClinica *string          `json:"direccionClinica,omitempty"`
	Modulos          []moduloResponse `json:"modulos"`
	Estadisticas     map[string]int   `json:"estadisticas"`
}

// respuestaDePagina arma la respuesta completa de /panel/pagina — el único
// lugar que junta la página con sus estadísticas y con la dirección de la
// clínica, para que los cuatro handlers respondan igual.
func respuestaDePagina(gdb *gorm.DB, clinicID uuid.UUID, p db.PaginaPublica) paginaPublicaResponse {
	resp := toPaginaPublicaResponse(p, estadisticasDeLaClinica(gdb, clinicID))
	var clinic db.Clinic
	if err := gdb.Where("id = ?", clinicID).First(&clinic).Error; err == nil {
		resp.DireccionClinica = clinic.Direccion
	}
	return resp
}

func toPaginaPublicaResponse(p db.PaginaPublica, estadisticas map[string]int) paginaPublicaResponse {
	resp := paginaPublicaResponse{
		Oculta:             p.Oculta,
		Bio:                p.Bio,
		Tema:               p.Tema,
		TemaVariante:       p.TemaVariante,
		TemaTipografia:     p.TemaTipografia,
		FotoPortadaURL:     p.FotoPortadaURL,
		RedesSociales:      p.RedesSociales,
		MostrarMapa:        p.MostrarMapa,
		DireccionOverride:  p.DireccionOverride,
		NombreSobrePortada: p.NombreSobrePortada,
		NombreColor:        p.NombreColor,
		Modulos:            make([]moduloResponse, len(p.Modulos)),
		Estadisticas:       estadisticas,
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
		writeJSON(w, http.StatusOK, respuestaDePagina(gdb, clinicID, *pagina))
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
	Bio                *string           `json:"bio"`
	Tema               *string           `json:"tema"`
	TemaVariante       *string           `json:"temaVariante"`
	TemaTipografia     *string           `json:"temaTipografia"`
	RedesSociales      map[string]string `json:"redesSociales"`
	MostrarMapa        *bool             `json:"mostrarMapa"`
	DireccionOverride  *string           `json:"direccionOverride"`
	FotoPortadaURL     *string           `json:"fotoPortadaUrl"`
	NombreSobrePortada *bool             `json:"nombreSobrePortada"`
	NombreColor        *string           `json:"nombreColor"`
	// Modulos — puntero al slice, no el slice solo: distingue "no vino en
	// el body" (nil, no tocar los módulos existentes) de "vino una lista
	// vacía" (reemplazar por CERO módulos, ej. el owner borró todos).
	Modulos *[]moduloRequest `json:"modulos"`
}

// validarModulos — cada Tipo tiene que ser del catálogo cerrado, y algunas
// config traen su propia validación (subtipo de foto, tope de fotos).
func validarModulos(modulos []moduloRequest) error {
	fotosSueltas := 0
	for _, m := range modulos {
		if !tiposModuloValidos[m.Tipo] {
			return fmt.Errorf("tipo de módulo inválido: %q", m.Tipo)
		}
		if nombre, ok := m.Config["nombre"]; ok {
			texto, esTexto := nombre.(string)
			if !esTexto {
				return errors.New("el nombre de un módulo tiene que ser un texto")
			}
			if len([]rune(texto)) > maxLargoNombreModulo {
				return fmt.Errorf("el nombre de un módulo admite hasta %d caracteres", maxLargoNombreModulo)
			}
		}
		switch m.Tipo {
		case "texto_libre":
			titulo, _ := m.Config["titulo"].(string)
			texto, _ := m.Config["texto"].(string)
			if len([]rune(titulo)) > maxLargoTituloTexto {
				return fmt.Errorf("el título de una sección de texto admite hasta %d caracteres", maxLargoTituloTexto)
			}
			if len([]rune(texto)) > maxLargoTextoLibre {
				return fmt.Errorf("una sección de texto admite hasta %d caracteres", maxLargoTextoLibre)
			}
		case "foto":
			fotosSueltas++
			subtipo, _ := m.Config["subtipo"].(string)
			if !subtiposFotoValidos[subtipo] {
				return fmt.Errorf("subtipo de foto inválido: %q", subtipo)
			}
			fotoURL, _ := m.Config["fotoUrl"].(string)
			if !urlDeFotoValida(fotoURL) {
				return errors.New("la URL de la foto no es válida")
			}
		case "galeria":
			fotoUrls, _ := m.Config["fotoUrls"].([]any)
			if len(fotoUrls) > topeFotosGaleria {
				return fmt.Errorf("la galería admite hasta %d fotos", topeFotosGaleria)
			}
			for _, v := range fotoUrls {
				u, _ := v.(string)
				if u == "" || !urlDeFotoValida(u) {
					return errors.New("la URL de una foto de la galería no es válida")
				}
			}
		case "estadisticas":
			mostrar, _ := m.Config["mostrar"].([]any)
			for _, v := range mostrar {
				id, _ := v.(string)
				if !estadisticasValidas[id] {
					return fmt.Errorf("estadística inválida: %q", id)
				}
			}
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
		if req.NombreColor != nil && !coloresNombreValidos[strings.TrimSpace(*req.NombreColor)] {
			writeError(w, http.StatusBadRequest, "color del nombre inválido")
			return
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
			updates := db.PaginaPublica{}
			var campos []string
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
			if req.NombreSobrePortada != nil {
				updates.NombreSobrePortada = *req.NombreSobrePortada
				campos = append(campos, "NombreSobrePortada")
			}
			if req.NombreColor != nil {
				updates.NombreColor = strings.TrimSpace(*req.NombreColor)
				campos = append(campos, "NombreColor")
			}
			if len(campos) > 0 {
				if err := tx.Model(&db.PaginaPublica{}).Where("id = ?", pagina.ID).Select(campos).Updates(updates).Error; err != nil {
					return err
				}
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
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo actualizar la página")
			return
		}

		pagina, err = getOrCrearPaginaPublica(gdb, clinicID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "página actualizada pero no se pudo leerla de vuelta")
			return
		}
		writeJSON(w, http.StatusOK, respuestaDePagina(gdb, clinicID, *pagina))
	}
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

		rawToken, _, err := security.NewToken()
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo generar el nombre del archivo")
			return
		}
		nombreArchivo := rawToken + extension

		ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
		defer cancel()
		url, err := store.Save(ctx, nombreArchivo, archivo)
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
		writeJSON(w, http.StatusOK, respuestaDePagina(gdb, clinicID, *pagina))
	}
}

// deployarPaginaPublicaHandler — PATCH /panel/pagina/deployar: publica la
// página por primera vez (spec §5.2 — "importante para que el buscador
// público de clínicas [...] no muestre páginas vacías o incompletas", ver
// el filtro `deployada_en IS NOT NULL` en buscarClinicasHandler,
// clinicas.go). Idempotente: no hay forma de "des-deployar" en el MVP, así
// que llamarlo de nuevo no pisa la fecha original ni es un error — el
// frontend hace desaparecer el botón apenas ve `deployadaEn` no nulo
// (spec §5.2: "solo visible la primera vez"), pero el backend no depende
// de eso para mantener la garantía.
func deployarPaginaPublicaHandler(gdb *gorm.DB) http.HandlerFunc {
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
		if pagina.DeployadaEn == nil {
			ahora := clock.Now()
			pagina.DeployadaEn = &ahora
			if err := gdb.Model(&db.PaginaPublica{}).Where("id = ?", pagina.ID).Update("deployada_en", ahora).Error; err != nil {
				writeError(w, http.StatusInternalServerError, "no se pudo publicar la página")
				return
			}
		}
		writeJSON(w, http.StatusOK, respuestaDePagina(gdb, clinicID, *pagina))
	}
}
