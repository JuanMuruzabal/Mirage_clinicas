package http

import (
	"encoding/json"
	"errors"
	"net/http"
	"slices"
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

// Documentos clínicos (Fase 5.1). Diseño en
// docs/Fases post MVP/fase 5/fase5-documentos-clinicos.md; decisiones en
// TR-182 (inmutabilidad), TR-184 (firma) y TR-186 (quién ve).
//
// El ciclo de un documento, desde acá:
//
//	POST   /documentos                  crea un borrador para un paciente
//	PATCH  /documentos/{id}             guarda el borrador
//	DELETE /documentos/{id}             lo descarta (solo un borrador)
//	POST   /documentos/{id}/terminar    lo congela: pasa a "a firmar", o
//	                                    "para imprimir" si es un
//	                                    consentimiento (se firma en papel,
//	                                    TR-188)
//	POST   /documentos/{id}/firmas      una firma en este dispositivo;
//	                                    con la última requerida, se sella
//	POST   /documentos/{id}/impresion   deja constancia de que se imprimió
//
// Lo que ninguno de estos handlers decide: que un documento sellado no se
// toque. Eso lo hacen los triggers de la base (db/migrate_documentos.go).
// Si un cambio de acá choca contra ellos, el cambio está mal.
func registrarDocumentosRoutes(r chi.Router, gdb *gorm.DB) {
	r.Group(func(r chi.Router) {
		// El módulo es exclusivo de profesionales (brief de la Fase 5,
		// TR-186): recepción y administrador de página no entran.
		r.Use(requireRol(db.RoleProfesional))
		r.Get("/documentos/pacientes", pacientesConDocumentosHandler(gdb))
		r.Get("/documentos/en-curso", documentosEnCursoHandler(gdb))
		r.Post("/documentos", crearDocumentoHandler(gdb))
		r.Get("/documentos/{id}", getDocumentoHandler(gdb))
		r.Patch("/documentos/{id}", guardarBorradorHandler(gdb))
		r.Delete("/documentos/{id}", descartarBorradorHandler(gdb))
		r.Post("/documentos/{id}/terminar", terminarDocumentoHandler(gdb))
		r.Post("/documentos/{id}/firmas", firmarEnElDispositivoHandler(gdb))
		r.Post("/documentos/{id}/impresion", impresionDeDocumentoHandler(gdb))
		r.Get("/pacientes/{id}/documentos", documentosDePacienteHandler(gdb))
	})
}

// --- Respuestas ------------------------------------------------------

type pacienteDeDocumentoResponse struct {
	ID       string `json:"id"`
	Nombre   string `json:"nombre"`
	Apellido string `json:"apellido"`
	DNI      string `json:"dni"`
}

type documentoResumenResponse struct {
	ID               string                      `json:"id"`
	PlantillaID      string                      `json:"plantillaId"`
	PlantillaVersion int                         `json:"plantillaVersion"`
	PlantillaNombre  string                      `json:"plantillaNombre"`
	Tipo             string                      `json:"tipo"`
	Estado           string                      `json:"estado"`
	Paciente         pacienteDeDocumentoResponse `json:"paciente"`
	AutorUserID      string                      `json:"autorUserId"`
	AutorNombre      string                      `json:"autorNombre"`
	// EsMio — lo escribió quien pregunta. Uno ajeno se lee, no se toca.
	EsMio         bool    `json:"esMio"`
	Folio         *int    `json:"folio,omitempty"`
	CreadoEn      string  `json:"creadoEn"`
	ActualizadoEn string  `json:"actualizadoEn"`
	TerminadoEn   *string `json:"terminadoEn,omitempty"`
	SelladoEn     *string `json:"selladoEn,omitempty"`
	AnuladoEn     *string `json:"anuladoEn,omitempty"`
}

type firmaResponse struct {
	Rol              string          `json:"rol"`
	Nombre           string          `json:"nombre"`
	DNI              *string         `json:"dni,omitempty"`
	EnRepresentacion bool            `json:"enRepresentacion"`
	Vinculo          *string         `json:"vinculo,omitempty"`
	Metodo           string          `json:"metodo"`
	FirmadoEn        string          `json:"firmadoEn"`
	Trazo            db.TrazoDeFirma `json:"trazo"`
}

type documentoDetalleResponse struct {
	documentoResumenResponse
	// Valores — lo cargado, solo en un borrador (el de quien lo escribe).
	Valores map[string]any `json:"valores,omitempty"`
	// Hoy — el día que el calco de un borrador pone en "Lugar y fecha".
	Hoy string `json:"hoy,omitempty"`
	// Contenido — el documento congelado, tal cual se firmó (JSON
	// canónico). Desde "a firmar", es lo que se muestra: no se vuelve a
	// armar con la plantilla, se lee lo congelado.
	Contenido        json.RawMessage `json:"contenido,omitempty"`
	HashContenido    *string         `json:"hashContenido,omitempty"`
	HashAnterior     *string         `json:"hashAnterior,omitempty"`
	HashSello        *string         `json:"hashSello,omitempty"`
	CadenaN          *int64          `json:"cadenaN,omitempty"`
	MotivoAnulacion  *string         `json:"motivoAnulacion,omitempty"`
	Firmas           []firmaResponse `json:"firmas"`
	FirmasPendientes []string        `json:"firmasPendientes"`
	// Retomado — al crear: ya había un borrador mío de este documento para
	// este paciente, y es este (no se abrió otro).
	Retomado bool `json:"retomado,omitempty"`
}

func fechaHoraPtr(t *time.Time) *string {
	if t == nil {
		return nil
	}
	s := clock.In(*t).Format(time.RFC3339)
	return &s
}

// completarResumenes — los nombres de pacientes y autores, en dos
// consultas para toda la lista (nunca una por fila).
func completarResumenes(tx *gorm.DB, r *http.Request, docs []db.DocumentoClinico) ([]documentoResumenResponse, error) {
	pacienteIDs := make([]uuid.UUID, 0, len(docs))
	autorIDs := make([]uuid.UUID, 0, len(docs))
	for _, d := range docs {
		pacienteIDs = append(pacienteIDs, d.PacienteID)
		autorIDs = append(autorIDs, d.AutorUserID)
	}
	pacientes := map[uuid.UUID]db.Paciente{}
	if len(pacienteIDs) > 0 {
		var filas []db.Paciente
		if err := tx.Select("id", "nombre", "apellido", "dni").Where("id IN ?", pacienteIDs).Find(&filas).Error; err != nil {
			return nil, err
		}
		for _, p := range filas {
			pacientes[p.ID] = p
		}
	}
	autores := map[uuid.UUID]string{}
	if len(autorIDs) > 0 {
		var perfiles []db.ProfessionalProfile
		if err := tx.Select("user_id", "nombre", "apellido").Where("user_id IN ?", autorIDs).Find(&perfiles).Error; err != nil {
			return nil, err
		}
		for _, p := range perfiles {
			autores[p.UserID] = strings.TrimSpace(p.Nombre + " " + p.Apellido)
		}
	}
	session, _ := sessionFromContext(r)
	out := make([]documentoResumenResponse, len(docs))
	for i, d := range docs {
		p := pacientes[d.PacienteID]
		nombre, tipo := d.PlantillaID, ""
		if plantilla, ok := documentos.PorID(d.PlantillaID, d.PlantillaVersion); ok {
			nombre, tipo = plantilla.Nombre, plantilla.Tipo
		}
		out[i] = documentoResumenResponse{
			ID: d.ID.String(), PlantillaID: d.PlantillaID, PlantillaVersion: d.PlantillaVersion,
			PlantillaNombre: nombre, Tipo: tipo, Estado: d.Estado,
			Paciente:    pacienteDeDocumentoResponse{ID: p.ID.String(), Nombre: p.Nombre, Apellido: p.Apellido, DNI: p.DNI},
			AutorUserID: d.AutorUserID.String(), AutorNombre: autores[d.AutorUserID],
			EsMio: session != nil && d.AutorUserID == session.UserID, Folio: d.Folio,
			CreadoEn: clock.In(d.CreatedAt).Format(time.RFC3339), ActualizadoEn: clock.In(d.UpdatedAt).Format(time.RFC3339),
			TerminadoEn: fechaHoraPtr(d.TerminadoEn), SelladoEn: fechaHoraPtr(d.SelladoEn), AnuladoEn: fechaHoraPtr(d.AnuladoEn),
		}
	}
	return out, nil
}

func detalleDeDocumento(tx *gorm.DB, r *http.Request, d db.DocumentoClinico) (documentoDetalleResponse, error) {
	resumenes, err := completarResumenes(tx, r, []db.DocumentoClinico{d})
	if err != nil {
		return documentoDetalleResponse{}, err
	}
	out := documentoDetalleResponse{
		documentoResumenResponse: resumenes[0],
		HashContenido:            d.HashContenido, HashAnterior: d.HashAnterior, HashSello: d.HashSello,
		CadenaN: d.CadenaN, MotivoAnulacion: d.MotivoAnulacion,
		Firmas: []firmaResponse{}, FirmasPendientes: []string{},
	}
	if d.Estado == db.DocumentoBorrador {
		out.Valores = d.Valores
		out.Hoy = clock.Today().Format("2006-01-02")
		return out, nil
	}
	if d.ContenidoCanonico != nil {
		out.Contenido = json.RawMessage(*d.ContenidoCanonico)
	}
	var firmas []db.DocumentoFirma
	if err := tx.Where("documento_id = ?", d.ID).Order("firmado_en").Find(&firmas).Error; err != nil {
		return documentoDetalleResponse{}, err
	}
	firmados := map[string]bool{}
	for _, f := range firmas {
		firmados[f.Rol] = true
		out.Firmas = append(out.Firmas, firmaResponse{
			Rol: f.Rol, Nombre: f.Nombre, DNI: f.DNI, EnRepresentacion: f.EnRepresentacion, Vinculo: f.Vinculo,
			Metodo: f.Metodo, FirmadoEn: clock.In(f.FirmadoEn).Format(time.RFC3339), Trazo: f.Trazo,
		})
	}
	if d.Estado == db.DocumentoAFirmar {
		if p, ok := documentos.PorID(d.PlantillaID, d.PlantillaVersion); ok {
			for _, rol := range p.FirmasRequeridas() {
				if !firmados[rol] {
					out.FirmasPendientes = append(out.FirmasPendientes, rol)
				}
			}
		}
	}
	return out, nil
}

// registrarEvento — la auditoría de un documento (solo INSERT, TR-186).
func registrarEvento(tx *gorm.DB, r *http.Request, d db.DocumentoClinico, tipo, detalle string) error {
	evento := db.DocumentoEvento{DocumentoID: d.ID, ClinicID: d.ClinicID, Tipo: tipo}
	if session, ok := sessionFromContext(r); ok {
		evento.UserID = &session.UserID
	}
	if detalle != "" {
		evento.Detalle = &detalle
	}
	if ip := clientIP(r); ip != "" {
		evento.IP = &ip
	}
	return tx.Create(&evento).Error
}

func errorDeValidacion(w http.ResponseWriter, errores []documentos.ErrorDeCampo) {
	writeJSON(w, http.StatusUnprocessableEntity, map[string]any{
		"error":   "Revisá los datos marcados.",
		"errores": errores,
	})
}

// --- Listados --------------------------------------------------------

type pacienteConDocumentosResponse struct {
	pacienteDeDocumentoResponse
	Cantidad int    `json:"cantidad"`
	Ultimo   string `json:"ultimo"`
}

// pacientesConDocumentosHandler — GET /documentos/pacientes: la tabla de
// debajo del selector. Los pacientes de MI lista con al menos un documento
// terminado —sellado, o un consentimiento para imprimir (TR-188)—, del más
// reciente al más viejo.
func pacientesConDocumentosHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clinicID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}
		misPacientes := gdb.Model(&db.Paciente{}).Scopes(soloMisPacientes(r)).Where("pacientes.clinic_id = ?", clinicID).Select("pacientes.id")
		var filas []struct {
			ID       uuid.UUID
			Nombre   string
			Apellido string
			DNI      string
			Cantidad int
			Ultimo   time.Time
		}
		if err := gdb.Table("documentos_clinicos d").
			Select("p.id, p.nombre, p.apellido, p.dni, COUNT(d.id) AS cantidad, MAX(COALESCE(d.sellado_en, d.terminado_en)) AS ultimo").
			Joins("JOIN pacientes p ON p.id = d.paciente_id").
			Where("d.estado IN ? AND d.paciente_id IN (?)", []string{db.DocumentoSellado, db.DocumentoParaImprimir}, misPacientes).
			Group("p.id, p.nombre, p.apellido, p.dni").
			Order("ultimo DESC").
			Scan(&filas).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo obtener la lista de pacientes")
			return
		}
		out := make([]pacienteConDocumentosResponse, len(filas))
		for i, f := range filas {
			out[i] = pacienteConDocumentosResponse{
				pacienteDeDocumentoResponse: pacienteDeDocumentoResponse{ID: f.ID.String(), Nombre: f.Nombre, Apellido: f.Apellido, DNI: f.DNI},
				Cantidad:                    f.Cantidad, Ultimo: clock.In(f.Ultimo).Format(time.RFC3339),
			}
		}
		writeJSON(w, http.StatusOK, out)
	}
}

