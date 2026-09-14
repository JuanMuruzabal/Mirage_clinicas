"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { Especialidad, PerfilProfesional } from "@dental-mirage/shared-types";
import { onboardingPerfilAction } from "@/app/actions/auth";
import { onboardingPerfilSchema, type OnboardingPerfilFormValues } from "@/lib/validation/auth";
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
import { ModalShell, SeccionCampos } from "@/components/auth/modal-shell";
import { TarjetaOpcion } from "@/components/auth/tarjeta-opcion";
import { IconBriefcase, IconClinic, IconSearch, IconUser, IconX } from "@/components/icons";

interface OnboardingPerfilFormProps {
  especialidades: Especialidad[];
  perfilInicial?: PerfilProfesional;
  /**
   * Modo "completá lo que falta": se muestran SOLO los datos
   * profesionales (matricula y especialidades), porque los personales ya
   * estan cargados. Es el camino de quien entro a la app para hacer
   * recepcion o administrar la pagina y despues quiere armar su propia
   * clinica — para eso si hace falta matricula (Fase 3.2.3).
   */
  soloProfesional?: boolean;
  /** Si se pasa, al guardar NO se redirige: se avisa aca. Lo usa el
   *  encadenado "completa tus datos -> crea tu clinica". */
  onListo?: () => void;
  onCancelar?: () => void;
}

// El `form=` del botón del pie: ver ModalShell, el submit vive fuera del
// <form> para que el pie pueda quedar fijo.
const ID_FORM = "form-perfil-profesional";

