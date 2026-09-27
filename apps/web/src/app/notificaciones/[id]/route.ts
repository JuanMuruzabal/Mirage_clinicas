import { apiAbrirNotificacion } from "@/lib/api";
import { destinoDeApertura } from "@/lib/notificaciones";
import { getSessionToken } from "@/lib/session";

// /notificaciones/<id> — adonde lleva tocar un aviso en el celular (TR-179).
// El service worker no puede llamar a una Server Action: abre esta URL, y
// acá se hace lo mismo que "Ver turno" en la bandeja — la API marca la
// notificación como leída y deja la sesión en la clínica (y, para
// recepción, en la agenda) donde el turno se ve — y se redirige al turno.
//
// Location relativa a propósito: detrás del proxy de Render la URL del
// pedido puede traer el host interno, y un redirect absoluto armado con
// ella mandaría al visitante a una dirección que no existe afuera.
export async function GET(_request: Request, ctx: RouteContext<"/notificaciones/[id]">) {
  const { id } = await ctx.params;
  const token = await getSessionToken();
  if (!token) return irA("/ingresar");
  const res = await apiAbrirNotificacion(token, id);
  if (!res.ok) return irA("/clinicas");
  return irA(destinoDeApertura(res.data) ?? "/clinicas");
}

function irA(destino: string): Response {
  return new Response(null, { status: 303, headers: { Location: destino } });
}
