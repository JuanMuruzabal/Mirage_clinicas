#!/usr/bin/env bash
#
# QA del entorno de desarrollo — auditoría de seguridad y optimización.
#
#   docker compose up -d --build
#   bash scripts/qa-entorno-dev.sh
#
# Recorre el flujo REAL de punta a punta contra la API levantada (no mocks,
# no la suite de tests): alta de profesional por los endpoints de
# onboarding, creación de un turno, los listados del panel, el wizard
# público y el frontend. Al final borra todo lo que creó.
#
# Existe porque la suite de tests y este script prueban cosas distintas: la
# suite corre contra una base de test con transacciones que se revierten;
# esto corre contra los contenedores reales, con las migraciones ya
# aplicadas y los datos que hay. Un problema de migración, de configuración
# o de una constraint que se creó mal solo se ve acá.
#
# Verifica en particular lo que cambió la auditoría (ver
# docs/Seguridad y optimizacion/radiografia-tecnica_1.md):
#   - Fase B: paginación opt-in y el header X-Total-Count, y que SIN `limit`
#     el endpoint siga respondiendo como antes (el calendario depende de eso).
#   - Fase C: que las foreign keys acepten el camino legítimo y rechacen lo
#     que no existe, y que el wizard público —el camino que una FK mal
#     puesta habría roto— siga funcionando.
#
# Pensado para correrse antes de cada snapshot de la auditoría.
set -uo pipefail

API=http://localhost:8080
PSQL="docker compose exec -T postgres psql -U dental_mirage -d dental_mirage"
EMAIL="qa-fasec-$(date +%s)@example.com"
PASS='UnaClaveLarga123!'
OK=0; FALLA=0

paso() { printf "\n\033[1m%s\033[0m\n" "$1"; }
ok()   { printf "  ✅ %s\n" "$1"; OK=$((OK+1)); }
mal()  { printf "  ❌ %s\n" "$1"; FALLA=$((FALLA+1)); }

# --- 1. Salud ---
paso "1. Salud del stack"
H=$(curl -s "$API/health")
[[ "$H" == *'"db":"ok"'* ]] && ok "API y base responden: $H" || mal "health inesperado: $H"

# --- 2. Registro + onboarding (flujo real) ---
paso "2. Alta de profesional por el flujo real"
REG=$(curl -s -X POST "$API/auth/register" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"aceptaTerminos\":true}")
TOKEN=$(echo "$REG" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
[[ -n "$TOKEN" ]] && ok "registro devolvió token" || { mal "registro falló: $REG"; exit 1; }

$PSQL -tAc "UPDATE users SET email_verified_at = now(), onboarding_step = 'perfil' WHERE email = '$EMAIL'" >/dev/null
ESP=$($PSQL -tAc "SELECT id FROM especialidades WHERE nombre = 'Odontología general' LIMIT 1" | tr -d '\r')

PERFIL=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$API/onboarding/perfil" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"nombre\":\"QA\",\"apellido\":\"FaseC\",\"telefonoPrefijo\":\"+54\",\"telefono\":\"+5493511234567\",\"matriculaTipo\":\"nacional\",\"matriculaNumero\":\"MP-99999\",\"especialidadIds\":[\"$ESP\"]}")
[[ "$PERFIL" == "200" ]] && ok "perfil profesional completado" || mal "perfil devolvió $PERFIL"

CLIN=$(curl -s -X PATCH "$API/onboarding/clinica" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"tipo":"individual","nombre":"Clinica QA Fase C"}')
SLUG=$(echo "$CLIN" | sed -n 's/.*"slug":"\([^"]*\)".*/\1/p')
[[ -n "$SLUG" ]] && ok "clínica creada (slug: $SLUG)" || mal "clínica falló: $CLIN"

CLINIC_ID=$($PSQL -tAc "SELECT c.id FROM clinics c JOIN users u ON u.id = c.owner_id WHERE u.email = '$EMAIL'" | tr -d '\r')
[[ -n "$CLINIC_ID" ]] && ok "clinic_id: $CLINIC_ID" || mal "no se encontró la clínica en la base"

