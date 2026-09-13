"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { onboardingClinicaAction } from "@/app/actions/auth";
import { onboardingClinicaSchema, type OnboardingClinicaFormValues } from "@/lib/validation/auth";
import {
  AuthField,
  CampoConIcono,
  authErrorClass,
  authInputClass,
  authInputConIconoClass,
  authSecondaryButtonClass,
  authSubmitClass,
} from "@/components/auth/auth-shell";
import { CampoTelefono } from "@/components/auth/campo-telefono";
import { ModalShell } from "@/components/auth/modal-shell";
import { IconCheck, IconChevronDown, IconClinic, IconInfo, IconMapPin, IconUser, IconUsers } from "@/components/icons";

interface OnboardingClinicaFormProps {
  onAtras: () => void;
  volverLabel?: string;
  submitLabel?: string;
}

const ID_FORM = "form-alta-clinica";

// Las 23 provincias + CABA. Lista cerrada y no campo libre (ronda de QA
// del 2026-09-13): *"dejarla libre te ensucia la base con Cordoba, CBA,
// córdoba"* — y esa columna es la que va a filtrar el buscador público de
// clínicas, donde tres grafías de lo mismo son tres lugares distintos.
const PROVINCIAS = [
  "Buenos Aires",
  "Ciudad Autónoma de Buenos Aires",
  "Catamarca",
  "Chaco",
  "Chubut",
  "Córdoba",
  "Corrientes",
  "Entre Ríos",
  "Formosa",
  "Jujuy",
  "La Pampa",
  "La Rioja",
  "Mendoza",
  "Misiones",
  "Neuquén",
  "Río Negro",
  "Salta",
  "San Juan",
  "San Luis",
  "Santa Cruz",
  "Santa Fe",
  "Santiago del Estero",
  "Tierra del Fuego",
  "Tucumán",
] as const;

