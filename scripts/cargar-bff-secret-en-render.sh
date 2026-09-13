#!/usr/bin/env bash
#
# Carga BFF_SHARED_SECRET en los dos servicios de Render con el MISMO valor,
# generándolo acá y sin que nadie lo vea ni lo tipee. Ver TR-134: si los
# valores no coinciden carácter por carácter, la API descarta la cabecera de
# IP en silencio y el arreglo queda inactivo — que es exactamente lo que
# pasaba antes de correr esto.
#
# USO:
#   export RENDER_API_KEY=rnd_xxxxx     # Account Settings → API Keys
#   bash scripts/cargar-bff-secret-en-render.sh
#
# La API key se lee del entorno a propósito: así no queda en el historial
# del shell ni en la línea de comandos.
#
# Es idempotente: correrlo de nuevo genera un secreto NUEVO y lo pone en los
# dos servicios a la vez, así que también sirve para rotarlo.

set -euo pipefail

API="https://api.render.com/v1"
SERVICIO_API="${SERVICIO_API:-dental-mirage-api}"
SERVICIO_WEB="${SERVICIO_WEB:-dental-mirage-web}"

if [ -z "${RENDER_API_KEY:-}" ]; then
  echo "ERROR: falta RENDER_API_KEY." >&2
  echo "  Sacala de Render → Account Settings → API Keys, y después:" >&2
  echo "    export RENDER_API_KEY=rnd_xxxxx" >&2
  exit 1
fi

for cmd in curl python; do
  command -v "$cmd" >/dev/null || { echo "ERROR: falta '$cmd' en el PATH." >&2; exit 1; }
done

llamar() { # método, ruta, [body]
  curl -sS -X "$1" "${API}$2" \
    -H "Authorization: Bearer ${RENDER_API_KEY}" \
    -H "Content-Type: application/json" \
    ${3:+-d "$3"}
}

# Busca el id del servicio por nombre exacto. El endpoint filtra por
# prefijo, así que se compara el nombre entero: "dental-mirage-api" no
# puede resolver por accidente a otro servicio que empiece igual.
id_de_servicio() {
  local nombre="$1" respuesta
  respuesta="$(llamar GET "/services?name=${nombre}&limit=20")"
  python -c '
import json,sys
nombre = sys.argv[1]
try:
    datos = json.loads(sys.stdin.read())
except Exception:
    sys.exit("respuesta ilegible de Render")
if isinstance(datos, dict) and datos.get("message"):
    sys.exit("Render respondió: " + str(datos["message"]))
for fila in datos:
    servicio = fila.get("service", fila)
    if servicio.get("name") == nombre:
        print(servicio["id"]); break
else:
    sys.exit("no encontré un servicio llamado " + nombre)
' "$nombre" <<< "$respuesta"
}

echo "Buscando los servicios…"
ID_API="$(id_de_servicio "$SERVICIO_API")"
ID_WEB="$(id_de_servicio "$SERVICIO_WEB")"
echo "  ${SERVICIO_API}: ${ID_API}"
echo "  ${SERVICIO_WEB}: ${ID_WEB}"

# 32 bytes de /dev/urandom en hex. Nunca se imprime: solo viaja a Render.
SECRETO="$(python -c 'import secrets; print(secrets.token_hex(32))')"

cargar() { # id, nombre
  local respuesta
  respuesta="$(llamar PUT "/services/$1/env-vars/BFF_SHARED_SECRET" \
    "$(python -c 'import json,os; print(json.dumps({"value": os.environ["SECRETO"]}))')")"
  SECRETO="$SECRETO" python -c '
import json,sys
try:
    datos = json.loads(sys.stdin.read())
except Exception:
    sys.exit("respuesta ilegible al cargar la variable")
if isinstance(datos, dict) and datos.get("message"):
    sys.exit("Render respondió: " + str(datos["message"]))
' <<< "$respuesta"
  echo "  ✓ $2"
}

echo "Cargando BFF_SHARED_SECRET (mismo valor en los dos)…"
export SECRETO
cargar "$ID_API" "$SERVICIO_API"
cargar "$ID_WEB" "$SERVICIO_WEB"
unset SECRETO

echo "Disparando redeploy de los dos servicios…"
llamar POST "/services/${ID_API}/deploys" '{"clearCache":"do_not_clear"}' >/dev/null
llamar POST "/services/${ID_WEB}/deploys" '{"clearCache":"do_not_clear"}' >/dev/null

cat <<'FIN'

Listo. Cuando terminen los dos deploys:

  1. En el log de arranque de la API, el WARN de "BFF_SHARED_SECRET sin
     configurar" tiene que DESAPARECER.
  2. Entrá al wizard público de una clínica y buscá la línea de
     /clinicas/{slug}/disponibilidad. Tiene que decir:

         ip=<la IP real del visitante>  ip_fuente=bff

     El "bff" es lo que importa: significa que la IP la propagó el BFF.
     Si dice ip_fuente=cf con una IP que no es la de nadie, los valores
     no quedaron iguales — volvé a correr este script.

FIN
