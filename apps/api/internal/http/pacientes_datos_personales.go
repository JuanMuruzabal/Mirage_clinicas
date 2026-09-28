package http

import (
	"errors"
	"strings"
	"unicode/utf8"

	"dental-mirage/api/internal/clock"
	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/documentos"
)

// errFichaConDocumentos — la ficha tiene documentos clínicos y no se puede
// borrar (Fase 5.1, TR-182). Ver borrarFichaPacienteConSusHijas.
var errFichaConDocumentos = errors.New("la ficha tiene documentos clínicos")

// datosPersonalesRequest — los datos de la ficha que piden los documentos
// clínicos (Fase 5.1, D7 de fase5-documentos-clinicos.md). Viajan en el
// PATCH de la ficha, con la misma regla que el resto de ese endpoint:
// ausente (nil) es "no tocar", "" es "borrar".
type datosPersonalesRequest struct {
	FechaNacimiento    *string `json:"fechaNacimiento"`
	Domicilio          *string `json:"domicilio"`
	ObraSocial         *string `json:"obraSocial"`
	ObraSocialPlan     *string `json:"obraSocialPlan"`
	ObraSocialAfiliado *string `json:"obraSocialAfiliado"`
}

// textoOpcional — "" → nil (borrar), y un largo máximo. Devuelve un mensaje
// si no entra.
func textoOpcional(valor *string, maximo int, nombre string) (*string, string) {
	limpio := strings.Join(strings.Fields(*valor), " ")
	if limpio == "" {
		return nil, ""
	}
	if utf8.RuneCountInString(limpio) > maximo {
		return nil, nombre + " es demasiado largo"
	}
	return &limpio, ""
}

// aplicarDatosPersonales — valida y aplica a la ficha los datos que
// vinieron. Devuelve un mensaje de error para el usuario, o "".
func aplicarDatosPersonales(p *db.Paciente, req datosPersonalesRequest) string {
	if req.FechaNacimiento != nil {
		f := strings.TrimSpace(*req.FechaNacimiento)
		if f == "" {
			p.FechaNacimiento = nil
		} else {
			if !documentos.EsFechaValida(f) {
				return "la fecha de nacimiento no es válida"
			}
			if f > clock.Today().Format("2006-01-02") {
				return "la fecha de nacimiento no puede ser futura"
			}
			// Medianoche de Córdoba: la columna es DATE y guarda ese día.
			fecha, err := clock.ParseDate(f)
			if err != nil {
				return "la fecha de nacimiento no es válida"
			}
			p.FechaNacimiento = &fecha
		}
	}
	campos := []struct {
		valor   *string
		destino **string
		maximo  int
		nombre  string
	}{
		{req.Domicilio, &p.Domicilio, 300, "el domicilio"},
		{req.ObraSocial, &p.ObraSocial, 150, "el nombre de la obra social"},
		{req.ObraSocialPlan, &p.ObraSocialPlan, 100, "el plan"},
		{req.ObraSocialAfiliado, &p.ObraSocialAfiliado, 60, "el número de afiliado"},
	}
	for _, c := range campos {
		if c.valor == nil {
			continue
		}
		limpio, msg := textoOpcional(c.valor, c.maximo, c.nombre)
		if msg != "" {
			return msg
		}
		*c.destino = limpio
	}
	return ""
}
