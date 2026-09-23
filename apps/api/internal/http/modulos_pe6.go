package http

import (
	"fmt"
	"sort"
	"strings"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/db"
)

type equipoElegibleResponse struct {
	UserID      string  `json:"userId"`
	Nombre      string  `json:"nombre"`
	FotoURL     *string `json:"fotoUrl"`
	Descripcion *string `json:"descripcion"`
	Aval        bool    `json:"aval"`
}

type servicioDisponibleResponse struct {
	Nombre         string `json:"nombre"`
	DuracionMinima int    `json:"duracionMinima"`
	DuracionMaxima int    `json:"duracionMaxima"`
}

type profesionalEquipoPublicoResponse struct {
	Nombre      string  `json:"nombre"`
	FotoURL     *string `json:"fotoUrl"`
	Descripcion *string `json:"descripcion"`
}

func equipoElegibleDeLaClinica(gdb *gorm.DB, clinicID uuid.UUID) ([]equipoElegibleResponse, error) {
	var miembros []db.ClinicMember
	if err := gdb.Scopes(db.ConRol(db.RoleProfesional)).
		Where("clinic_id = ? AND status = ?", clinicID, db.ClinicMemberStatusActive).
		Order("created_at, user_id").Find(&miembros).Error; err != nil {
		return nil, err
	}
	if len(miembros) == 0 {
		return []equipoElegibleResponse{}, nil
	}

	ids := make([]uuid.UUID, 0, len(miembros))
	for _, miembro := range miembros {
		ids = append(ids, miembro.UserID)
	}
	var perfiles []db.ProfessionalProfile
	if err := gdb.Where("user_id IN ?", ids).Find(&perfiles).Error; err != nil {
		return nil, err
	}
	porUsuario := make(map[uuid.UUID]db.ProfessionalProfile, len(perfiles))
	for _, perfil := range perfiles {
		porUsuario[perfil.UserID] = perfil
	}

	out := make([]equipoElegibleResponse, 0, len(miembros))
	for _, miembro := range miembros {
		perfil, existe := porUsuario[miembro.UserID]
		if !existe {
			continue
		}
		nombre := strings.TrimSpace(perfil.Nombre + " " + perfil.Apellido)
		if nombre == "" {
			nombre = "Profesional de la clínica"
		}
		out = append(out, equipoElegibleResponse{
			UserID: miembro.UserID.String(), Nombre: nombre, FotoURL: perfil.FotoURL,
			Descripcion: perfil.Bio, Aval: miembro.AvalPaginaPublica,
		})
	}
	return out, nil
}

// serviciosDisponiblesDeLaClinica une los tipos que ofrecen los
// profesionales activos por nombre; los IDs y duraciones individuales de
// TipoConsulta no son identidad del servicio compartido.
func serviciosDisponiblesDeLaClinica(gdb *gorm.DB, clinicID uuid.UUID) ([]servicioDisponibleResponse, error) {
	porNombre, err := tiposOfrecidosEnLaClinica(gdb, clinicID)
	if err != nil {
		return nil, err
	}
	claves := make([]string, 0, len(porNombre))
	for clave := range porNombre {
		claves = append(claves, clave)
	}
	sort.Strings(claves)

	out := make([]servicioDisponibleResponse, 0, len(claves))
	for _, clave := range claves {
		tipos := porNombre[clave]
		if len(tipos) == 0 {
			continue
		}
		minutosMin, minutosMax := tipos[0].DuracionMinutos, tipos[0].DuracionMinutos
		for _, tipo := range tipos[1:] {
			if tipo.DuracionMinutos < minutosMin {
				minutosMin = tipo.DuracionMinutos
			}
			if tipo.DuracionMinutos > minutosMax {
				minutosMax = tipo.DuracionMinutos
			}
		}
		out = append(out, servicioDisponibleResponse{
			Nombre: tipos[0].Nombre, DuracionMinima: minutosMin,
			DuracionMaxima: minutosMax,
		})
	}
	return out, nil
}

// validarSeleccionDeEquipo asegura que un borrador no guarde IDs de otra
// clínica, de miembros inactivos o de profesionales que no dieron su aval.
// En el modo todos, la lista es dinámica y no persiste IDs.
func validarSeleccionDeEquipo(gdb *gorm.DB, clinicID uuid.UUID, modulos []moduloRequest) error {
	for _, modulo := range modulos {
		if modulo.Tipo != "equipo" {
			continue
		}
		modo, _ := modulo.Config["modo"].(string)
		if modo != "seleccion" {
			continue
		}
		idsCrudos, ok := modulo.Config["userIds"]
		if !ok || idsCrudos == nil {
			continue
		}
		valores, ok := idsCrudos.([]any)
		if !ok {
			// Los mapas que llegan por JSON usan []any; aceptar también una
			// lista tipada hace más simple invocar el validador desde código.
			if tipados, esTipado := idsCrudos.([]string); esTipado {
				valores = make([]any, len(tipados))
				for i, id := range tipados {
					valores[i] = id
				}
			} else {
				return fmt.Errorf("la selección de equipo no tiene un formato válido")
			}
		}

		ids := make([]uuid.UUID, 0, len(valores))
		vistos := make(map[uuid.UUID]bool, len(valores))
		for _, valor := range valores {
			texto, ok := valor.(string)
			if !ok {
				return fmt.Errorf("la selección de equipo contiene un profesional inválido")
			}
			id, err := uuid.Parse(texto)
			if err != nil || vistos[id] {
				return fmt.Errorf("la selección de equipo contiene un profesional inválido")
			}
			vistos[id] = true
			ids = append(ids, id)
		}
		if len(ids) == 0 {
			continue
		}

		var miembros []db.ClinicMember
		if err := gdb.Scopes(db.ConRol(db.RoleProfesional)).
			Where("clinic_id = ? AND status = ? AND aval_pagina_publica = ? AND user_id IN ?",
				clinicID, db.ClinicMemberStatusActive, true, ids).
			Find(&miembros).Error; err != nil {
			return err
		}
		if len(miembros) != len(ids) {
			return fmt.Errorf("solo se pueden seleccionar profesionales activos que dieron su aval")
		}
	}
	return nil
}

