#!/usr/bin/env bash
#
# QA del entorno de desarrollo: el flujo real contra los contenedores.
#
#   docker compose up -d --build
#   bash scripts/qa-entorno-dev.sh
#
# Recorre el flujo REAL de punta a punta contra la API y la web levantadas
# (no mocks, no la suite de tests) y al final borra todo lo que creó. La
# suite corre contra una base de test con transacciones que se revierten;
# esto corre contra los contenedores, con las migraciones ya aplicadas y los
# datos que hay: un problema de migración, de configuración o de una
# constraint que se creó mal solo se ve acá.
#
# Qué verifica:
#   1. La API y la base responden (/health).
#   2. El alta de un profesional por los endpoints reales: registro, perfil
#      (PATCH /onboarding/perfil) y la clínica propia (PATCH
#      /onboarding/clinica, que exige provincia, ciudad, dirección y
#      teléfono).
#   3. Que el alta sembró los tipos de consulta del titular (con clinic_id y
#      user_id, TR-137) y que el panel crea paciente + turno con las foreign
#      keys activas.
#   4. Que las foreign keys rechacen lo que no existe (fk_pacientes_clinica).
#   5. La paginación opt-in de los listados del panel (X-Total-Count solo
#      con `limit`, el calendario depende de eso) y el 400 de un filtro
#      inventado.
#   6. El wizard público tal como lo recorre hoy (TR-146): la página, los
#      tipos de consulta deduplicados por nombre, quién atiende el tipo
#      elegido (con su tipoConsultaId y su primer día libre), los horarios
#      de ese día y los días con lugar del mes.
#   7. Que la web sirva la home y la página pública de la clínica.
#   Y la limpieza: todo en UNA transacción, y después se comprueba que no
#   quedaron ni la clínica ni el usuario. Si falla, cuenta como falla.
#
# El tope de lecturas públicas por IP (TR-178) no cuenta este tráfico: desde
# la máquina local no llega ninguna IP pública.
set -uo pipefail

# Corre desde la raíz del repo: `docker compose exec` busca ahí el compose.
cd "$(dirname "$0")/.." || exit 1

API=http://localhost:8080
WEB=http://localhost:3000
PSQL="docker compose exec -T postgres psql -U dental_mirage -d dental_mirage"
EMAIL="qa-fasec-$(date +%s)@example.com"
PASS='UnaClaveLarga123!'
TIPO_NOMBRE='Consulta general'   # lo siembra el alta en toda agenda (db.SeedTiposConsultaDefault)
OK=0; FALLA=0
CLINIC_ID=""; SLUG=""

paso() { printf "\n\033[1m%s\033[0m\n" "$1"; }
ok()   { printf "  ✅ %s\n" "$1"; OK=$((OK+1)); }
mal()  { printf "  ❌ %s\n" "$1"; FALLA=$((FALLA+1)); }
sql()  { $PSQL -tAc "$1" 2>&1 | tr -d '\r'; }

