package http

import (
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/clock"
	"dental-mirage/api/internal/db"
)

const maxLargoNotaHorarioClinica = 160

type franjaHorarioClinicaResponse struct {
	Desde string `json:"desde"`
	Hasta string `json:"hasta"`
}

type diaHorarioClinicaResponse struct {
	DiaSemana int                            `json:"diaSemana"`
	Cerrado   bool                           `json:"cerrado"`
	Franjas   []franjaHorarioClinicaResponse `json:"franjas"`
}

// horariosClinicaResponse siempre representa los siete días, incluso antes
// de que la clínica haya guardado un horario. AbiertoAhora solo se incluye
// en la lectura pública; el cálculo usa el reloj de Córdoba del servidor.
type horariosClinicaResponse struct {
	Dias         []diaHorarioClinicaResponse `json:"dias"`
	Nota         string                      `json:"nota"`
	AbiertoAhora *bool                       `json:"abiertoAhora,omitempty"`
}

type putHorariosClinicaRequest struct {
	Dias []diaHorarioClinicaResponse `json:"dias"`
	Nota string                      `json:"nota"`
}

// Estas rutas se montan dentro del grupo requireRol(admin) junto con el
// editor de página. Es un recurso de la clínica, pero solo su administrador
// de página puede cambiar el horario del edificio.
func registerHorariosClinicaRoutes(r chi.Router, gdb *gorm.DB) {
	r.Get("/horario-clinica", getHorariosClinicaHandler(gdb))
	r.Put("/horario-clinica", putHorariosClinicaHandler(gdb))
}

func getHorariosClinicaHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clinicID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}
		horarios, err := leerHorariosClinica(gdb, clinicID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo obtener el horario de la clínica")
			return
		}
		writeJSON(w, http.StatusOK, horarios)
	}
}

func putHorariosClinicaHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clinicID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}
		var req putHorariosClinicaRequest
		if err := decodeJSON(w, r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "cuerpo de la request inválido")
			return
		}
		nota := strings.TrimSpace(req.Nota)
		if len([]rune(nota)) > maxLargoNotaHorarioClinica {
			writeError(w, http.StatusBadRequest, fmt.Sprintf("la nota admite hasta %d caracteres", maxLargoNotaHorarioClinica))
			return
		}
		filas, errMsg := validarHorarioClinica(req.Dias)
		if errMsg != "" {
			writeError(w, http.StatusBadRequest, errMsg)
			return
		}

		if err := gdb.Transaction(func(tx *gorm.DB) error {
			if err := tx.Where("clinic_id = ?", clinicID).Delete(&db.HorarioClinica{}).Error; err != nil {
				return err
			}
			for i := range filas {
				filas[i].ClinicID = clinicID
			}
			if err := tx.Create(&filas).Error; err != nil {
				return err
			}
			return tx.Model(&db.Clinic{}).Where("id = ?", clinicID).
				Update("horario_clinica_nota", nota).Error
		}); err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo guardar el horario de la clínica")
			return
		}

		horarios, err := leerHorariosClinica(gdb, clinicID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "horario guardado pero no se pudo leer")
			return
		}
		writeJSON(w, http.StatusOK, horarios)
	}
}

