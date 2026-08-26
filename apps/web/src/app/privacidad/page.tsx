import type { Metadata } from "next";
import { CONTACTO_EMAIL } from "@/lib/contacto";

export const metadata: Metadata = {
  title: "Política de privacidad — Dental Mirage",
  description: "Cómo Dental Mirage recolecta, usa y protege tus datos personales.",
};

// Ver el comentario de app/terminos/page.tsx — mismo bug (TR-050 en
// docs/tradeoffs.md), mismo fix. Contenido alineado a lo que la
// plataforma REALMENTE recolecta hoy (spec §7, Ley 25.326) — no es una
// plantilla genérica de internet, pero tampoco reemplaza una revisión
// legal antes de un lanzamiento real.
export default function PrivacidadPage() {
  return (
    <main className="flex flex-1 flex-col bg-hueso px-6 py-16 pt-[calc(var(--header-height)+2rem)]">
      <div className="mx-auto w-full max-w-2xl">
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-medium text-grafito sm:text-5xl">
          Política de privacidad
        </h1>
        <p className="mt-2 text-sm text-grafito/60">Versión 1.0 — última actualización: agosto de 2026.</p>

        <div className="mt-10 flex flex-col gap-8 text-grafito/90">
          <p>
            En Dental Mirage tratamos tus datos personales conforme a la Ley 25.326 de Protección de Datos
            Personales (Argentina). Esta política explica qué datos recolectamos, para qué los usamos y qué derechos
            tenés sobre ellos.
          </p>

          <section className="flex flex-col gap-2">
            <h2 className="font-[family-name:var(--font-display)] text-xl font-medium text-grafito">
              1. Qué datos recolectamos
            </h2>
            <ul className="list-disc pl-5">
              <li>
                <span className="font-medium text-grafito">De tu cuenta:</span> email, contraseña (guardada
                encriptada, nunca en texto plano) o tu identificador de Google si te sumás con esa opción.
              </li>
              <li>
                <span className="font-medium text-grafito">De tu perfil profesional:</span> nombre, apellido,
                teléfono, documento y matrícula (opcional según el tipo), especialidades, años de experiencia y bio,
                si los cargás.
              </li>
              <li>
                <span className="font-medium text-grafito">De tu clínica:</span> nombre, dirección, ciudad,
                provincia y teléfono de contacto.
              </li>
              <li>
                <span className="font-medium text-grafito">De tus pacientes:</span> los datos que vos cargás al
                gestionar turnos (nombre, apellido, DNI, teléfono, mail, motivo de consulta) — sos vos quien decide
                qué información de tus pacientes cargar en la plataforma.
              </li>
              <li>
                <span className="font-medium text-grafito">Técnicos:</span> dirección IP y user-agent, solo para
                seguridad (detectar intentos de acceso indebidos) — nunca para publicidad ni se venden a terceros.
              </li>
            </ul>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="font-[family-name:var(--font-display)] text-xl font-medium text-grafito">
              2. Para qué los usamos
            </h2>
            <p>
              Para darte acceso a tu cuenta, gestionar tu turnero y pacientes, mostrar tu página pública a quienes te
              buscan, y avisarte por mail (verificación de cuenta, recuperación de contraseña, bienvenida). Nunca
              usamos tus datos para enviarte publicidad de terceros.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="font-[family-name:var(--font-display)] text-xl font-medium text-grafito">
              3. Con quién los compartimos
            </h2>
            <p>Solo con los proveedores estrictamente necesarios para que la plataforma funcione:</p>
            <ul className="list-disc pl-5">
              <li>Google, si elegís sumarte o ingresar con tu cuenta de Google.</li>
              <li>Resend, para el envío de los mails transaccionales de tu cuenta (verificación, recuperación).</li>
              <li>Cloudflare, para el CAPTCHA que evita registros automatizados.</li>
            </ul>
            <p>No vendemos ni cedemos tus datos a terceros con fines comerciales.</p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="font-[family-name:var(--font-display)] text-xl font-medium text-grafito">
              4. Cómo los protegemos
            </h2>
            <p>
              Tu contraseña se guarda encriptada (nunca en texto plano), la sesión viaja en una cookie que el
              navegador no expone a scripts de terceros, y verificamos que tu contraseña no haya aparecido en una
              filtración conocida antes de aceptarla.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="font-[family-name:var(--font-display)] text-xl font-medium text-grafito">
              5. Tus derechos
            </h2>
            <p>
              Como titular de tus datos, tenés derecho a acceder, rectificar, actualizar o solicitar la supresión de
              tu información (derechos ARCO), y a dar de baja tu cuenta cuando quieras. Para ejercer cualquiera de
              estos derechos, escribinos a{" "}
              <a href={`mailto:${CONTACTO_EMAIL}`} className="font-medium text-salvia-oscuro hover:text-grafito">
                {CONTACTO_EMAIL}
              </a>
              . La Agencia de Acceso a la Información Pública, en su carácter de Órgano de Control de la Ley 25.326,
              tiene la atribución de atender las denuncias y reclamos que se interpongan con relación al
              incumplimiento de las normas sobre protección de datos personales.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="font-[family-name:var(--font-display)] text-xl font-medium text-grafito">
              6. Cookies
            </h2>
            <p>
              Usamos una única cookie esencial para mantener tu sesión iniciada — no usamos cookies de seguimiento ni
              de publicidad.
            </p>
          </section>

          <p className="text-sm text-grafito/60">
            ¿Preguntas sobre tus datos? Escribinos a{" "}
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
