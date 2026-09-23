import { describe, expect, it } from "vitest";
import type { ClinicaPublica } from "@dental-mirage/shared-types";
import {
  descripcionSeoPorDefecto,
  horariosSchemaOrg,
  jsonLdDeClinica,
  MAX_LARGO_SEO_DESCRIPCION,
  MAX_LARGO_SEO_TITULO,
  recortar,
  seoDeClinica,
  serializarJsonLd,
  textoSeo,
  tipoSchemaOrg,
  tituloSeoPorDefecto,
} from "./seo";

const clinica = (parcial: Partial<ClinicaPublica> = {}): ClinicaPublica => ({
  slug: "clinica-sol",
  nombreClinica: "Clínica Sol",
  profesionalNombre: "Ana Pérez",
  telefono: "+5493511111111",
  telefonoClinica: "+5493512222222",
  especialidades: ["Ortodoncia", "Endodoncia"],
  oculta: false,
  enPreparacion: false,
  tema: "",
  temaVariante: "",
  temaTipografia: "",
  redesSociales: {},
  mostrarMapa: false,
  direccion: "Av. Colón 1240",
  ciudad: "Córdoba",
  provincia: "Córdoba",
  nombreSobrePortada: false,
  nombreColor: "",
  temaTokens: {},
  modulos: [],
  estadisticas: {},
  personalizada: true,
  ...parcial,
});

describe("textos por defecto", () => {
  it("arma el título con el nombre, hasta dos especialidades y la ciudad", () => {
    expect(tituloSeoPorDefecto({ nombreClinica: "Clínica Sol", especialidades: ["Ortodoncia", "Endodoncia", "Implantes"], ciudad: "Córdoba" })).toBe(
      "Clínica Sol — Ortodoncia y Endodoncia en Córdoba",
    );
    expect(tituloSeoPorDefecto({ nombreClinica: "Clínica Sol", especialidades: [], ciudad: null })).toBe("Clínica Sol — Turnos online");
  });

  it("la descripción usa la bio si hay, y si no una frase con lo que ofrece", () => {
    expect(descripcionSeoPorDefecto({ nombreClinica: "Sol", especialidades: [], bio: "  Cuidamos\n tu sonrisa. " })).toBe("Cuidamos tu sonrisa.");
    expect(descripcionSeoPorDefecto({ nombreClinica: "Sol", especialidades: ["Ortodoncia"], ciudad: "Córdoba" })).toBe(
      "Pedí turno online en Sol: Ortodoncia, en Córdoba.",
    );
  });

  it("nunca pasan del largo que muestra un buscador", () => {
    const largo = "palabra ".repeat(60);
    expect(tituloSeoPorDefecto({ nombreClinica: largo, especialidades: [] }).length).toBeLessThanOrEqual(MAX_LARGO_SEO_TITULO);
    expect(descripcionSeoPorDefecto({ nombreClinica: "Sol", especialidades: [], bio: largo }).length).toBeLessThanOrEqual(MAX_LARGO_SEO_DESCRIPCION);
  });

  it("los del admin ganan, y vacíos o en blanco vuelven al default", () => {
    expect(seoDeClinica(clinica({ seoTitulo: "Mi título", seoDescripcion: "Mi   descripción" }))).toEqual({
      titulo: "Mi título",
      descripcion: "Mi descripción",
    });
    expect(seoDeClinica(clinica({ seoTitulo: "   " })).titulo).toBe("Clínica Sol — Ortodoncia y Endodoncia en Córdoba");
  });
});

describe("recortar / textoSeo", () => {
  it("corta en un espacio y agrega puntos suspensivos", () => {
    expect(recortar("uno dos tres cuatro", 12)).toBe("uno dos…");
    expect(recortar("corto", 12)).toBe("corto");
    // Sin un espacio razonable, corta a mitad de palabra antes que pasarse.
    expect(recortar("supercalifragilístico", 10)).toBe("supercali…");
  });

  it("deja una sola línea sin espacios de más", () => {
    expect(textoSeo("  a \n\t b  ")).toBe("a b");
  });
});