// documentosEnCursoHandler — GET /documentos/en-curso: mis borradores y
// los que esperan firmas, para retomarlos.
func documentosEnCursoHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clinicID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}
		var docs []db.DocumentoClinico
		if err := gdb.Scopes(soloMisDocumentos(r)).
			Where("clinic_id = ? AND estado IN ?", clinicID, []string{db.DocumentoBorrador, db.DocumentoAFirmar}).
			Order("updated_at DESC").Limit(50).Find(&docs).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudieron obtener tus documentos en curso")
			return
		}
		out, err := completarResumenes(gdb, r, docs)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudieron obtener tus documentos en curso")
			return
		}
		writeJSON(w, http.StatusOK, out)
	}
}

// documentosDePacienteHandler — GET /pacientes/{id}/documentos: el
// registro de un paciente. Los sellados y anulados que veo (de cualquier
// colega) y lo mío en curso.
func documentosDePacienteHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clinicID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}
		pacienteID, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			writeError(w, http.StatusBadRequest, "id de paciente inválido")
			return
		}
		var paciente db.Paciente
		// 404 y no 403: un paciente fuera de mi lista, para mí, no existe.
		if err := gdb.Scopes(soloMisPacientes(r)).
			Where("id = ? AND clinic_id = ?", pacienteID, clinicID).First(&paciente).Error; err != nil {
			writeError(w, http.StatusNotFound, "paciente no encontrado")
			return
		}
		var docs []db.DocumentoClinico
		if err := gdb.Scopes(documentosQueVeo(r, clinicID)).
			Where("documentos_clinicos.clinic_id = ? AND documentos_clinicos.paciente_id = ?", clinicID, paciente.ID).
			Order("documentos_clinicos.folio DESC NULLS FIRST, documentos_clinicos.updated_at DESC").
			Find(&docs).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudieron obtener los documentos")
			return
		}
		out, err := completarResumenes(gdb, r, docs)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudieron obtener los documentos")
			return
		}
		writeJSON(w, http.StatusOK, out)
	}
}

