package db

import (
	"time"

	"github.com/google/uuid"
)

// Documentos clínicos (Fase 5, TR-182 a TR-186). Diseño completo en
// docs/Fases post MVP/fase 5/fase5-documentos-clinicos.md.
//
// Un documento es una instancia de una plantilla (una historia clínica o
// un consentimiento del Colegio, internal/documentos), para UN paciente,
// hecha por UN profesional, en UNA clínica. Pasa por estos estados y
// nunca vuelve desde "sellado":
//
//	borrador ──terminar──▶ a_firmar ──última firma──▶ sellado
//	                          └──volver a editar (sin firmas)──▶ borrador
//	                          └──anular──▶ anulado
//
// Un consentimiento informado se firma a mano, en papel (TR-188): no pasa
// por "a_firmar" ni se sella en el sistema.
//
//	borrador ──terminar──▶ para_imprimir ──volver a editar──▶ borrador
//
// Lo que hace que un documento sellado no se pueda tocar NO vive acá ni
// en los handlers: vive en la base, en los triggers de
// migrate_documentos.go. Un handler nuevo mal escrito, una migración o un
// UPDATE a mano chocan contra lo mismo.
const (
	DocumentoBorrador = "borrador"
	DocumentoAFirmar  = "a_firmar"
	DocumentoSellado  = "sellado"
	DocumentoAnulado  = "anulado"
	// DocumentoParaImprimir — terminado, con su contenido congelado, y
	// listo para imprimir: las firmas se ponen a mano sobre el papel, que es
	// el documento legal (TR-188).
	DocumentoParaImprimir = "para_imprimir"
)

type DocumentoClinico struct {
	ID       uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	ClinicID uuid.UUID `gorm:"column:clinic_id;type:uuid;not null;index:idx_documento_de_paciente,priority:1"`
	// PacienteID — la ficha es de la clínica (TR-137); el documento, de la
	// historia única del paciente en esa clínica (Ley 26.529, art. 17).
	PacienteID uuid.UUID `gorm:"column:paciente_id;type:uuid;not null;index:idx_documento_de_paciente,priority:2"`
	// AutorUserID — quién lo hizo. FK compuesta a clinic_members
	// (migrate_documentos.go): tiene que ser miembro de esta clínica.
	AutorUserID      uuid.UUID `gorm:"column:autor_user_id;type:uuid;not null;index:idx_documento_del_autor,priority:1"`
	PlantillaID      string    `gorm:"column:plantilla_id;type:varchar(80);not null"`
	PlantillaVersion int       `gorm:"column:plantilla_version;not null"`
	Estado           string    `gorm:"type:varchar(20);not null;default:'borrador';index:idx_documento_del_autor,priority:2;check:chk_documento_estado,estado IN ('borrador','a_firmar','para_imprimir','sellado','anulado')"`
	// Valores — lo que cargó el profesional, campo por campo. En un
	// borrador es lo único que hay; desde "a_firmar" el documento de
	// verdad es ContenidoCanonico, y esto queda como está.
	Valores map[string]any `gorm:"type:jsonb;serializer:json;not null;default:'{}'"`
	// ContenidoCanonico — el documento congelado al terminar, en JSON
	// canónico (internal/documentos.Canonico): plantilla y versión, el
	// texto ya armado que lee el paciente, los datos, quién es el paciente
	// y quién el profesional. TEXT y no jsonb A PROPÓSITO: jsonb reordena y
	// normaliza, y la huella se calcula sobre estos bytes exactos.
	ContenidoCanonico *string `gorm:"column:contenido_canonico;type:text"`
	// HashContenido — SHA-256 de ContenidoCanonico, en hex. Cada firma
	// guarda esta misma huella: firmar es firmar ESTE contenido.
	HashContenido *string    `gorm:"column:hash_contenido;type:char(64)"`
	TerminadoEn   *time.Time `gorm:"column:terminado_en"`
	// Folio — correlativo por paciente dentro de la clínica (Ley 26.529,
	// art. 12: "foliada"). Se asigna al sellar.
	Folio *int `gorm:"column:folio"`
	// CadenaN / HashAnterior / HashSello — la cadena de sellos de la
	// clínica (TR-182): cada sello incluye el del documento anterior, así
	// que alterar uno viejo rompe todos los que vienen después.
	CadenaN      *int64     `gorm:"column:cadena_n"`
	HashAnterior *string    `gorm:"column:hash_anterior;type:char(64)"`
	HashSello    *string    `gorm:"column:hash_sello;type:char(64)"`
	SelladoEn    *time.Time `gorm:"column:sellado_en"`
	// Anulación — un pedido de firma que no se concretó. Si alguien ya
	// había firmado, queda registrado con su motivo (Ley 26.529, art. 7
	// inc. f: el rechazo también se documenta).
	MotivoAnulacion *string    `gorm:"column:motivo_anulacion;type:varchar(500)"`
	AnuladoEn       *time.Time `gorm:"column:anulado_en"`
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

func (DocumentoClinico) TableName() string { return "documentos_clinicos" }

// Los roles de firma — los mismos que ROLES_DE_FIRMA de
// packages/documentos-clinicos/src/esquema.ts.
const (
	FirmaPaciente        = "paciente"
	FirmaRepresentante   = "representante"
	FirmaAsentimiento    = "asentimiento"
	FirmaProfesional     = "profesional"
	FirmaOtroProfesional = "otro_profesional"
	FirmaTestigo1        = "testigo_1"
	FirmaTestigo2        = "testigo_2"
)

// Cómo se firmó. En la 5.1 solo existe "presencial" (en el dispositivo
// del consultorio); "vinculo" y "alerta" llegan con la 5.3.
const (
	MetodoPresencial = "presencial"
	MetodoVinculo    = "vinculo"
	MetodoAlerta     = "alerta"
)

// TrazoDeFirma — la firma dibujada, como vectores con sus tiempos y no
// como una imagen (TR-184): una imagen se copia y pega; esto se vuelve a
// dibujar exacto en el PDF y es más difícil de fabricar. Cada punto es
// [x, y, milisegundos desde el primer toque].
type TrazoDeFirma struct {
	Ancho  int            `json:"ancho"`
	Alto   int            `json:"alto"`
	Trazos [][][3]float64 `json:"trazos"`
}

// DocumentoFirma — una firma. SOLO INSERT: el trigger de
// migrate_documentos.go rechaza cualquier UPDATE o DELETE, y el INSERT
// solo si el documento está "a_firmar" y la huella es la suya.
type DocumentoFirma struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	DocumentoID uuid.UUID `gorm:"column:documento_id;type:uuid;not null;uniqueIndex:idx_documento_firma_rol,priority:1"`
	Rol         string    `gorm:"type:varchar(30);not null;uniqueIndex:idx_documento_firma_rol,priority:2;check:chk_documento_firma_rol,rol IN ('paciente','representante','asentimiento','profesional','otro_profesional','testigo_1','testigo_2')"`
	// Quién firmó, con los datos que declaró al firmar (o los del perfil,
	// si es el profesional). EnRepresentacion: en el rol "paciente", firmó
	// un representante en su nombre (el padre de un menor, un curador).
	Nombre           string  `gorm:"type:varchar(200);not null"`
	DNI              *string `gorm:"column:dni;type:varchar(20)"`
	EnRepresentacion bool    `gorm:"column:en_representacion;not null;default:false"`
	Vinculo          *string `gorm:"type:varchar(60)"`
	Metodo           string  `gorm:"type:varchar(20);not null;check:chk_documento_firma_metodo,metodo IN ('presencial','vinculo','alerta')"`
	// UserID — la cuenta que firmó, cuando la firma es del profesional.
	UserID *uuid.UUID   `gorm:"column:user_id;type:uuid"`
	Trazo  TrazoDeFirma `gorm:"type:jsonb;serializer:json;not null"`
	// HashContenido — la huella del documento que se firmó; el trigger
	// exige que sea la del documento en ese momento.
	HashContenido string `gorm:"column:hash_contenido;type:char(64);not null"`
	// HashFirma — SHA-256 de esta firma (quién, cómo, cuándo, el trazo y la
	// huella firmada). Entra en el sello del documento.
	HashFirma string `gorm:"column:hash_firma;type:char(64);not null"`
	// Evidencias de la constancia (TR-184).
	IP        *string `gorm:"type:varchar(64)"`
	UserAgent *string `gorm:"column:user_agent;type:varchar(400)"`
	// MailVerificado — reservado para el código al mail antes de firmar
	// por vínculo (D2 = A). El cliente eligió no pedirlo (2026-09-27): hoy
	// siempre NULL, y sumarlo no toca el esquema.
	MailVerificado *string `gorm:"column:mail_verificado;type:varchar(255)"`
	// FirmaDigital — reservado para la firma digital certificada del
	// profesional (Ley 25.506, TR-184 opción B): la firma PKCS#7/CMS del
	// certificador licenciado. Hoy siempre NULL.
	FirmaDigital *string   `gorm:"column:firma_digital;type:text"`
	FirmadoEn    time.Time `gorm:"column:firmado_en;not null"`
}

