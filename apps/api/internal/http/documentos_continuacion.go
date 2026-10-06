package http

import (
	"errors"
	"fmt"
	"log/slog"
	"maps"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/clock"
	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/documentos"
)

// Los anexos de continuación (Fase 5.6d): el "Continúa en anexo Nº" del
// diagnóstico, del plan, de las observaciones o de los estudios de una
// historia clínica, como la hoja de evolución del papel.
//
// Uno por sección de cada historia, numerados por historia. Se crea desde la
// historia —en borrador, su número se escribe en el campo; completada, queda
// vinculado solo en el sistema— y nace "abierto": congelado, sin borrador ni
// cierre y sin folio propio (su folio es el "x.y" de su historia,
// documentos.FolioDe). Lo que crece son sus ASIENTOS ("anotaciones" en la
// pantalla), que puede sumar cualquier profesional que ve el anexo: los firma
// el registro digital —la sesión, el nombre, el instante y el evento con la
// IP—, sin firma dibujada, y quedan fijos una vez guardados (el trigger de
// documento_asientos).

type crearContinuacionRequest struct {
	Seccion string `json:"seccion"`
}

var (
	errSeccionSinContinuacion = errors.New("esta historia clínica no continúa esa sección en un anexo")
	errContinuacionNoVisible  = errors.New("esta sección ya tiene su anexo de continuación")
)

// crearContinuacionHandler — POST /documentos/{id}/continuaciones: el anexo
// de continuación de una sección de la historia {id}. Si ya existe, devuelve
// ese (200) en vez de un error: dos clics, o dos pestañas, llegan al mismo.
func crearContinuacionHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clinicID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}
		historiaID, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			writeError(w, http.StatusBadRequest, "id de documento inválido")
			return
		}
		var req crearContinuacionRequest
		if err := decodeJSON(w, r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "cuerpo de la request inválido")
			return
		}
		var anexo db.DocumentoClinico
		creado := false
		// Bajo el lock de la clínica: el número, uno solo por sección
		// aunque lleguen dos pedidos juntos, y que la historia no se descarte
		// entre verificarla y colgarle el anexo.
		err = gdb.Transaction(func(tx *gorm.DB) error {
			if err := bloquearDocumentosDeLaClinica(tx, clinicID); err != nil {
				return err
			}
			// La historia: una que veo (las mías en cualquier estado, las
			// terminadas de los colegas) y no anulada.
			var historia db.DocumentoClinico
			res := tx.Scopes(documentosQueVeo(r, clinicID)).
				Where("documentos_clinicos.id = ? AND documentos_clinicos.clinic_id = ? AND documentos_clinicos.estado <> ?", historiaID, clinicID, db.DocumentoAnulado).Limit(1).Find(&historia)
			if res.Error != nil {
				return res.Error
			}
			if res.RowsAffected == 0 {
				return errHistoriaNoEncontrada
			}
			var err error
			anexo, creado, err = continuacionDeLaHistoria(tx, r, historia, strings.TrimSpace(req.Seccion))
			return err
		})
		if escribirErrorDeContinuacion(w, err) {
			return
		}
		out, err := detalleDeDocumento(gdb, r, anexo)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo crear el anexo")
			return
		}
		status := http.StatusOK
		if creado {
			status = http.StatusCreated
		}
		writeJSON(w, status, out)
	}
}

// escribirErrorDeContinuacion — la respuesta de un error al crear un anexo de
// continuación. Devuelve false si no hubo error.
func escribirErrorDeContinuacion(w http.ResponseWriter, err error) bool {
	switch {
	case err == nil:
		return false
	case errors.Is(err, errHistoriaNoEncontrada):
		writeError(w, http.StatusNotFound, err.Error())
	case errors.Is(err, errSeccionSinContinuacion):
		writeError(w, http.StatusUnprocessableEntity, err.Error())
	case errors.Is(err, errContinuacionNoVisible):
		writeError(w, http.StatusConflict, err.Error())
	case errors.Is(err, errSinPerfil):
		writeError(w, http.StatusConflict, "completá tu perfil profesional antes de crear el anexo")
	default:
		writeError(w, http.StatusInternalServerError, "no se pudo crear el anexo")
	}
	return true
}

