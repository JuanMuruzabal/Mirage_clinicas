// Package clock centraliza "qué hora/fecha es hoy" en la zona horaria de
// Argentina, para no depender de la zona horaria del contenedor donde
// corre el proceso.
//
// Existe específicamente para el modal "+ Agregar turno" (spec §4.3) y
// cualquier regla futura de "turno vigente": comparar horarios con la hora
// local del servidor sin fijar zona horaria puede correr una consulta de
// hora sin que el profesional lo note (riesgo R6 en
// docs/implementation-plan.md). Todo el código que necesite "ahora"/"hoy"
// para ese tipo de comparación debe usar este paquete en vez de
// time.Now() directo.
package clock

import (
	"time"

	// Empaqueta la base de datos de zonas horarias IANA en el binario, para
	// que LoadLocation funcione aunque el contenedor de deploy no tenga
	// /usr/share/zoneinfo instalado (común en imágenes mínimas).
	_ "time/tzdata"
)

// Córdoba, como el resto de Argentina, no tiene horario de verano desde
// 2009: un único offset fijo (UTC-3) en todo el país (spec §9.5 pide
// explícitamente "America/Argentina/Cordoba").
var location = mustLoadLocation("America/Argentina/Cordoba")

func mustLoadLocation(name string) *time.Location {
	loc, err := time.LoadLocation(name)
	if err != nil {
		// No debería pasar con time/tzdata embebido, pero si pasa preferimos
		// un offset fijo correcto antes que reventar el arranque del backend.
		return time.FixedZone("ART", -3*60*60)
	}
	return loc
}

// Now devuelve el instante actual en la zona horaria de Argentina.
func Now() time.Time {
	return time.Now().In(location)
}

// Today devuelve la fecha calendario de hoy en Argentina, a medianoche.
func Today() time.Time {
	now := Now()
	return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, location)
}

// In convierte un instante cualquiera (ej. Turno.HoraInicio, un timestamptz
// guardado en UTC) a la hora de pared en Argentina — F2.3 (cálculo de
// disponibilidad, corrección de QA): comparar "a qué hora del día local
// cae este turno" contra horarios de atención/bloqueos ("HH:MM" en hora
// de pared) exige pasar todo a la misma zona primero, nunca comparar
// contra la hora tal cual la guardó Postgres.
func In(t time.Time) time.Time {
	return t.In(location)
}

// ParseDate interpreta un string "YYYY-MM-DD" como medianoche en Argentina
// — nunca uses time.Parse a secas para esto. time.Parse sin zona horaria en
// el layout asume UTC, así que comparar ese resultado contra Today()
// (Argentina, UTC-3) corre la fecha 3 horas (bug real documentado en
// Marcuzzi_Madryn, TR-006 de ese proyecto). ParseDate y Today() quedan
// siempre en la misma zona horaria, así que son comparables de forma segura.
func ParseDate(value string) (time.Time, error) {
	return time.ParseInLocation("2006-01-02", value, location)
}
