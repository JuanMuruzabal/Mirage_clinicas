import { describe, expect, it } from "vitest";
import {
  anchoEnUnidades,
  armarLamina,
  camposDeZona,
  componerZona,
  envolver,
  estaMarcada,
  MARCA_DE_CASILLA,
  NO_CONSIGNA,
  parteDeFecha,
  plantillaPorId,
  plantillaSchema,
  textoDeZona,
  validarLamina,
  type Plantilla,
  type Zona,
} from "./index";

const conducto = plantillaPorId("consentimiento-tratamiento-conducto") as Plantilla;
const hoy = { fecha: "2026-09-28" };
/** Una copia que se puede romper sin tocar la del registro. */
const copia = (p: Plantilla): Plantilla => JSON.parse(JSON.stringify(p)) as Plantilla;
const renglon: Zona = { id: "r", pagina: 1, x: 100, y: 100, ancho: 129, texto: "{{x}}" };

describe("las métricas", () => {
  it("suma los anchos de Helvetica, y un carácter sin métrica usa el de por defecto", () => {
    expect(anchoEnUnidades("")).toBe(0);
    // H = 722, o = 556, l = 222, a = 556.
    expect(anchoEnUnidades("Hola")).toBe(722 + 556 + 222 + 556);
    expect(anchoEnUnidades("一")).toBe(556);
  });
});

describe("las partes de una fecha", () => {
  it("da el día, el mes, el mes con su nombre, el año y el año en dos cifras", () => {
    expect(["dia", "mes", "mes_nombre", "anio", "anio2", "otra"].map((p) => parteDeFecha("2026-09-07", p))).toEqual([
      "07",
      "09",
      "septiembre",
      "2026",
      "26",
      "",
    ]);
    expect(parteDeFecha("2026-01-31", "mes_nombre")).toBe("enero");
    expect(parteDeFecha("2026-13-01", "mes_nombre")).toBe("");
    expect(parteDeFecha("7/9/2026", "dia")).toBe("");
  });

  it("también de la fecha del documento (\"Córdoba ___ de ______ 20__\")", () => {
    const partes: Zona = { ...renglon, texto: "{{sistema.fecha:dia}} de {{sistema.fecha:mes_nombre}} de 20{{sistema.fecha:anio2}}" };
    expect(textoDeZona(partes, conducto, {}, hoy, "sellado")).toEqual({ texto: "28 de septiembre de 2026", vacia: false });
  });
});

describe("las casillas", () => {
  const conCasillas = (): Plantilla => {
    const p = copia(conducto);
    p.secciones.push({
      id: "casillas",
      titulo: "Casillas",
      campos: [
        {
          tipo: "opcion_unica",
          id: "lugar_x",
          etiqueta: "Lugar",
          opciones: [
            { valor: "hospital", etiqueta: "Hospital" },
            { valor: "consultorio", etiqueta: "Consultorio" },
          ],
        },
        { tipo: "si_no", id: "acepta", etiqueta: "¿Acepta?" },
        {
          tipo: "opcion_multiple",
          id: "medios",
          etiqueta: "Medios",
          opciones: [
            { valor: "web", etiqueta: "Web" },
            { valor: "redes", etiqueta: "Redes" },
          ],
        },
      ],
    });
    return p;
  };

  it("estaMarcada reconoce la opción elegida, la respuesta de un sí o no y una de varias", () => {
    expect(estaMarcada("hospital", "hospital")).toBe(true);
    expect(estaMarcada("consultorio", "hospital")).toBe(false);
    expect(estaMarcada({ respuesta: "no" }, "no")).toBe(true);
    expect(estaMarcada({ respuesta: "si" }, "no")).toBe(false);
    expect(estaMarcada(["web", "redes"], "redes")).toBe(true);
    expect(estaMarcada(["web"], "redes")).toBe(false);
    expect(estaMarcada(undefined, "x")).toBe(false);
    expect(estaMarcada(12, "12")).toBe(false);
  });

  it("la casilla elegida lleva una X y las otras quedan en blanco, sin decir No consigna", () => {
    const p = conCasillas();
    const hospital: Zona = { ...renglon, texto: "{{lugar_x=hospital}}" };
    const consultorio: Zona = { ...renglon, texto: "{{lugar_x=consultorio}}" };
    expect(textoDeZona(hospital, p, { lugar_x: "hospital" }, hoy, "sellado")).toEqual({ texto: MARCA_DE_CASILLA, vacia: false });
    expect(textoDeZona(consultorio, p, { lugar_x: "hospital" }, hoy, "sellado")).toEqual({ texto: "", vacia: false });
    expect(textoDeZona({ ...renglon, texto: "{{acepta=no}}" }, p, { acepta: { respuesta: "no" } }, hoy, "sellado").texto).toBe("X");
    expect(textoDeZona({ ...renglon, texto: "{{medios=redes}}" }, p, { medios: ["redes"] }, hoy, "sellado").texto).toBe("X");
    // Sin responder, la casilla está vacía como cualquier zona.
    expect(textoDeZona(hospital, p, {}, hoy, "borrador").vacia).toBe(true);
  });

  it("el esquema rechaza una casilla de un campo sin opciones o de una opción que no existe", () => {
    const sinOpciones = copia(conducto);
    sinOpciones.lamina!.zonas[0].texto = "{{lugar=hospital}}";
    const r1 = plantillaSchema.safeParse(sinOpciones);
    expect(r1.success ? [] : r1.error.issues.map((i) => i.message)).toContain("la zona lugar_fecha marca una casilla de un campo sin opciones: lugar");

    const p = conCasillas();
    p.cuerpo.push({ t: "parrafo", texto: "{{lugar_x}} {{acepta}} {{medios}}" });
    p.lamina!.zonas.push(
      { id: "c1", pagina: 1, x: 10, y: 10, ancho: 10, texto: "{{lugar_x=quirofano}}" },
      { id: "c2", pagina: 1, x: 10, y: 20, ancho: 10, texto: "{{acepta=tal_vez}}" },
      { id: "c3", pagina: 1, x: 10, y: 30, ancho: 10, texto: "{{medios=web}}" },
    );
    const r2 = plantillaSchema.safeParse(p);
    const mensajes = r2.success ? [] : r2.error.issues.map((i) => i.message);
    expect(mensajes).toContain("la zona c1 marca una opción que lugar_x no tiene: quirofano");
    expect(mensajes).toContain("la zona c2 marca una opción que acepta no tiene: tal_vez");
    expect(mensajes.some((m) => m.startsWith("la zona c3"))).toBe(false);
  });
});