describe("tipoSchemaOrg", () => {
  it("elige el tipo por las especialidades, con odontología primero", () => {
    expect(tipoSchemaOrg(["Nutrición", "Ortodoncia"])).toBe("Dentist");
    expect(tipoSchemaOrg(["ODONTOLOGÍA GENERAL"])).toBe("Dentist");
    expect(tipoSchemaOrg(["Kinesiología"])).toBe("Physiotherapy");
    expect(tipoSchemaOrg(["Nutrición"])).toBe("MedicalClinic");
    expect(tipoSchemaOrg([])).toBe("MedicalClinic");
  });
});

describe("horariosSchemaOrg", () => {
  it("una entrada por franja de cada día abierto, con el día de schema.org", () => {
    const horarios = {
      nota: "",
      dias: [
        { diaSemana: 0 as const, cerrado: true, franjas: [{ desde: "09:00", hasta: "12:00" }] },
        { diaSemana: 1 as const, cerrado: false, franjas: [{ desde: "09:00", hasta: "13:00" }, { desde: "16:00", hasta: "20:00" }] },
      ],
    };
    expect(horariosSchemaOrg(horarios)).toEqual([
      { "@type": "OpeningHoursSpecification", dayOfWeek: "https://schema.org/Monday", opens: "09:00", closes: "13:00" },
      { "@type": "OpeningHoursSpecification", dayOfWeek: "https://schema.org/Monday", opens: "16:00", closes: "20:00" },
    ]);
  });

  it("sin franjas no declara nada (un horario vacío diría 'cerrado siempre')", () => {
    expect(horariosSchemaOrg(undefined)).toBeUndefined();
    expect(horariosSchemaOrg({ nota: "", dias: [{ diaSemana: 1, cerrado: false, franjas: [] }] })).toBeUndefined();
  });
});

describe("jsonLdDeClinica", () => {
  it("resume la vidriera: tipo, nombre, dirección, teléfono de la clínica y redes", () => {
    const datos = jsonLdDeClinica(
      clinica({
        fotoPortadaUrl: "/uploads/abc.w1600.webp",
        redesSociales: { instagram: "@clinicasol", whatsapp: "3511234567" },
      }),
      "https://prisma.test/clinica-sol",
      "https://prisma.test",
    );
    expect(datos).toMatchObject({
      "@context": "https://schema.org",
      "@type": "Dentist",
      name: "Clínica Sol",
      url: "https://prisma.test/clinica-sol",
      telephone: "+5493512222222",
      image: "https://prisma.test/uploads/abc.w1600.webp",
      address: { "@type": "PostalAddress", streetAddress: "Av. Colón 1240", addressLocality: "Córdoba", addressCountry: "AR" },
      sameAs: ["https://instagram.com/clinicasol"],
    });
  });

  it("sin portada usa la imagen para compartir, y omite lo que no hay", () => {
    const datos = jsonLdDeClinica(clinica({ direccion: null, ciudad: null, telefonoClinica: null, telefono: null }), "https://prisma.test/x", "https://prisma.test");
    expect(datos.image).toBe("https://prisma.test/x/opengraph-image");
    expect(datos).not.toHaveProperty("address");
    expect(datos).not.toHaveProperty("telephone");
    expect(datos).not.toHaveProperty("sameAs");
  });

  it("una portada con un esquema raro no llega al JSON-LD", () => {
    expect(jsonLdDeClinica(clinica({ fotoPortadaUrl: "javascript:alert(1)" }), "https://p.test/x", "https://p.test").image).toBe(
      "https://p.test/x/opengraph-image",
    );
  });
});

describe("serializarJsonLd", () => {
  it("escapa '<' para que un texto no pueda cerrar el <script>", () => {
    const html = serializarJsonLd({ name: "</script><script>alert(1)</script>" });
    expect(html).not.toContain("<");
    expect(JSON.parse(html)).toEqual({ name: "</script><script>alert(1)</script>" });
  });
});
