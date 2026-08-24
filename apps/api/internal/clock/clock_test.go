package clock

import "testing"

func TestLocation_EsCordobaUTCMenos3(t *testing.T) {
	_, offset := Now().Zone()
	if offset != -3*60*60 {
		t.Errorf("offset = %d segundos, esperaba -3h (UTC-3)", offset)
	}
	if location.String() != "America/Argentina/Cordoba" {
		t.Errorf("location = %q, esperaba America/Argentina/Cordoba", location.String())
	}
}

func TestToday_EsMedianoche(t *testing.T) {
	today := Today()
	if today.Hour() != 0 || today.Minute() != 0 || today.Second() != 0 || today.Nanosecond() != 0 {
		t.Errorf("Today() = %v, esperaba hora 00:00:00.000", today)
	}
}

func TestParseDate_ComparableConToday(t *testing.T) {
	hoy := Today()
	parsed, err := ParseDate(hoy.Format("2006-01-02"))
	if err != nil {
		t.Fatalf("ParseDate error inesperado: %v", err)
	}
	if !parsed.Equal(hoy) {
		t.Errorf("ParseDate(%q) = %v, esperaba que fuera igual a Today() = %v", hoy.Format("2006-01-02"), parsed, hoy)
	}
}

func TestParseDate_FinDeAnio(t *testing.T) {
	parsed, err := ParseDate("2026-12-31")
	if err != nil {
		t.Fatalf("ParseDate error inesperado: %v", err)
	}
	if parsed.Year() != 2026 || parsed.Month() != 12 || parsed.Day() != 31 {
		t.Errorf("ParseDate(2026-12-31) = %v, fecha incorrecta", parsed)
	}
}

func TestParseDate_FormatoInvalido(t *testing.T) {
	if _, err := ParseDate("31-12-2026"); err == nil {
		t.Error("ParseDate con formato inválido debería fallar")
	}
}
