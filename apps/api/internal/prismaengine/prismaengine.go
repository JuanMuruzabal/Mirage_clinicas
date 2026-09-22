// Package prismaengine — el lado Go del registro único de módulos de la
// página pública (PE-1, docs/Fases post MVP/Prisma Engine/plan-prisma-engine.md).
// Los archivos modulos/*.schema.json y temas.json de este paquete NO se
// editan a mano: los genera `pnpm engine:generar` a partir de
// packages/prisma-engine/src (zod) y packages/prisma-engine/catalogo/temas.json
// — correr ese comando después de cambiar un módulo o el catálogo de temas,
// nunca tocar el JSON de acá directo (CI corre el mismo comando y falla si
// el resultado difiere de lo commiteado).
//
// La directiva go:embed no puede leer fuera de este módulo Go, por eso los
// archivos están COPIADOS acá (no un symlink a packages/prisma-engine) — es la razón
// de ser de todo este paquete: sin esto, apps/api no tendría cómo enterarse
// del catálogo real sin duplicarlo a mano (el problema que tenían
// tiposModuloValidos/validarModulos en internal/http/pagina_publica.go y
// temasValidos/tipografiasValidas en internal/http/temas_pagina_publica.go
// — los dos quedan reemplazados por este paquete).
package prismaengine

import (
	"embed"
	"encoding/json"
	"fmt"

	"github.com/santhosh-tekuri/jsonschema/v5"
)

//go:embed modulos/*.schema.json temas.json
var archivos embed.FS

// CatalogoTemas — mismo shape que packages/prisma-engine/catalogo/temas.json:
// tema -> variantes válidas, más el catálogo compartido de tipografías. Ver
// el comentario de ese archivo para por qué es SOLO identificadores (el
// hex/las fuentes reales siguen viviendo solo en el frontend).
type CatalogoTemas struct {
	Temas       map[string][]string `json:"temas"`
	Tipografias []string            `json:"tipografias"`
}

var (
	esquemasModulo map[string]*jsonschema.Schema
	catalogoTemas  CatalogoTemas
)

// init — carga y compila todo una sola vez al arrancar el proceso. Si un
// JSON generado está roto o falta, el proceso no llega a levantar (falla en
// boot, con un mensaje claro, no en el primer PATCH que le toque en
// producción).
func init() {
	entradas, err := archivos.ReadDir("modulos")
	if err != nil {
		panic(fmt.Sprintf("prismaengine: no se pudo leer modulos/: %v", err))
	}

	esquemasModulo = make(map[string]*jsonschema.Schema, len(entradas))
	for _, entrada := range entradas {
		contenido, err := archivos.ReadFile("modulos/" + entrada.Name())
		if err != nil {
			panic(fmt.Sprintf("prismaengine: no se pudo leer modulos/%s: %v", entrada.Name(), err))
		}
		// "sobre_nosotros.schema.json" -> tipo "sobre_nosotros".
		tipo := entrada.Name()[:len(entrada.Name())-len(".schema.json")]
		ruta := "modulos/" + entrada.Name()
		esquema, err := jsonschema.CompileString(ruta, string(contenido))
		if err != nil {
			panic(fmt.Sprintf("prismaengine: no se pudo compilar %s: %v", ruta, err))
		}
		esquemasModulo[tipo] = esquema
	}

	contenidoTemas, err := archivos.ReadFile("temas.json")
	if err != nil {
		panic(fmt.Sprintf("prismaengine: no se pudo leer temas.json: %v", err))
	}
	if err := json.Unmarshal(contenidoTemas, &catalogoTemas); err != nil {
		panic(fmt.Sprintf("prismaengine: temas.json inválido: %v", err))
	}
}

// TipoDeModuloValido — reemplaza el mapa tiposModuloValidos escrito a mano:
// un tipo es válido si (y solo si) tiene un esquema generado. "portada" y
// "turno" siguen afuera a propósito (son estructurales, nunca se persisten
// como módulo — ver el comentario de tiposModuloValidos, que documentaba lo
// mismo).
func TipoDeModuloValido(tipo string) bool {
	_, ok := esquemasModulo[tipo]
	return ok
}

// ValidarConfigDeModulo — valida la config de UN módulo contra su esquema
// generado. El backend no conoce la forma de cada módulo por nombre: todo
// lo que sabía antes `validarModulos` a mano (subtipo de foto, tope de la
// galería, estadísticas válidas, largo de textos) ahora vive en el esquema.
// Lo que el esquema NO puede expresar —una regla que compara contra el
// resto de los módulos de la página, como el tope de fotos SUELTAS de toda
// la página— sigue en internal/http/pagina_publica.go.
func ValidarConfigDeModulo(tipo string, config map[string]any) error {
	esquema, ok := esquemasModulo[tipo]
	if !ok {
		return fmt.Errorf("tipo de módulo inválido: %q", tipo)
	}
	if err := esquema.Validate(config); err != nil {
		return fmt.Errorf("config de %q inválida: %w", tipo, err)
	}
	return nil
}

// TemaEsValido — "" (sin elegir todavía) siempre es válido; con un tema
// elegido, la variante tiene que pertenecer a ESE tema específico. Mismo
// contrato que la función que reemplaza (temaEsValido, temas_pagina_publica.go).
func TemaEsValido(tema, variante string) bool {
	if tema == "" && variante == "" {
		return true
	}
	variantesDelTema, existe := catalogoTemas.Temas[tema]
	if !existe {
		return false
	}
	if variante == "" {
		return true
	}
	for _, v := range variantesDelTema {
		if v == variante {
			return true
		}
	}
	return false
}

func TipografiaEsValida(tipografia string) bool {
	if tipografia == "" {
		return true
	}
	for _, t := range catalogoTemas.Tipografias {
		if t == tipografia {
			return true
		}
	}
	return false
}
