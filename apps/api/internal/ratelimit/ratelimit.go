// Package ratelimit aplica límites por-IP y por-cuenta en los endpoints de
// auth (login, registro, reenvío de verificación, reset de contraseña,
// confirmación de token) — spec §7 de docs/feature-sumarte-login.md.
//
// Por-cuenta: fila-contador en Postgres (db.AuthRateCounter), persiste
// entre restarts. Por-IP: en memoria (sync.Map) — tradeoff de MVP de
// instancia única, documentado en docs/tradeoffs.md: escalar horizontal
// rompería este límite (cada instancia tendría su propio contador). Ambos
// usan el mismo algoritmo de ventana fija con backoff progresivo.
package ratelimit

import (
	"sync"
	"time"

	"gorm.io/gorm"

	"dental-mirage/api/internal/db"
)

// Limit describe una política: máximo N intentos por ventana de duración
// Window. Tras superar el límite, Blocked reporta true hasta que la
// ventana expira — es un bloqueo temporal, nunca permanente (spec §7:
// "bloqueo temporal, no permanente, para evitar DoS contra usuarios
// legítimos").
type Limit struct {
	Max    int
	Window time.Duration
}

// Políticas por endpoint (spec §7 y §6). Login usa backoff progresivo
// propio (ver LoginBackoff) además del límite por-cuenta/IP.
var (
	LimitRegisterPerIP    = Limit{Max: 10, Window: time.Hour}
	LimitLoginPerIP       = Limit{Max: 20, Window: time.Hour}
	LimitLoginPerAccount  = Limit{Max: 10, Window: time.Hour}
	LimitResendPerAccount = Limit{Max: 5, Window: time.Hour}
	// LimitResendCooldown es un segundo límite, más fino, sobre el mismo
	// scope "resend_verify" pero con su propia key de cooldown — 1 cada 60s
	// (spec §6/§7), chequeado además de LimitResendPerAccount, no en
	// reemplazo.
	LimitResendCooldown          = Limit{Max: 1, Window: 60 * time.Second}
	LimitResendPerIP             = Limit{Max: 20, Window: time.Hour}
	LimitPasswordResetPerIP      = Limit{Max: 10, Window: time.Hour}
	LimitPasswordResetPerAccount = Limit{Max: 5, Window: time.Hour}
	LimitTokenConfirmPerIP       = Limit{Max: 30, Window: time.Hour}
	// LimitConfirmCodePerAccount — TR-055 en docs/tradeoffs.md: un código
	// de 6 dígitos tiene 10^6 combinaciones, muchísima menos entropía que
	// el token de 32 bytes que reemplaza — LimitTokenConfirmPerIP (por IP)
	// no alcanza solo, porque un atacante puede rotar de IP; este límite
	// por CUENTA acota los intentos de adivinar sin importar desde dónde
	// vengan. 8 intentos/15min against 1.000.000 de combinaciones es
	// generoso para un typo humano, imposible de explotar por fuerza
	// bruta.
	LimitConfirmCodePerAccount = Limit{Max: 8, Window: 15 * time.Minute}

	// Extra 2.3.5 (E5.6) — "Confirmanos que sos vos" del wizard público de
	// pedido de turno. Mismos criterios que los límites de arriba, pero la
	// key es (clinicId+email) en vez de un userId (acá no hay cuenta).
	LimitTurnoVerifEnviarPerIP = Limit{Max: 20, Window: time.Hour}
	// LimitTurnoVerifEnviarCooldown — mismo criterio que
	// LimitResendCooldown: 1 envío cada 60s por mail, para que "Reenviar
	// código" no se pueda apretar en bucle.
	LimitTurnoVerifEnviarCooldown     = Limit{Max: 1, Window: 60 * time.Second}
	LimitTurnoVerifEnviarPerCuenta    = Limit{Max: 5, Window: time.Hour}
	LimitTurnoVerifConfirmarPerIP     = Limit{Max: 30, Window: time.Hour}
	LimitTurnoVerifConfirmarPerCuenta = Limit{Max: 8, Window: 15 * time.Minute}

	// LimitMisTurnosConsultaPerIP — pedido textual del cliente: botón
	// "Mis turnos" de la página pública. Sin código de verificación de
	// por medio (a diferencia del resto de estos límites), así que probar
	// combinaciones de DNI+mail al voleo tiene que costar algo — 20/hora
	// por IP+clínica alcanza para un uso real (alguien consultando su
	// propio turno más de una vez) sin habilitar fuerza bruta cómoda.
	LimitMisTurnosConsultaPerIP = Limit{Max: 20, Window: time.Hour}
)

// scopeLoginFailed cuenta intentos de login fallidos consecutivos por
// cuenta — independiente del límite duro de LimitLoginPerAccount, usado
// para el backoff progresivo (spec §7).
const scopeLoginFailed = "login_failed"

// AccountLimiter aplica límites por-cuenta persistidos en Postgres
// (db.AuthRateCounter) — fila-contador por (scope, key, ventana), no
// fila-por-intento, para no crecer sin límite ni necesitar un cron de
// limpieza.
type AccountLimiter struct {
	DB *gorm.DB
}