# --- 3. La FK acepta el camino legítimo ---
paso "3. Foreign keys: el camino legítimo sigue funcionando"
TIPOS=$(curl -s "$API/tipos-consulta" -H "Authorization: Bearer $TOKEN")
TIPO_ID=$(echo "$TIPOS" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p' | head -1)
[[ -n "$TIPO_ID" ]] && ok "tipos de consulta sembrados por el alta (los escribe con profesional_id = clinic.id)" \
                    || mal "no se sembraron tipos: $TIPOS"

# El paciente y el turno se crean por el endpoint real del panel.
MANANA=$(date -d '+1 day' +%Y-%m-%d 2>/dev/null || date -v+1d +%Y-%m-%d)
INICIO="${MANANA}T14:00:00Z"   # 11:00 en Córdoba (UTC-3), dentro del horario de atención por default
FIN="${MANANA}T14:30:00Z"
TURNO=$(curl -s -X POST "$API/turnos" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"nombreContacto\":\"Ana\",\"apellidoContacto\":\"QA\",\"dniContacto\":\"30111999\",\"telefonoContacto\":\"3510000001\",\"emailContacto\":\"ana.qa@example.com\",\"tipoConsultaId\":\"$TIPO_ID\",\"horaInicio\":\"$INICIO\",\"horaFin\":\"$FIN\",\"motivo\":\"QA Fase C\"}")
if [[ "$TURNO" == *'"id"'* ]]; then
  ok "turno creado por el endpoint real (paciente + turno con FKs activas)"
else
  mal "no se pudo crear el turno: $TURNO"
fi

# --- 4. La FK rechaza lo que no existe ---
paso "4. Foreign keys: rechazan lo que no existe"
FALSO=$($PSQL -tAc "INSERT INTO pacientes (id, profesional_id, nombre, apellido, dni, created_at, updated_at)
        VALUES (gen_random_uuid(), gen_random_uuid(), 'Falso', 'Huerfano', '99999999', now(), now())" 2>&1 | tr -d '\r')
if [[ "$FALSO" == *"fk_pacientes_clinica"* ]]; then
  ok "un paciente de una clínica inexistente es rechazado por fk_pacientes_clinica"
else
  mal "la FK NO rechazó el insert huérfano: $FALSO"
fi

# --- 5. Paginación (Fase B, verificada en el entorno real) ---
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

# --- 6. Wizard público (lo que el usuario pidió cuidar) ---
paso "6. Wizard público — el camino que la FK podría haber roto"
PUB=$(curl -s -o /dev/null -w '%{http_code}' "$API/clinicas/$SLUG")
[[ "$PUB" == "200" ]] && ok "página pública de la clínica responde 200" || mal "página pública devolvió $PUB"

PTIPOS=$(curl -s "$API/clinicas/$SLUG/tipos-consulta")
[[ "$PTIPOS" == *'"id"'* ]] && ok "tipos de consulta públicos (paso 3 del wizard)" || mal "tipos públicos: $PTIPOS"

DISP=$(curl -s -o /dev/null -w '%{http_code}' "$API/clinicas/$SLUG/disponibilidad?tipoConsultaId=$TIPO_ID&fecha=$MANANA")
[[ "$DISP" == "200" ]] && ok "disponibilidad real (paso 5 del wizard) responde 200" || mal "disponibilidad devolvió $DISP"

# --- 7. Frontend ---
paso "7. Frontend"
WEB=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/)
[[ "$WEB" == "200" ]] && ok "home del sitio responde 200" || mal "home devolvió $WEB"
WEBPUB=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:3000/$SLUG")
[[ "$WEBPUB" =~ ^(200|307|308)$ ]] && ok "página pública de la clínica en el front ($WEBPUB)" || mal "página pública del front devolvió $WEBPUB"

# --- Limpieza ---
paso "Limpieza del QA"
# El orden importa, y es la cadena RESTRICT haciendo su trabajo: no se
# puede borrar la clínica mientras algo la referencie, ni el usuario
# mientras sea dueño de una clínica. Ninguna ruta del producto borra
# clínicas — este orden existe solo para el QA.
LIMPIEZA=$($PSQL -tAc "
  DELETE FROM turnos WHERE profesional_id = '$CLINIC_ID';
  DELETE FROM paciente_tutor_telefonos_alternativos WHERE paciente_tutor_id IN
    (SELECT id FROM paciente_tutores WHERE paciente_id IN (SELECT id FROM pacientes WHERE profesional_id = '$CLINIC_ID'));
  DELETE FROM paciente_tutores WHERE paciente_id IN (SELECT id FROM pacientes WHERE profesional_id = '$CLINIC_ID');
  DELETE FROM paciente_emails_alternativos WHERE paciente_id IN (SELECT id FROM pacientes WHERE profesional_id = '$CLINIC_ID');
  DELETE FROM paciente_telefonos_alternativos WHERE paciente_id IN (SELECT id FROM pacientes WHERE profesional_id = '$CLINIC_ID');
  DELETE FROM conflictos_paciente WHERE profesional_id = '$CLINIC_ID';
  DELETE FROM pacientes WHERE profesional_id = '$CLINIC_ID';
  DELETE FROM tipos_consulta WHERE profesional_id = '$CLINIC_ID';
  DELETE FROM paginas_publicas WHERE profesional_id = '$CLINIC_ID';
  DELETE FROM enlaces_turno WHERE profesional_id = '$CLINIC_ID';
  DELETE FROM emails_bloqueados_turno_publico WHERE profesional_id = '$CLINIC_ID';
  DELETE FROM ips_bloqueadas_turno_publico WHERE profesional_id = '$CLINIC_ID';
  DELETE FROM auditoria_bloqueos_turno_publico WHERE profesional_id = '$CLINIC_ID';
  DELETE FROM verificaciones_turno_publico WHERE clinic_id = '$CLINIC_ID';
  DELETE FROM horarios_atencion WHERE clinic_id = '$CLINIC_ID';
  DELETE FROM bloqueos_horario WHERE clinic_id = '$CLINIC_ID';
  DELETE FROM clinic_members WHERE clinic_id = '$CLINIC_ID';
  DELETE FROM clinics WHERE id = '$CLINIC_ID';
  DELETE FROM users WHERE email = '$EMAIL';" 2>&1)
[[ "$LIMPIEZA" == *ERROR* ]] && printf "  (detalle: %s)
" "$LIMPIEZA" 
RESTO=$($PSQL -tAc "SELECT count(*) FROM users WHERE email = '$EMAIL'" | tr -d '\r')
[[ "$RESTO" == "0" ]] && ok "datos del QA borrados (el CASCADE de users se llevó sesión y perfil)" || mal "quedaron datos del QA"

printf "\n\033[1m=== RESULTADO: %d ok, %d fallas ===\033[0m\n" "$OK" "$FALLA"
exit $([[ "$FALLA" -eq 0 ]] && echo 0 || echo 1)