func validarHorarioClinica(dias []diaHorarioClinicaResponse) ([]db.HorarioClinica, string) {
	if len(dias) != 7 {
		return nil, "el horario debe incluir los siete días de la semana"
	}
	vistos := make(map[int]bool, 7)
	filas := make([]db.HorarioClinica, 0, 7)
	for _, dia := range dias {
		if dia.DiaSemana < 0 || dia.DiaSemana > 6 || vistos[dia.DiaSemana] {
			return nil, "cada día de la semana debe aparecer una sola vez"
		}
		vistos[dia.DiaSemana] = true
		if dia.Cerrado && len(dia.Franjas) != 0 {
			return nil, "un día cerrado no puede tener franjas horarias"
		}
		if !dia.Cerrado && (len(dia.Franjas) == 0 || len(dia.Franjas) > 2) {
			return nil, "cada día abierto debe tener una o dos franjas"
		}

		tramos := make([]db.HorarioClinicaFranja, 0, len(dia.Franjas))
		minutos := make([][2]int, 0, len(dia.Franjas))
		for _, franja := range dia.Franjas {
			desde, desdeOK := minutosDesdeHora(franja.Desde)
			hasta, hastaOK := minutosDesdeHora(franja.Hasta)
			if !desdeOK || !hastaOK || desde >= hasta {
				return nil, "las franjas deben usar horas válidas y terminar después de empezar"
			}
			tramos = append(tramos, db.HorarioClinicaFranja{Desde: franja.Desde, Hasta: franja.Hasta})
			minutos = append(minutos, [2]int{desde, hasta})
		}
		if len(minutos) == 2 {
			if minutos[0][0] > minutos[1][0] {
				minutos[0], minutos[1] = minutos[1], minutos[0]
				tramos[0], tramos[1] = tramos[1], tramos[0]
			}
			if minutos[0][0] == minutos[1][0] || minutos[0][1] > minutos[1][0] {
				return nil, "las franjas no pueden superponerse"
			}
		}
		filas = append(filas, db.HorarioClinica{
			DiaSemana: dia.DiaSemana,
			Cerrado:   dia.Cerrado,
			Franjas:   tramos,
		})
	}
	sort.Slice(filas, func(i, j int) bool { return filas[i].DiaSemana < filas[j].DiaSemana })
	return filas, ""
}

func minutosDesdeHora(hora string) (int, bool) {
	if !horaRegex.MatchString(hora) {
		return 0, false
	}
	partes := strings.SplitN(hora, ":", 2)
	h, errH := strconv.Atoi(partes[0])
	m, errM := strconv.Atoi(partes[1])
	if errH != nil || errM != nil {
		return 0, false
	}
	return h*60 + m, true
}

func leerHorariosClinica(gdb *gorm.DB, clinicID uuid.UUID) (horariosClinicaResponse, error) {
	var clinic db.Clinic
	if err := gdb.Select("id", "horario_clinica_nota").First(&clinic, "id = ?", clinicID).Error; err != nil {
		return horariosClinicaResponse{}, err
	}
	var filas []db.HorarioClinica
	if err := gdb.Where("clinic_id = ?", clinicID).Order("dia_semana").Find(&filas).Error; err != nil {
		return horariosClinicaResponse{}, err
	}
	porDia := make(map[int]db.HorarioClinica, len(filas))
	for _, fila := range filas {
		porDia[fila.DiaSemana] = fila
	}

	out := horariosClinicaResponse{
		Dias: make([]diaHorarioClinicaResponse, 0, 7),
		Nota: clinic.HorarioClinicaNota,
	}
	for dia := 0; dia < 7; dia++ {
		respuesta := diaHorarioClinicaResponse{DiaSemana: dia, Cerrado: true, Franjas: []franjaHorarioClinicaResponse{}}
		if fila, existe := porDia[dia]; existe {
			respuesta.Cerrado = fila.Cerrado
			for _, franja := range fila.Franjas {
				respuesta.Franjas = append(respuesta.Franjas, franjaHorarioClinicaResponse{Desde: franja.Desde, Hasta: franja.Hasta})
			}
		}
		out.Dias = append(out.Dias, respuesta)
	}
	return out, nil
}

func horariosClinicaPublicos(gdb *gorm.DB, clinicID uuid.UUID) (horariosClinicaResponse, error) {
	respuesta, err := leerHorariosClinica(gdb, clinicID)
	if err != nil {
		return horariosClinicaResponse{}, err
	}
	now := clock.Now()
	minutosAhora := now.Hour()*60 + now.Minute()
	abierto := false
	for _, dia := range respuesta.Dias {
		if dia.DiaSemana != int(now.Weekday()) || dia.Cerrado {
			continue
		}
		for _, franja := range dia.Franjas {
			desde, desdeOK := minutosDesdeHora(franja.Desde)
			hasta, hastaOK := minutosDesdeHora(franja.Hasta)
			if desdeOK && hastaOK && minutosAhora >= desde && minutosAhora < hasta {
				abierto = true
				break
			}
		}
		break
	}
	respuesta.AbiertoAhora = &abierto
	return respuesta, nil
}