describe("la sangría", () => {
  const parrafo: Zona = { id: "p", pagina: 1, x: 86, y: 300, ancho: 400, lineas: 3, interlineado: 12, texto: "{{x}}" };

  it("el primer renglón empieza corrido y es más angosto; los demás usan todo el ancho", () => {
    const texto = "palabra ".repeat(40).trim();
    const sin = componerZona(parrafo, texto);
    const con = componerZona({ ...parrafo, sangria: 150 }, texto);
    expect(con.lineas[0].x).toBe(236);
    expect(con.lineas[1].x).toBe(86);
    expect(anchoEnUnidades(con.lineas[0].texto) * con.tamano).toBeLessThanOrEqual(250 * 1000);
    expect(con.lineas[0].texto.length).toBeLessThan(sin.lineas[0].texto.length);
  });

  it("envolver respeta el ancho del primer renglón aunque empiece con un párrafo vacío o una palabra que no entra", () => {
    expect(envolver("uno dos tres", 1000, 10, 25)).toEqual(["uno", "dos tres"]);
    expect(envolver("\nuno dos", 1000, 10, 1)).toEqual(["", "uno dos"]);
    const partida = envolver("Mariajosefernandezdelacolina", 1000, 10, 40);
    expect(anchoEnUnidades(partida[0]) * 10).toBeLessThanOrEqual(40 * 1000);
    expect(partida.join("")).toBe("Mariajosefernandezdelacolina");
  });

  it("centra el primer renglón en su tramo corrido", () => {
    const z = componerZona({ ...parrafo, lineas: 1, sangria: 100, alinear: "centro" }, "07");
    expect(z.lineas[0].x).toBeCloseTo(86 + 100 + (300 - (1112 * 10) / 1000) / 2, 2);
  });

  it("el esquema rechaza una sangría que no deja lugar", () => {
    const p = copia(conducto);
    p.lamina!.zonas[0].sangria = p.lamina!.zonas[0].ancho;
    const r = plantillaSchema.safeParse(p);
    expect(r.success ? [] : r.error.issues.map((i) => i.message)).toContain("la zona lugar_fecha tiene una sangría que no deja lugar");
  });
});

describe("envolver", () => {
  it("corta por palabra, respeta los saltos y parte una palabra que no entra sola", () => {
    expect(envolver("uno dos", 1000, 10)).toEqual(["uno dos"]);
    expect(envolver("uno\n\ndos", 1000, 10)).toEqual(["uno", "", "dos"]);
    expect(envolver("uno dos tres", 25, 10)).toEqual(["uno", "dos", "tres"]);
    const partida = envolver("Mariajosefernandezdelacolina", 60, 10);
    expect(partida.length).toBeGreaterThan(1);
    expect(partida.join("")).toBe("Mariajosefernandezdelacolina");
    // Tan angosta que ni un carácter entra: un carácter por renglón, sin
    // renglones en blanco.
    expect(envolver("abc", 1, 10)).toEqual(["a", "b", "c"]);
    expect(envolver("a\tb", 1000, 10)).toEqual(["a b"]);
  });
});

