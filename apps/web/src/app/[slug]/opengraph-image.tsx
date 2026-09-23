import { ImageResponse } from "next/og";
import { cargarClinicaPublica } from "@/lib/pagina-publica/cargar";
import { coloresDeTarjeta, familiaDelTitulo, fuenteDelTitulo } from "@/lib/pagina-publica/tarjeta-compartir";

// La imagen que aparece al compartir el link de la clínica (PE-9): WhatsApp,
// redes, un mail. Next la declara sola en `og:image` por la convención del
// nombre del archivo. Colores y tipografía del tema publicado; sin foto a
// propósito — las fotos son WebP (PE-9) y next/og no lee WebP, y una tarjeta
// de texto con los colores de la página se reconoce igual.
//
// Muestra solo lo que ya es público en la página (nombre, especialidades,
// ciudad). Una página en preparación o en mantenimiento muestra solo el
// nombre: su contenido no está publicado.

export const alt = "Página de la clínica";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await cargarClinicaPublica(slug);
  const clinica = result.ok ? result.data : null;
  const publicada = clinica !== null && !clinica.enPreparacion && !clinica.oculta;

  const colores = coloresDeTarjeta(publicada ? clinica.tema : "", publicada ? clinica.temaVariante : "");
  const { familia, peso } = familiaDelTitulo(publicada ? clinica.temaTipografia : "");
  const fuente = await fuenteDelTitulo(familia, peso);

  const nombre = clinica?.nombreClinica ?? "PRISMA";
  const especialidades = publicada ? clinica.especialidades.slice(0, 3).join(" · ") : "";
  const ciudad = publicada ? (clinica.ciudad ?? "") : "";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: colores.fondo,
          color: colores.texto,
        }}
      >
        <div style={{ width: 96, height: 10, borderRadius: 5, background: colores.acento }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              fontFamily: fuente ? familia : undefined,
              fontWeight: peso,
              fontSize: nombre.length > 28 ? 68 : 88,
              lineHeight: 1.05,
              maxWidth: 1000,
            }}
          >
            {nombre}
          </div>
          {especialidades && <div style={{ fontSize: 34, opacity: 0.75 }}>{especialidades}</div>}
          {ciudad && <div style={{ fontSize: 30, opacity: 0.6 }}>{ciudad}</div>}
        </div>
        {publicada ? (
          <div style={{ display: "flex" }}>
            <div
              style={{
                display: "flex",
                padding: "16px 32px",
                borderRadius: 999,
                background: colores.acento,
                color: colores.sobreAcento,
                fontSize: 30,
              }}
            >
              Pedí tu turno online
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 30, opacity: 0.6 }}>{clinica?.enPreparacion ? "Página en preparación" : ""}</div>
        )}
      </div>
    ),
    {
      ...size,
      fonts: fuente ? [{ name: familia, data: fuente, weight: peso as 400, style: "normal" }] : undefined,
      // Una hora: WhatsApp y las redes guardan su propia copia igual, y así
      // un cambio de tema publicado se ve en la próxima vista previa sin
      // regenerar la imagen en cada pedido.
      headers: { "Cache-Control": "public, max-age=3600" },
    },
  );
}