// --- Crear, leer, guardar, descartar ----------------------------------

type crearDocumentoRequest struct {
	PlantillaID string `json:"plantillaId"`
	PacienteID  string `json:"pacienteId"`
}

func textoPtr(p *string) string {
	if p == nil {
		return ""
	}
	return strings.TrimSpace(*p)
}

// matriculaLegible — "M.P. 1234" / "M.N. 1234", como la escribe un sello.
func matriculaLegible(perfil db.ProfessionalProfile) string {
	if perfil.MatriculaNumero == "" {
		return ""
	}
	switch perfil.MatriculaTipo {
	case "provincial":
		return "M.P. " + perfil.MatriculaNumero
	case "nacional":
		return "M.N. " + perfil.MatriculaNumero
	}
	return perfil.MatriculaNumero
}

func datosDePrecarga(paciente db.Paciente, perfil db.ProfessionalProfile, clinica db.Clinic) documentos.DatosDePrecarga {
	fechaNacimiento := ""
	if paciente.FechaNacimiento != nil {
		// Columna DATE: medianoche UTC. Se formatea directo, sin clock.In
		// (lo correría al día anterior).
		fechaNacimiento = paciente.FechaNacimiento.Format("2006-01-02")
	}
	return documentos.DatosDePrecarga{
		"paciente.nombreCompleto":     strings.TrimSpace(paciente.Nombre + " " + paciente.Apellido),
		"paciente.dni":                paciente.DNI,
		"paciente.fechaNacimiento":    fechaNacimiento,
		"paciente.domicilio":          textoPtr(paciente.Domicilio),
		"paciente.obraSocial":         textoPtr(paciente.ObraSocial),
		"paciente.obraSocialPlan":     textoPtr(paciente.ObraSocialPlan),
		"paciente.obraSocialAfiliado": textoPtr(paciente.ObraSocialAfiliado),
		"paciente.telefono":           textoPtr(paciente.Telefono),
		"paciente.email":              textoPtr(paciente.Email),
		"profesional.nombreCompleto":  strings.TrimSpace(perfil.Nombre + " " + perfil.Apellido),
		"profesional.matricula":       matriculaLegible(perfil),
		"clinica.nombre":              clinica.Nombre,
		"clinica.ciudad":              textoPtr(clinica.Ciudad),
	}
}

