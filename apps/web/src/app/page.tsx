import Image from "next/image";
import Link from "next/link";
import { ExpandableCard } from "@/components/expandable-card";
import { InfoCard } from "@/components/info-card";
import { ScrollReveal } from "@/components/scroll-reveal";

// Degradado sobre las fotos de fondo (no "copiar y pegar la foto" tal
// cual, pedido explícito) — más oscuro en los bordes, algo más claro en el
// medio, para que el texto quede legible sea cual sea la foto de abajo sin
// verse un bloque plano. Mismo criterio que el overlay de foto de
// Turismo Marcuzzi (--overlay-photo en su globals.css), con nuestro
// token de tinta.
const PHOTO_OVERLAY = "linear-gradient(180deg, rgba(18,25,27,0.82) 0%, rgba(18,25,27,0.62) 45%, rgba(18,25,27,0.85) 100%)";

// Home pública (01-home.png, T1.1). Copy adaptado del brief original al
// Sistema Cascarón (docs/tradeoffs.md TR-010) — paneles de borde duro,
// tipografía condensada, sin el acento verde/dorado del mock original
// (ese usaba una paleta de referencia, no la definitiva). Identidad cálida
// (TR-015): pedido explícito del cliente, "el home solo cambiar las
// tarjetas y botones" — las dos fotos de fondo, sus overlays y toda la
// tipografía siguen con porcelain/ink tal cual; solo las tarjetas
// (InfoCard/ExpandableCard) y los botones reales (no los links de texto)
// pasan a la paleta nueva.
export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      {/* Buscador público (spec §6, FR-10) — foto de fondo con degradado
          (no la banda plana de acero de antes), mismo criterio de "hero"
          diferenciado que el resto de la página. Las tarjetas son solo
          informativas (no navegan) — el único acceso al buscador es el
          botón grande, mismo patrón que "Ver alojamientos" en el hero de
          Turismo Marcuzzi. */}
      <section id="buscar" className="relative min-h-[640px] overflow-hidden px-6 py-24 sm:px-10">
        <Image
          src="/images/buscar-clinicas.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div aria-hidden="true" className="absolute inset-0" style={{ background: PHOTO_OVERLAY }} />

        <div className="relative z-10 mx-auto max-w-5xl">
          <ScrollReveal>
            <p className="mb-3 font-[family-name:var(--font-mono)] text-xs uppercase tracking-widest text-porcelain/60">
              Buscador público
            </p>
            <h2 className="max-w-xl text-balance font-[family-name:var(--font-display)] text-4xl font-black uppercase leading-[0.95] tracking-tight text-porcelain sm:text-6xl">
              Encontrá tu clínica más cómoda entre nuestros afiliados
            </h2>
            <p className="mt-4 max-w-lg text-base text-porcelain/80">
              Buscá por nombre, profesional o especialidad — vos elegís cómo empezar.
            </p>
            <Link
              href="/buscar"
              className="mt-8 inline-block rounded-full bg-salvia-oscuro px-10 py-5 text-base font-bold uppercase tracking-wide text-marfil transition-colors hover:brightness-95"
            >
              Buscar clínicas →
            </Link>
          </ScrollReveal>

          <div className="mt-16 grid gap-6 sm:grid-cols-2">
            <ScrollReveal delay={0.05}>
              <InfoCard
                eyebrow="Cerca tuyo"
                titulo="Tu clínica más cercana"
                descripcion="Encontrá la clínica que te quede más cómoda entre nuestros afiliados."
              />
            </ScrollReveal>
            <ScrollReveal delay={0.12}>
              <InfoCard
                eyebrow="Todos los afiliados"
                titulo="Todos los profesionales de tu zona"
                descripcion="Mirá el listado completo de clínicas y especialidades disponibles."
              />
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* Más espacio antes de esta sección (pedido explícito) — separa
          claramente el buscador de pacientes del alta de profesionales.
          Segunda foto de fondo, mismo tratamiento de degradado. */}
      <section
        id="tu-consultorio"
        className="relative flex min-h-[560px] flex-1 flex-col items-center justify-center gap-8 px-6 py-32 text-center sm:py-40"
      >
        <Image
          src="/images/tu-consultorio.jpg"
          alt=""
          fill
          sizes="100vw"
          className="object-cover"
        />
        <div aria-hidden="true" className="absolute inset-0" style={{ background: PHOTO_OVERLAY }} />

        <h1 className="relative z-10 max-w-3xl text-balance font-[family-name:var(--font-display)] text-5xl font-black uppercase leading-[0.9] tracking-tight text-porcelain sm:text-7xl">
          Tu consultorio,
          <br />
          sin el cuaderno.
        </h1>
        <p className="relative z-10 max-w-xl text-base text-porcelain/80 sm:text-lg">
          Un turnero pensado para odontología — agenda por consulta, pedidos que llegan solos desde tu página — y una
          página propia para que tus pacientes te encuentren y pidan turno. Nada más.
        </p>
        <div className="relative z-10 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/sumarse"
            className="rounded-full bg-salvia-oscuro px-6 py-3 text-sm font-semibold uppercase tracking-wide text-marfil hover:brightness-95"
          >
            Sumate gratis
          </Link>
          <a href="#como-funciona" className="text-sm font-medium text-porcelain/80 hover:text-porcelain">
            Ver cómo funciona →
          </a>
        </div>
        <svg aria-hidden="true" viewBox="0 0 160 24" className="relative z-10 mt-4 h-6 w-40 text-porcelain/70">
          <path
            d="M4 4c10 16 40 16 76 0s66-16 76 0"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      </section>

      <section id="como-funciona" className="border-t border-line bg-panel px-6 py-24">
        <div className="mx-auto mb-12 max-w-3xl text-center">
          <p className="mb-3 font-[family-name:var(--font-mono)] text-xs uppercase tracking-widest text-muted">
            Dos servicios, una cuenta
          </p>
          <h2 className="font-[family-name:var(--font-display)] text-3xl font-black uppercase tracking-tight text-ink sm:text-4xl">
            Tocá una tarjeta para ver cómo funciona
          </h2>
        </div>

        <div className="mx-auto grid max-w-5xl gap-6 sm:grid-cols-2">
          <ScrollReveal>
            <ExpandableCard
              eyebrow="Gestión de clínica"
              titulo="El día a día, ordenado"
              descripcion="Calendario simple por consulta y los pedidos que llegan desde tu página, listos para confirmar."
              detalle={[
                "Un dashboard con lo pendiente y lo confirmado del día.",
                "Calendario simple, con un color por tipo de consulta.",
                "Los pedidos que llegan desde tu página, a un clic de confirmarse.",
                "Una ficha por paciente con su historial de turnos.",
              ]}
            />
          </ScrollReveal>
          <ScrollReveal delay={0.1}>
            <ExpandableCard
              eyebrow="Página pública"
              titulo="Que te encuentren"
              descripcion="Una página propia con tus especialidades y un botón de pedir turno."
              detalle={[
                'Turno, especialidades y "sobre nosotros" en tu propia página.',
                "La podés ocultar mientras la armás — modo mantenimiento.",
                "Publicada, aparecés en el buscador de clínicas de Mirage.",
                "El pedido de turno llega directo a tu agenda, sin planillas sueltas.",
              ]}
            />
          </ScrollReveal>
        </div>
      </section>
    </main>
  );
}
