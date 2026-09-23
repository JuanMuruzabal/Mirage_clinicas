import type { Metadata } from "next";
import { apiGetPaginaPublica } from "@/lib/api";
import { redirect } from "next/navigation";
import { getSessionToken, requireOnboardingComplete } from "@/lib/session";
import { PaginaEditor } from "@/components/pagina-editor";

export const metadata: Metadata = { title: "Tu página — PRISMA" };

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
  const sesion = await requireOnboardingComplete();
  // El rol se verifica en la PANTALLA, no solo en la tarjeta que lleva
  // acá (corrección del 2026-09-14). El backend ya rechaza cada acción
  // de quien no es `admin`, pero sin esto un profesional podía abrir el
  // editor por URL y ver la página entera antes de que nada fallara —
  // esconder el botón nunca fue cerrar la puerta.
  if (!sesion.roles.includes("admin")) {
    redirect("/seleccionar-servicio");
  }
  const token = await getSessionToken();
  const paginaResult = token ? await apiGetPaginaPublica(token) : null;
  const pagina = paginaResult?.ok
    ? paginaResult.data
    : {
        oculta: false,
        deployadaEn: null,
        tema: "",
        temaVariante: "",
        temaTipografia: "",
        redesSociales: {},
        mostrarMapa: false,
        nombreSobrePortada: false,
        nombreColor: "",
        temaTokens: {},
        seoTitulo: "",
        seoDescripcion: "",
        modulos: [],
        estadisticas: {},
        revision: 0,
        actualizadaEn: new Date(0).toISOString(),
      };

  return (
    <main className="flex flex-1 flex-col gap-6 bg-hueso px-8 py-10 pt-[calc(var(--header-height)+2.5rem)]">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium text-grafito">Tu página</h1>
      <PaginaEditor sesion={sesion} paginaInicial={pagina} />
    </main>
  );
}
