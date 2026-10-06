package db

// Documentos clínicos (Fase 5.1, TR-182): lo que hace que un documento
// sellado no se pueda tocar vive ACÁ, en la base, y no en los handlers.
//
// Es la misma idea que el EXCLUDE de los turnos (spec §4.3): una regla que
// no se puede violar no se valida, se declara. Un handler nuevo mal
// escrito, una migración futura o un UPDATE a mano en una consola chocan
// contra estos triggers igual que el código de la API.
//
// Lo que NO pueden impedir: que alguien con acceso de administrador a la
// base los desactive. Para eso está la cadena de sellos (cada sello
// incluye el anterior, ver internal/documentos): la alteración de un
// documento viejo rompe todos los sellos siguientes y se detecta.
//
// Todo es idempotente (CREATE OR REPLACE, IF NOT EXISTS, DO … EXCEPTION):
// corre en cada arranque, bajo el advisory lock de RunMigrations. Lo que
// REEMPLAZA algo que ya existe (el check de estados y los triggers) va como
// paso con huella (migrate_con_huella.go): solo corre si su SQL cambió o si
// el objeto falta, porque repetirlo en cada arranque tomaba locks fuertes
// sobre estas tablas y trababa a los tests de otros paquetes (deadlock de
// CI, PR #83). Lo que se CREA una sola vez (la FK compuesta, los checks
// que nunca cambiaron y los índices únicos) va como paso "si hace
// falta": se le pregunta al catálogo antes de tocar la tabla, porque el
// `ADD CONSTRAINT` dentro de un `DO … EXCEPTION` y el `CREATE INDEX IF NOT
// EXISTS` esperaban el lock de la tabla aunque el objeto ya existiera. Las
// funciones siguen corriendo siempre: CREATE OR REPLACE FUNCTION no toma
// locks de tabla.
//
// Devuelve []any (sentencias comunes y pasos con huella mezclados) porque el
// orden importa: cada trigger va después de la función que ejecuta.
func sentenciasDeDocumentos() []any {
	return []any{
		// El autor tiene que ser miembro de ESTA clínica — misma FK
		// compuesta que turnos.atendido_por_user_id. Como una membresía no
		// se borra nunca (se marca 'removed'), el documento de alguien que
		// dejó la clínica sigue siendo válido y queda en ella: la ley hace
		// depositario al establecimiento (Ley 26.529, art. 18).
		crearConstraintSiFalta("documentos_clinicos", "fk_documentos_autor_de_la_clinica",
			`DO $$ BEGIN
		   ALTER TABLE documentos_clinicos ADD CONSTRAINT fk_documentos_autor_de_la_clinica
		     FOREIGN KEY (clinic_id, autor_user_id)
		     REFERENCES clinic_members (clinic_id, user_id);
		 EXCEPTION WHEN duplicate_object THEN NULL; END $$`),

		// Los estados posibles. DROP + ADD, no el patrón de duplicate_object:
		// sumó 'para_imprimir' (TR-188) y 'abierto' (Fase 5.6d), y GORM no
		// actualiza un check que ya existe — la base se habría quedado
		// rechazando el estado nuevo.
		reemplazarConstraint("documentos_clinicos", "chk_documento_estado",
			`ALTER TABLE documentos_clinicos DROP CONSTRAINT IF EXISTS chk_documento_estado`,
			`ALTER TABLE documentos_clinicos ADD CONSTRAINT chk_documento_estado
		   CHECK (estado IN ('borrador', 'a_firmar', 'para_imprimir', 'sellado', 'anulado', 'abierto'))`),

		// Un documento que salió de borrador tiene su contenido congelado.
		crearConstraintSiFalta("documentos_clinicos", "chk_documento_congelado",
			`DO $$ BEGIN
		   ALTER TABLE documentos_clinicos ADD CONSTRAINT chk_documento_congelado
		     CHECK (estado = 'borrador' OR (contenido_canonico IS NOT NULL AND hash_contenido IS NOT NULL AND terminado_en IS NOT NULL));
		 EXCEPTION WHEN duplicate_object THEN NULL; END $$`),
		// Uno sellado tiene todo lo del sello, y su folio salvo que sea un
		// anexo: un anexo no consume folio, lleva el "x.y" de su historia
		// (Fase 5.6d). Pasó de crearse una vez a reemplazarse al sumar esa
		// excepción; la regla nueva es más laxa, así que lo ya guardado la
		// cumple.
		reemplazarConstraint("documentos_clinicos", "chk_documento_sellado_completo",
			`ALTER TABLE documentos_clinicos DROP CONSTRAINT IF EXISTS chk_documento_sellado_completo`,
			`ALTER TABLE documentos_clinicos ADD CONSTRAINT chk_documento_sellado_completo
		     CHECK (estado <> 'sellado' OR (hash_sello IS NOT NULL AND (folio IS NOT NULL OR anexo_de IS NOT NULL)
		       AND cadena_n IS NOT NULL AND sellado_en IS NOT NULL))`),
		// Uno para imprimir ya tiene su folio: es parte de la historia del
		// paciente (TR-188), salvo un anexo (el "x.y" de su historia). NOT
		// VALID: los de antes de esta regla (solo en bases de desarrollo) no
		// se tocan; lo nuevo, sí.
		reemplazarConstraint("documentos_clinicos", "chk_documento_para_imprimir_con_folio",
			`ALTER TABLE documentos_clinicos DROP CONSTRAINT IF EXISTS chk_documento_para_imprimir_con_folio`,
			`ALTER TABLE documentos_clinicos ADD CONSTRAINT chk_documento_para_imprimir_con_folio
		     CHECK (estado <> 'para_imprimir' OR folio IS NOT NULL OR anexo_de IS NOT NULL) NOT VALID`),
		// Uno anulado dice por qué.
		crearConstraintSiFalta("documentos_clinicos", "chk_documento_anulado_con_motivo",
			`DO $$ BEGIN
		   ALTER TABLE documentos_clinicos ADD CONSTRAINT chk_documento_anulado_con_motivo
		     CHECK (estado <> 'anulado' OR (motivo_anulacion IS NOT NULL AND anulado_en IS NOT NULL));
		 EXCEPTION WHEN duplicate_object THEN NULL; END $$`),

		// Un anexo de continuación (Fase 5.6d) tiene su sección y su número,
		// cuelga de una historia y está abierto; y "abierto" es solo suyo.
		// Reemplazado al sacarle el folio (un anexo ya no lo consume): la
		// regla nueva es más laxa, así que lo ya guardado la cumple.
		reemplazarConstraint("documentos_clinicos", "chk_documento_continuacion",
			`ALTER TABLE documentos_clinicos DROP CONSTRAINT IF EXISTS chk_documento_continuacion`,
			`ALTER TABLE documentos_clinicos ADD CONSTRAINT chk_documento_continuacion
		     CHECK ((anexo_seccion IS NULL OR (anexo_de IS NOT NULL AND anexo_numero IS NOT NULL AND estado = 'abierto'))
		       AND (estado <> 'abierto' OR anexo_seccion IS NOT NULL))`),
		// Todo anexo con historia (de continuación o suelto) tiene su número
		// en ella —el y de su "x.y"—, desde 1, y no consume folio: su folio
		// es el de la historia. NOT VALID, como chk_*_con_duenio: las bases
		// de desarrollo tienen anexos de antes de esta regla, con folio y sin
		// número, y el candado no deja tocar uno abierto ni sellado; lo
		// nuevo, sí la cumple. Un borrador viejo sin número ya no se puede
		// guardar: se descarta y se hace de nuevo (son datos de QA local).
		reemplazarConstraint("documentos_clinicos", "chk_documento_anexo",
			`ALTER TABLE documentos_clinicos DROP CONSTRAINT IF EXISTS chk_documento_anexo`,
			`ALTER TABLE documentos_clinicos ADD CONSTRAINT chk_documento_anexo
		     CHECK ((anexo_de IS NULL) = (anexo_numero IS NULL)
		       AND (anexo_numero IS NULL OR anexo_numero >= 1)
		       AND (anexo_de IS NULL OR folio IS NULL)) NOT VALID`),
		// Uno por sección de cada historia, y numerados por historia (el
		// "Continúa en anexo Nº" del papel).
		crearIndiceSiFalta("idx_documento_anexo_seccion",
			`CREATE UNIQUE INDEX IF NOT EXISTS idx_documento_anexo_seccion
		   ON documentos_clinicos (anexo_de, anexo_seccion) WHERE anexo_seccion IS NOT NULL`),
		crearIndiceSiFalta("idx_documento_anexo_numero",
			`CREATE UNIQUE INDEX IF NOT EXISTS idx_documento_anexo_numero
		   ON documentos_clinicos (anexo_de, anexo_numero) WHERE anexo_numero IS NOT NULL`),

		// El folio es correlativo por paciente en la clínica, y la cadena
		// es una sola por clínica: ninguno de los dos se repite.
		crearIndiceSiFalta("idx_documento_folio",
			`CREATE UNIQUE INDEX IF NOT EXISTS idx_documento_folio
		   ON documentos_clinicos (clinic_id, paciente_id, folio) WHERE folio IS NOT NULL`),
		crearIndiceSiFalta("idx_documento_cadena",
			`CREATE UNIQUE INDEX IF NOT EXISTS idx_documento_cadena
		   ON documentos_clinicos (clinic_id, cadena_n) WHERE cadena_n IS NOT NULL`),

		// --- documentos_clinicos: el candado ---
		//
		// UPDATE: un documento sellado o anulado no cambia NADA. Uno
		// "a_firmar" solo puede sellarse o anularse, y en ningún caso cambia
		// su contenido congelado. Uno "para_imprimir" (un consentimiento: se
		// firma en papel, TR-188) ya no cambia: ni se firma ni se sella en el
		// sistema. NADA terminado vuelve a borrador (TR-188): si hay que
		// corregir, se hace otro documento. Uno "abierto" (un anexo de
		// continuación, Fase 5.6d) tampoco cambia: lo que crece son sus
		// asientos, en su propia tabla. La identidad (clínica, paciente,
		// autor, plantilla y, en un anexo, su historia, su sección y su
		// número) no cambia nunca.
		// DELETE: solo un borrador (descartar); lo demás es historia clínica.
		`CREATE OR REPLACE FUNCTION documentos_clinicos_candado() RETURNS trigger
		 LANGUAGE plpgsql AS $$
		 BEGIN
		   IF TG_OP = 'DELETE' THEN
		     IF OLD.estado <> 'borrador' THEN
		       RAISE EXCEPTION 'documento clínico %: solo un borrador se puede borrar (está %)', OLD.id, OLD.estado;
		     END IF;
		     RETURN OLD;
		   END IF;

		   IF OLD.estado IN ('sellado', 'anulado', 'abierto') THEN
		     RAISE EXCEPTION 'documento clínico %: un documento % no se modifica', OLD.id, OLD.estado;
		   END IF;

		   IF NEW.id <> OLD.id OR NEW.clinic_id <> OLD.clinic_id OR NEW.paciente_id <> OLD.paciente_id
		      OR NEW.autor_user_id <> OLD.autor_user_id OR NEW.plantilla_id <> OLD.plantilla_id
		      OR NEW.plantilla_version <> OLD.plantilla_version OR NEW.created_at <> OLD.created_at
		      OR NEW.anexo_de IS DISTINCT FROM OLD.anexo_de OR NEW.anexo_seccion IS DISTINCT FROM OLD.anexo_seccion
		      OR NEW.anexo_numero IS DISTINCT FROM OLD.anexo_numero THEN
		     RAISE EXCEPTION 'documento clínico %: la identidad de un documento no cambia', OLD.id;
		   END IF;

		   IF OLD.estado = 'borrador' THEN
		     IF NEW.estado NOT IN ('borrador', 'a_firmar', 'para_imprimir') THEN
		       RAISE EXCEPTION 'documento clínico %: un borrador solo pasa a a_firmar o para_imprimir', OLD.id;
		     END IF;
		     -- El folio lo recibe al terminar un consentimiento (para_imprimir) o
		     -- al sellar; el sello, solo al sellar.
		     IF NEW.cadena_n IS NOT NULL OR NEW.hash_sello IS NOT NULL
		        OR (NEW.folio IS NOT NULL AND NEW.estado <> 'para_imprimir') THEN
		       RAISE EXCEPTION 'documento clínico %: un borrador no se sella', OLD.id;
		     END IF;
		     RETURN NEW;
		   END IF;

		   -- OLD.estado = 'a_firmar' o 'para_imprimir': terminado.
		   IF NEW.estado = 'borrador' THEN
		     RAISE EXCEPTION 'documento clínico %: un documento terminado no vuelve a borrador: se hace otro', OLD.id;
		   END IF;
		   IF OLD.estado = 'para_imprimir' AND NEW.estado <> 'para_imprimir' THEN
		     RAISE EXCEPTION 'documento clínico %: un documento para imprimir se firma en papel: no se firma ni se sella en el sistema', OLD.id;
		   END IF;

		   IF NEW.valores IS DISTINCT FROM OLD.valores
		      OR NEW.contenido_canonico IS DISTINCT FROM OLD.contenido_canonico
		      OR NEW.hash_contenido IS DISTINCT FROM OLD.hash_contenido
		      OR NEW.terminado_en IS DISTINCT FROM OLD.terminado_en THEN
		     RAISE EXCEPTION 'documento clínico %: el contenido congelado no cambia', OLD.id;
		   END IF;

		   IF NEW.estado IN ('a_firmar', 'para_imprimir') THEN
		     IF NEW.folio IS DISTINCT FROM OLD.folio OR NEW.cadena_n IS DISTINCT FROM OLD.cadena_n
		        OR NEW.hash_sello IS DISTINCT FROM OLD.hash_sello OR NEW.hash_anterior IS DISTINCT FROM OLD.hash_anterior THEN
		       RAISE EXCEPTION 'documento clínico %: el sello se pone al sellar', OLD.id;
		     END IF;
		   END IF;
		   RETURN NEW;
		 END $$`,
		reemplazarTrigger("documentos_clinicos", "trg_documentos_clinicos_candado",
			`CREATE OR REPLACE TRIGGER trg_documentos_clinicos_candado
		   BEFORE UPDATE OR DELETE ON documentos_clinicos
		   FOR EACH ROW EXECUTE FUNCTION documentos_clinicos_candado()`),

		// --- documento_firmas: solo INSERT, y sobre el contenido congelado ---
		`CREATE OR REPLACE FUNCTION documento_firmas_candado() RETURNS trigger
		 LANGUAGE plpgsql AS $$
		 BEGIN
		   IF TG_OP = 'INSERT' THEN
		     IF NOT EXISTS (
		       SELECT 1 FROM documentos_clinicos d
		       WHERE d.id = NEW.documento_id AND d.estado = 'a_firmar' AND d.hash_contenido = NEW.hash_contenido
		     ) THEN
		       RAISE EXCEPTION 'firma de %: solo se firma un documento a_firmar, sobre su contenido congelado', NEW.documento_id;
		     END IF;
		     RETURN NEW;
		   END IF;
		   RAISE EXCEPTION 'firma %: una firma no se modifica ni se borra', OLD.id;
		 END $$`,
		reemplazarTrigger("documento_firmas", "trg_documento_firmas_candado",
			`CREATE OR REPLACE TRIGGER trg_documento_firmas_candado
		   BEFORE INSERT OR UPDATE OR DELETE ON documento_firmas
		   FOR EACH ROW EXECUTE FUNCTION documento_firmas_candado()`),

		// --- documento_asientos: solo INSERT, en orden y encadenados ---
		//
		// Un asiento se escribe solo en un anexo de continuación abierto, y
		// va después del último: su número es el que sigue y su
		// hash_anterior, la huella del anterior (la del contenido congelado
		// del anexo, para el primero). La API los arma así bajo un lock; esto
		// lo exige aunque llegue por SQL crudo.
		`CREATE OR REPLACE FUNCTION documento_asientos_candado() RETURNS trigger
		 LANGUAGE plpgsql AS $$
		 DECLARE
		   contenido text;
		   ultimo_numero bigint;
		   ultimo_hash text;
		 BEGIN
		   IF TG_OP <> 'INSERT' THEN
		     RAISE EXCEPTION 'asiento %: un asiento no se modifica ni se borra', OLD.id;
		   END IF;
		   SELECT d.hash_contenido INTO contenido FROM documentos_clinicos d
		   WHERE d.id = NEW.documento_id AND d.estado = 'abierto' AND d.anexo_seccion IS NOT NULL;
		   IF NOT FOUND THEN
		     RAISE EXCEPTION 'asiento de %: solo se escribe en un anexo de continuación abierto', NEW.documento_id;
		   END IF;
		   SELECT a.numero, a.hash INTO ultimo_numero, ultimo_hash FROM documento_asientos a
		   WHERE a.documento_id = NEW.documento_id ORDER BY a.numero DESC LIMIT 1;
		   IF NOT FOUND THEN
		     ultimo_numero := 0;
		     ultimo_hash := contenido;
		   END IF;
		   IF NEW.numero <> ultimo_numero + 1 OR NEW.hash_anterior IS DISTINCT FROM ultimo_hash THEN
		     RAISE EXCEPTION 'asiento de %: va después del último, encadenado a su huella', NEW.documento_id;
		   END IF;
		   RETURN NEW;
		 END $$`,
		reemplazarTrigger("documento_asientos", "trg_documento_asientos_candado",
			`CREATE OR REPLACE TRIGGER trg_documento_asientos_candado
		   BEFORE INSERT OR UPDATE OR DELETE ON documento_asientos
		   FOR EACH ROW EXECUTE FUNCTION documento_asientos_candado()`),

		// --- documento_eventos: la auditoría, solo INSERT ---
		`CREATE OR REPLACE FUNCTION documento_eventos_candado() RETURNS trigger
		 LANGUAGE plpgsql AS $$
		 BEGIN
		   RAISE EXCEPTION 'evento %: la auditoría no se modifica ni se borra', OLD.id;
		 END $$`,
		reemplazarTrigger("documento_eventos", "trg_documento_eventos_candado",
			`CREATE OR REPLACE TRIGGER trg_documento_eventos_candado
		   BEFORE UPDATE OR DELETE ON documento_eventos
		   FOR EACH ROW EXECUTE FUNCTION documento_eventos_candado()`),

		// TRUNCATE no dispara los triggers de fila: sin esto, vaciar la
		// tabla entera saltearía todo lo de arriba.
		`CREATE OR REPLACE FUNCTION documentos_sin_truncate() RETURNS trigger
		 LANGUAGE plpgsql AS $$
		 BEGIN
		   RAISE EXCEPTION '%: los documentos clínicos no se vacían', TG_TABLE_NAME;
		 END $$`,
		reemplazarTrigger("documentos_clinicos", "trg_documentos_clinicos_sin_truncate",
			`CREATE OR REPLACE TRIGGER trg_documentos_clinicos_sin_truncate
		   BEFORE TRUNCATE ON documentos_clinicos
		   FOR EACH STATEMENT EXECUTE FUNCTION documentos_sin_truncate()`),
		reemplazarTrigger("documento_firmas", "trg_documento_firmas_sin_truncate",
			`CREATE OR REPLACE TRIGGER trg_documento_firmas_sin_truncate
		   BEFORE TRUNCATE ON documento_firmas
		   FOR EACH STATEMENT EXECUTE FUNCTION documentos_sin_truncate()`),
		reemplazarTrigger("documento_asientos", "trg_documento_asientos_sin_truncate",
			`CREATE OR REPLACE TRIGGER trg_documento_asientos_sin_truncate
		   BEFORE TRUNCATE ON documento_asientos
		   FOR EACH STATEMENT EXECUTE FUNCTION documentos_sin_truncate()`),
		reemplazarTrigger("documento_eventos", "trg_documento_eventos_sin_truncate",
			`CREATE OR REPLACE TRIGGER trg_documento_eventos_sin_truncate
		   BEFORE TRUNCATE ON documento_eventos
		   FOR EACH STATEMENT EXECUTE FUNCTION documentos_sin_truncate()`),
	}
}
