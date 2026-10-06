package http

import (
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/documentos"
)

// Ronda A de la 5.6b: el vínculo entre un anexo y su historia clínica, de
// punta a punta (los rechazos, retomar, descartar, la versión, la lista de
// historias para elegir y las consultas fijas de la lista).

// colegaConPerfil — un profesional más de la clínica, con perfil (sin él
// el onboarding no lo deja entrar) y con el paciente del escenario en su
// lista.
func (e escenarioDocs) colegaConPerfil(t *testing.T, email string) (string, uuid.UUID) {
	t.Helper()
	token := sumarColaboradorDePrueba(t, e.gdb, e.router, e.clinicID, email, db.RoleProfesional)
	id := userIDDelMail(t, e.gdb, email)
	if err := e.gdb.Create(&db.ProfessionalProfile{
		UserID: id, Nombre: "Pedro", Apellido: "Díaz", Telefono: "+5493517654321",
		MatriculaTipo: db.MatriculaTipoNacional, MatriculaNumero: matriculaDePrueba(email),
	}).Error; err != nil {
		t.Fatal(err)
	}
	if err := e.gdb.Create(&db.PacienteEnMiLista{PacienteID: e.paciente.ID, UserID: id, ClinicID: e.clinicID}).Error; err != nil {
		t.Fatal(err)
	}
	return token, id
}

func (e escenarioDocs) pedirAnexo(t *testing.T, token string, pacienteID uuid.UUID, historiaID any) (int, documentoDetalleResponse, string) {
	t.Helper()
	cuerpo := map[string]any{"plantillaId": plantillaAnexoDePrueba, "pacienteId": pacienteID.String()}
	if historiaID != nil {
		cuerpo["historiaId"] = historiaID
	}
	rec := doJSONAuth(t, e.router, http.MethodPost, "/documentos", token, cuerpo)
	var d documentoDetalleResponse
	if rec.Code == http.StatusOK || rec.Code == http.StatusCreated {
		d = decodificar[documentoDetalleResponse](t, rec.Body.Bytes())
	}
	return rec.Code, d, rec.Body.String()
}

// Cada rechazo de POST /documentos con un anexo: la historia tiene que
// existir, ser una historia clínica, del mismo paciente y de la misma
// clínica, y estar entre lo que veo.
func TestDocumentos_AnexoRechazaCadaHistoriaQueNoCorresponde(t *testing.T) {
	e := escenarioDeDocumentos(t, "anexo-rechazos")

	for nombre, historia := range map[string]any{
		"sin historiaId":       nil,
		"historiaId vacío":     "",
		"historiaId en blanco": "   ",
		"historiaId inválido":  "no-es-un-uuid",
	} {
		if code, _, body := e.pedirAnexo(t, e.token, e.paciente.ID, historia); code != http.StatusBadRequest {
			t.Errorf("%s: se esperaba 400, llegó %d — %s", nombre, code, body)
		}
	}

	// Un consentimiento no es una historia, ni un anexo lo es.
	consentimiento := e.crearDe(t, e.token, plantillaConducto, e.paciente.ID)
	if code, _, body := e.pedirAnexo(t, e.token, e.paciente.ID, consentimiento.ID); code != http.StatusNotFound || !strings.Contains(body, "historia clínica no encontrada") {
		t.Errorf("un consentimiento como historia: %d — %s", code, body)
	}
	anexo := e.crearDe(t, e.token, plantillaAnexoDePrueba, e.paciente.ID)
	if code, _, _ := e.pedirAnexo(t, e.token, e.paciente.ID, anexo.ID); code != http.StatusNotFound {
		t.Errorf("un anexo como historia: se esperaba 404, llegó %d", code)
	}

	// La historia de otra clínica, aunque el anexo sea para mi paciente.
	otra := registrarProfesionalDePrueba(t, e.gdb, e.router, altaDePruebaInput{
		Email: "doc-anexo-otra@example.com", Password: "unaClaveLarga123", Nombre: "Pedro Ruiz", NombreClinica: "Otra",
	})
	otraClinica := clinicaDePrueba(t, otra.Profesional.ID)
	otroID := userIDDelMail(t, e.gdb, "doc-anexo-otra@example.com")
	ajeno := db.Paciente{ClinicID: otraClinica, Nombre: "Ana", Apellido: "Paz", DNI: "30111222", Origen: "manual", CreadoPorUserID: &otroID}
	if err := e.gdb.Create(&ajeno).Error; err != nil {
		t.Fatal(err)
	}
	historiaAjena := e.crear(t, otra.Token, ajeno.ID)
	if code, _, _ := e.pedirAnexo(t, e.token, e.paciente.ID, historiaAjena.ID); code != http.StatusNotFound {
		t.Errorf("la historia de otra clínica: se esperaba 404, llegó %d", code)
	}

	// El borrador de un colega: no lo veo, así que para mí no existe.
	colega, _ := e.colegaConPerfil(t, "doc-anexo-rechazo-colega@example.com")
	historiaDelColega := e.crear(t, colega, e.paciente.ID)
	if code, _, body := e.pedirAnexo(t, e.token, e.paciente.ID, historiaDelColega.ID); code != http.StatusNotFound {
		t.Errorf("el borrador de un colega: se esperaba 404, llegó %d — %s", code, body)
	}

	// Ninguno de los rechazos dejó un anexo a medias.
	var anexos int64
	e.gdb.Model(&db.DocumentoClinico{}).Where("clinic_id = ? AND plantilla_id = ?", e.clinicID, plantillaAnexoDePrueba).Count(&anexos)
	if anexos != 1 {
		t.Fatalf("queda solo el anexo creado bien: %d", anexos)
	}
}

