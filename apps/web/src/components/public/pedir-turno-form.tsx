"use client";

import { useEffect, useState } from "react";
import type { TipoConsultaPublico } from "@/lib/api";
import {
  confirmarVerificacionEmailAction,
  enviarVerificacionEmailAction,
  listDisponibilidadPublicaAction,
  listTiposConsultaPublicoAction,
  solicitarTurnoPublicoAction,
} from "@/app/actions/turno-publico";
import { fechaISOLocal } from "@/lib/calendar-utils";
import { HoraPicker } from "@/components/panel/hora-picker";

interface PedirTurnoFormProps {
  slug: string;
  nombreClinica: string;
  telefonoClinica?: string | null;
}

// TR-002 en docs/tradeoffs.md: mismas reglas que valida el backend
// (turno_publico.go) — el frontend las repite acá para dar feedback
// inmediato, pero el backend es la fuente de verdad (nunca confiar solo en
// esta validación).
const DNI_REGEX = /^\d{7,8}$/;
const TELEFONO_REGEX = /^\+?\d{10,13}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CAMPOS_INICIALES = {
  nombreContacto: "",
  apellidoContacto: "",
  dniContacto: "",
  telefonoContacto: "",
  emailContacto: "",
  motivo: "",
};

type Paso = "contacto" | "verificacion" | "turno";

