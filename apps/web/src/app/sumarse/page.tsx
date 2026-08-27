import type { Metadata } from "next";
import { getMe, redirectSiEmailVerificado } from "@/lib/session";
import { SumarseWizard } from "./sumarse-wizard";

export const metadata: Metadata = { title: "Sumate — Dental Mirage" };

// Crear cuenta + confirmar el código (spec §4 Paso 1) — reestructuración
// del 2026-08-26 (docs/tradeoffs.md TR-057): perfil profesional y clínica
// ya NO viven acá, pasaron al modal de "bienvenida" sobre
// /seleccionar-servicio. Apenas el mail queda verificado, se redirige ahí
// directo — este componente ya no necesita el catálogo de especialidades
// (eso lo carga /seleccionar-servicio para su propio modal). Identidad
// cálida (TR-015 en docs/tradeoffs.md).
export default async function SumarsePage() {
  const me = await getMe();

  await redirectSiEmailVerificado(me);

  return (
    // panel-texture (TR-073 en docs/tradeoffs.md, 2026-08-27, pedido
    // explícito del cliente): mismo fondo texturizado que /panel — antes
    // reservado solo a gestión de clínica (TR-013), ahora también en
    // ingresar/sumarse.
    <main className="panel-texture flex flex-1 flex-col items-center gap-8 px-6 py-16">
      <SumarseWizard me={me} />
    </main>
  );
}
