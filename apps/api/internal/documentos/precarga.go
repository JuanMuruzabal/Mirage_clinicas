package documentos

import (
	"strconv"
	"strings"
	"time"
)

// DatosDePrecarga — lo que ya se sabe al crear un documento, por clave de
// precarga ("paciente.dni", "clinica.ciudad"…; ver PRECARGAS en
// packages/documentos-clinicos/src/esquema.ts). Lo arma el handler con la
// ficha, el perfil y la clínica.
type DatosDePrecarga map[string]string

// Precargar — los valores iniciales de un documento nuevo.
func Precargar(p *Plantilla, datos DatosDePrecarga) map[string]any {
	valores := map[string]any{}
	for _, c := range p.Campos() {
		if c.Precarga == "" {
			continue
		}
		v := strings.TrimSpace(datos[c.Precarga])
		if v == "" {
			continue
		}
		switch c.Tipo {
		case "texto", "texto_largo":
			valores[c.ID] = v
		case "fecha":
			if EsFechaValida(v) {
				valores[c.ID] = v
			}
		case "numero":
			// Solo si el campo lo admite (una edad fuera de su rango no se
			// precarga: sería un error en un documento recién creado).
			if n, err := strconv.ParseFloat(v, 64); err == nil && errorDeTipo(c, n) == "" {
				valores[c.ID] = n
			}
		}
	}
	return valores
}

// ConservarBloqueados — un campo bloqueado (el nombre del profesional) se
// queda con lo que tenía: lo que mande la pantalla para ese campo se ignora.
func ConservarBloqueados(p *Plantilla, anteriores, nuevos map[string]any) map[string]any {
	resultado := map[string]any{}
	for clave, valor := range nuevos {
		resultado[clave] = valor
	}
	for _, c := range p.Campos() {
		if !c.Bloqueado {
			continue
		}
		if valor, existe := anteriores[c.ID]; existe {
			resultado[c.ID] = valor
		} else {
			delete(resultado, c.ID)
		}
	}
	return resultado
}

// EdadAl — los años y los meses cumplidos al día `hoy` de quien nació en
// `nacimiento` (AAAA-MM-DD): la "Edad: … años … meses" de odontopediatría.
// Vacíos si la fecha no es válida o es posterior a hoy. `hoy` es una fecha
// de calendario (clock.Today()): solo se miran su año, mes y día.
func EdadAl(nacimiento string, hoy time.Time) (anios, meses string) {
	if !EsFechaValida(nacimiento) {
		return "", ""
	}
	n, _ := time.Parse("2006-01-02", nacimiento)
	total := (hoy.Year()-n.Year())*12 + int(hoy.Month()) - int(n.Month())
	// Art. 6 CCyC: si el mes no tiene ese día, el plazo vence su último día.
	ultimoDelMes := hoy.AddDate(0, 0, 1).Day() == 1
	if hoy.Day() < n.Day() && !ultimoDelMes {
		total--
	}
	if total < 0 {
		return "", ""
	}
	return strconv.Itoa(total / 12), strconv.Itoa(total % 12)
}
