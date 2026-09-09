package http

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

// Logging estructurado — Fase B de la auditoría (2026-09-08, docs/Seguridad
// y optimizacion/radiografia-tecnica_1.md).
//
// Antes de esto el backend usaba `middleware.Logger` de chi: una línea de
// texto plano por request, sin request-id correlacionable, sin la clínica
// involucrada, sin latencia estructurada. Con N clínicas en la misma
// instancia, diagnosticar "a esta clínica le pasa X" significaba leer logs
// a ojo sin poder filtrar por nada.
//
// Se usa `log/slog` de la stdlib, no una librería de logging externa —
// misma lógica que el resto de las dependencias de este proyecto (ver
// internal/turnstile/googleauth: una request HTTP simple no justifica una
// dependencia nueva). slog ya da salida JSON estructurada, niveles y
// atributos tipados, que es todo lo que hace falta acá.
//
// ---------------------------------------------------------------------
// REGLA NO NEGOCIABLE DE ESTE ARCHIVO: los logs NUNCA llevan datos
// personales.
// ---------------------------------------------------------------------
//
// Esta es una app de salud: mails, DNIs, nombres y teléfonos de pacientes
// son datos sensibles (Ley 25.326). Un log es un lugar donde esos datos
// terminan replicados, retenidos por tiempo indefinido y accesibles a
// gente que no necesita verlos — convertir el logging en una fuga de PII
// sería crear un problema de seguridad nuevo mientras se resuelve otro.
// Por eso, explícitamente:
//
//   - NUNCA se loguea la query string. Es la trampa más fácil de este
//     código: `GET /clinicas/{slug}/mis-turnos?dni=30111222&email=...`
//     lleva DNI y mail EN LA URL. Loguear `r.URL.String()` o
//     `r.RequestURI` volcaría eso a los logs en cada consulta.
//   - NUNCA se loguea el body de la request ni de la respuesta.
//   - Se loguea el PATRÓN de ruta de chi (`/clinicas/{slug}/turnos`), no
//     el path concreto — además de evitar PII en los segmentos, mantiene
//     baja la cardinalidad para agrupar por endpoint.
//   - Los identificadores que sí se loguean son UUIDs internos
//     (clinic_id, user_id): sirven para correlacionar sin decir nada de
//     la persona por sí mismos.
//
// La IP sí se loguea: hace falta para investigar abuso (es la misma señal
// que alimenta los detectores de turno_publico.go) y ya se persiste en
// `Turno.IPContacto` con ese propósito.

type contextKeyLog struct{}

// camposLog — holder MUTABLE que el middleware de logging deja en el
// contexto antes de que corra ningún handler, para que los middlewares de
// más adentro (requireSession/requireClinic) puedan completarlo.
//
// Por qué mutable y no valores de contexto normales: `context.WithValue`
// devuelve un contexto NUEVO, así que un valor agregado por un middleware
// interno es invisible para el externo — y el log se escribe al terminar,
// en el externo. Un puntero compartido es el patrón estándar para este
// caso puntual. Solo lo escribe el goroutine de la propia request, así
// que no necesita sincronización.
type camposLog struct {
	UserID   string
	ClinicID string
}

// camposLogDe devuelve el holder de esta request, o nil si el middleware
// de logging no está montado (tests que arman un handler suelto). Los
// callers siempre chequean nil — nunca deben depender de que exista.
func camposLogDe(ctx context.Context) *camposLog {
	campos, _ := ctx.Value(contextKeyLog{}).(*camposLog)
	return campos
}

// loggerMiddleware reemplaza a `middleware.Logger` de chi. Emite UNA línea
// estructurada por request, ya terminada (con status y latencia reales).
//
// Nivel según el resultado: 5xx es Error (algo se rompió del lado del
// servidor), 4xx es Warn (el cliente pidió algo inválido — útil para ver
// picos de 401/429 sin que sea una falla nuestra), el resto Info.
func loggerMiddleware(logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			campos := &camposLog{}
			ctx := context.WithValue(r.Context(), contextKeyLog{}, campos)
			r = r.WithContext(ctx)

			// WrapResponseWriter de chi captura status y bytes escritos sin
			// que cada handler tenga que colaborar.
			ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
			inicio := time.Now()

			defer func() {
				// El patrón de ruta solo se conoce DESPUÉS de rutear — de ahí
				// que esto viva en el defer y no arriba. Sin match (404 de
				// ruta inexistente) queda vacío, y ahí el path concreto
				// tampoco aporta nada útil.
				patron := ""
				if rctx := chi.RouteContext(r.Context()); rctx != nil {
					patron = rctx.RoutePattern()
				}

				atributos := []slog.Attr{
					slog.String("request_id", middleware.GetReqID(r.Context())),
					slog.String("metodo", r.Method),
					// Patrón de ruta, NUNCA r.URL.String() — ver la regla
					// grande al principio del archivo (la query string lleva
					// DNI/mail en algunos endpoints públicos).
					slog.String("ruta", patron),
					slog.Int("status", ww.Status()),
					slog.Int64("duracion_ms", time.Since(inicio).Milliseconds()),
					slog.Int("bytes", ww.BytesWritten()),
					slog.String("ip", clientIP(r)),
				}
				// Solo presentes en requests autenticados — se omiten del
				// todo (en vez de ir en vacío) para no ensuciar los logs de
				// los endpoints públicos.
				if campos.ClinicID != "" {
					atributos = append(atributos, slog.String("clinic_id", campos.ClinicID))
				}
				if campos.UserID != "" {
					atributos = append(atributos, slog.String("user_id", campos.UserID))
				}

				nivel := slog.LevelInfo
				switch {
				case ww.Status() >= 500:
					nivel = slog.LevelError
				case ww.Status() >= 400:
					nivel = slog.LevelWarn
				}
				logger.LogAttrs(r.Context(), nivel, "http", atributos...)
			}()

			next.ServeHTTP(ww, r)
		})
	}
}
