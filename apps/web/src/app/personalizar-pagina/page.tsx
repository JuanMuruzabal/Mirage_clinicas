import type { Metadata } from "next";
import { apiGetPaginaPublica } from "@/lib/api";
import { getSessionToken, requireProfesional } from "@/lib/session";
import { PaginaEditor } from "@/components/pagina-editor";

export const metadata: Metadata = { title: "Tu página — Dental Mirage" };

// /personalizar-pagina (T4.1/T4.2, spec §5) — área propia, separada de
// gestión de clínica (pedido explícito del cliente, 2026-08-23:
// "personalizar pagina es una pagina aparte por fuera de gestiona
// clinica... si doy click a tu pagina desde gestion clinica me lleva a
// esta pagina de edicion"). No vive bajo /panel/** — sin el sidebar de
// navegación de clínica ni la textura de fondo de esas 4 pantallas (esa
// sigue acotada a General/Calendario/Turnos/Pacientes, ver
// panel/layout.tsx), con más espacio propio para el editor. Requiere
// sesión igual que /panel — acá el guard es directo (`requireProfesional`)
// en vez de heredarlo de un layout compartido.
export default async function PersonalizarPaginaPage() {
  const profesional = await requireProfesional();
  const token = await getSessionToken();
  const paginaResult = token ? await apiGetPaginaPublica(token) : null;
  const pagina = paginaResult?.ok ? paginaResult.data : { oculta: false, deployadaEn: null };

  return (
    <main className="flex flex-1 flex-col gap-6 bg-hueso px-8 py-10 pt-[calc(var(--header-height)+2.5rem)]">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium text-grafito">Tu página</h1>
      <PaginaEditor profesional={profesional} paginaInicial={pagina} />
    </main>
  );
}