// Perfil profesional (spec §4): obligatorios nombre, apellido, teléfono,
// matrícula y al menos una especialidad; el resto opcional pero visible.
//
// Rediseñado en la ronda de QA del 2026-09-13 (ver la bitácora de la fase (`docs/Fases post MVP/Fase 3/fase3.2-multi-tenant.md`)). Los cuatro cambios, y el porqué de cada uno:
//
//   - **Encabezado y pie fijos** (ModalShell): antes había que scrollear
//     hasta el fondo para encontrar "Continuar".
//   - **Dos grupos con título** en vez de una lista de nueve campos —
//     "Datos personales" y "Datos profesionales" son dos tareas cortas,
//     que es como la persona los tiene en la cabeza.
//   - **El país deja de ser un campo de texto** y pasa a ser un select
//     pegado al teléfono (CampoTelefono): nadie puede borrar el "+54".
//   - **Las especialidades elegidas van como chips DENTRO del campo de
//     búsqueda**, no sueltas abajo: el campo pasa a mostrar el estado, no
//     solo a filtrar.
export function OnboardingPerfilForm({
  especialidades,
  perfilInicial,
  soloProfesional = false,
  onListo,
  onCancelar,
}: OnboardingPerfilFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<OnboardingPerfilFormValues>({
    resolver: zodResolver(onboardingPerfilSchema),
    defaultValues: {
      // En modo "completa lo que falta" el destino es siempre
      // profesional: es justamente lo que se viene a agregar.
      tipoPerfil: soloProfesional ? "profesional" : (perfilInicial?.tipoPerfil ?? "profesional"),
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
  const seleccionadas = watch("especialidadIds") ?? [];
  const tipoPerfil = watch("tipoPerfil");
  const atiendePacientes = tipoPerfil === "profesional";

  const elegidas = especialidades.filter((e) => seleccionadas.includes(e.id));
  // Las ya elegidas salen de la lista de abajo: están arriba como chips, y
  // repetirlas hace pensar que son otras.
  const filtradas = especialidades.filter(
    (e) => !seleccionadas.includes(e.id) && e.nombre.toLowerCase().includes(busqueda.toLowerCase()),
  );

  function toggleEspecialidad(id: string) {
    setValue(
      "especialidadIds",
      seleccionadas.includes(id) ? seleccionadas.filter((x) => x !== id) : [...seleccionadas, id],
      { shouldValidate: true },
    );
  }

  async function onSubmit(values: OnboardingPerfilFormValues) {
    setErrorGlobal(null);
    const result = await onboardingPerfilAction(
      {
        ...values,
        documento: values.documento || undefined,
        bio: values.bio || undefined,
        // "" es el estado del select cuando el campo estuvo en pantalla y
        // dejó de estarlo; el backend espera ausencia, no vacío.
        matriculaTipo: values.matriculaTipo || undefined,
      },
      // Con `onListo` el flujo sigue en la misma pantalla (se encadena el
      // alta de la clinica), asi que la accion no redirige.
      { redirigir: !onListo },
    );
    if (result?.error) {
      setErrorGlobal(result.error);
      return;
    }
    // Sin `onListo`, la accion ya redirigio a /clinicas y esto no se
    // alcanza.
    onListo?.();
  }

  return (
    <ModalShell
      title={soloProfesional ? "Completá tus datos profesionales" : "Creá tu perfil"}
      subtitle={
        soloProfesional
          ? "Para tener tu propia clínica hace falta tu matrícula."
          : "Un último paso antes de empezar a usar PRISMA."
      }
      footer={
        <>
          {onCancelar && (
            <button type="button" onClick={onCancelar} className={authSecondaryButtonClass}>
              Cancelar
            </button>
          )}
          <button type="submit" form={ID_FORM} disabled={isSubmitting} className={authSubmitClass}>
            {isSubmitting ? "Guardando…" : "Continuar"}
          </button>
        </>
      }
    >
      <form id={ID_FORM} onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-7">
        {/* Qué hace esta persona en la clínica — Fase 3.2.3. No todo el
            que entra a la app atiende pacientes: un recepcionista o quien
            administra la página no tiene matrícula, y pedírsela como
            obligatoria lo dejaba afuera. Con las invitaciones por mail
            (3.2.4) ese caso pasa a ser corriente. */}
        {!soloProfesional && (
          <div className="grid items-stretch gap-3 sm:grid-cols-2">
            <TarjetaOpcion
              seleccionada={atiendePacientes}
              onClick={() => setValue("tipoPerfil", "profesional")}
              icono={<IconUser className="h-5 w-5" />}
              titulo="Profesional"
              descripcion="Atendés pacientes. Vas a cargar tu matrícula."
            />
            <TarjetaOpcion
              seleccionada={tipoPerfil === "actividades"}
              onClick={() => setValue("tipoPerfil", "actividades")}
              icono={<IconClinic className="h-5 w-5" />}
              titulo="Actividades de la clínica"
              descripcion="Recepción o administración de la página."
            />
          </div>
        )}

        {!soloProfesional && (
          <SeccionCampos titulo="Datos personales" icono={<IconUser className="h-4 w-4" />}>
            <div className="grid gap-4 sm:grid-cols-2">
              <AuthField label="Nombre" error={errors.nombre?.message}>
                <CampoConIcono icono={<IconUser className="h-[18px] w-[18px]" />}>
                  <input className={authInputConIconoClass} {...register("nombre")} />
                </CampoConIcono>
              </AuthField>
              <AuthField label="Apellido" error={errors.apellido?.message}>
                <input className={authInputClass} {...register("apellido")} />
              </AuthField>
            </div>

            <CampoTelefono
              label="Teléfono"
              prefijo={register("telefonoPrefijo")}
              numero={register("telefono")}
              error={errors.telefono?.message ?? errors.telefonoPrefijo?.message}
              placeholder="351 123 4567"
            />

            <AuthField label="Documento" opcional error={errors.documento?.message}>
              <input className={authInputClass} {...register("documento")} />
            </AuthField>
          </SeccionCampos>
        )}

        {atiendePacientes && (
          <SeccionCampos titulo="Datos profesionales" icono={<IconBriefcase className="h-4 w-4" />}>
            <div className="grid gap-4 sm:grid-cols-2">
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

            <div className="flex flex-col gap-2 text-sm">
              <span className="font-medium text-grafito">Especialidades</span>
              {/* Las elegidas viven ADENTRO del mismo control que la
                  búsqueda: un solo borde que contiene los chips y el campo
                  de texto. */}
              <div className="flex flex-col gap-2 rounded-[10px] border border-linea bg-hueso p-2 focus-within:border-salvia-oscuro">
                {elegidas.length > 0 && (
                  <ul className="flex flex-wrap gap-1.5">
                    {elegidas.map((esp) => (
                      <li key={esp.id}>
                        <button
                          type="button"
                          onClick={() => toggleEspecialidad(esp.id)}
                          aria-label={`Quitar ${esp.nombre}`}
                          className="flex items-center gap-1.5 rounded-full bg-salvia-claro px-2.5 py-1 text-sm text-salvia-oscuro hover:brightness-95"
                        >
                          {esp.nombre}
                          <IconX className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="relative flex flex-col">
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-grafito/40"
                  >
                    <IconSearch className="h-[18px] w-[18px]" />
                  </span>
                  <input
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="Buscar especialidad…"
                    aria-label="Buscar especialidad"
                    className="w-full bg-transparent py-1.5 pl-9 pr-2 text-grafito outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {filtradas.map((esp) => (
                  <button
                    key={esp.id}
                    type="button"
                    onClick={() => toggleEspecialidad(esp.id)}
                    className="rounded-full border-[0.5px] border-arena px-3 py-1.5 text-sm text-grafito hover:border-salvia hover:text-salvia-oscuro"
                  >
                    {esp.nombre}
                  </button>
                ))}
                {filtradas.length === 0 && busqueda !== "" && (
                  <p className="text-sm text-grafito/60">Sin resultados para “{busqueda}”.</p>
                )}
              </div>
              {errors.especialidadIds && <p className={authErrorClass}>{errors.especialidadIds.message}</p>}
            </div>

            <AuthField label="Años de experiencia" opcional error={errors.aniosExperiencia?.message}>
              <input type="number" min={0} max={80} className={authInputClass} {...register("aniosExperiencia")} />
            </AuthField>

            <AuthField label="Bio corta" opcional error={errors.bio?.message}>
              <textarea rows={3} className={authInputClass} {...register("bio")} />
            </AuthField>
          </SeccionCampos>
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