// Allow registra un intento para (scope, key) y devuelve false si ya se
// superó el límite en la ventana actual. Ventanas fijas (no deslizantes):
// simple y suficiente para el propósito de anti-abuso del MVP.
func (l *AccountLimiter) Allow(scope, key string, limit Limit) (bool, error) {
	now := time.Now()
	windowStart := now.Truncate(limit.Window)

	var counter db.AuthRateCounter
	err := l.DB.Where("scope = ? AND key = ?", scope, key).First(&counter).Error
	switch {
	case err == gorm.ErrRecordNotFound:
		counter = db.AuthRateCounter{Scope: scope, Key: key, WindowStart: windowStart, Count: 1}
		if err := l.DB.Create(&counter).Error; err != nil {
			return false, err
		}
		return true, nil
	case err != nil:
		return false, err
	}

	if counter.WindowStart.Before(windowStart) {
		// Nueva ventana: resetea el contador.
		counter.WindowStart = windowStart
		counter.Count = 1
		return true, l.DB.Model(&db.AuthRateCounter{}).
			Where("scope = ? AND key = ?", scope, key).
			Updates(map[string]any{"window_start": windowStart, "count": 1}).Error
	}

	if counter.Count >= limit.Max {
		return false, nil
	}

	counter.Count++
	return true, l.DB.Model(&db.AuthRateCounter{}).
		Where("scope = ? AND key = ?", scope, key).
		Update("count", counter.Count).Error
}

// RecordLoginFailure incrementa el contador de fallos consecutivos de
// login para una cuenta y devuelve el nuevo total — usado para calcular el
// backoff progresivo (ver LoginBackoff). Siempre incrementa, sin importar
// límites — el bloqueo duro lo aplica Allow con LimitLoginPerAccount por
// separado.
func (l *AccountLimiter) RecordLoginFailure(key string) (int, error) {
	var counter db.AuthRateCounter
	err := l.DB.Where("scope = ? AND key = ?", scopeLoginFailed, key).First(&counter).Error
	if err == gorm.ErrRecordNotFound {
		counter = db.AuthRateCounter{Scope: scopeLoginFailed, Key: key, WindowStart: time.Now(), Count: 1}
		return 1, l.DB.Create(&counter).Error
	}
	if err != nil {
		return 0, err
	}
	counter.Count++
	return counter.Count, l.DB.Model(&db.AuthRateCounter{}).
		Where("scope = ? AND key = ?", scopeLoginFailed, key).
		Update("count", counter.Count).Error
}

// ResetLoginFailures limpia el contador de fallos consecutivos tras un
// login exitoso.
func (l *AccountLimiter) ResetLoginFailures(key string) error {
	return l.DB.Where("scope = ? AND key = ?", scopeLoginFailed, key).Delete(&db.AuthRateCounter{}).Error
}

// LoginFailureCount lee el contador de fallos consecutivos sin
// modificarlo — se consulta antes de validar la contraseña, para aplicar
// el backoff progresivo incluso antes de tocar la base con la comparación
// de hash.
func (l *AccountLimiter) LoginFailureCount(key string) (int, error) {
	var counter db.AuthRateCounter
	err := l.DB.Where("scope = ? AND key = ?", scopeLoginFailed, key).First(&counter).Error
	if err == gorm.ErrRecordNotFound {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	return counter.Count, nil
}

// ipCounter es una ventana fija en memoria para una sola IP+scope.
type ipCounter struct {
	windowStart time.Time
	count       int
}

// IPLimiter aplica límites por-IP en memoria — no persiste entre
// restarts ni entre instancias (ver el comentario del paquete). Seguro
// para uso concurrente.
type IPLimiter struct {
	mu       sync.Mutex
	counters map[string]*ipCounter
}

func NewIPLimiter() *IPLimiter {
	return &IPLimiter{counters: make(map[string]*ipCounter)}
}

// Allow igual que AccountLimiter.Allow pero en memoria, keyed por
// "scope|ip".
func (l *IPLimiter) Allow(scope, ip string, limit Limit) bool {
	key := scope + "|" + ip
	now := time.Now()
	windowStart := now.Truncate(limit.Window)

	l.mu.Lock()
	defer l.mu.Unlock()

	c, ok := l.counters[key]
	if !ok || c.windowStart.Before(windowStart) {
		l.counters[key] = &ipCounter{windowStart: windowStart, count: 1}
		return true
	}
	if c.count >= limit.Max {
		return false
	}
	c.count++
	return true
}

// Cleanup elimina contadores de ventanas ya vencidas — pensado para
// correrse periódicamente (goroutine con time.Ticker desde main.go) y que
// el mapa no crezca sin límite con IPs que ya no vuelven a pegarle a la
// API. No es estrictamente necesario para la corrección del rate limit
// (una ventana vencida ya se resetea sola en el próximo Allow), solo para
// no acumular memoria indefinidamente.
func (l *IPLimiter) Cleanup(maxAge time.Duration) {
	cutoff := time.Now().Add(-maxAge)
	l.mu.Lock()
	defer l.mu.Unlock()
	for key, c := range l.counters {
		if c.windowStart.Before(cutoff) {
			delete(l.counters, key)
		}
	}
}

// LoginBackoff calcula un delay progresivo tras N intentos fallidos
// consecutivos (spec §7: "backoff progresivo tras intentos fallidos de
// login") — 2^N segundos, con un techo, para no dejar a un usuario
// legítimo esperando minutos enteros por un typo.
func LoginBackoff(failedAttempts int) time.Duration {
	if failedAttempts <= 0 {
		return 0
	}
	const maxBackoff = 30 * time.Second
	backoff := time.Duration(1<<uint(min(failedAttempts, 5))) * time.Second
	if backoff > maxBackoff {
		return maxBackoff
	}
	return backoff
}