// Se crea con la historia en borrador o sellada; se retoma el mismo
// borrador con la misma historia, y con otra da 409.
func TestDocumentos_AnexoSeCreaYSeRetomaConSuHistoria(t *testing.T) {
	e := escenarioDeDocumentos(t, "anexo-crear")
	sellada := e.completarYSellar(t, e.token, e.paciente.ID)
	enBorrador := e.crear(t, e.token, e.paciente.ID)

	code, anexo, body := e.pedirAnexo(t, e.token, e.paciente.ID, sellada.ID)
	if code != http.StatusCreated {
		t.Fatalf("crear con la historia sellada: %d — %s", code, body)
	}
	if anexo.AnexoDe == nil || anexo.AnexoDe.ID != sellada.ID || anexo.AnexoDe.Estado != db.DocumentoSellado ||
		anexo.AnexoDe.Folio == nil || anexo.AnexoDe.Nombre == "" || anexo.HistoriaNoVisible {
		t.Fatalf("el anexo trae su historia sellada: %+v", anexo.AnexoDe)
	}
	if _, err := time.Parse(time.RFC3339, anexo.AnexoDe.Fecha); err != nil {
		t.Fatalf("la fecha del vínculo es RFC3339: %q", anexo.AnexoDe.Fecha)
	}

	// Retomarlo con la misma historia: 200, el mismo borrador.
	code, otra, body := e.pedirAnexo(t, e.token, e.paciente.ID, sellada.ID)
	if code != http.StatusOK || !otra.Retomado || otra.ID != anexo.ID {
		t.Fatalf("retomar el mismo anexo: %d retomado=%v id=%s — %s", code, otra.Retomado, otra.ID, body)
	}
	// Con otra historia: 409, y no se crea nada.
	if code, _, body := e.pedirAnexo(t, e.token, e.paciente.ID, enBorrador.ID); code != http.StatusConflict {
		t.Fatalf("el borrador es de otra historia: se esperaba 409, llegó %d — %s", code, body)
	}
	var anexos int64
	e.gdb.Model(&db.DocumentoClinico{}).Where("paciente_id = ? AND plantilla_id = ?", e.paciente.ID, plantillaAnexoDePrueba).Count(&anexos)
	if anexos != 1 {
		t.Fatalf("sigue habiendo un solo anexo: %d", anexos)
	}

	// La historia lista su anexo.
	rec := doJSONAuth(t, e.router, http.MethodGet, "/documentos/"+sellada.ID, e.token, nil)
	historia := decodificar[documentoDetalleResponse](t, rec.Body.Bytes())
	if len(historia.Anexos) != 1 || historia.Anexos[0].ID != anexo.ID || historia.Anexos[0].Estado != db.DocumentoBorrador {
		t.Fatalf("la historia sellada lista su anexo: %+v", historia.Anexos)
	}

	// Descartado el anexo, se crea otro con la historia en borrador.
	if rec := doJSONAuth(t, e.router, http.MethodDelete, "/documentos/"+anexo.ID, e.token, nil); rec.Code != http.StatusNoContent {
		t.Fatalf("descartar el anexo: %d", rec.Code)
	}
	code, nuevo, body := e.pedirAnexo(t, e.token, e.paciente.ID, enBorrador.ID)
	if code != http.StatusCreated || nuevo.AnexoDe == nil || nuevo.AnexoDe.ID != enBorrador.ID || nuevo.AnexoDe.Estado != db.DocumentoBorrador {
		t.Fatalf("crear con la historia en borrador: %d %+v — %s", code, nuevo.AnexoDe, body)
	}
	if nuevo.AnexoDe.Folio != nil {
		t.Fatalf("una historia en borrador no tiene folio: %v", *nuevo.AnexoDe.Folio)
	}
}

