import { describe, expect, it } from "vitest";
import {
  camposDe,
  continuacionesDe,
  continuaEnAnexoDe,
  ETIQUETA_DE_SECCION_DE_CONTINUACION,
  PLANTILLA_DE_CONTINUACION,
  plantillaPorId,
  plantillaSchema,
  plantillasDelSelector,
  plantillasVigentes,
  SECCIONES_DE_CONTINUACION,
  type Plantilla,
} from "./index";

// Los anexos de continuación (Fase 5.6d): qué campo de una historia lleva el
// número del anexo de cada sección lo declara la plantilla.

type CampoSuelto = { id: string } & Record<string, unknown>;

function plantillaCon(campos: CampoSuelto[], tipo = "historia_clinica") {
  return {
    id: "prueba-continuacion",
    version: 1,
    nombre: "Prueba",
    tipo,
    descripcion: "Plantilla de prueba de las continuaciones.",
    fuente: { nombre: "Tests", url: "https://example.com" },
    secciones: [{ id: "todo", titulo: "Todo", campos }],
    // Cada campo tiene que aparecer en el cuerpo.
    cuerpo: [{ t: "titulo", texto: "Prueba" }, { t: "parrafo", texto: campos.map((c) => `{{${c.id}}}`).join(" ") }, { t: "firmas" }],
    firmas: [{ rol: "profesional", etiqueta: "Firma", requerida: true }],
  };
}

function problemas(p: unknown): string[] {
  const res = plantillaSchema.safeParse(p);
  return res.success ? [] : res.error.issues.map((i) => i.message);
}

// El mismo campo sin el atributo es válido: el rechazo es por continuaEnAnexo.
function soloPorElAtributo(campo: CampoSuelto, tipo?: string) {
  const { continuaEnAnexo: _, ...sin } = campo;
  expect(problemas(plantillaCon([sin], tipo))).toEqual([]);
  return problemas(plantillaCon([campo], tipo));
}

describe("continuaEnAnexo en el esquema", () => {
  it("vale en un campo de texto y en uno de número de una historia", () => {
    const p = plantillaSchema.parse(
      plantillaCon([
        { tipo: "texto", id: "diag_anexo", etiqueta: "Continúa en anexo Nº", continuaEnAnexo: "diagnostico" },
        { tipo: "numero", id: "plan_anexo", etiqueta: "Continúa en anexo Nº", continuaEnAnexo: "plan" },
      ]),
    );
    expect(continuacionesDe(p).map((c) => [c.seccion, c.campo.id])).toEqual([
      ["diagnostico", "diag_anexo"],
      ["plan", "plan_anexo"],
    ]);
  });

  it("no vale en otro tipo de campo", () => {
    for (const tipo of ["texto_largo", "fecha", "hora", "si_no"]) {
      expect(soloPorElAtributo({ tipo, id: "x", etiqueta: "X", continuaEnAnexo: "plan" }).length).toBeGreaterThan(0);
    }
  });

  it("no vale una sección que no existe", () => {
    expect(soloPorElAtributo({ tipo: "numero", id: "x", etiqueta: "X", continuaEnAnexo: "anamnesis" }).length).toBeGreaterThan(0);
  });

  it("solo una historia clínica continúa en un anexo", () => {
    for (const tipo of ["consentimiento", "anexo"]) {
      expect(soloPorElAtributo({ tipo: "numero", id: "x", etiqueta: "X", continuaEnAnexo: "plan" }, tipo)).toContain(
        "solo una historia clínica continúa en un anexo: x",
      );
    }
  });

  it("una sola vez cada sección", () => {
    expect(
      problemas(
        plantillaCon([
          { tipo: "numero", id: "a", etiqueta: "A", continuaEnAnexo: "plan" },
          { tipo: "texto", id: "b", etiqueta: "B", continuaEnAnexo: "plan" },
        ]),
      ),
    ).toEqual(["dos campos continúan la sección plan"]);
  });

  it("continuaEnAnexoDe no ve nada en un campo sin el atributo ni en otro tipo", () => {
    const general = plantillaPorId("historia-clinica-general")!;
    const sinAtributo = camposDe(general).filter((c) => !c.id.endsWith("_anexo"));
    for (const c of sinAtributo) expect(continuaEnAnexoDe(c)).toBeUndefined();
  });

  it("cada sección tiene su etiqueta", () => {
    expect(Object.keys(ETIQUETA_DE_SECCION_DE_CONTINUACION).sort()).toEqual([...SECCIONES_DE_CONTINUACION].sort());
  });
});

describe("continuacionesDe en las plantillas reales", () => {
  const secciones = (p: Plantilla | undefined) => continuacionesDe(p!).map((c) => `${c.seccion}:${c.campo.id}:${c.campo.tipo}`);

  it("la General (las dos versiones) y la PcD, en el orden del formulario", () => {
    const general = ["diagnostico:diagnostico_anexo:numero", "plan:plan_anexo:numero", "observaciones:observaciones_anexo:numero"];
    expect(secciones(plantillaPorId("historia-clinica-general", 1))).toEqual(general);
    expect(secciones(plantillaPorId("historia-clinica-general", 2))).toEqual(general);
    expect(secciones(plantillaPorId("historia-clinica-pcd"))).toEqual([
      "diagnostico:diagnostico_anexo:numero",
      "plan:plan_anexo:numero",
      "estudios:estudios_anexo:numero",
    ]);
  });

  it("un consentimiento y el propio anexo no continúan nada", () => {
    expect(continuacionesDe(plantillaPorId("consentimiento-tratamiento-conducto")!)).toEqual([]);
    expect(continuacionesDe(plantillaPorId(PLANTILLA_DE_CONTINUACION)!)).toEqual([]);
  });
});

describe("la plantilla del anexo de continuación", () => {
  it("es un anexo vigente, sin lámina, que el selector no ofrece", () => {
    const anexo = plantillaPorId(PLANTILLA_DE_CONTINUACION);
    expect(PLANTILLA_DE_CONTINUACION).toBe("anexo-de-continuacion");
    expect(anexo).toMatchObject({ tipo: "anexo", version: 1 });
    expect(anexo?.lamina).toBeUndefined();
    expect(plantillasVigentes().map((p) => p.id)).toContain(PLANTILLA_DE_CONTINUACION);
    const delSelector = plantillasDelSelector().map((p) => p.id);
    expect(delSelector).not.toContain(PLANTILLA_DE_CONTINUACION);
    expect(delSelector).toEqual(plantillasVigentes().map((p) => p.id).filter((id) => id !== PLANTILLA_DE_CONTINUACION));
  });
});
