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
import { TarjetaOpcion } from "@/components/auth/tarjeta-opcion";
import { IconClinic, IconMapPin, IconUser, IconUsers } from "@/components/icons";

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
  const tipo = watch("tipo");

  async function onSubmit(values: OnboardingClinicaFormValues) {
    setErrorGlobal(null);
    // El teléfono de la CLÍNICA es una sola columna (`clinics.telefono`),
    // a diferencia del perfil profesional, que guarda prefijo y número
    // por separado. El control es el mismo; acá se unen al enviar.
    const telefono = `${values.telefonoPrefijo} ${values.telefono}`.trim();
    const result = await onboardingClinicaAction({
      tipo: values.tipo,
      nombre: values.nombre,
      direccion: values.direccion,
      ciudad: values.ciudad,
      provincia: values.provincia,
      telefono,
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
          <TarjetaOpcion
            seleccionada={tipo === "individual"}
            onClick={() => setValue("tipo", "individual", { shouldValidate: true })}
            icono={<IconUser className="h-5 w-5" />}
            titulo="Clínica individual"
            descripcion="Trabajás solo/a en tu consultorio."
          />
          <TarjetaOpcion
            seleccionada={tipo === "organizacion"}
            onClick={() => setValue("tipo", "organizacion", { shouldValidate: true })}
            icono={<IconUsers className="h-5 w-5" />}
            titulo="Organización"
            descripcion="Varios profesionales en la misma clínica."
          />
        </div>
        {errors.tipo && <p className={authErrorClass}>{errors.tipo.message}</p>}

        {/* Acá había un aviso de que invitar colaboradores llegaba
            "próximamente". Se sacó el 2026-09-14: llegó en la Fase 3.2.4,
            y elegir "Organización" ahora TERMINA en esa pantalla. Un
            cartel que promete para más adelante algo que pasa a
            continuación es peor que no decir nada. */}

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

        {/* Ubicación y contacto — obligatorios desde la ronda de QA del
            2026-09-13. Dejaron de estar plegados por eso mismo: esconder
            detrás de un acordeón cuatro campos que hay que completar sí o
            sí es hacer que el formulario parezca más corto de lo que es, y
            que el error aparezca en una sección cerrada. */}
        {tipo && (
          <section className="flex flex-col gap-4 rounded-[10px] border border-linea p-4">
            <h3 className="flex items-center gap-2.5 text-sm font-medium text-grafito">
              <IconMapPin className="h-[18px] w-[18px] text-grafito/40" />
              Ubicación y contacto
            </h3>
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