// PedirTurnoForm — Extra 2.3.5 (E5.3, docs/implementation-plan.md §11.5),
// reescrito de punta a punta: antes solo pedía datos de contacto y el
// turno quedaba `pendiente`, sin horario, a la espera de que el
// profesional lo agendara a mano (TR-006). Ahora es un wizard de 3 pasos,
// mismo flujo visual que "Agregar turno" del profesional
// (agregar-turno-modal.tsx): datos de contacto → "Confirmanos que sos
// vos" (E5.6, código de 6 dígitos al mail) → tipo de consulta + fecha +
// horario disponible (reusa el cálculo de disponibilidad real, TR-086,
// vía los endpoints públicos de E5.2). El turno nace `agendado`, con
// horario fijo, de punta a punta — el link de WhatsApp (TR-003) se sigue
// armando client-side después de confirmar, con el teléfono que el propio
// profesional publicó.
export function PedirTurnoForm({ slug, nombreClinica, telefonoClinica }: PedirTurnoFormProps) {
  const [paso, setPaso] = useState<Paso>("contacto");
  const [campos, setCampos] = useState(CAMPOS_INICIALES);

  // Verificación de mail (E5.6) — codigo es lo que el paciente tipea;
  // verificacionToken es la prueba que devuelve el backend al confirmarlo
  // bien, y viaja en el pedido de turno final. enviandoCodigo/verificando
  // son pendings separados: "Continuar"/"Reenviar código" vs. "Confirmar
  // código", nunca activos los dos a la vez.
  const [codigo, setCodigo] = useState("");
  const [verificacionToken, setVerificacionToken] = useState("");
  const [enviandoCodigo, setEnviandoCodigo] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const [avisoReenvio, setAvisoReenvio] = useState<string | null>(null);

  const [tipos, setTipos] = useState<TipoConsultaPublico[]>([]);
  const [cargandoTipos, setCargandoTipos] = useState(true);
  const [tipoConsultaId, setTipoConsultaId] = useState("");

  const hoyISO = fechaISOLocal();
  const [fecha, setFecha] = useState(() => hoyISO);
  const [hora, setHora] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  // Arranca en "cargando" (no `false`): apenas el tipo de consulta se
  // auto-selecciona (efecto de arriba), el efecto de disponibilidad de
  // abajo corre solo — arrancar en `true` cubre esa primera carga sin
  // tener que llamar `setCargandoSlots(true)` de forma síncrona DENTRO de
  // ese efecto (react-hooks/set-state-in-effect); los cambios
  // POSTERIORES de tipo/fecha sí lo prenden, pero desde los onChange que
  // los disparan, mismo criterio que agregar-turno-modal.tsx.
  const [cargandoSlots, setCargandoSlots] = useState(true);

  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [linkWhatsapp, setLinkWhatsapp] = useState<string | null>(null);
  const [confirmado, setConfirmado] = useState<{ fecha: string; hora: string } | null>(null);

  function actualizar<K extends keyof typeof CAMPOS_INICIALES>(campo: K, valor: string) {
    setCampos((c) => ({ ...c, [campo]: valor }));
  }

  // Tipos de consulta de la clínica — se piden una sola vez, al montar.
  useEffect(() => {
    let activo = true;
    listTiposConsultaPublicoAction(slug).then((lista) => {
      if (!activo) return;
      setTipos(lista);
      setCargandoTipos(false);
      setTipoConsultaId((actual) => actual || (lista[0]?.id ?? ""));
    });
    return () => {
      activo = false;
    };
  }, [slug]);

  // Disponibilidad real — se vuelve a pedir cada vez que cambia el tipo de
  // consulta o la fecha, mismo criterio que agregar-turno-modal.tsx.
  useEffect(() => {
    if (!tipoConsultaId) return;
    let activo = true;
    listDisponibilidadPublicaAction(slug, tipoConsultaId, fecha).then((disponibilidad) => {
      if (!activo) return;
      setSlots(disponibilidad.slots);
      setCargandoSlots(false);
      setHora((actual) => (disponibilidad.slots.includes(actual) ? actual : (disponibilidad.slots[0] ?? "")));
    });
    return () => {
      activo = false;
    };
  }, [slug, tipoConsultaId, fecha]);

  async function continuar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const nombreContacto = campos.nombreContacto.trim();
    const apellidoContacto = campos.apellidoContacto.trim();
    const dniContacto = campos.dniContacto.trim();
    const telefonoContacto = campos.telefonoContacto.trim();
    const emailContacto = campos.emailContacto.trim().toLowerCase();

    if (!nombreContacto || !apellidoContacto) {
      setError("Nombre y apellido son obligatorios.");
      return;
    }
    if (!DNI_REGEX.test(dniContacto)) {
      setError("El DNI debe tener 7 u 8 dígitos, sin puntos.");
      return;
    }
    if (!TELEFONO_REGEX.test(telefonoContacto)) {
      setError("El teléfono no tiene un formato válido (10 a 13 dígitos, podés incluir el +).");
      return;
    }
    if (!EMAIL_REGEX.test(emailContacto)) {
      setError("El email no tiene un formato válido.");
      return;
    }

    setCampos((c) => ({ ...c, emailContacto }));

    // "Confirmanos que sos vos" (E5.6): antes de pasar al tipo de
    // consulta/fecha/horario, se manda el código de verificación al mail
    // recién validado.
    setEnviandoCodigo(true);
    const result = await enviarVerificacionEmailAction(slug, emailContacto);
    setEnviandoCodigo(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setPaso("verificacion");
  }

  async function confirmarCodigo(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!codigo.trim()) {
      setError("Ingresá el código que te mandamos por mail.");
      return;
    }

    setVerificando(true);
    const result = await confirmarVerificacionEmailAction(slug, campos.emailContacto, codigo.trim());
    setVerificando(false);
    if (result.error || !result.token) {
      setError(result.error ?? "No se pudo verificar el código.");
      return;
    }
    setVerificacionToken(result.token);
    setPaso("turno");
  }

  async function reenviarCodigo() {
    setError(null);
    setAvisoReenvio(null);
    setEnviandoCodigo(true);
    const result = await enviarVerificacionEmailAction(slug, campos.emailContacto);
    setEnviandoCodigo(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setAvisoReenvio("Te mandamos un código nuevo.");
  }

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!tipoConsultaId) {
      setError("Elegí un tipo de consulta.");
      return;
    }
    if (!hora) {
      setError("Elegí un horario disponible.");
      return;
    }

    const nombreContacto = campos.nombreContacto.trim();
    const apellidoContacto = campos.apellidoContacto.trim();
    const dniContacto = campos.dniContacto.trim();
    const telefonoContacto = campos.telefonoContacto.trim();
    const emailContacto = campos.emailContacto.trim().toLowerCase();
    const motivo = campos.motivo.trim();

    setPending(true);
    const result = await solicitarTurnoPublicoAction(slug, {
      nombreContacto,
      apellidoContacto,
      dniContacto,
      telefonoContacto,
      emailContacto,
      motivo: motivo || undefined,
      tipoConsultaId,
      fecha,
      hora,
      verificacionToken,
    });
    setPending(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    if (telefonoClinica) {
      const numero = telefonoClinica.replace(/[^\d]/g, "");
      const texto = `Hola! Te pedí un turno desde tu página para el ${fecha} a las ${hora}. Soy ${nombreContacto} ${apellidoContacto} (DNI ${dniContacto}).${
        motivo ? ` Motivo: ${motivo}.` : ""
      }`;
      setLinkWhatsapp(`https://wa.me/${numero}?text=${encodeURIComponent(texto)}`);
    }
    setConfirmado({ fecha, hora });
  }

  if (confirmado) {
    return (
      <div className="flex flex-col gap-4 rounded-card border-[0.5px] border-arena bg-marfil p-6 text-center shadow-soft">
        <p className="font-[family-name:var(--font-display)] text-lg font-medium text-grafito">
          ¡Listo! Tu turno en {nombreClinica} quedó confirmado
        </p>
        <p className="text-sm text-grafito/60">
          {confirmado.fecha} a las {confirmado.hora}hs.
        </p>
        {linkWhatsapp && (
          <a
            href={linkWhatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="mx-auto inline-block rounded-full bg-salvia-oscuro px-6 py-3 text-sm font-semibold text-marfil hover:brightness-95"
          >
            Escribir también por WhatsApp
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-card border-[0.5px] border-arena bg-marfil p-6 shadow-soft">
      {paso === "contacto" && (
        <form onSubmit={continuar} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo label="Nombre">
              <input value={campos.nombreContacto} onChange={(e) => actualizar("nombreContacto", e.target.value)} className={inputClass} />
            </Campo>
            <Campo label="Apellido">
              <input
                value={campos.apellidoContacto}
                onChange={(e) => actualizar("apellidoContacto", e.target.value)}
                className={inputClass}
              />
            </Campo>
            <Campo label="DNI">
              <input value={campos.dniContacto} onChange={(e) => actualizar("dniContacto", e.target.value)} className={inputClass} />
            </Campo>
            <Campo label="Teléfono">
              <input
                value={campos.telefonoContacto}
                onChange={(e) => actualizar("telefonoContacto", e.target.value)}
                placeholder="+54 9 351…"
                className={inputClass}
              />
            </Campo>
          </div>
          <Campo label="Email">
            <input
              type="email"
              value={campos.emailContacto}
              onChange={(e) => actualizar("emailContacto", e.target.value)}
              className={inputClass}
            />
          </Campo>
          <Campo label="Motivo de consulta (opcional)">
            <input value={campos.motivo} onChange={(e) => actualizar("motivo", e.target.value)} className={inputClass} />
          </Campo>

          {error && <ErrorMsg>{error}</ErrorMsg>}

          <button
            type="submit"
            disabled={enviandoCodigo}
            className="self-start rounded-full bg-salvia-oscuro px-8 py-3 text-sm font-semibold text-marfil hover:brightness-95 disabled:opacity-60"
          >
            {enviandoCodigo ? "Enviando código…" : "Continuar"}
          </button>
        </form>
      )}

      {paso === "verificacion" && (
        <form onSubmit={confirmarCodigo} className="flex flex-col gap-4">
          <div>
            <p className="font-[family-name:var(--font-display)] text-lg font-medium text-grafito">Confirmanos que sos vos</p>
            <p className="text-sm text-grafito/60">
              Te mandamos un código de 6 dígitos a <span className="font-medium text-grafito">{campos.emailContacto}</span>. Ingresalo acá
              para seguir con tu turno.
            </p>
          </div>

          <Campo label="Código de verificación">
            <input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              className={`${inputClass} text-center font-[family-name:var(--font-mono)] text-lg tracking-[0.3em]`}
            />
          </Campo>

          {avisoReenvio && <p className="text-sm text-salvia-oscuro">{avisoReenvio}</p>}
          {error && <ErrorMsg>{error}</ErrorMsg>}

          <button
            type="button"
            onClick={reenviarCodigo}
            disabled={enviandoCodigo}
            className="self-start text-sm font-medium text-salvia-oscuro hover:text-grafito disabled:opacity-60"
          >
            {enviandoCodigo ? "Reenviando…" : "Reenviar código"}
          </button>

          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => setPaso("contacto")}
              className="rounded-full border-[0.5px] border-arena px-5 py-2.5 text-sm font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro"
            >
              Atrás
            </button>
            <button
              type="submit"
              disabled={verificando}
              className="rounded-full bg-salvia-oscuro px-5 py-2.5 text-sm font-semibold text-marfil hover:brightness-95 disabled:opacity-60"
            >
              {verificando ? "Verificando…" : "Confirmar código"}
            </button>
          </div>
        </form>
      )}

      {paso === "turno" && (
        // noValidate: el `min` de la fecha es solo una ayuda del selector
        // nativo — la validación real (con el mismo mensaje en español que
        // el resto del form) la hace el backend contra la fecha/hora
        // elegidas (mismo criterio que agregar-turno-modal.tsx).
        <form onSubmit={confirmar} noValidate className="flex flex-col gap-5">
          <Campo label="Tipo de consulta">
            <select
              value={tipoConsultaId}
              onChange={(e) => {
                setTipoConsultaId(e.target.value);
                setCargandoSlots(true);
              }}
              disabled={cargandoTipos || tipos.length === 0}
              className={inputClass}
            >
              {tipos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </Campo>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo label="Fecha">
              <input
                type="date"
                value={fecha}
                min={hoyISO}
                onChange={(e) => {
                  setFecha(e.target.value);
                  setCargandoSlots(true);
                }}
                className={inputClass}
              />
            </Campo>
            {/* Sin <Campo> a propósito, mismo motivo que
                agregar-turno-modal.tsx: un <label> le pega su texto como
                nombre accesible a cualquier elemento etiquetable que
                contenga, y cada opción del HoraPicker terminaría
                anunciándose como "Hora" en vez de "09:00". */}
            <div className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-grafito">Hora</span>
              <HoraPicker slots={slots} value={hora} onChange={setHora} cargando={cargandoSlots} />
            </div>
          </div>

          {error && <ErrorMsg>{error}</ErrorMsg>}

          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => setPaso("verificacion")}
              className="rounded-full border-[0.5px] border-arena px-5 py-2.5 text-sm font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro"
            >
              Atrás
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-full bg-salvia-oscuro px-5 py-2.5 text-sm font-semibold text-marfil hover:brightness-95 disabled:opacity-60"
            >
              {pending ? "Confirmando…" : "Confirmar turno"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

const inputClass = "rounded-field border-[0.5px] border-arena bg-hueso px-3 py-2.5 text-grafito outline-none focus:border-salvia";

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