func (DocumentoFirma) TableName() string { return "documento_firmas" }

// Los eventos de la auditoría de un documento (TR-186).
const (
	EventoDocumentoTerminado   = "terminado"
	EventoDocumentoAlBorrador  = "vuelto_a_borrador"
	EventoDocumentoFirmado     = "firmado"
	EventoDocumentoSellado     = "sellado"
	EventoDocumentoVisto       = "visto"
	EventoDocumentoExportado   = "exportado"
	EventoDocumentoAnulado     = "anulado"
	EventoDocumentoDescartado  = "descartado"
	EventoDocumentoFichaActual = "ficha_completada"
)

// DocumentoEvento — la auditoría: quién hizo qué con un documento, y
// cuándo. SOLO INSERT (trigger). Los borradores no dejan eventos (todavía
// no son historia clínica), salvo uno: el que se terminó alguna vez y
// volvió a borrador.
//
// `documento_id` va SIN foreign key a propósito, igual que
// `conflictos_paciente` y `notificaciones.turno_id`: es historial. Un
// borrador que se terminó, volvió a editarse y se descartó deja sus
// eventos apuntando a una fila que ya no existe, y eso es lo correcto —
// la auditoría cuenta que existió.
type DocumentoEvento struct {
	ID          uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	DocumentoID uuid.UUID  `gorm:"column:documento_id;type:uuid;not null;index"`
	ClinicID    uuid.UUID  `gorm:"column:clinic_id;type:uuid;not null;index"`
	UserID      *uuid.UUID `gorm:"column:user_id;type:uuid"`
	Tipo        string     `gorm:"type:varchar(30);not null"`
	Detalle     *string    `gorm:"type:varchar(200)"`
	IP          *string    `gorm:"type:varchar(64)"`
	CreatedAt   time.Time  `gorm:"not null;default:now()"`
}

func (DocumentoEvento) TableName() string { return "documento_eventos" }