// continuacionDeLaHistoria — el anexo de esa sección de la historia: el que
// ya tiene o uno nuevo. Devuelve si lo creó. Va bajo el lock de la clínica.
func continuacionDeLaHistoria(tx *gorm.DB, r *http.Request, historia db.DocumentoClinico, seccion string) (db.DocumentoClinico, bool, error) {
	plantilla, ok := documentos.PorID(historia.PlantillaID, historia.PlantillaVersion)
	if !ok || plantilla.Tipo != documentos.TipoHistoriaClinica {
		return db.DocumentoClinico{}, false, errHistoriaNoEncontrada
	}
	campo := plantilla.CampoDeContinuacion(seccion)
	if campo == nil {
		return db.DocumentoClinico{}, false, errSeccionSinContinuacion
	}
	if existente, hay, err := continuacionExistente(tx, r, historia, seccion); err != nil || hay {
		return existente, false, err
	}
	anexo, err := crearAnexoDeContinuacion(tx, r, historia, plantilla, seccion)
	if err != nil {
		return db.DocumentoClinico{}, false, err
	}
	// En borrador, el número va en su "Continúa en anexo Nº"; completada, la
	// historia no se toca y el vínculo queda solo en el sistema. El WHERE
	// del estado cubre que se haya terminado mientras tanto.
	if historia.Estado == db.DocumentoBorrador {
		historia.Valores = maps.Clone(historia.Valores)
		if historia.Valores == nil {
			historia.Valores = map[string]any{}
		}
		historia.Valores[campo.ID] = valorDelNumero(campo, *anexo.AnexoNumero)
		if err := tx.Model(&historia).Where("estado = ?", db.DocumentoBorrador).Select("valores", "updated_at").Updates(&historia).Error; err != nil {
			return db.DocumentoClinico{}, false, err
		}
	}
	return anexo, true, nil
}

// continuacionExistente — el anexo que esa sección de la historia ya tiene, si
// tiene. Uno que existe y quien pide no ve (el de un colega, con un paciente
// que no está en su lista) no se devuelve: errContinuacionNoVisible.
func continuacionExistente(tx *gorm.DB, r *http.Request, historia db.DocumentoClinico, seccion string) (db.DocumentoClinico, bool, error) {
	var existente struct{ ID uuid.UUID }
	res := tx.Model(&db.DocumentoClinico{}).Select("id").
		Where("anexo_de = ? AND anexo_seccion = ?", historia.ID, seccion).Limit(1).Scan(&existente)
	if res.Error != nil || res.RowsAffected == 0 {
		return db.DocumentoClinico{}, false, res.Error
	}
	var anexo db.DocumentoClinico
	visible := tx.Scopes(documentosQueVeo(r, historia.ClinicID)).
		Where("documentos_clinicos.id = ? AND documentos_clinicos.clinic_id = ?", existente.ID, historia.ClinicID).
		Limit(1).Find(&anexo)
	if visible.Error != nil {
		return anexo, false, visible.Error
	}
	if visible.RowsAffected == 0 {
		return anexo, false, errContinuacionNoVisible
	}
	return anexo, true, nil
}

// crearAnexoDeContinuacion — el anexo nuevo: el número que sigue en su
// historia, sin folio propio (no consume el del paciente), abierto y
// congelado desde ya. Su contenido es la foto de quién es el paciente, quién
// lo abrió y de qué historia es (su nombre): quien lo crea ve la historia, y
// así su PDF no tiene que volver a mirarla más que por su folio.
func crearAnexoDeContinuacion(tx *gorm.DB, r *http.Request, historia db.DocumentoClinico, deLaHistoria *documentos.Plantilla, seccion string) (db.DocumentoClinico, error) {
	plantilla, ok := documentos.Ultima(documentos.PlantillaDeContinuacion)
	if !ok {
		return db.DocumentoClinico{}, errors.New("falta la plantilla del anexo de continuación")
	}
	session, _ := sessionFromContext(r)
	numero, err := siguienteNumeroDeAnexo(tx, historia.ID)
	if err != nil {
		return db.DocumentoClinico{}, err
	}
	ahora := clock.Now()
	anexo := db.DocumentoClinico{
		ID: uuid.New(), ClinicID: historia.ClinicID, PacienteID: historia.PacienteID, AutorUserID: session.UserID,
		PlantillaID: plantilla.ID, PlantillaVersion: plantilla.Version, AnexoDe: &historia.ID,
		AnexoSeccion: &seccion, AnexoNumero: &numero, Estado: db.DocumentoAbierto,
		Valores: map[string]any{}, TerminadoEn: &ahora,
	}
	contenido, err := contenidoDelDocumento(tx, anexo, plantilla, ahora)
	if err != nil {
		return db.DocumentoClinico{}, err
	}
	contenido.Continuacion = &documentos.ContinuacionCongelada{
		HistoriaID: historia.ID.String(), Historia: deLaHistoria.Nombre, Seccion: seccion, Numero: numero,
	}
	canonico, huella, err := documentos.Congelar(contenido)
	if err != nil {
		return db.DocumentoClinico{}, err
	}
	anexo.ContenidoCanonico, anexo.HashContenido = &canonico, &huella
	if err := tx.Create(&anexo).Error; err != nil {
		return db.DocumentoClinico{}, err
	}
	if err := sumarAMiLista(tx, anexo); err != nil {
		return db.DocumentoClinico{}, err
	}
	return anexo, registrarEvento(tx, r, anexo, db.EventoDocumentoAbierto, documentos.EtiquetaDeSeccion(seccion))
}

