"use client";

import { useState } from "react";
import { solicitarTurnoPublicoAction } from "@/app/actions/turno-publico";

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

// PedirTurnoForm (T3.1/T3.2, spec §4.4) — al confirmar, crea el turno
// `pendiente` en el backend y en paralelo arma un link de WhatsApp
// (TR-003) con el teléfono que el propio profesional publicó, para que el
// paciente además le escriba directo. Si la clínica no cargó teléfono
// todavía, solo queda el turno pendiente y un mensaje de confirmación.
export function PedirTurnoForm({ slug, nombreClinica, telefonoClinica }: PedirTurnoFormProps) {
  const [campos, setCampos] = useState(CAMPOS_INICIALES);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [linkWhatsapp, setLinkWhatsapp] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);

  function actualizar<K extends keyof typeof CAMPOS_INICIALES>(campo: K, valor: string) {
    setCampos((c) => ({ ...c, [campo]: valor }));
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const nombreContacto = campos.nombreContacto.trim();
    const apellidoContacto = campos.apellidoContacto.trim();
    const dniContacto = campos.dniContacto.trim();
    const telefonoContacto = campos.telefonoContacto.trim();
    const emailContacto = campos.emailContacto.trim().toLowerCase();
    const motivo = campos.motivo.trim();

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

    setPending(true);
    const result = await solicitarTurnoPublicoAction(slug, {
      nombreContacto,
      apellidoContacto,
      dniContacto,
      telefonoContacto,
      emailContacto,
      motivo: motivo || undefined,
    });
    setPending(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    if (telefonoClinica) {
      const numero = telefonoClinica.replace(/[^\d]/g, "");
      const texto = `Hola! Te pedí un turno desde tu página. Soy ${nombreContacto} ${apellidoContacto} (DNI ${dniContacto}).${
        motivo ? ` Motivo: ${motivo}.` : ""
      }`;
      setLinkWhatsapp(`https://wa.me/${numero}?text=${encodeURIComponent(texto)}`);
    }
    setEnviado(true);
  }

  if (enviado) {
    return (
      <div className="flex flex-col gap-4 rounded-card border-[0.5px] border-arena bg-marfil p-6 text-center shadow-soft">
        <p className="font-[family-name:var(--font-display)] text-lg font-medium text-grafito">
          ¡Listo! Tu pedido de turno llegó a {nombreClinica}
        </p>
        <p className="text-sm text-grafito/60">Te van a contactar para confirmar el día y horario.</p>
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
    <form onSubmit={enviar} className="flex flex-col gap-4 rounded-card border-[0.5px] border-arena bg-marfil p-6 shadow-soft">
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

      {error && (
        <p role="alert" className="text-sm text-terracota-oscuro">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-full bg-salvia-oscuro px-8 py-3 text-sm font-semibold text-marfil hover:brightness-95 disabled:opacity-60"
      >
        {pending ? "Enviando…" : "Pedir turno"}
      </button>
    </form>
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
