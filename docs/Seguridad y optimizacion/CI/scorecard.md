# El puntaje de OpenSSF Scorecard

**PRISMA · Seguridad y optimización / CI** · 2026-10-25 · TR-200 en `docs/Arquitectura y base/tradeoffs.md` (el workflow y su porqué están en TR-199 y en `ci-de-seguridad.md`, sección 2.7)

Este documento explica **qué es el puntaje, qué se hizo para subirlo, qué se decidió no hacer y cómo volver a medirlo**. Está aparte de `ci-de-seguridad.md` porque el puntaje no es un chequeo que frena nada: es una vara para mirar la postura del repo, y conviene tener a mano la receta para medirlo sin esperar a GitHub.

## 1. Qué es y dónde se ve

[OpenSSF Scorecard](https://github.com/ossf/scorecard) corre una veintena de chequeos sobre el repo (ramas, workflows, dependencias, política de seguridad, licencia...), le pone de 0 a 10 a cada uno y promedia con pesos según el riesgo. El workflow `seguridad-scorecard.yml` lo corre en cada push a `dev` y una vez por semana, publica el resultado y sube el SARIF a *Security and quality*.

- **El desglose, en el visor:** `https://scorecard.dev/viewer/?uri=github.com/JuanMuruzabal/Mirage_clinicas`
- **El JSON crudo:** `https://api.securityscorecards.dev/projects/github.com/JuanMuruzabal/Mirage_clinicas`

**No frena nada:** no es un check obligatorio (ver `ci-de-seguridad.md`, sección 4) y un puntaje bajo no rompe un PR. Sirve para decidir qué vale la pena.

## 2. El puntaje publicado antes de esta ronda: 6,0

Fue 5,7 en el merge del #95 y 6,0 después de cargar los rulesets y relanzar el workflow.

| Chequeo | Puntaje | Qué mira | Nota |
|---|---|---|---|
| Dangerous-Workflow, Token-Permissions, Binary-Artifacts, Security-Policy, Dependency-Update-Tool, CI-Tests | 10 | Patrones peligrosos en los workflows, permisos del token, binarios commiteados, `SECURITY.md`, un archivo de Dependabot, que los PRs corran tests | Dependency-Update-Tool se mantiene por tener `dependabot.yml`, aunque no abra PRs |
| Vulnerabilities | 9 | Avisos de OSV sobre las dependencias | GO-2026-5932 (`x/crypto/openpgp`): sin arreglo y sin usar |
| SAST | 7 | Qué proporción de los últimos commits pasó por un análisis estático (CodeQL) | 21 de 30 commits |
| Pinned-Dependencies | 4 | Que las dependencias de workflows y Dockerfiles estén fijadas por hash | Los `FROM` iban por etiqueta |
| Branch-Protection | 3 | Reglas en las ramas (aprobaciones, checks, force push) | Con 0 aprobaciones por PR |
| Contributors | 3 | Cuántas organizaciones distintas contribuyen | |
| Maintained | 0 | Actividad del repo en los últimos 90 días | El repo es del 24/08: tiene menos de 90 días |
| Code-Review | 0 | Que los cambios los apruebe alguien más | 0 de 6 PRs aprobados |
| Fuzzing | 0 | Que haya fuzzing | No había |
| License | 0 | Que haya un archivo de licencia | No hay |
| CII-Best-Practices | 0 | El badge de OpenSSF Best Practices | No está tramitado |
| Packaging, Signed-Releases | -1 | No aplican | No cuentan |

## 3. Cómo aparecen los hallazgos en Security and quality

Scorecard sube **una alerta de code scanning por cada chequeo que no llega a 10** y, en *Pinned-Dependencies*, una por cada línea de Dockerfile sin fijar. Por eso, después de una corrida aparecen alertas que no son "bugs" sino una lista de lo que le falta al puntaje.

**Se cierran solas:** la próxima corrida de Scorecard sobre `dev` ya no encuentra el problema y GitHub marca la alerta como arreglada. Un arreglo no se confirma mirando el PR (el workflow no corre en PRs): se confirma en la primera corrida en `dev` después del merge.

## 4. Lo que hizo la ronda de TR-200

| Palanca | Qué se hizo | Efecto medido en local |
|---|---|---|
| Pinned-Dependencies | Los cuatro `FROM` de los dos Dockerfiles pasan a `tag@sha256` (el digest del **índice** multi-arquitectura, confirmado con `docker buildx imagetools inspect`); la API suma `apk upgrade --no-cache` en su runtime, como la web. Las etapas `FROM base` no se tocan | 4 a 10 |
| Fuzzing | Cinco tests de fuzzing nativos de Go con invariantes sobre los parsers de datos de afuera: `FuzzParseArgon2Params` (`security`), `FuzzIPPublica` y `FuzzClientIPConFuente` (`http`), `FuzzEnvolver` y `FuzzParteDeFecha` (`documentos`) | 0 a 10 |
| Vulnerabilities | `apps/api/osv-scanner.toml` ignora GO-2026-5932 con su motivo y `ignoreUntil = 2027-04-25` | 9 a 10 |

Verificado: 60 s de fuzzing por cada uno, sin fallas (838.795, 134.908, 698.995, 205.863 y 195.780 ejecuciones); `go test ./internal/... -race` en verde en los 18 paquetes con 83,6 % de cobertura; las dos imágenes compilan y arrancan (`/health` y la web dan 200).

**Qué se sacrifica:** con Dependabot sin PRs, los digests no se renuevan solos (ver la sección 8).

## 5. Lo que sube solo, con el tiempo

Las cifras son una **estimación** con los pesos de Scorecard, no un valor publicado:

- **Después del merge:** con Pinned, Fuzzing y Vulnerabilities en 10, **~6,9**.
- **El 22/11:** *Maintained* pasa de 0 a 10 (el repo cumple 90 días). **~7,7**.
- **A medida que entran commits:** *SAST* sube de 7 a 10. **~7,9**.

## 6. Lo que se decidió no hacer

**No se exigen aprobaciones en los PRs.** Daría ~+1,2 (Branch-Protection y Code-Review) pero cambia la forma de trabajo del equipo, y la persona lo descartó: Branch-Protection queda en 3 y Code-Review en 0. Las alertas #32 (Branch-Protection) y #43 (Code-Review) se cerraron por API como *won't fix*, con la decisión del equipo como motivo.

También se descartó un job de CI que fuzzee durante minutos en cada PR: cuesta tiempo de CI. En `go test` los fuzzers corren solo su corpus semilla.

## 7. Lo que queda pendiente de la persona

Quedan **abiertas a propósito**, para retomarlas más adelante:

- **#41, License:** elegir una licencia es una decisión de negocio (el repo es público y no tiene).
- **#45, CII-Best-Practices:** el badge se completa con su cuenta en bestpractices.dev.

Las dos juntas valen ~0,4.

## 8. Mantenimiento

- **Renovar los digests de los `FROM`** en cada ronda de dependencias (Dependabot ya no lo hace). Se obtiene el digest del índice con `docker buildx imagetools inspect <imagen>:<etiqueta>`. Entre una ronda y otra lo mitigan `apk upgrade` en cada build y Trivy cada lunes, que falla si queda un alto o crítico con arreglo.
- **Revisar la excepción de OSV el 2027-04-25** (`apps/api/osv-scanner.toml`): si `x/crypto/openpgp` ya tiene arreglo o algo empezó a importarlo, se saca la excepción. Al vencer, `ignoreUntil` deja de ignorar y Vulnerabilities baja solo.
- **Fuzzing largo, a mano**, cuando se toque un parser: `go test -run='^$' -fuzz='^FuzzX$' -fuzztime=60s ./internal/<paquete>/`. Un fallo deja su entrada en `testdata/fuzz/` del paquete: se commitea con el arreglo.
- **`SCORECARD_TOKEN`: no hace falta.** Branch-Protection leyó los rulesets con el `GITHUB_TOKEN` (ver `ci-de-seguridad.md`, sección 5.1).

## 9. Cómo medirlo en local, paso a paso

Sirve para comprobar un arreglo sin esperar al workflow. El CLI v5.6.0 se usó en un contenedor `alpine` porque en Windows no hay binario cómodo.

1. **Bajar el release v5.6.0** de `github.com/ossf/scorecard` (el `.tar.gz` de Linux amd64 y su archivo de checksums), en una carpeta nueva y vacía fuera del repo.
2. **Verificar el checksum** del archivo bajado contra el publicado (`sha256sum -c`, con el renglón correspondiente). Si no coincide, no se usa.
3. **Correr el binario de Linux dentro de un contenedor `alpine:3.20`** con el repo montado de solo lectura y con red (algunos chequeos consultan OSV), **sin token**.
4. **Pasarle `--local <ruta del repo>`**, que mide solo lo que se puede ver en los archivos.

El comando literal, con el binario de Linux v5.6.0 ya extraído y con su checksum verificado (`<bin>` es la carpeta que lo contiene y `<copia>` es una copia del repo sin `.git` ni `node_modules`, para que no mida de más):

```
docker run --rm -v <bin>:/sc:ro -v <copia>:/repo:ro alpine:3.20 /sc/scorecard --local=/repo --format=json --show-details
```

`--format=json --show-details` deja el detalle de cada chequeo (qué archivo y qué línea) en lugar de solo el puntaje, que es lo que sirve para ver qué alerta de *Security and quality* se cerró.

**Por qué el total local no se compara con el público:** `--local` no corre los chequeos que leen la API de GitHub (Branch-Protection, Code-Review, Maintained, CI-Tests, Contributors, Signed-Releases, CII), y SAST da 0 solo en local porque no ve los análisis de CodeQL. El total local de esta ronda fue 8,8, y no es comparable con el 6,0 publicado. Lo que sí vale es mirar **chequeo por chequeo** los que se pueden medir: Pinned-Dependencies, Vulnerabilities y Fuzzing dieron 10.
