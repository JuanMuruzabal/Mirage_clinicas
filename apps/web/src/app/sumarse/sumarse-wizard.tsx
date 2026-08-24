"use client";

import { useState } from "react";
import type { Especialidad } from "@dental-mirage/shared-types";
import { registerAction } from "@/app/actions/auth";

type Paso = "datos" | "especialidades" | "clinica";

interface DatosPersonales {
  nombre: string;
  email: string;
  password: string;
  confirmarPassword: string;
  telefono: string;
}

const PASOS: { id: Paso; titulo: string }[] = [
  { id: "datos", titulo: "Datos personales" },
  { id: "especialidades", titulo: "Especialidades" },
  { id: "clinica", titulo: "Tu clínica" },
];

export function SumarseWizard({ especialidades }: { especialidades: Especialidad[] }) {
  const [paso, setPaso] = useState<Paso>("datos");
  const [datos, setDatos] = useState<DatosPersonales>({
    nombre: "",
    email: "",
    password: "",
    confirmarPassword: "",
    telefono: "",
  });
  const [seleccionadas, setSeleccionadas] = useState<string[]>([]);
  const [nombreClinica, setNombreClinica] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const pasoIndex = PASOS.findIndex((p) => p.id === paso);

  function toggleEspecialidad(id: string) {
    setSeleccionadas((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function irADatosSiguiente(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (datos.password !== datos.confirmarPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    if (datos.password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    setPaso("especialidades");
  }

  async function crearCuenta(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (nombreClinica.trim() === "") {
      setError("El nombre de la clínica es obligatorio.");
      return;
    }
    setPending(true);
    const result = await registerAction({
      nombre: datos.nombre,
      email: datos.email,
      password: datos.password,
      telefono: datos.telefono || undefined,
      nombreClinica,
      especialidadIds: seleccionadas,
    });
    if (result?.error) {
      setError(result.error);
      setPending(false);
    }
  }

  return (
    <div className="flex w-full max-w-lg flex-col gap-8">
      <ol className="flex items-center gap-2 font-[family-name:var(--font-mono)] text-xs uppercase tracking-widest text-grafito/50">
        {PASOS.map((p, i) => (
          <li key={p.id} className={`flex items-center gap-2 ${i === pasoIndex ? "text-grafito" : ""}`}>
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full border-[0.5px] ${
                i <= pasoIndex ? "border-salvia text-salvia-oscuro" : "border-arena"
              }`}
            >
              {i + 1}
            </span>
            {p.titulo}
            {i < PASOS.length - 1 && <span className="mx-1 text-arena">—</span>}
          </li>
        ))}
      </ol>

      {paso === "datos" && (
        <form onSubmit={irADatosSiguiente} className="flex flex-col gap-5">
          <Campo label="Nombre y apellido">
            <input
              required
              value={datos.nombre}
              onChange={(e) => setDatos((d) => ({ ...d, nombre: e.target.value }))}
              className={inputClass}
            />
          </Campo>
          <Campo label="Email">
            <input
              type="email"
              required
              value={datos.email}
              onChange={(e) => setDatos((d) => ({ ...d, email: e.target.value }))}
              className={inputClass}
            />
          </Campo>
          <Campo label="Teléfono (opcional)">
            <input
              value={datos.telefono}
              onChange={(e) => setDatos((d) => ({ ...d, telefono: e.target.value }))}
              className={inputClass}
            />
          </Campo>
          <Campo label="Contraseña">
            <input
              type="password"
              required
              value={datos.password}
              onChange={(e) => setDatos((d) => ({ ...d, password: e.target.value }))}
              className={inputClass}
            />
          </Campo>
          <Campo label="Confirmar contraseña">
            <input
              type="password"
              required
              value={datos.confirmarPassword}
              onChange={(e) => setDatos((d) => ({ ...d, confirmarPassword: e.target.value }))}
              className={inputClass}
            />
          </Campo>

          {error && <ErrorMsg>{error}</ErrorMsg>}

          <BotonPrimario type="submit">Continuar</BotonPrimario>
        </form>
      )}

      {paso === "especialidades" && (
        <div className="flex flex-col gap-5">
          <p className="text-sm text-grafito/60">
            Elegí las que apliquen — se muestran después en tu perfil público.
          </p>
          <div className="flex flex-wrap gap-2">
            {especialidades.map((esp) => {
              const activa = seleccionadas.includes(esp.id);
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
          {especialidades.length === 0 && (
            <p className="text-sm text-grafito/60">No se pudo cargar el catálogo — podés continuar sin elegir ninguna.</p>
          )}

          <div className="flex justify-between">
            <BotonSecundario type="button" onClick={() => setPaso("datos")}>
              Atrás
            </BotonSecundario>
            <BotonPrimario type="button" onClick={() => setPaso("clinica")}>
              Continuar
            </BotonPrimario>
          </div>
        </div>
      )}

      {paso === "clinica" && (
        <form onSubmit={crearCuenta} className="flex flex-col gap-5">
          <Campo label="Nombre de tu clínica o consultorio">
            {/* Sin `required`: la validación es el chequeo explícito de
                crearCuenta (setError) — con `required`, la validación
                nativa del navegador corta el submit antes de llegar ahí y
                nunca se ve nuestro mensaje. */}
            <input
              value={nombreClinica}
              onChange={(e) => setNombreClinica(e.target.value)}
              className={inputClass}
              placeholder="Consultorio Dr. Games"
            />
          </Campo>

          {error && <ErrorMsg>{error}</ErrorMsg>}

          <div className="flex justify-between">
            <BotonSecundario type="button" onClick={() => setPaso("especialidades")}>
              Atrás
            </BotonSecundario>
            <BotonPrimario type="submit" disabled={pending}>
              {pending ? "Creando cuenta…" : "Crear cuenta"}
            </BotonPrimario>
          </div>
        </form>
      )}
    </div>
  );
}

const inputClass = "rounded-field border-[0.5px] border-arena bg-marfil px-3 py-2 text-grafito outline-none focus:border-salvia";

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-grafito">{label}</span>
      {children}
    </label>
  );
}

function ErrorMsg({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="text-sm text-terracota-oscuro">
      {children}
    </p>
  );
}

function BotonPrimario(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = "", ...rest } = props;
  return (
    <button
      {...rest}
      className={`rounded-full bg-salvia-oscuro px-5 py-2.5 text-sm font-semibold text-marfil hover:brightness-95 disabled:opacity-60 ${className}`}
    />
  );
}

function BotonSecundario(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = "", ...rest } = props;
  return (
    <button
      {...rest}
      className={`rounded-full border-[0.5px] border-arena bg-marfil px-5 py-2.5 text-sm font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro ${className}`}
    />
  );
}
