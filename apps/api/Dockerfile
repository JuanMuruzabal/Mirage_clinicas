# apps/api — build en dos etapas para que la imagen final no cargue el
# toolchain de Go, solo los binarios ya compilados.
#
# Build context: este Dockerfile asume que se construye con contexto
# `apps/api` (ver docker-compose.yml, build.context: ./apps/api, y
# render.yaml, dockerContext: apps/api) — es un módulo Go independiente,
# no necesita nada del resto del monorepo. Mismo patrón que Marcuzzi_Madryn.

# Go 1.26 (subido desde 1.25 el 2026-09-08, auditoría de seguridad — ver
# docs/Seguridad y optimizacion/): golang.org/x/crypto v0.56.0+, que
# corrige 3 CVEs conocidas de la librería que implementa argon2/bcrypt
# (el hashing de contraseñas), exige go >= 1.26. Esta línea, la directiva
# `go` de go.mod y el `go-version-file` del CI se mueven JUNTAS — con el
# Dockerfile pinneado en 1.25 y go.mod pidiendo 1.26, el build de
# producción falla (verificado en la práctica antes de este cambio).
FROM golang:1.26-alpine AS build
WORKDIR /src

# Cachea `go mod download` en su propia capa: solo se re-ejecuta si
# go.mod/go.sum cambian, no en cada cambio de código.
COPY go.mod go.sum ./
RUN go mod download

COPY . .

# CGO_ENABLED=0 para un binario estático que corre en la imagen final
# alpine sin depender de libc del builder.
RUN CGO_ENABLED=0 go build -o /out/api ./cmd/api
RUN CGO_ENABLED=0 go build -o /out/migrate ./cmd/migrate

FROM alpine:3.20 AS runtime
# ca-certificates: necesario si en el futuro el backend hace requests
# salientes por HTTPS (p. ej. un storage/email real, ver
# docs/Arquitectura y base/tradeoffs.md sobre las interfaces dev/prod pendientes).
RUN apk add --no-cache ca-certificates
WORKDIR /app

COPY --from=build /out/api /app/api
COPY --from=build /out/migrate /app/migrate

EXPOSE 8080
# Corre la migración (idempotente) ANTES de arrancar el servidor, en el
# propio arranque del contenedor — no vía un servicio/comando aparte
# (docker-compose.yml sí usa un servicio `migrate` separado, pero ese
# patrón depende de "esperar a que otro servicio termine bien" antes de
# arrancar este, algo que Render free no soporta vía preDeployCommand,
# feature exclusiva de planes pagos). Si la migración falla, `&&` corta
# acá: el contenedor nunca llega a servir tráfico contra un esquema roto.
CMD ["/bin/sh", "-c", "/app/migrate && /app/api"]