// crearDocumentoHandler — POST /documentos: un borrador nuevo, para un
// paciente de la clínica, con la última versión de la plantilla y lo que
// ya se sabe precargado.
func crearDocumentoHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clinicID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}
		session, _ := sessionFromContext(r)
		var req crearDocumentoRequest
		if err := decodeJSON(w, r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "cuerpo de la request inválido")
			return
		}
		plantilla, existe := documentos.Ultima(strings.TrimSpace(req.PlantillaID))
		if !existe {
			writeError(w, http.StatusBadRequest, "ese documento no existe")
			return
		}
		pacienteID, err := uuid.Parse(strings.TrimSpace(req.PacienteID))
		if err != nil {
			writeError(w, http.StatusBadRequest, "elegí un paciente")
			return
		}

		// Cualquier paciente de la CLÍNICA, no solo los de mi lista: la
		// identidad es de la clínica (TR-144), y hacerle un documento lo
		// suma a mi lista — el mismo acto que "+ Agregar paciente > De la
		// clínica" (TR-157).
		var paciente db.Paciente
		if err := gdb.Where("id = ? AND clinic_id = ?", pacienteID, clinicID).First(&paciente).Error; err != nil {
			writeError(w, http.StatusNotFound, "paciente no encontrado")
			return
		}
		// Una ficha en conflicto es la duplicada de un pedido con un mail
		// desconocido: resolver el conflicto puede borrarla. La historia
		// clínica va en la ficha que queda (TR-186).
		if paciente.EnConflicto {
			writeError(w, http.StatusConflict, "este paciente tiene un conflicto de identidad sin resolver: resolvelo antes de hacerle un documento")
			return
		}

		var perfil db.ProfessionalProfile
		if err := gdb.Where("user_id = ?", session.UserID).First(&perfil).Error; err != nil {
			writeError(w, http.StatusConflict, "completá tu perfil profesional antes de hacer un documento")
			return
		}
		var clinica db.Clinic
		if err := gdb.First(&clinica, "id = ?", clinicID).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo crear el documento")
			return
		}

		doc := db.DocumentoClinico{
			ClinicID: clinicID, PacienteID: paciente.ID, AutorUserID: session.UserID,
			PlantillaID: plantilla.ID, PlantillaVersion: plantilla.Version,
			Valores: documentos.Precargar(plantilla, datosDePrecarga(paciente, perfil, clinica)),
		}
		// Un solo borrador de cada documento por paciente (pedido del cliente,
		// 2026-09-29): si ya tengo uno de este mismo documento para este
		// paciente, se retoma ese en vez de abrir otro. Bajo el lock de la
		// clínica, para que dos clics seguidos no creen dos.
		var existente db.DocumentoClinico
		retomado := false
		err = gdb.Transaction(func(tx *gorm.DB) error {
			if err := tx.Exec("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", "documentos:"+clinicID.String()).Error; err != nil {
				return err
			}
			res := tx.Scopes(soloMisDocumentos(r)).
				Where("clinic_id = ? AND paciente_id = ? AND plantilla_id = ? AND estado = ?", clinicID, paciente.ID, plantilla.ID, db.DocumentoBorrador).
				Limit(1).Find(&existente)
			if res.Error != nil {
				return res.Error
			}
			if res.RowsAffected > 0 {
				retomado = true
				return nil
			}
			if err := tx.Create(&doc).Error; err != nil {
				return err
			}
			return tx.Exec(`INSERT INTO pacientes_en_mi_lista (clinic_id, paciente_id, user_id, created_at)
				VALUES (?, ?, ?, now()) ON CONFLICT DO NOTHING`, clinicID, paciente.ID, session.UserID).Error
		})
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo crear el documento")
			return
		}
		if retomado {
			out, err := detalleDeDocumento(gdb, r, existente)
			if err != nil {
				writeError(w, http.StatusInternalServerError, "no se pudo abrir el borrador")
				return
			}
			out.Retomado = true
			writeJSON(w, http.StatusOK, out)
			return
		}
		out, err := detalleDeDocumento(gdb, r, doc)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo crear el documento")
			return
		}
		writeJSON(w, http.StatusCreated, out)
	}
}

