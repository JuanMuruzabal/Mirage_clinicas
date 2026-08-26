"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { onboardingClinicaAction } from "@/app/actions/auth";
import { onboardingClinicaSchema, type OnboardingClinicaFormValues } from "@/lib/validation/auth";
import { AuthField, authErrorClass, authInputClass, authSubmitClass } from "@/components/auth/auth-shell";

interface OnboardingClinicaFormProps {
  onAtras: () => void;
}

// Paso 3 — Tu clínica (spec §4): elección de tipo con dos cards grandes
// seleccionables (no un <select>), después los campos de la clínica.
// "Organización" muestra un aviso de que invitar colaboradores llega
// después (spec §9, fuera de alcance implementar el envío ahora).
export function OnboardingClinicaForm({ onAtras }: OnboardingClinicaFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<OnboardingClinicaFormValues>({
    resolver: zodResolver(onboardingClinicaSchema),
    defaultValues: { tipo: undefined, nombre: "", direccion: "", ciudad: "", provincia: "", telefono: "" },
  });
  const [errorGlobal, setErrorGlobal] = useState<string | null>(null);
  const tipo = watch("tipo");

  async function onSubmit(values: OnboardingClinicaFormValues) {
    setErrorGlobal(null);
    const result = await onboardingClinicaAction({
      ...values,
      direccion: values.direccion || undefined,
      ciudad: values.ciudad || undefined,
      provincia: values.provincia || undefined,
      telefono: values.telefono || undefined,
    });
    // Si tuvo éxito, la acción ya redirigió a /seleccionar-servicio y esta
    // línea no se alcanza.
    if (result?.error) {
      setErrorGlobal(result.error);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <TarjetaTipo
          seleccionada={tipo === "individual"}
          onClick={() => setValue("tipo", "individual", { shouldValidate: true })}
          titulo="Clínica individual"
          descripcion="Trabajás solo/a. Vos gestionás tu agenda y tus pacientes."
        />
        <TarjetaTipo
          seleccionada={tipo === "organizacion"}
          onClick={() => setValue("tipo", "organizacion", { shouldValidate: true })}
          titulo="Organización"
          descripcion="Varios profesionales. Vas a poder invitar colaboradores con distintos roles."
        />
      </div>
      {errors.tipo && <p className={authErrorClass}>{errors.tipo.message}</p>}

      {tipo === "organizacion" && (
        <p className="rounded-field border-[0.5px] border-salvia bg-salvia-claro px-4 py-3 text-sm text-salvia-oscuro">
          Vas a poder invitar colaboradores con distintos roles desde el panel, próximamente.
        </p>
      )}

      {tipo && (
        <>
          <AuthField label="Nombre de tu clínica o consultorio" error={errors.nombre?.message}>
            <input placeholder="Consultorio Dr. Games" className={authInputClass} {...register("nombre")} />
          </AuthField>

          <div className="grid gap-5 sm:grid-cols-2">
            <AuthField label="Ciudad (opcional)" error={errors.ciudad?.message}>
              <input className={authInputClass} {...register("ciudad")} />
            </AuthField>
            <AuthField label="Provincia (opcional)" error={errors.provincia?.message}>
              <input className={authInputClass} {...register("provincia")} />
            </AuthField>
          </div>
          <AuthField label="Dirección (opcional)" error={errors.direccion?.message}>
            <input className={authInputClass} {...register("direccion")} />
          </AuthField>
          <AuthField label="Teléfono de contacto (opcional)" error={errors.telefono?.message}>
            <input type="tel" className={authInputClass} {...register("telefono")} />
          </AuthField>
        </>
      )}

      {errorGlobal && (
        <p role="alert" className={authErrorClass}>
          {errorGlobal}
        </p>
      )}

      <div className="flex justify-between">
        <button
          type="button"
          onClick={onAtras}
          className="rounded-full border-[0.5px] border-arena bg-marfil px-5 py-2.5 text-sm font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro"
        >
          Atrás
        </button>
        <button type="submit" disabled={isSubmitting || !tipo} className={authSubmitClass}>
          {isSubmitting ? "Creando clínica…" : "Crear cuenta"}
        </button>
      </div>
    </form>
  );
}

function TarjetaTipo({
  seleccionada,
  onClick,
  titulo,
  descripcion,
}: {
  seleccionada: boolean;
  onClick: () => void;
  titulo: string;
  descripcion: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={seleccionada}
      className={`flex flex-col gap-2 rounded-card border-[0.5px] p-5 text-left transition-colors ${
        seleccionada ? "border-salvia bg-salvia-claro" : "border-arena bg-marfil hover:border-salvia"
      }`}
    >
      <span className={`font-[family-name:var(--font-display)] text-lg font-medium ${seleccionada ? "text-salvia-oscuro" : "text-grafito"}`}>
        {titulo}
      </span>
      <span className="text-sm text-grafito/60">{descripcion}</span>
    </button>
  );
}
