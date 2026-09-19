import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { PerfilDeColega } from "@dental-mirage/shared-types";
import { apiPerfilDeColega } from "@/lib/api";
import { getSessionToken, requireOnboardingComplete } from "@/lib/session";

export const metadata: Metadata = { title: "Perfil del colaborador — PRISMA" };

// El perfil de un COLEGA (2026-09-19, ítem 4 de la ronda de ajustes:
// "en la tarjeta de los colaboradores... poner un botón de ver perfil,
// que me llevará a mi perfil o al perfil del otro profesional").
//
// Vive bajo /colaboradores porque es el detalle de esa lista, no una
// herramienta de la agenda. El tuyo propio NO pasa por acá: el botón
// manda a /perfil, que además de mostrar edita. Si alguien llega igual
// con su propio id, lo redirigimos ahí en vez de mostrarle una copia en
// solo lectura de su propia ficha.
//
// El guard es el mismo que la lista: verlo lo puede cualquier miembro.
// Quién es un colega no es un permiso especial — lo que sí está acotado
// es DE QUÉ CLÍNICA: el backend responde 404 si esa persona no trabaja
// acá (ver perfil_colega.go).
export default async function PerfilDeColaboradorPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const sesion = await requireOnboardingComplete();
  const token = await getSessionToken();
  const resultado = token ? await apiPerfilDeColega(token, userId) : null;
  if (!resultado?.ok) {
    notFound();
  }
  const colega = resultado.data;
  if (colega.esVos) {
    redirect("/perfil");
  }

  return (
    <main className="flex flex-1 flex-col gap-8 bg-hueso px-6 py-10 pt-[calc(var(--header-height)+2.5rem)]">
      <div className="mx-auto w-full max-w-[680px]">
        <p className="mb-1 flex flex-wrap items-center gap-2 font-[family-name:var(--font-mono)] text-xs uppercase tracking-widest text-grafito/50">
          <Link href="/colaboradores" className="hover:text-salvia-oscuro">
            Colaboradores
          </Link>
          <span aria-hidden="true">/</span>
          <span>{sesion.nombreClinica}</span>
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium text-grafito">{colega.nombre}</h1>
        <p className="text-sm text-grafito/60">{colega.email}</p>
      </div>

      <div className="mx-auto w-full max-w-[680px]">
        <FichaDelColega colega={colega} />
      </div>
    </main>
  );
}

const ETIQUETA_ROL: Record<string, string> = {
  owner: "Titular",
  admin: "Administrador de página",
  profesional: "Profesional",
  recepcion: "Recepción",
};

function FichaDelColega({ colega }: { colega: PerfilDeColega }) {
  const perfil = colega.perfil;
  const telefono = perfil ? `${perfil.telefonoPrefijo} ${perfil.telefono}`.trim() : "";

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-card border border-linea bg-marfil p-6 shadow-soft">
        <h2 className="font-[family-name:var(--font-mono)] text-sm uppercase tracking-[0.15em] text-grafito/60">
          En esta clínica
        </h2>
        <ul className="flex flex-wrap gap-2">
          {colega.roles.map((rol) => (
            <li key={rol} className="tag-rol tag-rol--profesional">
              {ETIQUETA_ROL[rol] ?? rol}
            </li>
          ))}
        </ul>
      </section>

      {/* Sin perfil cargado no es un error: alguien recién invitado que
          todavía no lo completó aparece igual en el equipo. Decirlo es
          más útil que una ficha llena de guiones. */}
      {!perfil ? (
        <section className="rounded-card border border-dashed border-linea bg-marfil px-6 py-5 text-sm text-grafito/60">
          Esta persona todavía no completó su perfil profesional.
        </section>
      ) : (
        <>
          <Bloque titulo="Datos de contacto">
            <Dato etiqueta="Teléfono" valor={telefono} />
            <Dato etiqueta="Mail" valor={colega.email} />
          </Bloque>

          {/* Un perfil "actividades" (recepción, administración de la
              página) no tiene matrícula ni especialidades — el backend
              las descarta, así que acá no hay nada que mostrar. */}
          {perfil.tipoPerfil === "profesional" && (
            <Bloque titulo="Ejercicio profesional">
              <Dato
                etiqueta="Matrícula"
                valor={[perfil.matriculaTipo, perfil.matriculaNumero].filter(Boolean).join(" ")}
              />
              <Dato
                etiqueta="Especialidades"
                valor={perfil.especialidades.map((e) => e.nombre).join(", ")}
              />
              <Dato
                etiqueta="Años de experiencia"
                valor={perfil.aniosExperiencia ? String(perfil.aniosExperiencia) : ""}
              />
              <Dato etiqueta="Idiomas" valor={(perfil.idiomas ?? []).join(", ")} />
            </Bloque>
          )}

          {perfil.bio && (
            <section className="flex flex-col gap-3 rounded-card border border-linea bg-marfil p-6 shadow-soft">
              <h2 className="font-[family-name:var(--font-mono)] text-sm uppercase tracking-[0.15em] text-grafito/60">
                Sobre
              </h2>
              <p className="whitespace-pre-line text-[15px] leading-relaxed text-grafito">{perfil.bio}</p>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-card border border-linea bg-marfil p-6 shadow-soft">
      <h2 className="font-[family-name:var(--font-mono)] text-sm uppercase tracking-[0.15em] text-grafito/60">
        {titulo}
      </h2>
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs uppercase tracking-wide text-grafito/50">{etiqueta}</dt>
      <dd className="text-[15px] text-grafito">{valor.trim() === "" ? "—" : valor}</dd>
    </div>
  );
}
