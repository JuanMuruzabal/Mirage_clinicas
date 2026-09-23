"use client";

import { useState } from "react";
import type { Paciente, TutorInfo } from "@dental-mirage/shared-types";
import { editarPacienteAction } from "@/app/actions/pacientes";
import { ModalPortal } from "./modal-portal";

interface EditarPacienteModalProps {
  paciente: Paciente;
  onClose: () => void;
  onSuccess: (paciente: Paciente) => void;
}

// Mismas reglas de formato que TR-002 (docs/Arquitectura y base/tradeoffs.md) — feedback
// inmediato acá, el backend (editarPacienteHandler) es la fuente de verdad.
const DNI_REGEX = /^\d{7,8}$/;
const TELEFONO_REGEX = /^\+?\d{10,13}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Un dato de contacto con su principal y los demás. "Los demás" son los
// alternativos que se fueron sumando (resolviendo conflictos, o un tutor
// que volvió con otro teléfono).
interface Contacto {
  principal: string;
  otros: string[];
}

interface TutorEditable {
  id: string;
  nombre: string;
  email: string;
  telefono: Contacto;
}

// promover — el elegido pasa a ser el principal y el que era principal
// ocupa su lugar en la lista: ninguno de los dos se pierde. Sin principal
// previo, el elegido simplemente sale de la lista.
function promover(c: Contacto, i: number): Contacto {
  const otros = [...c.otros];
  const elegido = otros[i];
  if (c.principal.trim()) {
    otros[i] = c.principal;
  } else {
    otros.splice(i, 1);
  }
  return { principal: elegido, otros };
}

function limpios(valores: string[]): string[] {
  return valores.map((v) => v.trim()).filter(Boolean);
}

function tutorEditable(t: TutorInfo): TutorEditable {
  return {
    id: t.id,
    nombre: t.nombre,
    email: t.email,
    telefono: { principal: t.telefono ?? "", otros: t.telefonosAlternativos ?? [] },
  };
}