// Un documento que no es anexo sigue retomándose como siempre (los dos
// sin historia cuentan como "la misma").
func TestDocumentos_UnaHistoriaSeRetomaSinHistoriaId(t *testing.T) {
	e := escenarioDeDocumentos(t, "historia-retoma")
	h := e.crear(t, e.token, e.paciente.ID)
	rec := doJSONAuth(t, e.router, http.MethodPost, "/documentos", e.token, map[string]any{
		"plantillaId": plantillaHistoriaDePrueba, "pacienteId": e.paciente.ID.String(),
	})
	d := decodificar[documentoDetalleResponse](t, rec.Body.Bytes())
	if rec.Code != http.StatusOK || !d.Retomado || d.ID != h.ID || d.AnexoDe != nil || d.HistoriaNoVisible {
		t.Fatalf("retomar la historia: %d %+v", rec.Code, d.documentoResumenResponse)
	}
}

// Descartar una historia sin anexos anda; un anexo de un colega también
// la frena (el anexo existe aunque no sea mío).
func TestDocumentos_DescartarUnaHistoriaMiraTodosSusAnexos(t *testing.T) {
	e := escenarioDeDocumentos(t, "anexo-descartar-colega")
	sola := e.crear(t, e.token, e.paciente.ID)
	if rec := doJSONAuth(t, e.router, http.MethodDelete, "/documentos/"+sola.ID, e.token, nil); rec.Code != http.StatusNoContent {
		t.Fatalf("descartar una historia sin anexos: %d", rec.Code)
	}

	historia := e.crear(t, e.token, e.paciente.ID)
	_, colegaID := e.colegaConPerfil(t, "doc-anexo-desc-colega@example.com")
	hid := uuid.MustParse(historia.ID)
	p, _ := documentos.Ultima(plantillaAnexoDePrueba)
	anexoDelColega := db.DocumentoClinico{
		ClinicID: e.clinicID, PacienteID: e.paciente.ID, AutorUserID: colegaID,
		PlantillaID: plantillaAnexoDePrueba, PlantillaVersion: p.Version, AnexoDe: &hid,
	}
	if err := e.gdb.Create(&anexoDelColega).Error; err != nil {
		t.Fatal(err)
	}
	rec := doJSONAuth(t, e.router, http.MethodDelete, "/documentos/"+historia.ID, e.token, nil)
	if rec.Code != http.StatusConflict || !strings.Contains(rec.Body.String(), "anexos") {
		t.Fatalf("una historia con el anexo de un colega: %d — %s", rec.Code, rec.Body.String())
	}
	var sigue int64
	e.gdb.Model(&db.DocumentoClinico{}).Where("id = ?", historia.ID).Count(&sigue)
	if sigue != 1 {
		t.Fatal("la historia con anexos tiene que seguir")
	}
}

// Una historia en borrador de una versión vieja que ya tiene anexos se
// queda en su versión: pasarla a la vigente es crear otra y borrar esta, y
// sus anexos la apuntan.
func TestDocumentos_UnaHistoriaConAnexosNoCambiaDeVersion(t *testing.T) {
	e := escenarioDeDocumentos(t, "anexo-version")
	if p, ok := documentos.Ultima(plantillaHistoriaGeneral); !ok || p.Version < 2 {
		t.Fatalf("hace falta una General con una versión vieja: %+v", p)
	}
	vieja := db.DocumentoClinico{
		ClinicID: e.clinicID, PacienteID: e.paciente.ID, AutorUserID: e.titularID,
		PlantillaID: plantillaHistoriaGeneral, PlantillaVersion: 1,
		Valores: map[string]any{"lugar": "Villa Allende"},
	}
	if err := e.gdb.Create(&vieja).Error; err != nil {
		t.Fatal(err)
	}
	code, anexo, body := e.pedirAnexo(t, e.token, e.paciente.ID, vieja.ID.String())
	if code != http.StatusCreated || anexo.AnexoDe == nil || anexo.AnexoDe.ID != vieja.ID.String() {
		t.Fatalf("crear el anexo de la General v1: %d — %s", code, body)
	}

	rec := doJSONAuth(t, e.router, http.MethodPost, "/documentos", e.token, map[string]any{
		"plantillaId": plantillaHistoriaGeneral, "pacienteId": e.paciente.ID.String(),
	})
	d := decodificar[documentoDetalleResponse](t, rec.Body.Bytes())
	if rec.Code != http.StatusOK || !d.Retomado || d.ID != vieja.ID.String() || d.PlantillaVersion != 1 || d.VersionActualizada {
		t.Fatalf("la historia con anexos se retoma en su versión: %d %+v", rec.Code, d.documentoResumenResponse)
	}
	if len(d.Anexos) != 1 || d.Anexos[0].ID != anexo.ID {
		t.Fatalf("y sigue con su anexo: %+v", d.Anexos)
	}
	// La función, directo: sin cambio y sin error.
	if mismo, cambio, err := borradorEnLaVersionVigente(e.gdb, vieja); err != nil || cambio || mismo.ID != vieja.ID {
		t.Fatalf("borradorEnLaVersionVigente con anexos: cambio=%v err=%v", cambio, err)
	}
}