// validarServiciosSeleccionados cubre una limitación del JSON Schema generado:
// `uniqueItems` compara strings exactos, mientras que el producto considera
// iguales los nombres tras normalizar acentos, puntuación y espacios.
func validarServiciosSeleccionados(modulos []moduloRequest) error {
	for _, modulo := range modulos {
		if modulo.Tipo != "servicios" {
			continue
		}
		valores, ok := modulo.Config["nombres"].([]any)
		if !ok {
			continue // el schema ya reporta el tipo inválido
		}
		vistos := make(map[string]bool, len(valores))
		for _, valor := range valores {
			nombre, ok := valor.(string)
			if !ok {
				continue // el schema ya reporta el tipo inválido
			}
			clave := normalizarNombreTipo(nombre)
			if vistos[clave] {
				return fmt.Errorf("la selección de servicios no puede repetir nombres equivalentes")
			}
			vistos[clave] = true
		}
	}
	return nil
}

func equipoPublicoDeModulo(gdb *gorm.DB, clinicID uuid.UUID, config map[string]any) ([]profesionalEquipoPublicoResponse, error) {
	modo, _ := config["modo"].(string)
	idsElegidos := []uuid.UUID{}
	if modo == "seleccion" {
		idsCrudos, _ := config["userIds"].([]any)
		if tipados, ok := config["userIds"].([]string); ok {
			for _, valor := range tipados {
				if id, err := uuid.Parse(valor); err == nil {
					idsElegidos = append(idsElegidos, id)
				}
			}
		} else {
			for _, valor := range idsCrudos {
				texto, ok := valor.(string)
				if !ok {
					continue
				}
				id, err := uuid.Parse(texto)
				if err == nil {
					idsElegidos = append(idsElegidos, id)
				}
			}
		}
	}

	query := gdb.Scopes(db.ConRol(db.RoleProfesional)).
		Where("clinic_id = ? AND status = ? AND aval_pagina_publica = ?",
			clinicID, db.ClinicMemberStatusActive, true)
	if modo == "seleccion" {
		if len(idsElegidos) == 0 {
			return []profesionalEquipoPublicoResponse{}, nil
		}
		query = query.Where("user_id IN ?", idsElegidos)
	} else if modo != "todos" {
		return []profesionalEquipoPublicoResponse{}, nil
	}

	var miembros []db.ClinicMember
	if err := query.Order("user_id").Find(&miembros).Error; err != nil {
		return nil, err
	}
	if len(miembros) == 0 {
		return []profesionalEquipoPublicoResponse{}, nil
	}
	ids := make([]uuid.UUID, 0, len(miembros))
	for _, miembro := range miembros {
		ids = append(ids, miembro.UserID)
	}
	var perfiles []db.ProfessionalProfile
	if err := gdb.Where("user_id IN ?", ids).Find(&perfiles).Error; err != nil {
		return nil, err
	}
	porUsuario := make(map[uuid.UUID]db.ProfessionalProfile, len(perfiles))
	for _, perfil := range perfiles {
		porUsuario[perfil.UserID] = perfil
	}

	idsOrdenados := ids
	if modo == "seleccion" {
		idsOrdenados = idsElegidos
	}
	out := make([]profesionalEquipoPublicoResponse, 0, len(miembros))
	vistos := map[uuid.UUID]bool{}
	for _, id := range idsOrdenados {
		perfil, existe := porUsuario[id]
		if !existe || vistos[id] {
			continue
		}
		vistos[id] = true
		nombre := strings.TrimSpace(perfil.Nombre + " " + perfil.Apellido)
		if nombre == "" {
			nombre = "Profesional de la clínica"
		}
		out = append(out, profesionalEquipoPublicoResponse{
			Nombre: nombre, FotoURL: perfil.FotoURL, Descripcion: perfil.Bio,
		})
	}
	if modo == "todos" {
		sort.SliceStable(out, func(i, j int) bool { return out[i].Nombre < out[j].Nombre })
	}
	return out, nil
}

func configPublicaDeModulo(tipo string, config map[string]any) map[string]any {
	if tipo != "equipo" || config == nil {
		return config
	}
	limpia := make(map[string]any, len(config))
	for clave, valor := range config {
		if clave != "userIds" {
			limpia[clave] = valor
		}
	}
	return limpia
}
