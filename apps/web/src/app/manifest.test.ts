import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "./manifest";

// El manifiesto (TR-179) es lo que deja instalar PRISMA en la pantalla de
// inicio — y en iPhone, lo único que habilita los avisos.
describe("manifest", () => {
  const m = manifest();

  it("se instala como app y arranca en la elección de clínica", () => {
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/clinicas");
    expect(m.name).toBe("PRISMA");
  });

  // Un ícono que no existe no rompe nada visible: el navegador
  // simplemente no ofrece instalar. Por eso se chequea acá.
  it("todos sus íconos existen en public/, y hay uno adaptable (maskable) para Android", () => {
    for (const icono of m.icons ?? []) {
      expect(existsSync(join(__dirname, "../../public", icono.src)), icono.src).toBe(true);
    }
    expect(m.icons?.some((i) => i.purpose === "maskable")).toBe(true);
  });

  it("los íconos que usa el service worker también existen", () => {
    for (const src of ["/icons/icono-192.png", "/icons/insignia-96.png"]) {
      expect(existsSync(join(__dirname, "../../public", src)), src).toBe(true);
    }
  });
});