// GET /documentos/historias: las historias del paciente que veo, de la
// más nueva a la más vieja; ni consentimientos, ni anexos, ni el borrador
// de un colega.
func TestDocumentos_LasHistoriasQueSePuedenElegir(t *testing.T) {
	e := escenarioDeDocumentos(t, "anexo-historias")
	sellada := e.completarYSellar(t, e.token, e.paciente.ID)
	enBorrador := e.crear(t, e.token, e.paciente.ID)
	general := e.crearDe(t, e.token, plantillaHistoriaGeneral, e.paciente.ID)
	e.crearDe(t, e.token, plantillaConducto, e.paciente.ID)
	if code, _, body := e.pedirAnexo(t, e.token, e.paciente.ID, enBorrador.ID); code != http.StatusCreated {
		t.Fatalf("el anexo: %d — %s", code, body)
	}
	colega, _ := e.colegaConPerfil(t, "doc-anexo-historias-colega@example.com")
	delColega := e.crear(t, colega, e.paciente.ID)

	rec := doJSONAuth(t, e.router, http.MethodGet, "/documentos/historias?paciente="+e.paciente.ID.String(), e.token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("las historias: %d — %s", rec.Code, rec.Body.String())
	}
	lista := decodificar[[]documentoResumenResponse](t, rec.Body.Bytes())
	var ids []string
	for _, d := range lista {
		ids = append(ids, d.ID)
		if d.Tipo != documentos.TipoHistoriaClinica {
			t.Errorf("solo historias: %s es %q", d.PlantillaID, d.Tipo)
		}
		if d.ID == enBorrador.ID && len(d.Anexos) != 1 {
			t.Errorf("la historia en borrador trae su anexo: %+v", d.Anexos)
		}
	}
	esperado := []string{general.ID, enBorrador.ID, sellada.ID}
	if strings.Join(ids, ",") != strings.Join(esperado, ",") {
		t.Fatalf("las historias, de la más nueva a la más vieja:\n got  %v\n want %v", ids, esperado)
	}
	if strings.Contains(rec.Body.String(), delColega.ID) {
		t.Fatal("el borrador del colega no se ofrece")
	}

	// El colega ve su propio borrador y la sellada, no mis borradores.
	rec = doJSONAuth(t, e.router, http.MethodGet, "/documentos/historias?paciente="+e.paciente.ID.String(), colega, nil)
	ids = nil
	for _, d := range decodificar[[]documentoResumenResponse](t, rec.Body.Bytes()) {
		ids = append(ids, d.ID)
	}
	if strings.Join(ids, ",") != delColega.ID+","+sellada.ID {
		t.Fatalf("el colega ve su borrador y la sellada: %v", ids)
	}

	if rec := doJSONAuth(t, e.router, http.MethodGet, "/documentos/historias?paciente=nada", e.token, nil); rec.Code != http.StatusBadRequest {
		t.Fatalf("un paciente inválido: %d", rec.Code)
	}
	rec = doJSONAuth(t, e.router, http.MethodGet, "/documentos/historias?paciente="+uuid.NewString(), e.token, nil)
	if rec.Code != http.StatusOK || len(decodificar[[]documentoResumenResponse](t, rec.Body.Bytes())) != 0 {
		t.Fatalf("un paciente que no existe: %d — %s", rec.Code, rec.Body.String())
	}
}

