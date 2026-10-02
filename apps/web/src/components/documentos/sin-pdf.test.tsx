import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { DocumentoResumen } from "@dental-mirage/shared-types";
import { aFirmar, borrador, conLamina, paraImprimir, sellado, trazo } from "./fixtures";
import { tienePDF } from "./acciones-de-pdf";

// Un documento terminado SIN PDF (Fase 5.3, correcciones): lo dice la API
// con `tienePDF: false` — uno sellado en la 5.1, antes de que se congelara
// la composición de la lámina. Se ve en pantalla, sin Imprimir (el del PDF)
// ni Descargar PDF, ni en la vista ni en las filas de las listas. Y un
// consentimiento anterior a TR-188, sin folio, sí lo tiene.

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/app/actions/documentos", () => ({ firmarDocumentoAction: vi.fn(), registrarImpresionAction: vi.fn() }));
vi.mock("./lienzo-de-firma", () => ({
  LienzoDeFirma: ({ onCambio }: { onCambio: (t: unknown) => void }) => (
    <button type="button" onClick={() => onCambio(trazo())}>
      Dibujar firma
    </button>
  ),
}));

const { VistaDeDocumento } = await import("./vista-de-documento");
const { TablaDeDocumentos } = await import("./tablas-de-documentos");
const { RegistroDeDocumentos } = await import("./registro-de-documentos");

beforeEach(() => vi.clearAllMocks());

describe("tienePDF: el dato de la API manda", () => {
  it.each<[DocumentoResumen["estado"], boolean, boolean]>([
    ["sellado", true, true],
    ["sellado", false, false],
    ["para_imprimir", true, true],
    ["para_imprimir", false, false],
    // Un borrador o uno a firmar, nunca: aunque la API dijera true.
    ["borrador", true, false],
    ["a_firmar", true, false],
    ["anulado", true, false],
    ["borrador", false, false],
  ])("%s con tienePDF=%s → %s", (estado, dato, esperado) => {
    expect(tienePDF({ estado, tienePDF: dato })).toBe(esperado);
  });

  it("los fixtures de la API: los terminados lo traen en true, los demás en false", () => {
    expect(sellado().tienePDF).toBe(true);
    expect(paraImprimir().tienePDF).toBe(true);
    expect(aFirmar().tienePDF).toBe(false);
    expect(borrador().tienePDF).toBe(false);
  });
});

function filaDe(id: string): HTMLElement {
  const link = screen
    .getAllByRole("link")
    .find((a) => a.getAttribute("href") === `/panel/documentos/${id}` && !a.getAttribute("aria-label"));
  return link?.closest("tr") as HTMLElement;
}

describe("TablaDeDocumentos: una fila sin PDF no ofrece acciones", () => {
  it("sellado y para imprimir sin PDF, sin Imprimir ni Descargar; los que tienen, sí", () => {
    render(
      <TablaDeDocumentos
        documentos={[
          { ...sellado(), id: "viejo", folio: 1, tienePDF: false },
          { ...paraImprimir(), id: "papel-viejo", folio: 2, tienePDF: false },
          { ...sellado(), id: "nuevo", folio: 3 },
          { ...paraImprimir(), id: "papel", folio: 4 },
        ]}
        vacio="nada"
      />,
    );
    for (const id of ["viejo", "papel-viejo"]) {
      const fila = filaDe(id);
      expect(within(fila).queryByRole("link", { name: /^Imprimir/ })).not.toBeInTheDocument();
      expect(within(fila).queryByRole("link", { name: /^Descargar PDF/ })).not.toBeInTheDocument();
    }
    for (const id of ["nuevo", "papel"]) {
      const fila = filaDe(id);
      expect(within(fila).getByRole("link", { name: /^Imprimir/ })).toHaveAttribute("href", `/panel/documentos/${id}/pdf?para=imprimir`);
      expect(within(fila).getByRole("link", { name: /^Descargar PDF/ })).toHaveAttribute("href", `/panel/documentos/${id}/pdf`);
    }
  });

  it("un consentimiento sin folio (anterior a TR-188): la columna dice — y el PDF se ofrece igual", () => {
    render(<TablaDeDocumentos documentos={[{ ...paraImprimir(), id: "sin-folio", folio: undefined }]} vacio="nada" />);
    const fila = filaDe("sin-folio");
    expect(within(fila).getAllByRole("cell")[0]).toHaveTextContent("—");
    expect(within(fila).getByRole("link", { name: /^Descargar PDF/ })).toHaveAttribute("href", "/panel/documentos/sin-folio/pdf");
  });
});

describe("RegistroDeDocumentos: las filas siguen el tienePDF de cada documento", () => {
  it("el sellado de la 5.1 sin acciones, el resto con", () => {
    render(
      <RegistroDeDocumentos
        documentos={[
          { ...sellado(), id: "viejo", folio: 1, tienePDF: false, selladoEn: "2026-09-10T10:00:00-03:00" },
          { ...paraImprimir(), id: "papel", folio: 2, terminadoEn: "2026-09-28T10:00:00-03:00" },
        ]}
      />,
    );
    expect(within(filaDe("viejo")).queryByRole("link", { name: /^Descargar PDF/ })).not.toBeInTheDocument();
    expect(within(filaDe("papel")).getByRole("link", { name: /^Descargar PDF/ })).toBeInTheDocument();
  });
});

describe("VistaDeDocumento: sin PDF", () => {
  it("un sellado sin PDF muestra 'Sin PDF', sin botones ni código de verificación", () => {
    render(<VistaDeDocumento documento={{ ...sellado(), tienePDF: false, codigoVerificacion: "04HM-ASW9" }} />);
    const bloque = screen.getByRole("heading", { name: "Sin PDF" }).closest("section") as HTMLElement;
    expect(bloque).toHaveTextContent("se selló antes de que existiera la lámina");
    expect(within(bloque).queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "PDF del documento" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Descargar PDF" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Imprimir/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Imprimir" })).not.toBeInTheDocument();
    expect(screen.queryByText("04HM-ASW9")).not.toBeInTheDocument();
    expect(screen.queryByText(/Código de verificación/)).not.toBeInTheDocument();
    // Se sigue viendo como sellado.
    expect(screen.getByRole("heading", { name: "Firmado y sellado" })).toBeInTheDocument();
  });

  it("un sellado con PDF no muestra 'Sin PDF'", () => {
    render(<VistaDeDocumento documento={conLamina(sellado())} />);
    expect(screen.queryByRole("heading", { name: "Sin PDF" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "PDF del documento" })).toBeInTheDocument();
  });

  it("un para imprimir sin PDF conserva su Imprimir de siempre, sin Descargar PDF ni 'Sin PDF'", () => {
    render(<VistaDeDocumento documento={conLamina(paraImprimir({ tienePDF: false }))} />);
    expect(screen.getByRole("button", { name: "Imprimir" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Descargar PDF" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Imprimir/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Sin PDF" })).not.toBeInTheDocument();
  });

  it("un para imprimir sin folio se ve y ofrece su PDF", () => {
    render(<VistaDeDocumento documento={conLamina(paraImprimir({ folio: undefined }))} />);
    expect(screen.getByRole("button", { name: "Imprimir" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Descargar PDF" })).toHaveAttribute("href", "/panel/documentos/doc-1/pdf");
    expect(screen.queryByText(/undefined/)).not.toBeInTheDocument();
  });
});
