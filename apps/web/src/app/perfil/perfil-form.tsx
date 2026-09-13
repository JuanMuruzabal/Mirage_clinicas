"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { Especialidad } from "@dental-mirage/shared-types";
import type { SesionCompleta } from "@/lib/session";
import { updateMeAction } from "@/app/actions/auth";
import { onboardingPerfilSchema, type OnboardingPerfilFormValues } from "@/lib/validation/auth";
import { AuthField, authErrorClass, authInputClass, authSubmitClass, authSuccessClass } from "@/components/auth/auth-shell";

export function PerfilForm({ sesion, catalogo }: { sesion: SesionCompleta; catalogo: Especialidad[] }) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<OnboardingPerfilFormValues>({
    resolver: zodResolver(onboardingPerfilSchema),
    defaultValues: {
      tipoPerfil: sesion.tipoPerfil,
      nombre: sesion.nombre,
      apellido: sesion.apellido,
      telefonoPrefijo: sesion.telefonoPrefijo || "+54",
      telefono: sesion.telefono,
      documento: sesion.documento ?? "",
      matriculaTipo: (sesion.matriculaTipo || undefined) as "nacional" | "provincial" | undefined,
      matriculaNumero: sesion.matriculaNumero,
      especialidadIds: sesion.especialidades.map((e) => e.id),
      aniosExperiencia: sesion.aniosExperiencia ?? undefined,
      bio: sesion.bio ?? "",
    },
  });

  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const seleccionadas = watch("especialidadIds");
  // Quien trabaja en la clínica sin atender (recepción, administración de
  // la página) no tiene matrícula ni especialidades — Fase 3.2.3. Mostrarle
  // esos campos vacíos acá sería pedirle datos que la app decidió no
  // pedirle. El tipo no se cambia desde esta pantalla: el único camino a
  // "profesional" es armar la clínica propia, donde la matrícula sí hace
  // falta y se pide como parte de ese flujo.
  const atiendePacientes = sesion.tipoPerfil === "profesional";

  function toggleEspecialidad(id: string) {
    setGuardado(false);
    const actuales = seleccionadas ?? [];
    setValue("especialidadIds", actuales.includes(id) ? actuales.filter((x) => x !== id) : [...actuales, id], {
      shouldValidate: true,
    });
  }

  async function onSubmit(values: OnboardingPerfilFormValues) {
    setError(null);
    setGuardado(false);
    const result = await updateMeAction({
      ...values,
      documento: values.documento || undefined,
      bio: values.bio || undefined,
      // "" es lo que deja el select de matrícula cuando el campo estuvo
      // en pantalla y dejó de estarlo; el payload espera ausencia.
      matriculaTipo: values.matriculaTipo || undefined,
    });
    if (result?.error) {
      setError(result.error);
    } else {
      setGuardado(true);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex w-full max-w-lg flex-col gap-6">
      <div className="rounded-card border-[0.5px] border-arena bg-marfil p-5 shadow-soft">
        <p className="text-xs uppercase tracking-widest text-grafito/50">Email</p>
        <p className="mt-1 text-sm text-grafito">{sesion.email}</p>
        <p className="mt-3 text-xs uppercase tracking-widest text-grafito/50">Clínica</p>
        <p className="mt-1 text-sm text-grafito">{sesion.nombreClinica}</p>
      </div>

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
          <input type="tel" className={authInputClass} {...register("telefono")} />
        </AuthField>
      </div>

      {atiendePacientes && (
        <div className="grid gap-5 sm:grid-cols-2">
          <AuthField label="Matrícula — tipo" error={errors.matriculaTipo?.message}>
            <select className={authInputClass} {...register("matriculaTipo")}>
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
      )}

      <AuthField label="Documento" error={errors.documento?.message}>
        <input className={authInputClass} {...register("documento")} />
      </AuthField>

      {atiendePacientes && (
        <>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-grafito">Especialidades</span>
            <div className="flex flex-wrap gap-2">
              {catalogo.map((esp) => {
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
            </div>
            {errors.especialidadIds && <p className={authErrorClass}>{errors.especialidadIds.message}</p>}
          </div>

          <AuthField label="Años de experiencia" error={errors.aniosExperiencia?.message}>
            <input type="number" min={0} max={80} className={authInputClass} {...register("aniosExperiencia")} />
          </AuthField>
        </>
      )}

      <AuthField label="Bio corta" error={errors.bio?.message}>
        <textarea rows={3} className={authInputClass} {...register("bio")} />
      </AuthField>

      {error && (
        <p role="alert" className={authErrorClass}>
          {error}
        </p>
      )}
      {guardado && <p className={authSuccessClass}>Cambios guardados.</p>}

      <button type="submit" disabled={isSubmitting} className={`self-start ${authSubmitClass}`}>
        {isSubmitting ? "Guardando…" : "Guardar cambios"}
      </button>
    </form>
  );
}
