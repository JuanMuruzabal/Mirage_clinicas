import { apiDescargarPDFDocumento } from "@/lib/api";
import { getSessionToken } from "@/lib/session";

// GET /panel/documentos/{id}/pdf — el PDF de un documento terminado (Fase
// 5.3, TR-185), que la API genera en cada pedido. El navegador nunca le
// habla a la API (BFF): esta ruta le pide el PDF con la sesión de la cookie
// y lo devuelve tal cual, con el Content-Disposition (attachment para
// descargar; inline con `?para=imprimir`, para abrirlo en una pestaña e
// imprimirlo) y el Cache-Control de la API. El Content-Type va fijo en
// application/pdf.
//
// Quién puede bajarlo lo decide la API, no esta ruta: solo profesionales
// (403 para el resto), y solo un documento que veo (404 para lo demás). Un
// error de la API vuelve con su código y su mensaje en texto plano: esta
// ruta la abre un link, no una pantalla que sepa leer JSON.
export async function GET(request: Request, ctx: RouteContext<"/panel/documentos/[id]/pdf">) {
  const token = await getSessionToken();
  if (!token) {
    return new Response("Iniciá sesión para descargar el documento.", {
      status: 401,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  const { id } = await ctx.params;
  const paraImprimir = new URL(request.url).searchParams.get("para") === "imprimir";
  const res = await apiDescargarPDFDocumento(token, id, paraImprimir);
  if (!res.ok) {
    return new Response(res.error, {
      status: res.status === 0 ? 502 : res.status,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  const headers: Record<string, string> = {
    // Un PDF y nada más: lo que conteste la API se sirve desde nuestro
    // origen, y un tipo activo serviría contenido ejecutable desde acá.
    "Content-Type": "application/pdf",
    "Cache-Control": res.cacheControl ?? "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Length": String(res.datos.byteLength),
  };
  if (res.contentDisposition) headers["Content-Disposition"] = res.contentDisposition;
  return new Response(res.datos, { status: 200, headers });
}