describe("componer una zona", () => {
  it("se queda en 10 pt si entra", () => {
    const z = componerZona(renglon, "Ana Pérez");
    expect(z).toMatchObject({ zona: "r", pagina: 1, tamano: 10, desborda: false });
    expect(z.lineas).toEqual([{ x: 100, y: 100, texto: "Ana Pérez" }]);
  });

  it("achica de a medio punto hasta que entra", () => {
    const z = componerZona(renglon, "María José Fernández de la Colina");
    expect(z.tamano).toBeLessThan(10);
    expect(z.tamano % 0.5).toBe(0);
    expect(z.desborda).toBe(false);
    expect(anchoEnUnidades(z.lineas[0].texto) * z.tamano).toBeLessThanOrEqual(renglon.ancho * 1000);
  });

  it("si ni al mínimo entra, desborda y se queda con los renglones que tiene", () => {
    const z = componerZona({ ...renglon, lineas: 2 }, "palabra ".repeat(60));
    expect(z.desborda).toBe(true);
    expect(z.tamano).toBe(6);
    expect(z.lineas).toHaveLength(2);
    // Los renglones siguen los del papel aunque la letra se achique.
    expect(z.lineas[1].y).toBe(112);
  });

  it("centra cada renglón en su tramo", () => {
    const z = componerZona({ ...renglon, ancho: 16.2, alinear: "centro" }, "07");
    expect(z.lineas[0].x).toBeCloseTo(100 + (16.2 - (1112 * 10) / 1000) / 2, 2);
  });

  it("respeta el tamaño, el mínimo y el interlineado que declare la zona", () => {
    const z = componerZona({ ...renglon, tamano: 12, minimo: 11, lineas: 2, interlineado: 14 }, "uno dos tres cuatro cinco seis siete ocho nueve diez");
    expect(z.tamano).toBeGreaterThanOrEqual(11);
    if (z.lineas.length > 1) expect(z.lineas[1].y).toBe(114);
  });
});

describe("el texto de una zona", () => {
  const zonaDeLugar = conducto.lamina!.zonas.find((z) => z.id === "lugar_fecha")!;
  const zonaDelDia = conducto.lamina!.zonas.find((z) => z.id === "proxima_consulta_dia")!;

  it("pone los valores, la fecha del sistema y las partes de una fecha", () => {
    expect(textoDeZona(zonaDeLugar, conducto, { lugar: "Córdoba" }, hoy, "borrador")).toEqual({ texto: "Córdoba, 28/09/2026", vacia: false });
    expect(textoDeZona(zonaDelDia, conducto, { proxima_consulta_fecha: "2026-10-05" }, hoy, "borrador").texto).toBe("05");
  });

  it("está vacía si ningún campo está cargado; la fecha del sistema no cuenta", () => {
    expect(textoDeZona(zonaDeLugar, conducto, {}, hoy, "borrador").vacia).toBe(true);
    const soloFecha: Zona = { ...renglon, texto: "{{sistema.fecha}}" };
    expect(textoDeZona(soloFecha, conducto, {}, hoy, "borrador")).toEqual({ texto: "28/09/2026", vacia: false });
  });

  it("un campo vacío junto a otros cargados queda en blanco en el borrador y dice No consigna al terminar", () => {
    const dos: Zona = { ...renglon, texto: "{{lugar}} / {{suscribe_dni}}" };
    expect(textoDeZona(dos, conducto, { lugar: "Córdoba" }, hoy, "borrador").texto).toBe("Córdoba / ");
    expect(textoDeZona(dos, conducto, { lugar: "Córdoba" }, hoy, "sellado").texto).toBe(`Córdoba / ${NO_CONSIGNA}`);
  });

  it("una marca a un campo que no existe no escribe nada, y los saltos de Windows se normalizan", () => {
    expect(textoDeZona({ ...renglon, texto: "{{no_existe}}" }, conducto, {}, hoy, "borrador")).toEqual({ texto: "", vacia: false });
    expect(textoDeZona({ ...renglon, texto: "{{indicaciones}}" }, conducto, { indicaciones: "a\r\nb\rc" }, hoy, "borrador").texto).toBe("a\nb\nc");
  });

  it("los campos de una zona, sin la fecha del sistema", () => {
    expect(camposDeZona(zonaDeLugar)).toEqual(["lugar"]);
  });
});