// Alta de la clínica (spec §4). Desde la Fase 3.2.3 ya no es "el paso 3
// del wizard" sino una acción que se abre desde "¿Dónde trabajás hoy?".
//
// Rediseñado en la ronda de QA del 2026-09-13 (ver la bitácora de la fase (`docs/Fases post MVP/Fase 3/fase3.2-multi-tenant.md`)):
//
//   - **Encabezado y pie fijos** (ModalShell), con scroll solo en el
//     cuerpo y scrollbar fina — la nativa gris rompía el borde redondeado.
//   - **Los cuatro campos opcionales se pliegan** en "Ubicación y
//     contacto": así el modal entra sin scroll y lo obligatorio queda en
//     primer plano.
//   - **La tarjeta elegida se marca con el verde de la marca y un tilde**,
//     no con un borde negro grueso — *"el negro no existe en ningún otro
//     lado de PRISMA, por eso saltaba"*.
//   - **El botón nunca está deshabilitado.** Antes, sin tipo elegido,
//     quedaba gris sin decir por qué: *"un botón gris sin explicación deja
//     al usuario adivinando qué falta"*. Ahora se puede tocar siempre y el
//     error aparece debajo del campo que falta.
export function OnboardingClinicaForm({
  onAtras,
  volverLabel = "Atrás",
  submitLabel = "Empezar a usar PRISMA",
}: OnboardingClinicaFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<OnboardingClinicaFormValues>({
    resolver: zodResolver(onboardingClinicaSchema),
    defaultValues: {
      tipo: undefined,
      nombre: "",
      direccion: "",
      ciudad: "",
      provincia: "",
      telefonoPrefijo: "+54",
      telefono: "",
    },
  });
  const [errorGlobal, setErrorGlobal] = useState<string | null>(null);
  const [ubicacionAbierta, setUbicacionAbierta] = useState(false);
  const tipo = watch("tipo");

  async function onSubmit(values: OnboardingClinicaFormValues) {
    setErrorGlobal(null);
    // El teléfono de la CLÍNICA es una sola columna (`clinics.telefono`),
    // a diferencia del perfil profesional, que guarda prefijo y número
    // por separado. El control es el mismo; acá se unen al enviar.
    const telefono = values.telefono ? `${values.telefonoPrefijo} ${values.telefono}`.trim() : "";
    const result = await onboardingClinicaAction({
      tipo: values.tipo,
      nombre: values.nombre,
      direccion: values.direccion || undefined,
      ciudad: values.ciudad || undefined,
      provincia: values.provincia || undefined,
      telefono: telefono || undefined,
    });
    // Si tuvo éxito, la acción ya redirigió y esta línea no se alcanza.
    if (result?.error) {
      setErrorGlobal(result.error);
    }
  }

  return (
    <ModalShell
      title="Tu clínica"
      subtitle="Los datos básicos. Después vas a poder cambiarlos desde el panel."
      footer={
        <>
          <button type="button" onClick={onAtras} className={authSecondaryButtonClass}>
            {volverLabel}
          </button>
          <button type="submit" form={ID_FORM} disabled={isSubmitting} className={authSubmitClass}>
            {isSubmitting ? "Creando clínica…" : submitLabel}
          </button>
        </>
      }
    >
      <form id={ID_FORM} onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
        <div className="grid items-stretch gap-3 sm:grid-cols-2">
          <TarjetaTipo
            seleccionada={tipo === "individual"}
            onClick={() => setValue("tipo", "individual", { shouldValidate: true })}
            icono={<IconUser className="h-5 w-5" />}
            titulo="Clínica individual"
            descripcion="Trabajás solo/a en tu consultorio."
          />
          <TarjetaTipo
            seleccionada={tipo === "organizacion"}
            onClick={() => setValue("tipo", "organizacion", { shouldValidate: true })}
            icono={<IconUsers className="h-5 w-5" />}
            titulo="Organización"
            descripcion="Varios profesionales en la misma clínica."
          />
        </div>
        {errors.tipo && <p className={authErrorClass}>{errors.tipo.message}</p>}

        {/* Banner con ícono, separado de las tarjetas: pegado abajo de una
            parecía parte de ella. */}
        {tipo === "organizacion" && (
          <p className="flex items-start gap-2.5 rounded-[10px] border-[0.5px] border-salvia bg-salvia-claro px-4 py-3 text-sm text-salvia-oscuro">
            <IconInfo className="mt-0.5 h-[18px] w-[18px] flex-shrink-0" />
            <span>Vas a poder invitar colaboradores con distintos roles desde el panel, próximamente.</span>
          </p>
        )}

        {/* El nombre y los opcionales aparecen recién con el tipo elegido
            (corrección de QA del 2026-09-13). El orden de la
            pantalla pasa a ser el de la decisión: primero qué clase de
            clínica es, después sus datos. */}
        {tipo && (
          <AuthField label="Nombre de tu clínica o consultorio" error={errors.nombre?.message}>
            <CampoConIcono icono={<IconClinic className="h-[18px] w-[18px]" />}>
              <input placeholder="Consultorio Dr. Games" className={authInputConIconoClass} {...register("nombre")} />
            </CampoConIcono>
          </AuthField>
        )}

        {/* Los cuatro opcionales, plegados. Adentro los labels van en peso
            normal y gris: eso reemplaza al "(opcional)" repetido cuatro
            veces. */}
        {tipo && (
          <section className="rounded-[10px] border-[0.5px] border-arena">
            <button
              type="button"
              onClick={() => setUbicacionAbierta((abierta) => !abierta)}
              aria-expanded={ubicacionAbierta}
              aria-controls="ubicacion-y-contacto"
              className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm font-medium text-grafito"
            >
              <IconMapPin className="h-[18px] w-[18px] text-grafito/40" />
              Ubicación y contacto
              <span className="ml-auto flex items-center gap-2 text-xs font-normal text-grafito/50">
                opcional
                <IconChevronDown
                  className={`h-4 w-4 transition-transform ${ubicacionAbierta ? "rotate-180" : ""}`}
                />
              </span>
            </button>
            <div
              id="ubicacion-y-contacto"
              hidden={!ubicacionAbierta}
              className="flex flex-col gap-4 border-t border-arena/70 px-4 py-4 [&_span]:font-normal [&_span]:text-grafito/70"
            >
              {/* Provincia ANTES que ciudad: el día que las ciudades se
                  filtren por provincia, el orden ya va a ser el correcto. */}
              <AuthField label="Provincia" error={errors.provincia?.message}>
                <select className={authInputClass} defaultValue="" {...register("provincia")}>
                  <option value="">Elegí una provincia</option>
                  {PROVINCIAS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </AuthField>
              <AuthField label="Ciudad" error={errors.ciudad?.message}>
                <input className={authInputClass} {...register("ciudad")} />
              </AuthField>
              <AuthField label="Dirección" error={errors.direccion?.message}>
                <input className={authInputClass} {...register("direccion")} />
              </AuthField>
              <CampoTelefono
                label="Teléfono de contacto"
                prefijo={register("telefonoPrefijo")}
                numero={register("telefono")}
                error={errors.telefono?.message}
                placeholder="351 123 4567"
              />
            </div>
          </section>
        )}

        {errorGlobal && (
          <p role="alert" className={authErrorClass}>
            {errorGlobal}
          </p>
        )}
      </form>
    </ModalShell>
  );
}

function TarjetaTipo({
  seleccionada,
  onClick,
  icono,
  titulo,
  descripcion,
}: {
  seleccionada: boolean;
  onClick: () => void;
  icono: React.ReactNode;
  titulo: string;
  descripcion: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={seleccionada}
      className={`flex h-full flex-col gap-2 rounded-[10px] border-[0.5px] p-4 text-left transition-colors ${
        seleccionada ? "border-salvia bg-salvia-claro" : "border-arena bg-marfil hover:border-salvia"
      }`}
    >
      {/* Ícono arriba a la izquierda y círculo de selección arriba a la
          derecha: así la tarjeta se lee como un radio button aunque sea
          una tarjeta. */}
      <span className="flex items-start justify-between">
        <span className={seleccionada ? "text-salvia-oscuro" : "text-grafito/40"}>{icono}</span>
        <span
          aria-hidden="true"
          className={`flex h-5 w-5 items-center justify-center rounded-full border-[0.5px] ${
            seleccionada ? "border-salvia-oscuro bg-salvia-oscuro text-marfil" : "border-arena"
          }`}
        >
          {seleccionada && <IconCheck className="h-3.5 w-3.5" />}
        </span>
      </span>
      <span
        className={`font-[family-name:var(--font-display)] text-lg font-medium ${
          seleccionada ? "text-salvia-oscuro" : "text-grafito"
        }`}
      >
        {titulo}
      </span>
      <span className="text-sm text-grafito/60">{descripcion}</span>
    </button>
  );
}