// siguienteNumeroDeAnexo — el número que sigue entre los anexos de una
// historia, de continuación o sueltos: una sola secuencia por historia (el y
// de su "x.y"). Se llama bajo el lock de la clínica.
func siguienteNumeroDeAnexo(tx *gorm.DB, historiaID uuid.UUID) (int, error) {
	var numero int
	err := tx.Raw("SELECT COALESCE(MAX(anexo_numero), 0) + 1 FROM documentos_clinicos WHERE anexo_de = ?", historiaID).Scan(&numero).Error
	return numero, err
}

// valorDelNumero — el número de un anexo como lo guarda su campo: un campo
// número guarda un número (float64, como llega del JSON); uno de texto, el
// texto.
func valorDelNumero(campo *documentos.Campo, numero int) any {
	if campo.Tipo == "texto" {
		return strconv.Itoa(numero)
	}
	return float64(numero)
}

// fijarNumerosDeContinuacion — en el borrador de una historia, el
// "Continúa en anexo Nº" de una sección que ya tiene su anexo es el número de
// ese anexo, y no lo pisa lo que mande la pantalla: una pestaña abierta antes
// de crearlo lo borraría al guardar.
func fijarNumerosDeContinuacion(tx *gorm.DB, plantilla *documentos.Plantilla, historiaID uuid.UUID, valores map[string]any) error {
	if !slices.ContainsFunc(plantilla.Campos(), func(c *documentos.Campo) bool { return c.ContinuaEnAnexo != "" }) {
		return nil
	}
	var anexos []db.DocumentoClinico
	if err := tx.Select("anexo_seccion", "anexo_numero").
		Where("anexo_de = ? AND anexo_seccion IS NOT NULL", historiaID).Find(&anexos).Error; err != nil {
		return err
	}
	for _, a := range anexos {
		if campo := plantilla.CampoDeContinuacion(*a.AnexoSeccion); campo != nil && a.AnexoNumero != nil {
			valores[campo.ID] = valorDelNumero(campo, *a.AnexoNumero)
		}
	}
	return nil
}

// --- Los asientos -------------------------------------------------------

// maxCaracteresDeAsiento — lo mismo que el CHECK de documento_asientos.texto.
const maxCaracteresDeAsiento = 4000

type asientoRequest struct {
	Texto string `json:"texto"`
}

type asientoResponse struct {
	Numero      int    `json:"numero"`
	Texto       string `json:"texto"`
	AutorUserID string `json:"autorUserId"`
	AutorNombre string `json:"autorNombre"`
	CreadoEn    string `json:"creadoEn"`
}

// asientosDelAnexo — los asientos de un anexo, en orden, en una sola consulta.
func asientosDelAnexo(tx *gorm.DB, anexoID uuid.UUID) ([]asientoResponse, error) {
	var asientos []db.DocumentoAsiento
	if err := tx.Where("documento_id = ?", anexoID).Order("numero").Find(&asientos).Error; err != nil {
		return nil, err
	}
	out := make([]asientoResponse, len(asientos))
	for i, a := range asientos {
		out[i] = asientoResponse{
			Numero: a.Numero, Texto: a.Texto, AutorUserID: a.AutorUserID.String(), AutorNombre: a.AutorNombre,
			CreadoEn: clock.In(a.CreadoEn).Format(time.RFC3339),
		}
	}
	return out, nil
}