// EditarPacienteModal — ficha de paciente (pedido explícito del cliente,
// 2026-08-23): corrige DNI, teléfono y email "por si hay alguna
// actualización en estos datos". A diferencia de editar un turno puntual,
// esto cambia el dato real del paciente, no solo el snapshot de contacto
// de un turno — nombre y apellido no son editables acá todavía.
//
// CONTACTOS PRINCIPALES (pedido del cliente, 2026-09-23): el paciente
// tiene UN teléfono y UN mail principales, que se editan directo en su
// campo; los que se fueron sumando aparecen abajo, en una lista con
// editar / quitar / hacer principal — y la lista solo existe si hay más de
// uno. Lo mismo para cada tutor, salvo el mail: el mail es la identidad
// del tutor (un mail nuevo en el wizard es OTRO tutor, TR-116), así que
// se corrige pero no acumula alternativos. Todo se guarda de una vez con
// "Guardar cambios": la lista que ve la persona es el estado final.
export function EditarPacienteModal({ paciente, onClose, onSuccess }: EditarPacienteModalProps) {
  const [dni, setDni] = useState(paciente.dni);
  const [telefono, setTelefono] = useState<Contacto>({
    principal: paciente.telefono ?? "",
    otros: paciente.telefonosAlternativos ?? [],
  });
  const [email, setEmail] = useState<Contacto>({
    principal: paciente.email ?? "",
    otros: paciente.emailsAlternativos ?? [],
  });
  const [tutores, setTutores] = useState<TutorEditable[]>((paciente.tutores ?? []).map(tutorEditable));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Con tutor, el paciente puede no tener mail ni teléfono propios: la
  // identidad la aporta el tutor (TR-147). Misma regla que el backend.
  const conTutor = tutores.length > 0;

  function actualizarTutor(i: number, cambio: Partial<TutorEditable>) {
    setTutores((prev) => prev.map((t, j) => (j === i ? { ...t, ...cambio } : t)));
  }

  function validar(): string | null {
    if (!DNI_REGEX.test(dni.trim())) {
      return "El DNI debe tener 7 u 8 dígitos, sin puntos.";
    }
    const tel = telefono.principal.trim();
    if (!tel && !conTutor) return "El teléfono es obligatorio.";
    if (tel && !TELEFONO_REGEX.test(tel)) {
      return "El teléfono no tiene un formato válido (10 a 13 dígitos, podés incluir el +).";
    }
    const otrosTel = limpios(telefono.otros);
    const telInvalido = otrosTel.find((t) => !TELEFONO_REGEX.test(t));
    if (telInvalido) return `El teléfono ${telInvalido} no tiene un formato válido.`;
    if (otrosTel.length > 0 && !tel) return "Si tiene más de un teléfono, elegí cuál es el principal.";

    const mail = email.principal.trim();
    if (!mail && !conTutor) return "El mail es obligatorio.";
    if (mail && !EMAIL_REGEX.test(mail)) return "El mail no tiene un formato válido.";
    const otrosMail = limpios(email.otros);
    const mailInvalido = otrosMail.find((m) => !EMAIL_REGEX.test(m));
    if (mailInvalido) return `El mail ${mailInvalido} no tiene un formato válido.`;
    if (otrosMail.length > 0 && !mail) return "Si tiene más de un mail, elegí cuál es el principal.";

    for (const t of tutores) {
      const mailTutor = t.email.trim();
      if (!mailTutor) return `El mail de ${t.nombre} es obligatorio.`;
      if (!EMAIL_REGEX.test(mailTutor)) return `El mail de ${t.nombre} no tiene un formato válido.`;
      const telTutor = t.telefono.principal.trim();
      if (!telTutor) return `El teléfono de ${t.nombre} es obligatorio.`;
      if (!TELEFONO_REGEX.test(telTutor)) return `El teléfono de ${t.nombre} no tiene un formato válido.`;
      const otroInvalido = limpios(t.telefono.otros).find((x) => !TELEFONO_REGEX.test(x));
      if (otroInvalido) return `El teléfono ${otroInvalido} de ${t.nombre} no tiene un formato válido.`;
    }
    return null;
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const problema = validar();
    if (problema) {
      setError(problema);
      return;
    }

    setPending(true);
    const result = await editarPacienteAction(paciente.id, {
      dni: dni.trim(),
      telefono: telefono.principal.trim(),
      email: email.principal.trim(),
      telefonosAlternativos: limpios(telefono.otros),
      emailsAlternativos: limpios(email.otros),
      ...(tutores.length > 0 && {
        tutores: tutores.map((t) => ({
          id: t.id,
          email: t.email.trim(),
          telefono: t.telefono.principal.trim(),
          telefonosAlternativos: limpios(t.telefono.otros),
        })),
      }),
    });
    setPending(false);

    if ("error" in result) {
      setError(result.error);
      return;
    }
    onSuccess(result.paciente);
  }

  return (
    <ModalPortal>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Editar datos del paciente"
        className="fixed inset-0 z-50 flex items-center justify-center bg-grafito/50 p-4 backdrop-blur-sm"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-card border-[0.5px] border-arena bg-marfil shadow-soft max-md:max-w-[90vw]">
          <div className="flex items-center justify-between border-b-[0.5px] border-arena px-6 py-4">
            <h2 className="font-[family-name:var(--font-display)] text-xl font-medium text-grafito">Editar datos del paciente</h2>
            <button type="button" onClick={onClose} aria-label="Cerrar" className="text-2xl leading-none text-grafito/50 hover:text-grafito">
              ×
            </button>
          </div>

          {/* noValidate: la validación nativa de `type="email"` frenaba el
              envío con su propio globo, antes que el mensaje de acá. */}
          <form onSubmit={guardar} noValidate className="flex flex-col gap-4 p-6">
            <Campo label="DNI">
              <input value={dni} onChange={(e) => setDni(e.target.value)} className={inputClass} />
            </Campo>

            <div className="flex flex-col gap-2">
              <Campo label="Teléfono principal">
                <input
                  value={telefono.principal}
                  onChange={(e) => setTelefono({ ...telefono, principal: e.target.value })}
                  className={inputClass}
                />
              </Campo>
              <ListaDeOtros titulo="Otros teléfonos" tipo="tel" contacto={telefono} onChange={setTelefono} />
            </div>

            <div className="flex flex-col gap-2">
              <Campo label="Mail principal">
                <input
                  type="email"
                  value={email.principal}
                  onChange={(e) => setEmail({ ...email, principal: e.target.value })}
                  className={inputClass}
                />
              </Campo>
              <ListaDeOtros titulo="Otros mails" tipo="email" contacto={email} onChange={setEmail} />
            </div>

            {tutores.map((t, i) => (
              <fieldset key={t.id} className="flex flex-col gap-3 border-t-[0.5px] border-arena pt-4">
                <legend className="pb-2 text-xs font-semibold uppercase tracking-wide text-grafito/50">Tutor · {t.nombre}</legend>
                <Campo label={`Mail de ${t.nombre}`}>
                  <input type="email" value={t.email} onChange={(e) => actualizarTutor(i, { email: e.target.value })} className={inputClass} />
                </Campo>
                <div className="flex flex-col gap-2">
                  <Campo label={`Teléfono principal de ${t.nombre}`}>
                    <input
                      value={t.telefono.principal}
                      onChange={(e) => actualizarTutor(i, { telefono: { ...t.telefono, principal: e.target.value } })}
                      className={inputClass}
                    />
                  </Campo>
                  <ListaDeOtros
                    titulo={`Otros teléfonos de ${t.nombre}`}
                    tipo="tel"
                    contacto={t.telefono}
                    onChange={(c) => actualizarTutor(i, { telefono: c })}
                  />
                </div>
              </fieldset>
            ))}

            {error && (
              <p role="alert" className="text-sm text-terracota-oscuro">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border-[0.5px] border-arena px-5 py-2.5 text-sm font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={pending}
                className="rounded-full bg-salvia-oscuro px-5 py-2.5 text-sm font-semibold text-marfil hover:brightness-95 disabled:opacity-60"
              >
                {pending ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
}

// ListaDeOtros — los datos que no son el principal, con sus tres
// acciones. No se dibuja si no hay ninguno: con un solo teléfono, el
// campo principal alcanza.
function ListaDeOtros({
  titulo,
  tipo,
  contacto,
  onChange,
}: {
  titulo: string;
  tipo: "tel" | "email";
  contacto: Contacto;
  onChange: (c: Contacto) => void;
}) {
  const [editando, setEditando] = useState<number | null>(null);

  if (contacto.otros.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5 rounded-field border-[0.5px] border-arena bg-hueso/60 px-3 py-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-grafito/50">{titulo}</span>
      <ul aria-label={titulo} className="flex flex-col">
        {contacto.otros.map((valor, i) => (
          <li key={i} className={`flex flex-wrap items-center gap-2 py-1.5 ${i > 0 ? "border-t-[0.5px] border-arena" : ""}`}>
            {editando === i ? (
              <>
                <input
                  type={tipo === "email" ? "email" : "text"}
                  aria-label={`Editar dato ${i + 1} de ${titulo.toLowerCase()}`}
                  value={valor}
                  autoFocus
                  onChange={(e) => onChange({ ...contacto, otros: contacto.otros.map((v, j) => (j === i ? e.target.value : v)) })}
                  className={`${inputClass} min-w-0 flex-1 py-1 text-sm`}
                />
                <button type="button" onClick={() => setEditando(null)} className={accionClass}>
                  Listo
                </button>
              </>
            ) : (
              <>
                <span className="min-w-0 flex-1 break-all font-[family-name:var(--font-mono)] text-sm text-grafito">{valor}</span>
                <span className="flex gap-1.5">
                  <button type="button" aria-label={`Editar ${valor}`} onClick={() => setEditando(i)} className={accionClass}>
                    Editar
                  </button>
                  <button
                    type="button"
                    aria-label={`Hacer principal ${valor}`}
                    onClick={() => {
                      setEditando(null);
                      onChange(promover(contacto, i));
                    }}
                    className={accionClass}
                  >
                    Hacer principal
                  </button>
                  <button
                    type="button"
                    aria-label={`Quitar ${valor}`}
                    onClick={() => {
                      setEditando(null);
                      onChange({ ...contacto, otros: contacto.otros.filter((_, j) => j !== i) });
                    }}
                    className={`${accionClass} hover:border-terracota hover:text-terracota-oscuro`}
                  >
                    Quitar
                  </button>
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Los campos del formulario con el borde de CLAUDE.md (`border-linea`):
// el de medio píxel desaparecía sobre el marfil del modal.
const inputClass = "rounded-field border border-linea bg-hueso px-3 py-2 text-grafito outline-none focus:border-salvia";

const accionClass =
  "rounded-full border-[0.5px] border-arena px-2.5 py-0.5 text-xs font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro";

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-grafito">{label}</span>
      {children}
    </label>
  );
}