// getDocumentoHandler — GET /documentos/{id}. Abrir un documento ya
// firmado deja constancia en la auditoría (TR-186).
func getDocumentoHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clinicID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}
		docID, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			writeError(w, http.StatusBadRequest, "id de documento inválido")
			return
		}
		var doc db.DocumentoClinico
		if err := gdb.Scopes(documentosQueVeo(r, clinicID)).
			Where("documentos_clinicos.id = ? AND documentos_clinicos.clinic_id = ?", docID, clinicID).First(&doc).Error; err != nil {
			writeError(w, http.StatusNotFound, "documento no encontrado")
			return
		}
		if doc.Estado == db.DocumentoSellado || doc.Estado == db.DocumentoAnulado || doc.Estado == db.DocumentoParaImprimir {
			if err := registrarEvento(gdb, r, doc, db.EventoDocumentoVisto, ""); err != nil {
				writeError(w, http.StatusInternalServerError, "no se pudo abrir el documento")
				return
			}
		}
		out, err := detalleDeDocumento(gdb, r, doc)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo abrir el documento")
			return
		}
		writeJSON(w, http.StatusOK, out)
	}
}

// miDocumento — un documento mío, en alguno de los estados pedidos.
// Escribe la respuesta de error y devuelve false si no.
func miDocumento(w http.ResponseWriter, r *http.Request, tx *gorm.DB, clinicID uuid.UUID, estados ...string) (db.DocumentoClinico, bool) {
	docID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "id de documento inválido")
		return db.DocumentoClinico{}, false
	}
	var doc db.DocumentoClinico
	if err := tx.Scopes(soloMisDocumentos(r)).
		Where("id = ? AND clinic_id = ?", docID, clinicID).First(&doc).Error; err != nil {
		writeError(w, http.StatusNotFound, "documento no encontrado")
		return db.DocumentoClinico{}, false
	}
	if !slices.Contains(estados, doc.Estado) {
		switch doc.Estado {
		case db.DocumentoSellado:
			writeError(w, http.StatusConflict, "este documento ya está firmado y sellado: no se puede modificar")
		case db.DocumentoAnulado:
			writeError(w, http.StatusConflict, "este documento está anulado: no se puede modificar")
		case db.DocumentoAFirmar:
			writeError(w, http.StatusConflict, "este documento ya se terminó y espera firmas: no se puede editar")
		case db.DocumentoParaImprimir:
			writeError(w, http.StatusConflict, "este documento está listo para imprimir y se firma a mano, en papel: no se puede editar ni firmar en el sistema")
		default:
			writeError(w, http.StatusConflict, "este documento todavía no se terminó")
		}
		return db.DocumentoClinico{}, false
	}
	return doc, true
}

type guardarBorradorRequest struct {
	Valores map[string]any `json:"valores"`
}

// guardarBorradorHandler — PATCH /documentos/{id}: reemplaza los valores
// del borrador (el editor manda el estado completo, no un parche).
func guardarBorradorHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clinicID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}
		var req guardarBorradorRequest
		if err := decodeJSON(w, r, &req); err != nil || req.Valores == nil {
			writeError(w, http.StatusBadRequest, "cuerpo de la request inválido")
			return
		}
		doc, ok := miDocumento(w, r, gdb, clinicID, db.DocumentoBorrador)
		if !ok {
			return
		}
		plantilla, existe := documentos.PorID(doc.PlantillaID, doc.PlantillaVersion)
		if !existe {
			writeError(w, http.StatusInternalServerError, "la plantilla de este documento ya no existe")
			return
		}
		valores := documentos.ConservarBloqueados(plantilla, doc.Valores, req.Valores)
		if errores := documentos.Validar(plantilla, valores, documentos.Tolerante); len(errores) > 0 {
			errorDeValidacion(w, errores)
			return
		}
		doc.Valores = valores
		if err := gdb.Model(&doc).Select("valores", "updated_at").Updates(&doc).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo guardar el borrador")
			return
		}
		out, err := detalleDeDocumento(gdb, r, doc)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo guardar el borrador")
			return
		}
		writeJSON(w, http.StatusOK, out)
	}
}