// sumarAsientoHandler — POST /documentos/{id}/asientos: un asiento nuevo en
// un anexo de continuación abierto que veo, a nombre de quien lo escribe: lo
// firma el registro digital (la sesión, el instante y el evento con la IP),
// no un trazo. Devuelve el anexo con todos sus asientos.
func sumarAsientoHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clinicID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}
		anexoID, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			writeError(w, http.StatusBadRequest, "id de documento inválido")
			return
		}
		var req asientoRequest
		if err := decodeJSON(w, r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "cuerpo de la request inválido")
			return
		}
		texto := strings.TrimSpace(req.Texto)
		if n := utf8.RuneCountInString(texto); n == 0 || n > maxCaracteresDeAsiento {
			writeError(w, http.StatusBadRequest, fmt.Sprintf("escribí la anotación, de hasta %d caracteres", maxCaracteresDeAsiento))
			return
		}
		// Postgres rechaza el byte 0x00 en una columna text: sin esto, un 500.
		if strings.ContainsRune(texto, 0) {
			writeError(w, http.StatusBadRequest, "la anotación tiene un carácter inválido")
			return
		}
		var anexo db.DocumentoClinico
		if err := gdb.Scopes(documentosQueVeo(r, clinicID)).
			Where("documentos_clinicos.id = ? AND documentos_clinicos.clinic_id = ?", anexoID, clinicID).First(&anexo).Error; err != nil {
			writeError(w, http.StatusNotFound, "documento no encontrado")
			return
		}
		if anexo.Estado != db.DocumentoAbierto || anexo.AnexoSeccion == nil {
			writeError(w, http.StatusConflict, "solo un anexo de continuación suma anotaciones")
			return
		}
		session, _ := sessionFromContext(r)
		var perfil db.ProfessionalProfile
		if err := gdb.Select("nombre", "apellido").First(&perfil, "user_id = ?", session.UserID).Error; err != nil {
			writeError(w, http.StatusConflict, "completá tu perfil profesional antes de escribir una anotación")
			return
		}
		asiento := db.DocumentoAsiento{
			DocumentoID: anexo.ID, Texto: texto, AutorUserID: session.UserID,
			AutorNombre: strings.TrimSpace(perfil.Nombre + " " + perfil.Apellido),
		}
		if err := gdb.Transaction(func(tx *gorm.DB) error { return sumarAsiento(tx, r, anexo, asiento) }); err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo guardar la anotación")
			return
		}
		out, err := detalleDeDocumento(gdb, r, anexo)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo guardar la anotación")
			return
		}
		writeJSON(w, http.StatusCreated, out)
	}
}

// sumarAsiento — numera el asiento y lo encadena al anterior (al contenido
// congelado del anexo, si es el primero), bajo un lock del anexo: dos
// asientos a la vez no pueden tomar el mismo número.
func sumarAsiento(tx *gorm.DB, r *http.Request, anexo db.DocumentoClinico, asiento db.DocumentoAsiento) error {
	if err := tx.Exec("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", "asientos:"+anexo.ID.String()).Error; err != nil {
		return err
	}
	var ultimo db.DocumentoAsiento
	res := tx.Select("numero", "hash").Where("documento_id = ?", anexo.ID).Order("numero DESC").Limit(1).Find(&ultimo)
	if res.Error != nil {
		return res.Error
	}
	asiento.Numero, asiento.HashAnterior = 1, *anexo.HashContenido
	if res.RowsAffected > 0 {
		asiento.Numero, asiento.HashAnterior = ultimo.Numero+1, ultimo.Hash
	}
	asiento.CreadoEn = documentos.MomentoDeFirma(clock.Now())
	huella, err := documentos.HuellaDelAsiento(asiento)
	if err != nil {
		return err
	}
	asiento.Hash = huella
	if err := tx.Create(&asiento).Error; err != nil {
		return err
	}
	return registrarEvento(tx, r, anexo, db.EventoDocumentoAsiento, fmt.Sprintf("asiento %d", asiento.Numero))
}

// --- El PDF ---------------------------------------------------------------

// entregarPDFDeContinuacion — el PDF de un anexo de continuación que veo
// (documentos.GenerarPDFDeContinuacion): sale del anexo, de sus asientos y
// del folio actual de su historia, así que es el mismo para cualquiera que lo
// baje.
func entregarPDFDeContinuacion(gdb *gorm.DB, w http.ResponseWriter, r *http.Request, anexo db.DocumentoClinico) {
	var asientos []db.DocumentoAsiento
	if err := gdb.Where("documento_id = ?", anexo.ID).Order("numero").Find(&asientos).Error; err != nil {
		writeError(w, http.StatusInternalServerError, "no se pudo generar el PDF del documento")
		return
	}
	folioHistoria, err := folioDeLaHistoria(gdb, anexo)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "no se pudo generar el PDF del documento")
		return
	}
	datos, err := documentos.GenerarPDFDeContinuacion(documentos.FuenteDeContinuacion{Documento: anexo, Asientos: asientos, FolioDeLaHistoria: folioHistoria})
	if err != nil {
		// Solo el id: nada del contenido va a los logs (TR-186).
		slog.Error("no se pudo generar el PDF de un anexo de continuación",
			slog.String("documento_id", anexo.ID.String()), slog.String("error", err.Error()))
		writeError(w, http.StatusInternalServerError, "no se pudo generar el PDF del documento")
		return
	}
	plantilla, _ := documentos.PorID(anexo.PlantillaID, anexo.PlantillaVersion)
	entregarPDF(gdb, w, r, anexo, nombreDeArchivoDelPDF(anexo, plantilla, documentos.FolioDe(anexo, folioHistoria)), datos)
}