describe("la lámina entera", () => {
  it("en un borrador, una zona vacía no escribe nada (la pantalla dibuja la pista)", () => {
    const lamina = armarLamina(conducto, { lugar: "Córdoba" }, hoy, "borrador");
    expect(lamina).toHaveLength(conducto.lamina!.zonas.length);
    const indicaciones = lamina.find((z) => z.zona === "indicaciones")!;
    expect(indicaciones).toMatchObject({ vacia: true, lineas: [], desborda: false, tamano: 10 });
  });

  it("terminada, lo vacío dice No consigna, o lo que la zona declare", () => {
    const lamina = armarLamina(conducto, {}, hoy, "sellado");
    expect(lamina.find((z) => z.zona === "indicaciones")!.lineas[0].texto).toBe(NO_CONSIGNA);
    expect(lamina.find((z) => z.zona === "proxima_consulta_dia")!.lineas[0].texto).toBe("—");
  });

  it("lo que no entra es un error en el primer campo de su zona", () => {
    const largo = "Indicación muy larga que no entra. ".repeat(60);
    expect(validarLamina(conducto, { indicaciones: largo, medicacion: largo }, hoy)).toEqual([
      { campo: "indicaciones", mensaje: "No entra en el espacio del documento: acortalo." },
      { campo: "medicacion", mensaje: "No entra en el espacio del documento: acortalo." },
    ]);
    expect(validarLamina(conducto, { indicaciones: "Poco." }, hoy)).toEqual([]);
  });

  it("una zona sin campos que desborda nombra la zona, y dos zonas del mismo campo dan un error solo", () => {
    const base = copia(conducto);
    base.lamina!.zonas.push(
      { id: "extra_uno", pagina: 1, x: 10, y: 10, ancho: 1, texto: "{{sistema.fecha}} {{sistema.fecha}}", minimo: 9 },
      { id: "extra_dos", pagina: 1, x: 10, y: 20, ancho: 1, texto: "{{lugar}} {{lugar}}", minimo: 9 },
      { id: "extra_tres", pagina: 1, x: 10, y: 30, ancho: 1, texto: "{{lugar}} {{lugar}}", minimo: 9 },
    );
    const errores = validarLamina(base, { lugar: "Córdoba" }, hoy);
    expect(errores.map((e) => e.campo)).toEqual(["extra_uno", "lugar"]);
  });

  it("una plantilla sin lámina no tiene nada que componer", () => {
    const { lamina: _, ...sinLamina } = conducto;
    expect(armarLamina(sinLamina as Plantilla, {}, hoy, "sellado")).toEqual([]);
    expect(validarLamina(sinLamina as Plantilla, {}, hoy)).toEqual([]);
  });
});

describe("el esquema de la lámina", () => {
  function conLamina(cambio: (l: NonNullable<Plantilla["lamina"]>) => void): string[] {
    const p = copia(conducto);
    cambio(p.lamina!);
    const r = plantillaSchema.safeParse(p);
    return r.success ? [] : r.error.issues.map((i) => i.message);
  }

  it("la de conducto es válida", () => {
    expect(conLamina(() => {})).toEqual([]);
  });

  it("rechaza zonas repetidas, fuera de página o de la página, y un mínimo mayor que el tamaño", () => {
    expect(conLamina((l) => l.zonas.push({ ...l.zonas[0] }))).toContain("zona repetida: lugar_fecha");
    expect(conLamina((l) => (l.zonas[0].pagina = 3))).toContain("la zona lugar_fecha está en una página que no existe");
    expect(conLamina((l) => (l.zonas[0].x = 600))).toContain("la zona lugar_fecha se sale de la página");
    expect(conLamina((l) => (l.zonas[0].minimo = 12))).toContain("la zona lugar_fecha tiene un mínimo mayor que su tamaño");
  });

  it("rechaza marcas a campos que no existen, partes de algo que no es fecha y campos que no aparecen", () => {
    expect(conLamina((l) => (l.zonas[0].texto = "{{no_existe}}"))).toContain("la zona lugar_fecha marca un campo que no existe: no_existe");
    expect(conLamina((l) => (l.zonas[0].texto = "{{lugar:dia}}"))).toContain("la zona lugar_fecha parte un campo que no es fecha: lugar");
    expect(conLamina((l) => (l.zonas = l.zonas.filter((z) => z.id !== "medicacion")))).toContain("el campo medicacion no aparece en la lámina");
  });

  it("exige un lugar para cada firma, y solo para las que la plantilla pide", () => {
    expect(conLamina((l) => l.firmas.push({ ...l.firmas[0] }))).toContain("lugar de firma repetido: paciente");
    expect(conLamina((l) => l.firmas.push({ ...l.firmas[0], rol: "testigo_1" }))).toContain(
      "la lámina ubica una firma que la plantilla no pide: testigo_1",
    );
    expect(conLamina((l) => (l.firmas = l.firmas.slice(1)))).toContain("la lámina no ubica la firma paciente");
    expect(conLamina((l) => (l.firmas[0].pagina = 2))).toContain("la firma paciente está en una página que no existe");
  });
});