// descartarBorradorHandler — DELETE /documentos/{id}: solo un borrador.
// Todavía no es historia clínica, así que se borra de verdad (no queda
// guardado un dato de salud que nadie terminó).
func descartarBorradorHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clinicID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}
		doc, ok := miDocumento(w, r, gdb, clinicID, db.DocumentoBorrador)
		if !ok {
			return
		}
		if err := gdb.Delete(&db.DocumentoClinico{}, "id = ?", doc.ID).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo descartar el borrador")
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// --- Terminar y volver a editar ---------------------------------------

// terminarDocumentoHandler — POST /documentos/{id}/terminar: valida en modo
// estricto, arma el texto que se va a firmar y lo congela (TR-182). Desde
// acá, el contenido no cambia: se firma o, si nadie firmó todavía, vuelve a
// borrador entero.
func terminarDocumentoHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clinicID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}
		doc, ok := miDocumento(w, r, gdb, clinicID, db.DocumentoBorrador)
		if !ok {
			return
		}
		plantilla, existe := documentos.PorID(doc.PlantillaID, doc.PlantillaVersion)
		if !existe {
			writeError(w, http.StatusInternalServerError, "la plantilla de este documento ya no existe")
			return
		}
		if errores := documentos.Validar(plantilla, doc.Valores, documentos.Estricto); len(errores) > 0 {
			errorDeValidacion(w, errores)
			return
		}

		ahora := clock.Now()
		fecha := ahora.Format("2006-01-02")
		contexto := documentos.Contexto{Fecha: fecha}
		// Lo que no entra en su renglón del original no se puede sellar: el
		// documento se vería cortado, o se saldría del papel (TR-187).
		if errores := documentos.ValidarLamina(plantilla, doc.Valores, contexto); len(errores) > 0 {
			errorDeValidacion(w, errores)
			return
		}

		var paciente db.Paciente
		if err := gdb.First(&paciente, "id = ?", doc.PacienteID).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo terminar el documento")
			return
		}
		var perfil db.ProfessionalProfile
		if err := gdb.First(&perfil, "user_id = ?", doc.AutorUserID).Error; err != nil {
			writeError(w, http.StatusConflict, "completá tu perfil profesional antes de terminar el documento")
			return
		}
		var clinica db.Clinic
		if err := gdb.First(&clinica, "id = ?", doc.ClinicID).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo terminar el documento")
			return
		}

		canonico, huella, err := documentos.Congelar(documentos.ContenidoCongelado{
			Formato:     documentos.FormatoContenido,
			DocumentoID: doc.ID.String(),
			Plantilla: documentos.PlantillaCongelada{
				ID: plantilla.ID, Version: plantilla.Version, Nombre: plantilla.Nombre, Tipo: plantilla.Tipo, Fuente: plantilla.Fuente,
			},
			Clinica:  documentos.ClinicaCongelada{ID: clinica.ID.String(), Nombre: clinica.Nombre},
			Paciente: documentos.PacienteCongelado{ID: paciente.ID.String(), Nombre: paciente.Nombre, Apellido: paciente.Apellido, DNI: paciente.DNI},
			Profesional: documentos.ProfesionalCongelado{
				UserID: perfil.UserID.String(), Nombre: perfil.Nombre, Apellido: perfil.Apellido,
				MatriculaTipo: perfil.MatriculaTipo, MatriculaNumero: perfil.MatriculaNumero,
			},
			Fecha:       fecha,
			TerminadoEn: ahora.Format(time.RFC3339),
			Valores:     documentos.LimpiarValores(plantilla, doc.Valores),
			Cuerpo:      documentos.ArmarCuerpo(plantilla, doc.Valores, contexto, documentos.TextoSellado),
			Firmas:      plantilla.Firmas,
			Lamina:      documentos.ArmarLamina(plantilla, doc.Valores, contexto, documentos.TextoSellado),
		})
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo terminar el documento")
			return
		}

		// Un consentimiento se firma a mano (TR-188): terminado, queda listo
		// para imprimir, sin firmas en el sistema ni sello.
		destino := db.DocumentoAFirmar
		if plantilla.SeFirmaEnPapel() {
			destino = db.DocumentoParaImprimir
		}
		err = gdb.Transaction(func(tx *gorm.DB) error {
			cambios := map[string]any{
				"estado": destino, "contenido_canonico": canonico, "hash_contenido": huella,
				"terminado_en": ahora, "updated_at": ahora,
			}
			// El consentimiento terminado ya es parte de la historia del
			// paciente: recibe su folio ahora (lo que se sella, al sellar).
			// Bajo el lock de la clínica: el folio no admite dos "siguientes".
			if destino == db.DocumentoParaImprimir {
				if err := tx.Exec("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", "documentos:"+clinicID.String()).Error; err != nil {
					return err
				}
				folio, err := siguienteFolio(tx, doc.ClinicID, doc.PacienteID)
				if err != nil {
					return err
				}
				cambios["folio"] = folio
			}
			if err := tx.Model(&db.DocumentoClinico{}).Where("id = ? AND estado = ?", doc.ID, db.DocumentoBorrador).
				Updates(cambios).Error; err != nil {
				return err
			}
			return registrarEvento(tx, r, doc, db.EventoDocumentoTerminado, "")
		})
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo terminar el documento")
			return
		}
		if err := gdb.First(&doc, "id = ?", doc.ID).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo terminar el documento")
			return
		}
		out, err := detalleDeDocumento(gdb, r, doc)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo terminar el documento")
			return
		}
		writeJSON(w, http.StatusOK, out)
	}
}

