import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NavCard } from "@/components/nav-card";
import { FondoOndas } from "@/components/fondo-ondas";
import {
  CLASE_ANTETITULO_DE_TARJETA,
  CLASE_DESCRIPCION_DE_TARJETA,
  CLASE_TITULO_DE_TARJETA,
  TarjetaConDibujo,
} from "@/components/tarjeta-con-dibujo";
import { NOMBRE_DE_VARIANTE, VARIANTES_DE_DIBUJO } from "@/components/panel/dibujos-discretos";

export const metadata: Metadata = { title: "Vista previa de dibujos — PRISMA", robots: { index: false } };
export const dynamic = "force-dynamic";

// VISTA PREVIA DE LOS DIBUJOS DE LAS TARJETAS (28/10): el objeto de hoy y
// las tres variantes discretas (`dibujos-discretos.tsx`), una debajo de la
// otra y con las tarjetas de las dos pantallas que los usan, para elegir
// mirándolas juntas. Sin sesión ni API: los textos son de ejemplo. Solo en
// desarrollo, o con PRISMA_VISTA_PREVIA=1; en producción no existe.
export default function VistaPreviaDibujosPage() {
  if (process.env.NODE_ENV === "production" && process.env.PRISMA_VISTA_PREVIA !== "1") notFound();

  return (
    <>
      <FondoOndas />
      <main className="flex w-full flex-1 flex-col px-8 pb-16 pt-[calc(var(--header-height)+2rem)] max-md:px-[clamp(1rem,4vw,2rem)]">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-12">
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight sm:text-4xl">
            <span className="titulo-prismatico">Dibujos de las tarjetas</span>
          </h1>
          {VARIANTES_DE_DIBUJO.map((variante) => (
            <section key={variante} id={variante} className="flex flex-col gap-4">
              <h2 className="text-lg font-semibold text-marca">{NOMBRE_DE_VARIANTE[variante]}</h2>
              <TarjetaConDibujo dibujo="clinica" variante={variante}>
                <p className={CLASE_ANTETITULO_DE_TARJETA}>Tu clínica · Titular</p>
                <h3 className={CLASE_TITULO_DE_TARJETA}>Consultorio Nueva Córdoba</h3>
                <p className={CLASE_DESCRIPCION_DE_TARJETA}>Av. Hipólito Yrigoyen 450, Córdoba</p>
              </TarjetaConDibujo>
              <NavCard href={`#${variante}`} dibujo="agenda" variante={variante} titulo="Gestión de clínica" descripcion="La agenda, los turnos y los pacientes." />
              <NavCard href={`#${variante}`} dibujo="pagina" variante={variante} titulo="Personalización de página" descripcion="Tu página y el enlace para tus pacientes." />
              <NavCard href={`#${variante}`} dibujo="equipo" variante={variante} titulo="Colaboradores" descripcion="Tu equipo y a quién invitar." />
            </section>
          ))}
        </div>
      </main>
    </>
  );
}
