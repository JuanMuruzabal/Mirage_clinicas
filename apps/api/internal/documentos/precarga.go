package documentos

import "strings"

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