// impresionDeDocumentoHandler — POST /documentos/{id}/impresion: la
// pantalla avisa que se abrió la impresión de un documento terminado, y
// queda en la auditoría como "exportado" (TR-186: se registra quién sacó
// datos de salud del sistema, y cuándo). Imprime quien lo puede ver. La
// impresión misma la hace el navegador; la API no genera nada acá.
func impresionDeDocumentoHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clinicID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}
		docID, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			writeError(w, http.StatusBadRequest, "id de documento inválido")
			return
		}
		var doc db.DocumentoClinico
		if err := gdb.Scopes(documentosQueVeo(r, clinicID)).
			Where("documentos_clinicos.id = ? AND documentos_clinicos.clinic_id = ?", docID, clinicID).First(&doc).Error; err != nil {
			writeError(w, http.StatusNotFound, "documento no encontrado")
			return
		}
		if doc.Estado == db.DocumentoBorrador {
			writeError(w, http.StatusConflict, "un borrador no se imprime: terminalo primero")
			return
		}
		if err := registrarEvento(gdb, r, doc, db.EventoDocumentoExportado, "impresión"); err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo registrar la impresión")
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// siguienteFolio — el folio que sigue para un paciente en la clínica
// (Ley 26.529, art. 12: la historia va foliada). Correlativo entre todos
// los documentos del paciente, de cualquier profesional: lo reciben el
// consentimiento al terminarse (TR-188) y lo demás al sellarse. Se llama
// bajo el lock de la clínica.
func siguienteFolio(tx *gorm.DB, clinicID, pacienteID uuid.UUID) (int, error) {
	var folio int
	err := tx.Raw(`SELECT COALESCE(MAX(folio), 0) + 1 FROM documentos_clinicos
		WHERE clinic_id = ? AND paciente_id = ? AND folio IS NOT NULL`, clinicID, pacienteID).Scan(&folio).Error
	return folio, err
}

// --- Firmar y sellar ---------------------------------------------------

type firmaRequest struct {
	Rol              string          `json:"rol"`
	Nombre           string          `json:"nombre"`
	DNI              string          `json:"dni"`
	EnRepresentacion bool            `json:"enRepresentacion"`
	Vinculo          string          `json:"vinculo"`
	Trazo            db.TrazoDeFirma `json:"trazo"`
}

var errYaFirmado = errors.New("ese rol ya firmó")

func recortar(s string, maximo int) string {
	if utf8.RuneCountInString(s) <= maximo {
		return s
	}
	return string([]rune(s)[:maximo])
}