// La lista con vínculos no hace una consulta por documento: los anexos y
// sus historias salen en consultas fijas.
func TestDocumentos_LosVinculosNoCrecenConLosDocumentos(t *testing.T) {
	e := escenarioDeDocumentos(t, "anexo-consultas")
	historiaV, _ := documentos.Ultima(plantillaHistoriaDePrueba)
	anexoV, _ := documentos.Ultima(plantillaAnexoDePrueba)
	sembrar := func(n int) {
		for i := 0; i < n; i++ {
			h := db.DocumentoClinico{
				ClinicID: e.clinicID, PacienteID: e.paciente.ID, AutorUserID: e.titularID,
				PlantillaID: plantillaHistoriaDePrueba, PlantillaVersion: historiaV.Version,
			}
			if err := e.gdb.Create(&h).Error; err != nil {
				t.Fatal(err)
			}
			a := db.DocumentoClinico{
				ClinicID: e.clinicID, PacienteID: e.paciente.ID, AutorUserID: e.titularID,
				PlantillaID: plantillaAnexoDePrueba, PlantillaVersion: anexoV.Version, AnexoDe: &h.ID,
			}
			if err := e.gdb.Create(&a).Error; err != nil {
				t.Fatal(err)
			}
		}
	}
	medir := func(ruta string) (int64, []documentoResumenResponse) {
		var lista []documentoResumenResponse
		n := contarConsultasDe(t, e.gdb, func() {
			rec := doJSONAuth(t, e.router, http.MethodGet, ruta, e.token, nil)
			if rec.Code != http.StatusOK {
				t.Fatalf("%s: %d", ruta, rec.Code)
			}
			lista = decodificar[[]documentoResumenResponse](t, rec.Body.Bytes())
		})
		return n, lista
	}
	registro := "/pacientes/" + e.paciente.ID.String() + "/documentos"

	sembrar(1)
	conUno, _ := medir(registro)
	enCursoUno, _ := medir("/documentos/en-curso")
	sembrar(5)
	conSeis, lista := medir(registro)
	enCursoSeis, _ := medir("/documentos/en-curso")
	if conUno != conSeis {
		t.Fatalf("las consultas del registro crecen con los documentos: %d con 2, %d con 12", conUno, conSeis)
	}
	if enCursoUno != enCursoSeis {
		t.Fatalf("las consultas de en curso crecen con los documentos: %d con 2, %d con 12", enCursoUno, enCursoSeis)
	}
	if len(lista) != 12 {
		t.Fatalf("la lista trae los 12 documentos: %d", len(lista))
	}
	for _, d := range lista {
		switch d.PlantillaID {
		case plantillaHistoriaDePrueba:
			if len(d.Anexos) != 1 {
				t.Errorf("cada historia trae su anexo: %+v", d.Anexos)
			}
		case plantillaAnexoDePrueba:
			if d.AnexoDe == nil || d.HistoriaNoVisible {
				t.Errorf("cada anexo trae su historia: %+v", d.AnexoDe)
			}
		}
	}
}

// Una historia anulada ya no rige: no se ofrece para elegir y no se le
// cuelga un anexo. Se anula por el único camino que deja el trigger: desde
// "a firmar", con motivo y fecha.
func TestDocumentos_UnaHistoriaAnuladaNoSumaAnexos(t *testing.T) {
	e := escenarioDeDocumentos(t, "anexo-historia-anulada")
	d := e.crear(t, e.token, e.paciente.ID)
	valores := d.Valores
	valores["elementos"] = []string{"36"}
	e.guardar(t, e.token, d.ID, valores)
	e.terminar(t, e.token, d.ID)
	if err := e.gdb.Model(&db.DocumentoClinico{}).Where("id = ?", d.ID).Updates(map[string]any{
		"estado": db.DocumentoAnulado, "motivo_anulacion": "No se firmó", "anulado_en": time.Now(),
	}).Error; err != nil {
		t.Fatalf("anular la historia: %v", err)
	}

	rec := doJSONAuth(t, e.router, http.MethodGet, "/documentos/historias?paciente="+e.paciente.ID.String(), e.token, nil)
	if rec.Code != http.StatusOK || len(decodificar[[]documentoResumenResponse](t, rec.Body.Bytes())) != 0 {
		t.Fatalf("una historia anulada no se ofrece: %d — %s", rec.Code, rec.Body.String())
	}
	if code, _, body := e.pedirAnexo(t, e.token, e.paciente.ID, d.ID); code != http.StatusNotFound {
		t.Fatalf("un anexo de una historia anulada: se esperaba 404, llegó %d — %s", code, body)
	}
}
