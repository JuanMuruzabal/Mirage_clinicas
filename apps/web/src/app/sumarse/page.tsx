import type { Metadata } from "next";
import { getMe, redirectSiEmailVerificado } from "@/lib/session";
import { SumarseWizard } from "./sumarse-wizard";
import { FondoOndas } from "@/components/fondo-ondas";

export const metadata: Metadata = { title: "Sumate — PRISMA" };

// Crear cuenta + confirmar el código (spec §4 Paso 1) — reestructuración
// del 2026-08-26 (docs/Arquitectura y base/tradeoffs.md TR-057): perfil profesional y clínica
// ya NO viven acá, pasaron al modal de "bienvenida" sobre
// /seleccionar-servicio. Apenas el mail queda verificado, se redirige ahí
// directo — este componente ya no necesita el catálogo de especialidades
// (eso lo carga /seleccionar-servicio para su propio modal). Identidad
// cálida (TR-015 en docs/Arquitectura y base/tradeoffs.md).
export default async function SumarsePage() {
  const me = await getMe();

  await redirectSiEmailVerificado(me);

  return (
    <>
      {/* FondoOndas (correcciones generales, ítem 1, 2026-10-10): el fondo
          de ondas de toda la app, en lugar de las crucecitas y del hueso
          plano. Va afuera de <main>, fijo y detrás del contenido. */}
      <FondoOndas />
      <main className="flex flex-1 flex-col items-center gap-8 px-6 py-16">
        <SumarseWizard me={me} />
      </main>
    </>
  );
}
