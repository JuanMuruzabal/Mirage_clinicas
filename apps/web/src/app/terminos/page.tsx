import type { Metadata } from "next";
import Link from "next/link";
import { CONTACTO_EMAIL } from "@/lib/contacto";

export const metadata: Metadata = {
  title: "Términos y condiciones — Dental Mirage",
  description: "Términos y condiciones de uso de la plataforma Dental Mirage.",
};

// Página pública de un solo segmento (/terminos) — sin esto, cae en la
// ruta dinámica /[slug] (página pública de una clínica) y muestra un 404
// real, porque no existe ninguna clínica con ese slug. Bug real reportado
// por el cliente, 2026-08-26: el checkbox de "Crear cuenta" (spec §7, Ley
// 25.326) linkeaba acá desde el día 1 de la feature, pero la página nunca
// se construyó. Sumada a "privacidad" en RUTAS_PROPIAS_DE_UN_SEGMENTO
// (lib/site-routes.ts) para que conserve el header/footer del sitio en
// vez del modo "página pública de clínica" (ver TR-050 en
// docs/tradeoffs.md).
//
// Contenido: plantilla base a revisar por el cliente/asesoría legal antes
// de un lanzamiento real — no reemplaza una revisión legal.
export default function TerminosPage() {
  return (
    <main className="flex flex-1 flex-col bg-hueso px-6 py-16 pt-[calc(var(--header-height)+2rem)]">
      <div className="mx-auto w-full max-w-2xl">
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-medium text-grafito sm:text-5xl">
          Términos y condiciones
        </h1>
        <p className="mt-2 text-sm text-grafito/60">Versión 1.0 — última actualización: agosto de 2026.</p>

        <div className="mt-10 flex flex-col gap-8 text-grafito/90">
          <p>
            Estos términos regulan el uso de Dental Mirage, la plataforma que combina gestión de clínica (turnero,
            agenda, pacientes) con una página pública para que tus pacientes pidan turno. Al crear una cuenta,
            aceptás lo siguiente.
          </p>

          <section className="flex flex-col gap-2">
            <h2 className="font-[family-name:var(--font-display)] text-xl font-medium text-grafito">1. Tu cuenta</h2>
            <p>
              Sos responsable de la información que cargás (datos personales, de tu clínica y de tus pacientes) y de
              mantener segura tu contraseña o tu acceso con Google. Podés dar de baja tu cuenta cuando quieras
              escribiéndonos a{" "}
              <a href={`mailto:${CONTACTO_EMAIL}`} className="font-medium text-salvia-oscuro hover:text-grafito">
                {CONTACTO_EMAIL}
              </a>
              .
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="font-[family-name:var(--font-display)] text-xl font-medium text-grafito">
              2. Qué ofrece la plataforma
            </h2>
            <p>
              Un turnero con agenda propia, una página pública de tu clínica con una plantilla fija, y un buscador
              público para que pacientes te encuentren por nombre, profesional o especialidad. La plataforma está en
              una etapa temprana — algunas funciones (edición visual de la página, historia clínica, recordatorios
              automáticos) todavía no están disponibles.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="font-[family-name:var(--font-display)] text-xl font-medium text-grafito">
              3. Uso aceptable
            </h2>
            <p>
              No uses Dental Mirage para cargar información falsa, suplantar a otro profesional o clínica, ni para
              fines distintos de la gestión de tu propia práctica odontológica.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="font-[family-name:var(--font-display)] text-xl font-medium text-grafito">
              4. Disponibilidad y cambios
            </h2>
            <p>
              Hacemos lo posible por mantener el servicio disponible, pero no garantizamos que esté libre de
              interrupciones. Podemos actualizar estos términos — si cambian de forma relevante, te lo vamos a
              avisar y te vamos a pedir que los aceptes de nuevo antes de seguir usando la plataforma.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="font-[family-name:var(--font-display)] text-xl font-medium text-grafito">
              5. Tus datos
            </h2>
            <p>
              El tratamiento de tus datos personales y los de tus pacientes está detallado en nuestra{" "}
              <Link href="/privacidad" className="font-medium text-salvia-oscuro hover:text-grafito">
                política de privacidad
              </Link>
              .
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="font-[family-name:var(--font-display)] text-xl font-medium text-grafito">
              6. Ley aplicable
            </h2>
            <p>Estos términos se rigen por las leyes de la República Argentina.</p>
          </section>

          <p className="text-sm text-grafito/60">
            ¿Preguntas? Escribinos a{" "}
            <a href={`mailto:${CONTACTO_EMAIL}`} className="font-medium text-salvia-oscuro hover:text-grafito">
              {CONTACTO_EMAIL}
            </a>
            .
          </p>
        </div>
      </div>
    </main>
  );
}
