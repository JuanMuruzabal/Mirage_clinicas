import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { REGISTRO_MODULOS } from "../registro";
import type { ContextoPublico, ModuloBorrador } from "../tipos";

// Contexto de prueba: utils permisivos por default, cada test pisa lo que
// necesita. Cubre lo que modulos-publicos.tsx (apps/web) da por sentado:
// que cada `seccion()` devuelve null cuando no hay nada que mostrar, y el
// contenido correcto cuando sí.
function contexto(parcial: Partial<ContextoPublico> = {}): ContextoPublico {
  return {
    nombreClinica: "Clínica de prueba",
    telefono: "351 555 0000",
    especialidades: [],
    contenido: { bio: null, direccion: null, mostrarMapa: false, redesSociales: {}, estadisticas: {} },
    utils: {
      esUrlDeFotoSegura: () => true,
      hrefDeTelefono: (t) => `tel:${t}`,
      urlDeComoLlegar: (d) => `https://maps/${d}`,
      urlDeMapaEmbebido: (d) => `https://maps/embed/${d}`,
      urlDeRedSocial: (_red, valor) => (valor ? `https://red/${valor}` : null),
    },
    ...parcial,
  };
}

function modulo(tipo: string, config: Record<string, unknown> = {}): ModuloBorrador {
  return { clave: "c1", tipo, visible: true, config };
}

describe("sobre_nosotros: seccion", () => {
  it("sin bio no hay sección", () => {
    expect(REGISTRO_MODULOS.sobre_nosotros.seccion(modulo("sobre_nosotros"), 0, contexto())).toBeNull();
  });

  it("con bio arma la sección con el texto de la PÁGINA, no de la config del módulo", () => {
    const s = REGISTRO_MODULOS.sobre_nosotros.seccion(modulo("sobre_nosotros"), 0, contexto({ contenido: { ...contexto().contenido, bio: "Somos una clínica" } }));
    expect(s?.id).toBe("sobre-nosotros");
    expect(s?.etiqueta).toBe("Sobre nosotros");
  });
});

describe("contacto: seccion", () => {
  it("sin dirección, teléfono ni redes no hay sección", () => {
    expect(REGISTRO_MODULOS.contacto.seccion(modulo("contacto"), 0, contexto({ telefono: null }))).toBeNull();
  });

  it("con teléfono solo, arma la sección", () => {
    const s = REGISTRO_MODULOS.contacto.seccion(modulo("contacto"), 0, contexto());
    expect(s?.id).toBe("contacto");
  });
});

describe("foto: seccion", () => {
  it("una URL insegura no se muestra", () => {
    const ctx = contexto({ utils: { ...contexto().utils, esUrlDeFotoSegura: () => false } });
    expect(REGISTRO_MODULOS.foto.seccion(modulo("foto", { fotoUrl: "javascript:alert(1)" }), 0, ctx)).toBeNull();
  });

  it("una foto retrato da ancho medio en la sección", () => {
    const s = REGISTRO_MODULOS.foto.seccion(modulo("foto", { fotoUrl: "/uploads/x.jpg", subtipo: "retrato" }), 0, contexto());
    expect(s?.ancho).toBe("medio");
  });
});

describe("texto_libre: seccion", () => {
  it("sin título ni texto no hay sección", () => {
    expect(REGISTRO_MODULOS.texto_libre.seccion(modulo("texto_libre", { titulo: "", texto: "" }), 0, contexto())).toBeNull();
  });

  it("el id lleva el índice para poder repetirse", () => {
    const s = REGISTRO_MODULOS.texto_libre.seccion(modulo("texto_libre", { titulo: "Filosofía", texto: "" }), 2, contexto());
    expect(s?.id).toBe("texto-2");
    expect(s?.etiqueta).toBe("Filosofía");
  });
});

describe("estadisticas: seccion", () => {
  it("sin nada elegido no hay sección", () => {
    expect(REGISTRO_MODULOS.estadisticas.seccion(modulo("estadisticas", { mostrar: [] }), 0, contexto())).toBeNull();
  });

  it("muestra el número real de la clínica, no uno cargado a mano", () => {
    const ctx = contexto({ contenido: { ...contexto().contenido, estadisticas: { pacientes_atendidos: 42 } } });
    const s = REGISTRO_MODULOS.estadisticas.seccion(modulo("estadisticas", { mostrar: ["pacientes_atendidos"] }), 0, ctx);
    expect(s).not.toBeNull();
  });

  // PP-1, H24: una clínica nueva no publica "0 pacientes atendidos".
  it("una estadística en cero no se muestra, y si todas lo están no hay sección", () => {
    const todas = { mostrar: ["pacientes_atendidos", "turnos_realizados"] };
    const enCero = contexto({ contenido: { ...contexto().contenido, estadisticas: { pacientes_atendidos: 0, turnos_realizados: 0 } } });
    expect(REGISTRO_MODULOS.estadisticas.seccion(modulo("estadisticas", todas), 0, enCero)).toBeNull();

    const una = contexto({ contenido: { ...contexto().contenido, estadisticas: { pacientes_atendidos: 0, turnos_realizados: 1234 } } });
    render(<>{REGISTRO_MODULOS.estadisticas.seccion(modulo("estadisticas", todas), 0, una)!.contenido}</>);
    expect(screen.queryByText("Pacientes atendidos")).toBeNull();
    // Formato argentino desde el primer render, sin esperar a la animación.
    expect(screen.queryByText("1.234")).not.toBeNull();
  });

});