// firmarEnElDispositivoHandler — POST /documentos/{id}/firmas: una firma
// hecha en este mismo dispositivo, en persona (TR-184: la identidad la
// constata el profesional, que está presente). La firma por vínculo y por
// alerta al celular llegan en la 5.3.
//
// Con la última firma requerida, el documento se sella en la MISMA
// transacción: no existe un documento con todas sus firmas y sin sellar.
func firmarEnElDispositivoHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clinicID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}
		session, _ := sessionFromContext(r)
		var req firmaRequest
		if err := decodeJSON(w, r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "cuerpo de la request inválido")
			return
		}
		doc, ok := miDocumento(w, r, gdb, clinicID, db.DocumentoAFirmar)
		if !ok {
			return
		}
		plantilla, existe := documentos.PorID(doc.PlantillaID, doc.PlantillaVersion)
		if !existe {
			writeError(w, http.StatusInternalServerError, "la plantilla de este documento ya no existe")
			return
		}
		if plantilla.Firma(req.Rol) == nil {
			writeError(w, http.StatusBadRequest, "este documento no lleva esa firma")
			return
		}
		trazo, err := documentos.NormalizarTrazo(req.Trazo)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}

		firma := db.DocumentoFirma{
			DocumentoID: doc.ID, Rol: req.Rol, Metodo: db.MetodoPresencial, Trazo: trazo,
			HashContenido: *doc.HashContenido, FirmadoEn: documentos.MomentoDeFirma(time.Now()),
		}
		if req.Rol == db.FirmaProfesional {
			// El profesional firma como SÍ MISMO: nombre y documento salen de
			// su perfil, no de lo que mande la pantalla.
			var perfil db.ProfessionalProfile
			if err := gdb.First(&perfil, "user_id = ?", session.UserID).Error; err != nil {
				writeError(w, http.StatusConflict, "completá tu perfil profesional antes de firmar")
				return
			}
			firma.Nombre = strings.TrimSpace(perfil.Nombre + " " + perfil.Apellido)
			firma.DNI = perfil.Documento
			firma.UserID = &session.UserID
		} else {
			nombre := strings.Join(strings.Fields(req.Nombre), " ")
			dni := strings.TrimSpace(req.DNI)
			if utf8.RuneCountInString(nombre) < 3 || utf8.RuneCountInString(nombre) > 200 {
				writeError(w, http.StatusBadRequest, "escribí el nombre y apellido de quien firma")
				return
			}
			if !dniRegex.MatchString(dni) {
				writeError(w, http.StatusBadRequest, "el DNI de quien firma debe tener 7 u 8 dígitos, sin puntos")
				return
			}
			firma.Nombre, firma.DNI = nombre, &dni
			if req.EnRepresentacion {
				if req.Rol != db.FirmaPaciente {
					writeError(w, http.StatusBadRequest, "solo la firma del paciente admite un representante")
					return
				}
				vinculo := strings.TrimSpace(req.Vinculo)
				if vinculo == "" || utf8.RuneCountInString(vinculo) > 60 {
					writeError(w, http.StatusBadRequest, "contá qué vínculo tiene con el paciente quien firma en su nombre")
					return
				}
				firma.EnRepresentacion, firma.Vinculo = true, &vinculo
			}
		}
		if ip := clientIP(r); ip != "" {
			firma.IP = &ip
		}
		if ua := strings.TrimSpace(r.UserAgent()); ua != "" {
			ua = recortar(ua, 400)
			firma.UserAgent = &ua
		}
		firma.HashFirma, err = documentos.HuellaDe(documentos.EntradaDesde(firma))
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo registrar la firma")
			return
		}

		err = gdb.Transaction(func(tx *gorm.DB) error {
			// Un documento a la vez por clínica: la cadena de sellos no
			// admite dos "siguientes" (TR-182).
			if err := tx.Exec("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", "documentos:"+clinicID.String()).Error; err != nil {
				return err
			}
			var yaFirmado int64
			if err := tx.Model(&db.DocumentoFirma{}).Where("documento_id = ? AND rol = ?", doc.ID, req.Rol).Count(&yaFirmado).Error; err != nil {
				return err
			}
			if yaFirmado > 0 {
				return errYaFirmado
			}
			if err := tx.Create(&firma).Error; err != nil {
				return err
			}
			if err := registrarEvento(tx, r, doc, db.EventoDocumentoFirmado, req.Rol); err != nil {
				return err
			}
			return sellarSiEstaCompleto(tx, r, doc, plantilla)
		})
		if errors.Is(err, errYaFirmado) {
			writeError(w, http.StatusConflict, "esa firma ya está")
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo registrar la firma")
			return
		}
		if err := gdb.First(&doc, "id = ?", doc.ID).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo registrar la firma")
			return
		}
		out, err := detalleDeDocumento(gdb, r, doc)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo registrar la firma")
			return
		}
		writeJSON(w, http.StatusOK, out)
	}
}

// sellarSiEstaCompleto — si ya firmaron todos los roles requeridos, sella
// el documento: folio, eslabón de la cadena y sello (TR-182). Corre dentro
// de la transacción de la firma y bajo el lock de la clínica.
func sellarSiEstaCompleto(tx *gorm.DB, r *http.Request, doc db.DocumentoClinico, plantilla *documentos.Plantilla) error {
	var firmas []db.DocumentoFirma
	if err := tx.Where("documento_id = ?", doc.ID).Find(&firmas).Error; err != nil {
		return err
	}
	huellas := map[string]string{}
	for _, f := range firmas {
		huellas[f.Rol] = f.HashFirma
	}
	for _, rol := range plantilla.FirmasRequeridas() {
		if _, firmo := huellas[rol]; !firmo {
			return nil
		}
	}

	var anterior struct {
		HashSello *string
		CadenaN   *int64
	}
	if err := tx.Raw(`SELECT hash_sello, cadena_n FROM documentos_clinicos
		WHERE clinic_id = ? AND cadena_n IS NOT NULL ORDER BY cadena_n DESC LIMIT 1`, doc.ClinicID).Scan(&anterior).Error; err != nil {
		return err
	}
	hashAnterior, eslabon := "", int64(1)
	if anterior.CadenaN != nil && anterior.HashSello != nil {
		hashAnterior, eslabon = *anterior.HashSello, *anterior.CadenaN+1
	}
	folio, err := siguienteFolio(tx, doc.ClinicID, doc.PacienteID)
	if err != nil {
		return err
	}

	ahora := time.Now()
	cambios := map[string]any{
		"estado": db.DocumentoSellado, "folio": folio, "cadena_n": eslabon,
		"hash_sello": documentos.Sello(*doc.HashContenido, huellas, hashAnterior),
		"sellado_en": ahora, "updated_at": ahora,
	}
	if hashAnterior != "" {
		cambios["hash_anterior"] = hashAnterior
	}
	if err := tx.Model(&db.DocumentoClinico{}).Where("id = ? AND estado = ?", doc.ID, db.DocumentoAFirmar).
		Updates(cambios).Error; err != nil {
		return err
	}
	return registrarEvento(tx, r, doc, db.EventoDocumentoSellado, "")
}