# --- Limpieza ---
# Borra todo lo que cuelga del usuario del QA y de la clínica de la que es
# titular, en el orden que imponen las foreign keys (NO ACTION casi todas:
# no se puede borrar la clínica mientras algo la referencie, ni el usuario
# mientras sea dueño de una clínica). Ninguna ruta del producto borra
# clínicas: este orden existe solo para el QA. Va en una sola transacción
# con ON_ERROR_STOP: si algo falla no queda nada a medio borrar, y la
# corrida lo cuenta como falla.
#
# Antes de borrar, verifica que la clínica sea solo del QA (ningún otro
# miembro, ningún documento clínico, que la base no deja borrar).
limpiar() {
  paso "Limpieza del QA"
  local salida estado
  salida=$($PSQL -q -v ON_ERROR_STOP=1 2>&1 <<SQL
BEGIN;
CREATE TEMP TABLE qa_usuario ON COMMIT DROP AS
  SELECT id FROM users WHERE email = '$EMAIL';
CREATE TEMP TABLE qa_clinica ON COMMIT DROP AS
  SELECT id FROM clinics WHERE owner_id IN (SELECT id FROM qa_usuario);

DO \$\$
BEGIN
  IF EXISTS (SELECT 1 FROM clinic_members
               WHERE clinic_id IN (SELECT id FROM qa_clinica)
                 AND user_id NOT IN (SELECT id FROM qa_usuario))
     OR EXISTS (SELECT 1 FROM clinic_members
               WHERE user_id IN (SELECT id FROM qa_usuario)
                 AND clinic_id NOT IN (SELECT id FROM qa_clinica)) THEN
    RAISE EXCEPTION 'la clínica o el usuario del QA comparten datos con otros: no se borra';
  END IF;
  IF EXISTS (SELECT 1 FROM documentos_clinicos WHERE clinic_id IN (SELECT id FROM qa_clinica))
     OR EXISTS (SELECT 1 FROM documento_eventos WHERE clinic_id IN (SELECT id FROM qa_clinica)) THEN
    RAISE EXCEPTION 'la clínica del QA tiene documentos clínicos: la base no deja borrarlos';
  END IF;
END
\$\$;

CREATE TEMP TABLE qa_turnos ON COMMIT DROP AS
  SELECT id FROM turnos WHERE clinic_id IN (SELECT id FROM qa_clinica);
CREATE TEMP TABLE qa_pacientes ON COMMIT DROP AS
  SELECT id FROM pacientes WHERE clinic_id IN (SELECT id FROM qa_clinica);
CREATE TEMP TABLE qa_miembros ON COMMIT DROP AS
  SELECT id FROM clinic_members
   WHERE clinic_id IN (SELECT id FROM qa_clinica) OR user_id IN (SELECT id FROM qa_usuario);
CREATE TEMP TABLE qa_paginas ON COMMIT DROP AS
  SELECT id FROM paginas_publicas WHERE clinic_id IN (SELECT id FROM qa_clinica);

DELETE FROM notificaciones
 WHERE user_id IN (SELECT id FROM qa_usuario)
    OR clinic_id IN (SELECT id FROM qa_clinica)
    OR turno_id IN (SELECT id FROM qa_turnos);
DELETE FROM turnos WHERE id IN (SELECT id FROM qa_turnos);
DELETE FROM paciente_tutor_telefonos_alternativos WHERE paciente_tutor_id IN
  (SELECT id FROM paciente_tutores WHERE paciente_id IN (SELECT id FROM qa_pacientes));
DELETE FROM paciente_tutores WHERE paciente_id IN (SELECT id FROM qa_pacientes);
DELETE FROM paciente_emails_alternativos WHERE paciente_id IN (SELECT id FROM qa_pacientes);
DELETE FROM paciente_telefonos_alternativos WHERE paciente_id IN (SELECT id FROM qa_pacientes);
DELETE FROM pacientes_en_mi_lista
 WHERE paciente_id IN (SELECT id FROM qa_pacientes) OR clinic_id IN (SELECT id FROM qa_clinica);
DELETE FROM conflictos_paciente WHERE clinic_id IN (SELECT id FROM qa_clinica);
DELETE FROM enlaces_turno WHERE clinic_id IN (SELECT id FROM qa_clinica);
DELETE FROM pacientes WHERE id IN (SELECT id FROM qa_pacientes);
DELETE FROM tipos_consulta WHERE clinic_id IN (SELECT id FROM qa_clinica);
DELETE FROM horarios_atencion WHERE clinic_id IN (SELECT id FROM qa_clinica);
DELETE FROM bloqueos_horario WHERE clinic_id IN (SELECT id FROM qa_clinica);
DELETE FROM horarios_clinica WHERE clinic_id IN (SELECT id FROM qa_clinica);
DELETE FROM verificaciones_turno_publico WHERE clinic_id IN (SELECT id FROM qa_clinica);
DELETE FROM emails_bloqueados_turno_publico WHERE clinic_id IN (SELECT id FROM qa_clinica);
DELETE FROM ips_bloqueadas_turno_publico WHERE clinic_id IN (SELECT id FROM qa_clinica);
DELETE FROM auditoria_bloqueos_turno_publico WHERE clinic_id IN (SELECT id FROM qa_clinica);
DELETE FROM clinic_invitations
 WHERE clinic_id IN (SELECT id FROM qa_clinica) OR invited_by_user_id IN (SELECT id FROM qa_usuario);
DELETE FROM pagina_publica_modulos WHERE pagina_publica_id IN (SELECT id FROM qa_paginas);
DELETE FROM pagina_publica_versiones WHERE pagina_publica_id IN (SELECT id FROM qa_paginas);
DELETE FROM paginas_publicas WHERE id IN (SELECT id FROM qa_paginas);
DELETE FROM clinic_member_roles WHERE clinic_member_id IN (SELECT id FROM qa_miembros);
DELETE FROM clinic_members WHERE id IN (SELECT id FROM qa_miembros);
DELETE FROM sessions
 WHERE user_id IN (SELECT id FROM qa_usuario) OR clinic_id IN (SELECT id FROM qa_clinica);
DELETE FROM clinics WHERE id IN (SELECT id FROM qa_clinica);
DELETE FROM professional_especialidades WHERE user_id IN (SELECT id FROM qa_usuario);
DELETE FROM professional_profiles WHERE user_id IN (SELECT id FROM qa_usuario);
DELETE FROM audit_events WHERE user_id IN (SELECT id FROM qa_usuario);
DELETE FROM auth_rate_counters WHERE key LIKE '%$EMAIL%';
-- accounts, verification_tokens y push_suscripciones caen con el usuario (CASCADE).
DELETE FROM users WHERE id IN (SELECT id FROM qa_usuario);
COMMIT;
SQL
)
  estado=$?
  if [[ $estado -eq 0 ]]; then
    ok "limpieza aplicada en una sola transacción"
  else
    mal "la limpieza falló y se revirtió entera (salida $estado): $(echo "$salida" | tr -d '\r')"
  fi

  local resto
  resto=$(sql "SELECT (SELECT count(*) FROM users WHERE email = '$EMAIL')
                    + (SELECT count(*) FROM clinics
                        WHERE owner_id IN (SELECT id FROM users WHERE email = '$EMAIL')
                           OR id::text = '${CLINIC_ID:-}'
                           OR slug = '${SLUG:-}')")
  [[ "$resto" == "0" ]] && ok "no quedó ni la clínica ni el usuario del QA" \
                        || mal "quedaron datos del QA (clínica + usuario: $resto)"
}

terminar() {
  printf "\n\033[1m=== RESULTADO: %d ok, %d fallas ===\033[0m\n" "$OK" "$FALLA"
  exit $([[ "$FALLA" -eq 0 ]] && echo 0 || echo 1)
}

# --- 1. Salud ---
paso "1. Salud del stack"
H=$(curl -s "$API/health")
[[ "$H" == *'"db":"ok"'* ]] && ok "API y base responden: $H" || mal "health inesperado: $H"

# --- 2. Registro + onboarding (flujo real) ---
paso "2. Alta de profesional por el flujo real"
REG=$(curl -s -X POST "$API/auth/register" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"aceptaTerminos\":true}")
TOKEN=$(echo "$REG" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
if [[ -n "$TOKEN" ]]; then
  ok "registro devolvió token"
else
  mal "registro falló: $REG"
  limpiar; terminar
fi

# El código de 6 dígitos del mail no se puede leer desde acá: se marca el
# mail como verificado directo en la base.
sql "UPDATE users SET email_verified_at = now(), onboarding_step = 'perfil' WHERE email = '$EMAIL'" >/dev/null
USER_ID=$(sql "SELECT id FROM users WHERE email = '$EMAIL'")
ESP=$(sql "SELECT id FROM especialidades WHERE nombre = 'Odontología general' LIMIT 1")
# La matrícula es única en todo el sistema (TR-141): se deriva de la hora.
MATRICULA="MP-QA-${EMAIL//[^0-9]/}"

PERFIL=$(curl -s -X PATCH "$API/onboarding/perfil" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -w '\n%{http_code}' \
  -d "{\"nombre\":\"QA\",\"apellido\":\"FaseC\",\"telefonoPrefijo\":\"+54\",\"telefono\":\"+5493511234567\",\"matriculaTipo\":\"nacional\",\"matriculaNumero\":\"$MATRICULA\",\"especialidadIds\":[\"$ESP\"]}")
[[ "$(echo "$PERFIL" | tail -1)" == "200" ]] && ok "perfil profesional completado" \
                                            || mal "perfil falló: $(echo "$PERFIL" | tr '\n' ' ')"

# La clínica propia: PATCH /onboarding/clinica (lo usa también "Crear mi
# clínica" de /clinicas). Pide provincia, ciudad, dirección y teléfono:
# son los datos de la página pública y del buscador.
CLIN=$(curl -s -X PATCH "$API/onboarding/clinica" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"tipo":"individual","nombre":"Clinica QA Fase C","provincia":"Córdoba","ciudad":"Córdoba","direccion":"Av. Siempre Viva 123","telefono":"+5493511234567"}')
SLUG=$(echo "$CLIN" | sed -n 's/.*"slug":"\([^"]*\)".*/\1/p')
[[ -n "$SLUG" ]] && ok "clínica creada (slug: $SLUG)" || mal "clínica falló: $CLIN"

CLINIC_ID=$(sql "SELECT c.id FROM clinics c JOIN users u ON u.id = c.owner_id WHERE u.email = '$EMAIL'")
[[ -n "$CLINIC_ID" ]] && ok "clinic_id: $CLINIC_ID" || mal "no se encontró la clínica en la base"

# --- 3. La FK acepta el camino legítimo ---
paso "3. Foreign keys: el camino legítimo sigue funcionando"
TIPOS=$(curl -s "$API/tipos-consulta" -H "Authorization: Bearer $TOKEN")
TIPO_ID=$(echo "$TIPOS" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p' | head -1)
SEMBRADOS=$(sql "SELECT count(*) FROM tipos_consulta WHERE clinic_id = '${CLINIC_ID:-00000000-0000-0000-0000-000000000000}' AND user_id = '$USER_ID'")
if [[ -n "$TIPO_ID" && "$SEMBRADOS" =~ ^[0-9]+$ && "$SEMBRADOS" -ge 2 ]]; then
  ok "tipos de consulta sembrados por el alta ($SEMBRADOS, con clinic_id de la clínica y user_id del titular)"
else
  mal "no se sembraron tipos ($SEMBRADOS en la base): $TIPOS"
fi

# El paciente y el turno se crean por el endpoint real del panel.
MANANA=$(date -d '+1 day' +%Y-%m-%d 2>/dev/null || date -v+1d +%Y-%m-%d)
INICIO="${MANANA}T14:00:00Z"   # 11:00 en Córdoba (UTC-3), dentro del horario de atención por default
FIN="${MANANA}T14:30:00Z"
TURNO=$(curl -s -X POST "$API/turnos" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"nombreContacto\":\"Ana\",\"apellidoContacto\":\"QA\",\"dniContacto\":\"30111999\",\"telefonoContacto\":\"3510000001\",\"emailContacto\":\"ana.qa@example.com\",\"tipoConsultaId\":\"$TIPO_ID\",\"horaInicio\":\"$INICIO\",\"horaFin\":\"$FIN\",\"motivo\":\"QA del entorno\"}")
if [[ "$TURNO" == *'"id"'* ]]; then
  ok "turno creado por el endpoint real (paciente + turno con FKs activas)"
else
  mal "no se pudo crear el turno: $TURNO"
fi

# --- 4. La FK rechaza lo que no existe ---
paso "4. Foreign keys: rechazan lo que no existe"
FALSO=$(sql "INSERT INTO pacientes (id, clinic_id, nombre, apellido, dni, created_at, updated_at)
        VALUES (gen_random_uuid(), gen_random_uuid(), 'Falso', 'Huerfano', '99999999', now(), now())")
if [[ "$FALSO" == *"fk_pacientes_clinica"* ]]; then
  ok "un paciente de una clínica inexistente es rechazado por fk_pacientes_clinica"
else
  mal "la FK NO rechazó el insert huérfano: $FALSO"
fi

# --- 5. Paginación ---
paso "5. Paginación de los listados del panel"
HDRS=$(curl -s -D - -o /dev/null "$API/turnos?limit=1" -H "Authorization: Bearer $TOKEN")
TOTAL=$(echo "$HDRS" | grep -i '^x-total-count:' | tr -d '\r' | awk '{print $2}')
[[ -n "$TOTAL" ]] && ok "GET /turnos?limit=1 devuelve X-Total-Count: $TOTAL" || mal "no vino X-Total-Count"

SIN=$(curl -s -D - -o /dev/null "$API/turnos" -H "Authorization: Bearer $TOKEN" | grep -ci '^x-total-count:')
[[ "$SIN" == "0" ]] && ok "sin limit no manda el header (compatibilidad intacta, el calendario depende de esto)" \
                    || mal "mandó X-Total-Count sin pedir paginación"

VERIF=$(curl -s -o /dev/null -w '%{http_code}' "$API/pacientes?verificacion=cualquiera" -H "Authorization: Bearer $TOKEN")
[[ "$VERIF" == "400" ]] && ok "un filtro de verificación inventado devuelve 400, no la lista entera" \
                        || mal "verificacion inválida devolvió $VERIF"

# --- 6. Wizard público ---
# El wizard elige TIPO (por nombre) y después PROFESIONAL (TR-146), y los
# horarios se piden con los dos: `tipo` + `profesionalId`.
paso "6. Wizard público"
PUB=$(curl -s -o /dev/null -w '%{http_code}' "$API/clinicas/$SLUG")
[[ "$PUB" == "200" ]] && ok "página pública de la clínica responde 200" || mal "página pública devolvió $PUB"

PTIPOS=$(curl -s "$API/clinicas/$SLUG/tipos-consulta")
if [[ "$PTIPOS" == *"\"nombre\":\"$TIPO_NOMBRE\",\"profesionales\":1"* && "$PTIPOS" != *'"id"'* ]]; then
  ok "tipos públicos: nombres deduplicados, sin id ($PTIPOS)"
else
  mal "tipos públicos con otra forma: $PTIPOS"
fi

PROFS=$(curl -s -G "$API/clinicas/$SLUG/profesionales" --data-urlencode "tipo=$TIPO_NOMBRE")
PROF_ID=$(echo "$PROFS" | sed -n 's/.*"userId":"\([^"]*\)".*/\1/p' | head -1)
PROF_TIPO=$(echo "$PROFS" | sed -n 's/.*"tipoConsultaId":"\([^"]*\)".*/\1/p' | head -1)
PROXIMO=$(echo "$PROFS" | sed -n 's/.*"proximoDisponible":"\([^"]*\)".*/\1/p' | head -1)
TIPO_GENERAL=$(sql "SELECT id FROM tipos_consulta WHERE clinic_id = '${CLINIC_ID:-00000000-0000-0000-0000-000000000000}' AND user_id = '$USER_ID' AND nombre = '$TIPO_NOMBRE'")
if [[ -n "$PROF_ID" && "$PROF_ID" == "$USER_ID" && "$PROF_TIPO" == "$TIPO_GENERAL" && -n "$PROXIMO" ]]; then
  ok "quién atiende \"$TIPO_NOMBRE\": el titular, con SU tipoConsultaId y primer día libre $PROXIMO"
else
  mal "profesionales del tipo con otra forma: $PROFS"
fi

DISP=$(curl -s -G "$API/clinicas/$SLUG/disponibilidad" -w '\n%{http_code}' \
  --data-urlencode "tipo=$TIPO_NOMBRE" --data-urlencode "profesionalId=$PROF_ID" --data-urlencode "fecha=$PROXIMO")
DISP_COD=$(echo "$DISP" | tail -1); DISP_CUERPO=$(echo "$DISP" | head -1)
if [[ "$DISP_COD" == "200" && "$DISP_CUERPO" =~ ^\{\"slots\":\[\"[0-9]{2}:[0-9]{2}\" ]]; then
  ok "horarios del $PROXIMO: 200 con $(echo "$DISP_CUERPO" | grep -o '"[0-9][0-9]:[0-9][0-9]"' | wc -l | tr -d ' ') horarios libres"
else
  mal "disponibilidad de un día devolvió $DISP_COD: $DISP_CUERPO"
fi

MES=${PROXIMO:0:7}
DMES=$(curl -s -G "$API/clinicas/$SLUG/disponibilidad-mes" -w '\n%{http_code}' \
  --data-urlencode "tipo=$TIPO_NOMBRE" --data-urlencode "profesionalId=$PROF_ID" --data-urlencode "mes=$MES")
DMES_COD=$(echo "$DMES" | tail -1); DMES_CUERPO=$(echo "$DMES" | head -1)
if [[ "$DMES_COD" == "200" && "$DMES_CUERPO" == '{"dias":['* && "$DMES_CUERPO" == *"\"$PROXIMO\""* ]]; then
  ok "días con lugar de $MES: 200, e incluye el $PROXIMO"
else
  mal "disponibilidad del mes devolvió $DMES_COD: $DMES_CUERPO"
fi

NADIE=$(curl -s -o /dev/null -w '%{http_code}' -G "$API/clinicas/$SLUG/disponibilidad" \
  --data-urlencode "tipo=Tipo que nadie atiende" --data-urlencode "fecha=$PROXIMO")
[[ "$NADIE" == "404" ]] && ok "un tipo que nadie atiende da 404" || mal "un tipo que nadie atiende devolvió $NADIE"

# --- 7. Frontend ---
paso "7. Frontend"
HOME_WEB=$(curl -s -o /dev/null -w '%{http_code}' "$WEB/")
[[ "$HOME_WEB" == "200" ]] && ok "home del sitio responde 200" || mal "home devolvió $HOME_WEB"
WEBPUB=$(curl -s -o /dev/null -w '%{http_code}' "$WEB/$SLUG")
[[ "$WEBPUB" =~ ^(200|307|308)$ ]] && ok "página pública de la clínica en el front ($WEBPUB)" || mal "página pública del front devolvió $WEBPUB"

limpiar
terminar
