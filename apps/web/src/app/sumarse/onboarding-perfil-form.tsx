"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { Especialidad, PerfilProfesional } from "@dental-mirage/shared-types";
import { onboardingPerfilAction } from "@/app/actions/auth";
import { onboardingPerfilSchema, type OnboardingPerfilFormValues } from "@/lib/validation/auth";
import { AuthField, authErrorClass, authInputClass, authSubmitClass } from "@/components/auth/auth-shell";

interface OnboardingPerfilFormProps {
  especialidades: Especialidad[];
  perfilInicial?: PerfilProfesional;
}

// Paso 2 — Perfil profesional (spec §4): obligatorios nombre, apellido,
// teléfono, matrícula, al menos una especialidad; el resto opcional pero
// visible. Selector de especialidades con búsqueda y multiselección.
export function OnboardingPerfilForm({ especialidades, perfilInicial }: OnboardingPerfilFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<OnboardingPerfilFormValues>({
    resolver: zodResolver(onboardingPerfilSchema),
    defaultValues: {
      nombre: perfilInicial?.nombre ?? "",
      apellido: perfilInicial?.apellido ?? "",
      telefonoPrefijo: perfilInicial?.telefonoPrefijo || "+54",
      telefono: perfilInicial?.telefono ?? "",
      documento: perfilInicial?.documento ?? "",
      matriculaTipo: (perfilInicial?.matriculaTipo || undefined) as "nacional" | "provincial" | undefined,
      matriculaNumero: perfilInicial?.matriculaNumero ?? "",
      especialidadIds: perfilInicial?.especialidades.map((e) => e.id) ?? [],
      aniosExperiencia: perfilInicial?.aniosExperiencia ?? undefined,
      bio: perfilInicial?.bio ?? "",
    },
  });

  const [busqueda, setBusqueda] = useState("");
  const [errorGlobal, setErrorGlobal] = useState<string | null>(null);
  const seleccionadas = watch("especialidadIds");

  const filtradas = especialidades.filter((e) => e.nombre.toLowerCase().includes(busqueda.toLowerCase()));

  function toggleEspecialidad(id: string) {
    const actuales = seleccionadas ?? [];
    setValue("especialidadIds", actuales.includes(id) ? actuales.filter((x) => x !== id) : [...actuales, id], {
      shouldValidate: true,
    });
  }

  async function onSubmit(values: OnboardingPerfilFormValues) {
    setErrorGlobal(null);
    const result = await onboardingPerfilAction({
      ...values,
      documento: values.documento || undefined,
      bio: values.bio || undefined,
    });
    // Si tuvo éxito, la acción ya redirigió (recarga /sumarse, que ahora
    // muestra el paso siguiente) y esta línea no se alcanza.
    if (result?.error) {
      setErrorGlobal(result.error);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <AuthField label="Nombre" error={errors.nombre?.message}>
          <input className={authInputClass} {...register("nombre")} />
        </AuthField>
        <AuthField label="Apellido" error={errors.apellido?.message}>
          <input className={authInputClass} {...register("apellido")} />
        </AuthField>
      </div>

      <div className="grid gap-5 sm:grid-cols-[6rem_1fr]">
        <AuthField label="País" error={errors.telefonoPrefijo?.message}>
          <input className={authInputClass} {...register("telefonoPrefijo")} />
        </AuthField>
        <AuthField label="Teléfono" error={errors.telefono?.message}>
          <input type="tel" autoComplete="tel" className={authInputClass} {...register("telefono")} />
        </AuthField>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <AuthField label="Matrícula — tipo" error={errors.matriculaTipo?.message}>
          <select className={authInputClass} defaultValue="" {...register("matriculaTipo")}>
            <option value="" disabled>
              Elegí una opción
            </option>
            <option value="nacional">Nacional</option>
            <option value="provincial">Provincial</option>
          </select>
        </AuthField>
        <AuthField label="Matrícula — número" error={errors.matriculaNumero?.message}>
          <input className={authInputClass} {...register("matriculaNumero")} />
        </AuthField>
      </div>

      <AuthField label="Documento (opcional)" error={errors.documento?.message}>
        <input className={authInputClass} {...register("documento")} />
      </AuthField>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-grafito">Especialidades</span>
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar…"
          className={authInputClass}
        />
        <div className="flex flex-wrap gap-2">
          {filtradas.map((esp) => {
            const activa = (seleccionadas ?? []).includes(esp.id);
            return (
              <button
                key={esp.id}
                type="button"
                onClick={() => toggleEspecialidad(esp.id)}
                aria-pressed={activa}
                className={`rounded-full border-[0.5px] px-3 py-1.5 text-sm ${
                  activa
                    ? "border-salvia bg-salvia-claro text-salvia-oscuro"
                    : "border-arena text-grafito hover:border-salvia hover:text-salvia-oscuro"
                }`}
              >
                {esp.nombre}
              </button>
            );
          })}
          {filtradas.length === 0 && <p className="text-sm text-grafito/60">Sin resultados para “{busqueda}”.</p>}
        </div>
        {errors.especialidadIds && <p className={authErrorClass}>{errors.especialidadIds.message}</p>}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <AuthField label="Años de experiencia (opcional)" error={errors.aniosExperiencia?.message}>
          <input type="number" min={0} max={80} className={authInputClass} {...register("aniosExperiencia")} />
        </AuthField>
      </div>

      <AuthField label="Bio corta (opcional)" error={errors.bio?.message}>
        <textarea rows={3} className={authInputClass} {...register("bio")} />
      </AuthField>

      {errorGlobal && (
        <p role="alert" className={authErrorClass}>
          {errorGlobal}
        </p>
      )}

      <button type="submit" disabled={isSubmitting} className={authSubmitClass}>
        {isSubmitting ? "Guardando…" : "Continuar"}
      </button>
    </form>
  );
}
