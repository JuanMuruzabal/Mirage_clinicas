"use client";

import { useEffect, useState } from "react";
import type { TipoConsultaPublico, PacienteVerificadoPublico, SolicitarTurnoPublicoPayload } from "@/lib/api";
import {
  confirmarVerificacionEmailAction,
  enviarVerificacionEmailAction,
  listDisponibilidadPublicaAction,
  listTiposConsultaPublicoAction,
  pacienteVerificadoPublicoAction,
  pacientesVerificadosDeTutorAction,
  solicitarTurnoPublicoAction,
} from "@/app/actions/turno-publico";
import { fechaISOLocal } from "@/lib/calendar-utils";
import { HoraPicker } from "@/components/panel/hora-picker";
import { TurnstileWidget } from "@/components/auth/turnstile-widget";

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

// TUTOR_CAMPOS_INICIALES — Fase 2.4.2, camino "sacar turno para otro": los
// campos de arriba (CAMPOS_INICIALES) siguen siendo del PACIENTE en los
// dos caminos (sin cambio de significado, ver el comentario grande en
// turno_publico.go/models.go del backend) — este es el set PARALELO de
// datos de quien reserva en su nombre.
const TUTOR_CAMPOS_INICIALES = {
  relacion: "",
  nombre: "",
  telefono: "",
  email: "",
};

// Paso — Fase 2.4.1 (`docs/FASE 2.4 - detallada y bien especificada.docx`):
// el wizard de Extra 2.3.5 (contacto → verificacion → turno) ahora arranca
// con dos preguntas nuevas ("¿Para quién es el turno?" / "¿Ya te has
// atendido con nosotros?") que abren dos caminos:
//   - "primera vez": el wizard de siempre, sin cambios (contacto →
//     verificacion → turno).
//   - "ya he venido antes": pide DNI + mail, verifica con el mismo
//     mecanismo ("Confirmanos que sos vos", ya-vine-codigo), y si hay una
//     ficha VERIFICADA que matchee, muestra una tarjeta clickeable
//     (tarjeta-paciente) que salta directo a "turno" sin volver a pedir
//     nombre/apellido/DNI/teléfono.
// Fase 2.4.2 ("para otro"): reusa la MISMA pregunta "ya-te-atendiste" (ver
// el flag `esOtro` más abajo, que decide a cuál de los 2 grupos de pasos
// saltar) con su propio par de caminos:
//   - "otro-tutor" → "otro-paciente": pide primero los datos de quien
//     reserva (el tutor) y recién en una pantalla aparte los del paciente
//     (sin nombre/apellido/DNI/teléfono del paciente asumidos del contacto
//     que completa el formulario — son 2 personas distintas). Corrección
//     de QA (2026-09-06): antes era un solo paso con las 2 tandas de
//     campos juntas — "el apartado 'para otro' es muy grande" — se separó
//     en 2 pantallas, tutor primero. Verifica el mail del TUTOR recién al
//     terminar "otro-paciente" (otro-verificacion).
//   - "otro-ya-vine-datos": pide solo el mail del tutor, verifica
//     (otro-ya-vine-codigo) y muestra una LISTA de tarjetas
//     (otro-tarjeta-paciente) — un tutor puede tener más de un hijo
//     verificado a su cargo.
type Paso =
  | "para-quien"
  | "ya-te-atendiste"
  | "contacto"
  | "verificacion"
  | "ya-vine-datos"
  | "ya-vine-codigo"
  | "tarjeta-paciente"
  | "otro-tutor"
  | "otro-paciente"
  | "otro-verificacion"
  | "otro-ya-vine-datos"
  | "otro-ya-vine-codigo"
  | "otro-tarjeta-paciente"
  | "turno";

const PASOS_VALIDOS: Paso[] = [
  "para-quien",
  "ya-te-atendiste",
  "contacto",
  "verificacion",
  "ya-vine-datos",
  "ya-vine-codigo",
  "tarjeta-paciente",
  "otro-tutor",
  "otro-paciente",
  "otro-verificacion",
  "otro-ya-vine-datos",
  "otro-ya-vine-codigo",
  "otro-tarjeta-paciente",
  "turno",
];

// Flujo — qué camino llegó al paso "turno", para saber qué mandar en
// solicitarTurnoPublicoAction y cómo armar el texto de WhatsApp al
// confirmar. Los 2 nuevos ("otro-primera-vez"/"otro-verificado", Fase
// 2.4.2) son el espejo exacto de los 2 de siempre, para el camino "para
// otro".
type Flujo = "primera-vez" | "verificado" | "otro-primera-vez" | "otro-verificado";

// Persistencia del progreso del wizard (pedido textual del cliente,
// 2026-09-05): "si esta ventana se cierra o se reinicia... para evitarle
// molestias debería, al poner Pedir turno, llevarlo al paso del wizard en
// el que estaba" — pensado para mobile, donde tocar afuera sin querer o
// que el navegador recicle la pestaña cierra el modal (PedirTurnoButton
// desmonta este componente entero, perdiendo todo el estado de React).
//
// Va en localStorage, NO en la cookie de sesión (`lib/session.ts` — esa sí
// nunca en localStorage, spec §9.3): esto no es una sesión autenticada, es
// el progreso de un formulario público que el propio paciente ya está
// tipeando y mandando al backend; persistirlo en el navegador del propio
// paciente durante una ventana corta no expone nada que el backend no
// tenga ya. Se excluye a propósito el código de 6 dígitos tipeado
// (`codigo`) y el token de Turnstile (de un solo uso, se re-emite solo) —
// ninguno de los dos sirve de nada restaurado.
//
// Ventana de 30 minutos (`turnoVerifPruebaTTL` en el backend,
// verificacion_turno_publico.go) — pasado ese tiempo desde el último
// cambio, el token de verificación ya venció de todos modos, así que
// resumir no ahorra nada; se descarta y arranca de cero. Se resetea en
// cada cambio (no desde que se abrió por primera vez), para no penalizar
// a alguien que sí está usando el wizario activamente pero tarda.
const PEDIR_TURNO_STORAGE_VERSION = 1;
const PEDIR_TURNO_VENTANA_RESUMEN_MS = 30 * 60 * 1000;

interface EstadoGuardado {
  version: number;
  guardadoEn: number;
  paso: Paso;
  flujo: Flujo;
  campos: typeof CAMPOS_INICIALES;
  yaVineDni: string;
  emailEnVerificacion: string;
  verificacionToken: string;
  pacienteVerificado: PacienteVerificadoPublico | null;
  tipoConsultaId: string;
  fecha: string;
  hora: string;
  // esOtro/tutorCampos/pacientesVerificadosTutor (Fase 2.4.2) — mismo
  // criterio que el resto de este objeto: se restauran para no perder el
  // progreso del camino "para otro" si el modal se cierra sin querer.
  esOtro: boolean;
  tutorCampos: typeof TUTOR_CAMPOS_INICIALES;
  pacientesVerificadosTutor: PacienteVerificadoPublico[];
}

function pedirTurnoStorageKey(slug: string): string {
  return `dental-mirage:pedir-turno:${slug}`;
}

// leerEstadoGuardado — nunca deja que un localStorage corrupto, de otra
// versión, o vencido rompa el wizard: cualquier problema de parseo o de
// forma devuelve null (arranca de cero) en vez de propagar el error.
function leerEstadoGuardado(slug: string): EstadoGuardado | null {
  try {
    const crudo = localStorage.getItem(pedirTurnoStorageKey(slug));
    if (!crudo) return null;
    const datos = JSON.parse(crudo) as Partial<EstadoGuardado>;
    if (datos.version !== PEDIR_TURNO_STORAGE_VERSION || typeof datos.guardadoEn !== "number" || typeof datos.paso !== "string") {
      localStorage.removeItem(pedirTurnoStorageKey(slug));
      return null;
    }
    if (Date.now() - datos.guardadoEn > PEDIR_TURNO_VENTANA_RESUMEN_MS) {
      localStorage.removeItem(pedirTurnoStorageKey(slug));
      return null;
    }
    if (!PASOS_VALIDOS.includes(datos.paso as Paso)) {
      localStorage.removeItem(pedirTurnoStorageKey(slug));
      return null;
    }
    return datos as EstadoGuardado;
  } catch {
    return null;
  }
}

function guardarEstadoGuardado(slug: string, estado: EstadoGuardado) {
  try {
    localStorage.setItem(pedirTurnoStorageKey(slug), JSON.stringify(estado));
  } catch {
    // localStorage puede fallar (modo privado, cuota llena) — degradar a
    // "no se puede resumir" en vez de romper el wizard en uso.
  }
}

function borrarEstadoGuardado(slug: string) {
  try {
    localStorage.removeItem(pedirTurnoStorageKey(slug));
  } catch {
    // ver guardarEstadoGuardado.
  }
}

// PedirTurnoForm — Extra 2.3.5 (E5.3) + Fase 2.4.1 (rework de punta a
// punta, docs/implementation-plan.md §11.6): antes era un wizard de 3
// pasos fijo (contacto → verificacion → turno). Ahora arranca preguntando
// para quién es el turno y si el paciente ya se atendió antes — quien dice
// que sí puede saltarse los datos de contacto por completo si tiene una
// ficha VERIFICADA (al menos un turno resuelto y asistido) que matchee su
// DNI + mail. El turno sigue naciendo `agendado`, con horario fijo, de
// punta a punta.
export function PedirTurnoForm({ slug, nombreClinica, telefonoClinica }: PedirTurnoFormProps) {
  // estadoInicial — se lee UNA sola vez (useState solo evalúa el
  // inicializador en el primer render), ver el comentario grande de
  // leerEstadoGuardado/PEDIR_TURNO_VENTANA_RESUMEN_MS arriba.
  const [estadoInicial] = useState<EstadoGuardado | null>(() => leerEstadoGuardado(slug));

  const [paso, setPaso] = useState<Paso>(() => estadoInicial?.paso ?? "para-quien");
  const [flujo, setFlujo] = useState<Flujo>(() => estadoInicial?.flujo ?? "primera-vez");
  const [campos, setCampos] = useState(() => estadoInicial?.campos ?? CAMPOS_INICIALES);
  // esOtro (Fase 2.4.2) — se fija en el paso "para-quien" ("Para mí" vs
  // "Para otro") y decide, en el paso "ya-te-atendiste" (LA MISMA
  // pregunta para los 2 caminos), a cuál de los 2 grupos de pasos saltar.
  const [esOtro, setEsOtro] = useState(() => estadoInicial?.esOtro ?? false);
  const [tutorCampos, setTutorCampos] = useState(() => estadoInicial?.tutorCampos ?? TUTOR_CAMPOS_INICIALES);

  // Verificación de mail ("Confirmanos que sos vos") — reusada por los DOS
  // caminos ("primera vez" y "ya he venido antes"): emailEnVerificacion
  // guarda a qué mail le corresponde el código que se está tipeando,
  // independiente de en qué paso del wizard se originó.
  const [codigo, setCodigo] = useState("");
  const [emailEnVerificacion, setEmailEnVerificacion] = useState(() => estadoInicial?.emailEnVerificacion ?? "");
  const [verificacionToken, setVerificacionToken] = useState(() => estadoInicial?.verificacionToken ?? "");
  const [enviandoCodigo, setEnviandoCodigo] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const [avisoReenvio, setAvisoReenvio] = useState<string | null>(null);
  // codigoDev (Fase 2.4.1, pedido del cliente) — SOLO viene en local (sin
  // RESEND_API_KEY configurada, ver AuthDeps.ExponerCodigoVerificacion en
  // el backend), nunca en producción: se muestra debajo del campo para no
  // tener que ir a buscar el código a los logs mientras se prueba el
  // wizard en desarrollo.
  const [codigoDev, setCodigoDev] = useState<string | null>(null);
  // captchaToken (corrección de seguridad, Fase 2.4.1) — el widget de
  // Turnstile vive en los dos pasos que disparan
  // enviarVerificacionEmailAction ("contacto" de "primera vez" y
  // "ya-vine-datos" de "ya he venido antes"), compartiendo un solo
  // estado — sin NEXT_PUBLIC_TURNSTILE_SITE_KEY el widget no se renderiza
  // y esto queda en "" (mismo criterio que crear-cuenta-form.tsx).
  const [captchaToken, setCaptchaToken] = useState("");

  // Camino "ya he venido antes" (Fase 2.4.1).
  const [yaVineDni, setYaVineDni] = useState(() => estadoInicial?.yaVineDni ?? "");
  const [pacienteVerificado, setPacienteVerificado] = useState<PacienteVerificadoPublico | null>(
    () => estadoInicial?.pacienteVerificado ?? null,
  );
  // pacientesVerificadosTutor (Fase 2.4.2) — la LISTA que devuelve el
  // camino "para otro" + "ya he venido antes" (un tutor puede tener más
  // de un hijo verificado a su cargo). `pacienteVerificado` de arriba
  // sigue siendo "la tarjeta ya elegida", igual en los 2 caminos — una
  // vez elegida de esta lista, el resto del wizard (paso "turno",
  // confirmar()) no necesita saber de dónde salió.
  const [pacientesVerificadosTutor, setPacientesVerificadosTutor] = useState<PacienteVerificadoPublico[]>(
    () => estadoInicial?.pacientesVerificadosTutor ?? [],
  );
  const [buscandoPaciente, setBuscandoPaciente] = useState(false);
  const [pacienteNoEncontrado, setPacienteNoEncontrado] = useState(false);

  const [tipos, setTipos] = useState<TipoConsultaPublico[]>([]);
  const [cargandoTipos, setCargandoTipos] = useState(true);
  const [tipoConsultaId, setTipoConsultaId] = useState(() => estadoInicial?.tipoConsultaId ?? "");

  const hoyISO = fechaISOLocal();
  const [fecha, setFecha] = useState(() => estadoInicial?.fecha ?? hoyISO);
  const [hora, setHora] = useState(() => estadoInicial?.hora ?? "");
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

  function actualizarTutor<K extends keyof typeof TUTOR_CAMPOS_INICIALES>(campo: K, valor: string) {
    setTutorCampos((c) => ({ ...c, [campo]: valor }));
  }

  // Persistir el progreso en cada cambio relevante (ver el comentario
  // grande de EstadoGuardado más arriba) — se corta apenas hay un turno
  // confirmado, ahí ya no hay nada que resumir (ver borrarEstadoGuardado
  // en confirmar()).
  useEffect(() => {
    if (confirmado) return;
    guardarEstadoGuardado(slug, {
      version: PEDIR_TURNO_STORAGE_VERSION,
      guardadoEn: Date.now(),
      paso,
      flujo,
      campos,
      yaVineDni,
      emailEnVerificacion,
      verificacionToken,
      pacienteVerificado,
      tipoConsultaId,
      fecha,
      hora,
      esOtro,
      tutorCampos,
      pacientesVerificadosTutor,
    });
  }, [
    slug,
    confirmado,
    paso,
    flujo,
    campos,
    yaVineDni,
    emailEnVerificacion,
    verificacionToken,
    pacienteVerificado,
    tipoConsultaId,
    fecha,
    hora,
    esOtro,
    tutorCampos,
    pacientesVerificadosTutor,
  ]);

  // Tipos de consulta de la clínica — se piden una sola vez, al montar.
  useEffect(() => {
    let activo = true;
    listTiposConsultaPublicoAction(slug).then((lista) => {
      if (!activo) return;
      setTipos(lista);
      setCargandoTipos(false);
      // Corrección de QA (resumen del wizard, TR-111): `actual` puede venir
      // de un tipo de consulta guardado en localStorage que el profesional
      // borró mientras tanto — si ya no está en la lista fresca, se
      // descarta en vez de dejar el <select> apuntando a un id fantasma.
      setTipoConsultaId((actual) => (actual && lista.some((t) => t.id === actual) ? actual : (lista[0]?.id ?? "")));
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

    // "Confirmanos que sos vos": antes de pasar al tipo de consulta/fecha/
    // horario, se manda el código de verificación al mail recién validado.
    setEmailEnVerificacion(emailContacto);
    setEnviandoCodigo(true);
    const result = await enviarVerificacionEmailAction(slug, emailContacto, captchaToken);
    setEnviandoCodigo(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setCodigoDev(result.codigoDev ?? null);
    setPaso("verificacion");
  }

  // continuarOtroTutor — Fase 2.4.2, camino "para otro" + "primera vez",
  // PRIMER paso: solo los datos de quien reserva (el tutor — relación/
  // nombre/DNI/teléfono/mail, todos obligatorios). Corrección de QA
  // (2026-09-06, "el apartado 'para otro' es muy grande, primero que se
  // pidan datos del tutor y luego los del paciente"): antes esto vivía en
  // el mismo paso que los datos del paciente — se separó en 2 pantallas,
  // sin enviar el código de verificación todavía (recién se manda al
  // terminar "otro-paciente", una vez que se tienen los dos juegos de
  // datos completos).
  function continuarOtroTutor(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const tutorNombre = tutorCampos.nombre.trim();
    const tutorTelefono = tutorCampos.telefono.trim();
    const tutorEmail = tutorCampos.email.trim().toLowerCase();

    if (!tutorCampos.relacion) {
      setError("Elegí tu relación con el paciente.");
      return;
    }
    if (!tutorNombre) {
      setError("Tu nombre es obligatorio.");
      return;
    }
    if (!TELEFONO_REGEX.test(tutorTelefono)) {
      setError("Tu teléfono no tiene un formato válido (10 a 13 dígitos, podés incluir el +).");
      return;
    }
    if (!EMAIL_REGEX.test(tutorEmail)) {
      setError("Tu email no tiene un formato válido.");
      return;
    }

    setTutorCampos((c) => ({ ...c, nombre: tutorNombre, telefono: tutorTelefono, email: tutorEmail }));
    setPaso("otro-paciente");
  }

  // continuarOtroPaciente — Fase 2.4.2, camino "para otro" + "primera
  // vez", SEGUNDO paso: datos del PACIENTE (nombre/apellido/DNI
  // obligatorios, teléfono/mail propios opcionales — el `.docx` lo pide
  // así). Recién acá se manda el código de verificación — al mail del
  // TUTOR (ya validado en el paso anterior), no al del paciente.
  async function continuarOtroPaciente(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const nombreContacto = campos.nombreContacto.trim();
    const apellidoContacto = campos.apellidoContacto.trim();
    const dniContacto = campos.dniContacto.trim();
    const telefonoContacto = campos.telefonoContacto.trim();
    const emailContacto = campos.emailContacto.trim().toLowerCase();

    if (!nombreContacto || !apellidoContacto) {
      setError("Nombre y apellido del paciente son obligatorios.");
      return;
    }
    if (!DNI_REGEX.test(dniContacto)) {
      setError("El DNI del paciente debe tener 7 u 8 dígitos, sin puntos.");
      return;
    }
    if (telefonoContacto && !TELEFONO_REGEX.test(telefonoContacto)) {
      setError("El teléfono del paciente no tiene un formato válido (10 a 13 dígitos, podés incluir el +).");
      return;
    }
    if (emailContacto && !EMAIL_REGEX.test(emailContacto)) {
      setError("El email del paciente no tiene un formato válido.");
      return;
    }

    setCampos((c) => ({ ...c, emailContacto }));

    // "Confirmanos que sos vos" — acá el mail que se verifica es el del
    // TUTOR (quien reserva), no el del paciente.
    const tutorEmail = tutorCampos.email;
    setEmailEnVerificacion(tutorEmail);
    setEnviandoCodigo(true);
    const result = await enviarVerificacionEmailAction(slug, tutorEmail, captchaToken);
    setEnviandoCodigo(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setCodigoDev(result.codigoDev ?? null);
    setPaso("otro-verificacion");
  }

  // continuarYaVine — Fase 2.4.1, camino "ya he venido antes": pide DNI +
  // mail y dispara la misma verificación de "Confirmanos que sos vos".
  async function continuarYaVine(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const dni = yaVineDni.trim();
    const email = campos.emailContacto.trim().toLowerCase();
    if (!DNI_REGEX.test(dni)) {
      setError("El DNI debe tener 7 u 8 dígitos, sin puntos.");
      return;
    }
    if (!EMAIL_REGEX.test(email)) {
      setError("El email no tiene un formato válido.");
      return;
    }

    setYaVineDni(dni);
    setCampos((c) => ({ ...c, emailContacto: email }));
    setEmailEnVerificacion(email);
    setPacienteNoEncontrado(false);
    setEnviandoCodigo(true);
    const result = await enviarVerificacionEmailAction(slug, email, captchaToken);
    setEnviandoCodigo(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setCodigoDev(result.codigoDev ?? null);
    setPaso("ya-vine-codigo");
  }

  // continuarOtroYaVine — Fase 2.4.2, camino "para otro" + "ya he venido
  // antes": a diferencia de continuarYaVine (busca por DNI del paciente),
  // acá el match es por MAIL DEL TUTOR — puede devolver más de una
  // tarjeta (ver otro-tarjeta-paciente), así que no hace falta pedir el
  // DNI del paciente en este paso.
  async function continuarOtroYaVine(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const tutorEmail = tutorCampos.email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(tutorEmail)) {
      setError("El email no tiene un formato válido.");
      return;
    }

    setTutorCampos((c) => ({ ...c, email: tutorEmail }));
    setEmailEnVerificacion(tutorEmail);
    setPacienteNoEncontrado(false);
    setEnviandoCodigo(true);
    const result = await enviarVerificacionEmailAction(slug, tutorEmail, captchaToken);
    setEnviandoCodigo(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setCodigoDev(result.codigoDev ?? null);
    setPaso("otro-ya-vine-codigo");
  }

  // confirmarCodigo — común a los CUATRO caminos de verificación (paso
  // "verificacion" de "primera vez", "ya-vine-codigo" de "ya he venido
  // antes", y sus espejos "otro-verificacion"/"otro-ya-vine-codigo" de
  // Fase 2.4.2): valida el código de 6 dígitos.
  //
  // "Primera vez"/"ya he venido antes" (para mí): chequea si el DNI
  // recién tipeado ya pertenece a una ficha VERIFICADA con este mail —
  // pedido textual del documento: "si el paciente por obra del destino...
  // se va por el camino de 'primera vez'... si el DNI es el mismo y el
  // mail el mismo que tiene el paciente confirmado, redirigirlo a la
  // selección de pacientes del segundo camino". Sin match: "ya he venido
  // antes" muestra el aviso de no encontrado; "primera vez" sigue de
  // largo al paso de turno con los datos recién tipeados, como siempre.
  //
  // "otro-verificacion" (para otro, primera vez): sin este chequeo
  // retroactivo — a diferencia de "para mí", acá el mail que se verifica
  // es el del TUTOR, no el del paciente, así que "¿el DNI+mail ya
  // pertenecen a una ficha verificada?" no tiene el mismo sentido
  // (asunción de este alcance, el documento no lo pide explícito para
  // este camino) — sigue de largo al paso de turno.
  //
  // "otro-ya-vine-codigo" (para otro, ya he venido antes): busca por
  // MAIL DEL TUTOR (pacientesVerificadosDeTutorAction) — puede devolver
  // una LISTA (otro-tarjeta-paciente) en vez de una sola tarjeta.
  async function confirmarCodigo(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!codigo.trim()) {
      setError("Ingresá el código que te mandamos por mail.");
      return;
    }

    setVerificando(true);
    const result = await confirmarVerificacionEmailAction(slug, emailEnVerificacion, codigo.trim());
    setVerificando(false);
    if (result.error || !result.token) {
      setError(result.error ?? "No se pudo verificar el código.");
      return;
    }
    setVerificacionToken(result.token);

    if (paso === "otro-verificacion") {
      setFlujo("otro-primera-vez");
      setPaso("turno");
      return;
    }

    if (paso === "otro-ya-vine-codigo") {
      setBuscandoPaciente(true);
      const resultado = await pacientesVerificadosDeTutorAction(slug, emailEnVerificacion, result.token);
      setBuscandoPaciente(false);
      if (resultado.pacientes && resultado.pacientes.length > 0) {
        setPacientesVerificadosTutor(resultado.pacientes);
        setPaso("otro-tarjeta-paciente");
        return;
      }
      setPacienteNoEncontrado(true);
      return;
    }

    const esPrimeraVez = paso === "verificacion";
    const dniAChequear = esPrimeraVez ? campos.dniContacto.trim() : yaVineDni;

    setBuscandoPaciente(true);
    const resultado = await pacienteVerificadoPublicoAction(slug, dniAChequear, emailEnVerificacion, result.token);
    setBuscandoPaciente(false);

    if (resultado.paciente) {
      setPacienteVerificado(resultado.paciente);
      setPaso("tarjeta-paciente");
      return;
    }

    if (!esPrimeraVez) {
      setPacienteNoEncontrado(true);
      return;
    }

    setFlujo("primera-vez");
    setPaso("turno");
  }

  async function reenviarCodigo() {
    setError(null);
    setAvisoReenvio(null);
    setEnviandoCodigo(true);
    const result = await enviarVerificacionEmailAction(slug, emailEnVerificacion, captchaToken);
    setEnviandoCodigo(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setCodigoDev(result.codigoDev ?? null);
    setAvisoReenvio("Te mandamos un código nuevo.");
  }

  function confirmarTarjetaPaciente() {
    setFlujo("verificado");
    setPaso("turno");
  }

  // elegirPacienteVerificadoTutor — Fase 2.4.2: variante de
  // confirmarTarjetaPaciente para la LISTA de "otro-tarjeta-paciente" —
  // el tutor toca directo la tarjeta que le corresponde (no hace falta un
  // "¿sos vos?" de confirmación aparte, ya eligió entre varias).
  function elegirPacienteVerificadoTutor(elegido: PacienteVerificadoPublico) {
    setPacienteVerificado(elegido);
    setFlujo("otro-verificado");
    setPaso("turno");
  }

  function empezarComoNuevo() {
    setPacienteVerificado(null);
    setPacienteNoEncontrado(false);
    setCampos((c) => ({ ...c, dniContacto: yaVineDni }));
    setPaso("contacto");
  }

  // empezarComoNuevoOtro — Fase 2.4.2: mismo criterio que
  // empezarComoNuevo, para el camino "para otro" — vuelve al formulario
  // completo (tutor + paciente) en vez del de "para mí".
  function empezarComoNuevoOtro() {
    setPacientesVerificadosTutor([]);
    setPacienteNoEncontrado(false);
    setPaso("otro-tutor");
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

    const motivo = campos.motivo.trim();
    // esOtroFlujo/esVerificado — Fase 2.4.2: los 4 valores de Flujo se
    // reducen acá a las 2 preguntas que de verdad importan para armar el
    // payload: ¿es "para otro"? ¿ya está verificado (viene de una tarjeta
    // elegida) o es la primera vez (manda todos los datos)?
    const esOtroFlujo = flujo === "otro-primera-vez" || flujo === "otro-verificado";
    const esVerificado = (flujo === "verificado" || flujo === "otro-verificado") && pacienteVerificado;

    let payload: SolicitarTurnoPublicoPayload;
    if (esVerificado) {
      payload = {
        emailContacto: emailEnVerificacion,
        motivo: motivo || undefined,
        tipoConsultaId,
        fecha,
        hora,
        verificacionToken,
        pacienteVerificadoId: pacienteVerificado.id,
        ...(esOtroFlujo ? { paraOtro: true, tutorEmail: emailEnVerificacion } : {}),
      };
    } else if (esOtroFlujo) {
      // "Para otro" + "primera vez" — datos del PACIENTE (nombre/
      // apellido/DNI obligatorios, teléfono/mail propios opcionales) +
      // datos del TUTOR (el mail ya se verificó, es emailEnVerificacion).
      payload = {
        nombreContacto: campos.nombreContacto.trim(),
        apellidoContacto: campos.apellidoContacto.trim(),
        dniContacto: campos.dniContacto.trim(),
        telefonoContacto: campos.telefonoContacto.trim() || undefined,
        emailContacto: campos.emailContacto.trim().toLowerCase() || undefined,
        motivo: motivo || undefined,
        tipoConsultaId,
        fecha,
        hora,
        verificacionToken,
        paraOtro: true,
        tutorRelacion: tutorCampos.relacion,
        tutorNombre: tutorCampos.nombre.trim(),
        tutorTelefono: tutorCampos.telefono.trim(),
        tutorEmail: emailEnVerificacion,
      };
    } else {
      payload = {
        nombreContacto: campos.nombreContacto.trim(),
        apellidoContacto: campos.apellidoContacto.trim(),
        dniContacto: campos.dniContacto.trim(),
        telefonoContacto: campos.telefonoContacto.trim(),
        emailContacto: campos.emailContacto.trim().toLowerCase(),
        motivo: motivo || undefined,
        tipoConsultaId,
        fecha,
        hora,
        verificacionToken,
      };
    }

    setPending(true);
    const result = await solicitarTurnoPublicoAction(slug, payload);
    setPending(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    if (telefonoClinica) {
      const numero = telefonoClinica.replace(/[^\d]/g, "");
      // Camino "ya he venido antes": no tenemos nombre/DNI reales acá (la
      // tarjeta que confirmó el paciente muestra los datos ya censurados)
      // — el mensaje queda genérico, sin inventar ni mandar el dato
      // censurado como si fuera el real. "Para otro" (Fase 2.4.2, primera
      // vez): quien manda el WhatsApp es el TUTOR, así que se identifica
      // a los dos — a nombre de quién es el turno y quién escribe.
      let datosPersonales = "";
      if (!esVerificado) {
        datosPersonales = esOtroFlujo
          ? ` Soy ${tutorCampos.nombre.trim()}, reservo para ${campos.nombreContacto.trim()} ${campos.apellidoContacto.trim()} (DNI ${campos.dniContacto.trim()}).`
          : ` Soy ${campos.nombreContacto.trim()} ${campos.apellidoContacto.trim()} (DNI ${campos.dniContacto.trim()}).`;
      }
      const texto = `Hola! Te pedí un turno desde tu página para el ${fecha} a las ${hora}.${datosPersonales}${motivo ? ` Motivo: ${motivo}.` : ""}`;
      setLinkWhatsapp(`https://wa.me/${numero}?text=${encodeURIComponent(texto)}`);
    }
    // Turno ya creado — nada que resumir de acá en más (ver el efecto de
    // guardado más arriba, que además deja de escribir apenas `confirmado`
    // pasa a tener valor).
    borrarEstadoGuardado(slug);
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
      {paso === "para-quien" && (
        <div className="flex flex-col gap-4">
          <p className="font-[family-name:var(--font-display)] text-lg font-medium text-grafito">¿Para quién es el turno?</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <OpcionGrande
              icon={<IconoPersona />}
              onClick={() => {
                setEsOtro(false);
                setPaso("ya-te-atendiste");
              }}
            >
              Para mí
            </OpcionGrande>
            {/* Fase 2.4.2 — antes deshabilitado ("Muy pronto..."). Reusa
                la MISMA pregunta "ya-te-atendiste" que "para mí" (ver
                esOtro más abajo, que decide a cuál de los 2 grupos de
                pasos saltar desde ahí). */}
            <OpcionGrande
              icon={<IconoPersonaConCorazon />}
              onClick={() => {
                setEsOtro(true);
                setPaso("ya-te-atendiste");
              }}
            >
              Para otro
            </OpcionGrande>
          </div>
        </div>
      )}

      {paso === "ya-te-atendiste" && (
        <div className="flex flex-col gap-4">
          <p className="font-[family-name:var(--font-display)] text-lg font-medium text-grafito">¿Ya te has atendido con nosotros?</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <OpcionGrande icon={<IconoDestellos />} onClick={() => setPaso(esOtro ? "otro-tutor" : "contacto")}>
              Es mi primera vez
            </OpcionGrande>
            <OpcionGrande icon={<IconoHistorial />} onClick={() => setPaso(esOtro ? "otro-ya-vine-datos" : "ya-vine-datos")}>
              Ya he venido anteriormente
            </OpcionGrande>
          </div>
          <button
            type="button"
            onClick={() => setPaso("para-quien")}
            className="self-start rounded-full border-[0.5px] border-arena px-5 py-2.5 text-sm font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro"
          >
            Atrás
          </button>
        </div>
      )}

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

          <TurnstileWidget onToken={setCaptchaToken} />

          {error && <ErrorMsg>{error}</ErrorMsg>}

          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => setPaso("ya-te-atendiste")}
              className="rounded-full border-[0.5px] border-arena px-5 py-2.5 text-sm font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro"
            >
              Atrás
            </button>
            <button
              type="submit"
              disabled={enviandoCodigo}
              className="rounded-full bg-salvia-oscuro px-8 py-3 text-sm font-semibold text-marfil hover:brightness-95 disabled:opacity-60"
            >
              {enviandoCodigo ? "Enviando código…" : "Continuar"}
            </button>
          </div>
        </form>
      )}

      {paso === "ya-vine-datos" && (
        <form onSubmit={continuarYaVine} className="flex flex-col gap-4">
          <div>
            <p className="font-[family-name:var(--font-display)] text-lg font-medium text-grafito">Contanos con qué datos te registraste</p>
            <p className="text-sm text-grafito/60">Buscamos tu ficha por DNI y confirmamos que sos vos con un código a tu mail.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo label="DNI">
              <input value={yaVineDni} onChange={(e) => setYaVineDni(e.target.value)} className={inputClass} />
            </Campo>
            <Campo label="Email">
              <input
                type="email"
                value={campos.emailContacto}
                onChange={(e) => actualizar("emailContacto", e.target.value)}
                className={inputClass}
              />
            </Campo>
          </div>

          <TurnstileWidget onToken={setCaptchaToken} />

          {error && <ErrorMsg>{error}</ErrorMsg>}

          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => setPaso("ya-te-atendiste")}
              className="rounded-full border-[0.5px] border-arena px-5 py-2.5 text-sm font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro"
            >
              Atrás
            </button>
            <button
              type="submit"
              disabled={enviandoCodigo}
              className="rounded-full bg-salvia-oscuro px-5 py-2.5 text-sm font-semibold text-marfil hover:brightness-95 disabled:opacity-60"
            >
              {enviandoCodigo ? "Enviando código…" : "Continuar"}
            </button>
          </div>
        </form>
      )}

      {/* Fase 2.4.2, camino "para otro" + "primera vez", PASO 1 de 2: solo
          los datos de quien reserva (el tutor, todos obligatorios) —
          separado de los datos del paciente (corrección de QA,
          2026-09-06: "el apartado 'para otro' es muy grande"). */}
      {paso === "otro-tutor" && (
        <form onSubmit={continuarOtroTutor} className="flex flex-col gap-5">
          <div>
            <p className="font-[family-name:var(--font-display)] text-lg font-medium text-grafito">Tus datos</p>
            <p className="text-sm text-grafito/60">Los de la persona que reserva el turno.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo label="Tu relación con el paciente">
              <select
                value={tutorCampos.relacion}
                onChange={(e) => actualizarTutor("relacion", e.target.value)}
                className={inputClass}
              >
                <option value="">Elegí una opción</option>
                <option value="familiar">Familiar</option>
                <option value="amigo">Amigo/a</option>
                <option value="otro">Otro</option>
              </select>
            </Campo>
            <Campo label="Tu nombre completo">
              <input value={tutorCampos.nombre} onChange={(e) => actualizarTutor("nombre", e.target.value)} className={inputClass} />
            </Campo>
            <Campo label="Tu teléfono">
              <input
                value={tutorCampos.telefono}
                onChange={(e) => actualizarTutor("telefono", e.target.value)}
                placeholder="+54 9 351…"
                className={inputClass}
              />
            </Campo>
          </div>
          <Campo label="Tu email">
            <input type="email" value={tutorCampos.email} onChange={(e) => actualizarTutor("email", e.target.value)} className={inputClass} />
          </Campo>

          {error && <ErrorMsg>{error}</ErrorMsg>}

          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => setPaso("ya-te-atendiste")}
              className="rounded-full border-[0.5px] border-arena px-5 py-2.5 text-sm font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro"
            >
              Atrás
            </button>
            <button
              type="submit"
              className="rounded-full bg-salvia-oscuro px-8 py-3 text-sm font-semibold text-marfil hover:brightness-95"
            >
              Continuar
            </button>
          </div>
        </form>
      )}

      {/* Fase 2.4.2, camino "para otro" + "primera vez", PASO 2 de 2:
          datos del PACIENTE (teléfono/mail propios opcionales) — recién
          acá se manda el código de verificación al mail del tutor. */}
      {paso === "otro-paciente" && (
        <form onSubmit={continuarOtroPaciente} className="flex flex-col gap-5">
          <div>
            <p className="font-[family-name:var(--font-display)] text-lg font-medium text-grafito">Datos del paciente</p>
            <p className="text-sm text-grafito/60">Ahora sí, los de quien se va a atender.</p>
          </div>
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
            <Campo label="Teléfono (opcional)">
              <input
                value={campos.telefonoContacto}
                onChange={(e) => actualizar("telefonoContacto", e.target.value)}
                placeholder="+54 9 351…"
                className={inputClass}
              />
            </Campo>
          </div>
          <Campo label="Email (opcional)">
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

          <TurnstileWidget onToken={setCaptchaToken} />

          {error && <ErrorMsg>{error}</ErrorMsg>}

          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => setPaso("otro-tutor")}
              className="rounded-full border-[0.5px] border-arena px-5 py-2.5 text-sm font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro"
            >
              Atrás
            </button>
            <button
              type="submit"
              disabled={enviandoCodigo}
              className="rounded-full bg-salvia-oscuro px-8 py-3 text-sm font-semibold text-marfil hover:brightness-95 disabled:opacity-60"
            >
              {enviandoCodigo ? "Enviando código…" : "Continuar"}
            </button>
          </div>
        </form>
      )}

      {/* Fase 2.4.2, camino "para otro" + "ya he venido antes": solo el
          mail del tutor — el match es por ese mail (no por DNI del
          paciente), puede devolver más de una tarjeta. */}
      {paso === "otro-ya-vine-datos" && (
        <form onSubmit={continuarOtroYaVine} className="flex flex-col gap-4">
          <div>
            <p className="font-[family-name:var(--font-display)] text-lg font-medium text-grafito">¿Con qué mail reservaste antes?</p>
            <p className="text-sm text-grafito/60">Confirmamos que sos vos con un código a ese mail.</p>
          </div>
          <Campo label="Tu email">
            <input type="email" value={tutorCampos.email} onChange={(e) => actualizarTutor("email", e.target.value)} className={inputClass} />
          </Campo>

          <TurnstileWidget onToken={setCaptchaToken} />

          {error && <ErrorMsg>{error}</ErrorMsg>}

          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => setPaso("ya-te-atendiste")}
              className="rounded-full border-[0.5px] border-arena px-5 py-2.5 text-sm font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro"
            >
              Atrás
            </button>
            <button
              type="submit"
              disabled={enviandoCodigo}
              className="rounded-full bg-salvia-oscuro px-5 py-2.5 text-sm font-semibold text-marfil hover:brightness-95 disabled:opacity-60"
            >
              {enviandoCodigo ? "Enviando código…" : "Continuar"}
            </button>
          </div>
        </form>
      )}

      {(paso === "verificacion" || paso === "ya-vine-codigo" || paso === "otro-verificacion" || paso === "otro-ya-vine-codigo") && (
        <form onSubmit={confirmarCodigo} className="flex flex-col gap-4">
          <div>
            <p className="font-[family-name:var(--font-display)] text-lg font-medium text-grafito">Confirmanos que sos vos</p>
            <p className="text-sm text-grafito/60">
              Te mandamos un código de 6 dígitos a <span className="font-medium text-grafito">{emailEnVerificacion}</span>. Ingresalo acá
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

          {/* codigoDev (Fase 2.4.1) — SOLO en local: el backend nunca
              manda este campo con RESEND_API_KEY configurada, así que
              este aviso no puede aparecer en producción. */}
          {codigoDev && (
            <p className="rounded-field border-[0.5px] border-dashed border-arena bg-hueso px-3 py-2 text-xs text-grafito/60">
              Modo desarrollo — código: <span className="font-[family-name:var(--font-mono)] font-semibold text-grafito">{codigoDev}</span>
            </p>
          )}

          {pacienteNoEncontrado && (
            <div className="flex flex-col gap-2 rounded-field border-[0.5px] border-arena bg-hueso p-3 text-sm text-grafito/70">
              <p>No encontramos una ficha verificada con esos datos.</p>
              <button
                type="button"
                onClick={esOtro ? empezarComoNuevoOtro : empezarComoNuevo}
                className="self-start font-medium text-salvia-oscuro hover:text-grafito"
              >
                Empezar como paciente nuevo
              </button>
            </div>
          )}

          {avisoReenvio && <p className="text-sm text-salvia-oscuro">{avisoReenvio}</p>}
          {error && <ErrorMsg>{error}</ErrorMsg>}

          {/* Turnstile es de un solo uso — el token del paso anterior ya
              se consumió en el envío inicial, así que "Reenviar código"
              necesita el suyo propio (mismo estado captchaToken). */}
          <TurnstileWidget onToken={setCaptchaToken} />

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
              onClick={() => {
                if (paso === "ya-vine-codigo") setPaso("ya-vine-datos");
                else if (paso === "otro-verificacion") setPaso("otro-paciente");
                else if (paso === "otro-ya-vine-codigo") setPaso("otro-ya-vine-datos");
                else setPaso("contacto");
              }}
              className="rounded-full border-[0.5px] border-arena px-5 py-2.5 text-sm font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro"
            >
              Atrás
            </button>
            <button
              type="submit"
              disabled={verificando || buscandoPaciente}
              className="rounded-full bg-salvia-oscuro px-5 py-2.5 text-sm font-semibold text-marfil hover:brightness-95 disabled:opacity-60"
            >
              {verificando ? "Verificando…" : buscandoPaciente ? "Buscando tu ficha…" : "Confirmar código"}
            </button>
          </div>
        </form>
      )}

      {paso === "tarjeta-paciente" && pacienteVerificado && (
        <div className="flex flex-col gap-4">
          <p className="font-[family-name:var(--font-display)] text-lg font-medium text-grafito">¿Sos vos?</p>
          <button
            type="button"
            onClick={confirmarTarjetaPaciente}
            className="flex flex-col gap-1 rounded-field border-[0.5px] border-salvia bg-hueso p-4 text-left hover:border-salvia-oscuro"
          >
            <span className="font-[family-name:var(--font-display)] text-base font-medium text-grafito">{pacienteVerificado.nombre}</span>
            <span className="text-sm text-grafito/60">DNI {pacienteVerificado.dni}</span>
          </button>

          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => {
                setPacienteVerificado(null);
                setPaso("ya-vine-datos");
              }}
              className="rounded-full border-[0.5px] border-arena px-5 py-2.5 text-sm font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro"
            >
              No soy yo
            </button>
            <button
              type="button"
              onClick={confirmarTarjetaPaciente}
              className="rounded-full bg-salvia-oscuro px-5 py-2.5 text-sm font-semibold text-marfil hover:brightness-95"
            >
              Sí, soy yo — continuar
            </button>
          </div>
        </div>
      )}

      {/* Fase 2.4.2, camino "para otro" + "ya he venido antes": LISTA de
          tarjetas (a diferencia de "tarjeta-paciente", que siempre es una
          sola) — un tutor puede tener más de un hijo verificado a su
          cargo. Tocar una tarjeta la elige directo, sin un "¿sos vos?"
          de confirmación aparte (ya está eligiendo entre varias). */}
      {paso === "otro-tarjeta-paciente" && pacientesVerificadosTutor.length > 0 && (
        <div className="flex flex-col gap-4">
          <p className="font-[family-name:var(--font-display)] text-lg font-medium text-grafito">¿Para cuál de tus pacientes es el turno?</p>
          <div className="flex flex-col gap-2">
            {pacientesVerificadosTutor.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => elegirPacienteVerificadoTutor(p)}
                className="flex flex-col gap-1 rounded-field border-[0.5px] border-salvia bg-hueso p-4 text-left hover:border-salvia-oscuro"
              >
                <span className="font-[family-name:var(--font-display)] text-base font-medium text-grafito">{p.nombre}</span>
                <span className="text-sm text-grafito/60">DNI {p.dni}</span>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              setPacientesVerificadosTutor([]);
              setPaso("otro-ya-vine-datos");
            }}
            className="self-start rounded-full border-[0.5px] border-arena px-5 py-2.5 text-sm font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro"
          >
            Ninguno de estos
          </button>
        </div>
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

          {/* Los caminos "ya he venido antes" ("verificado"/"otro-verificado")
              nunca pasan por un paso con este campo (ni "contacto" ni
              "otro-paciente") — se ofrece acá para no perder la
              posibilidad de aclarar el motivo. */}
          {(flujo === "verificado" || flujo === "otro-verificado") && (
            <Campo label="Motivo de consulta (opcional)">
              <input value={campos.motivo} onChange={(e) => actualizar("motivo", e.target.value)} className={inputClass} />
            </Campo>
          )}

          {error && <ErrorMsg>{error}</ErrorMsg>}

          {/* Corrección de QA: "ya tenés un turno pendiente..." (DNI con
              un turno activo, sea cual sea el tipo o si está verificado
              — la regla universal) suma un contacto directo — el
              paciente no puede resolverlo solo desde acá. */}
          {error && error.startsWith("ya tenés un turno pendiente") && telefonoClinica && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-grafito/70">
              <span>Por cualquier inconveniente o modificación, contactate a:</span>
              <a
                href={`https://wa.me/${telefonoClinica.replace(/[^\d]/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full bg-salvia-oscuro px-4 py-1.5 text-xs font-semibold text-marfil hover:brightness-95"
              >
                Escribir por WhatsApp
              </a>
            </div>
          )}

          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => {
                if (flujo === "verificado") setPaso("tarjeta-paciente");
                else if (flujo === "otro-verificado") setPaso("otro-tarjeta-paciente");
                else if (flujo === "otro-primera-vez") setPaso("otro-verificacion");
                else setPaso("verificacion");
              }}
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

// OpcionGrande — botón grande clickeable para las dos preguntas nuevas de
// Fase 2.4.1 ("¿Para quién es el turno?" / "¿Ya te has atendido con
// nosotros?"). Corrección de QA ("fíjese las fotos diseño1 y diseño2 para
// darle más personalidad a las tarjetas"): ícono propio arriba de cada
// etiqueta + fondo cálido al pasar el mouse (mismo tono que el resto del
// wizard usa para avisos/acentos, `terracota-claro`), en vez del botón
// liso de antes.
function OpcionGrande({
  children,
  icon,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex flex-col items-center gap-3 rounded-field border-[0.5px] border-arena bg-hueso px-5 py-5 text-center text-sm font-semibold text-grafito transition-colors hover:border-terracota hover:bg-terracota-claro disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-arena disabled:hover:bg-hueso"
    >
      <span className="text-salvia-oscuro" aria-hidden="true">
        {icon}
      </span>
      {children}
    </button>
  );
}

// Iconos — Fase 2.4.1, corrección de QA: mismo trazo fino (stroke,
// currentColor) para las 4 opciones grandes del wizard, ver diseño1.png/
// diseño2.png. SVG inline en vez de un ícono importado: sin dependencias
// nuevas para 4 formas chicas y fijas.
function IconoPersona() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" />
    </svg>
  );
}

function IconoPersonaConCorazon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9.5" cy="8" r="3.5" />
      <path d="M3 20c0-4.1 2.9-6.5 6.5-6.5" />
      <path d="M17.5 12.8c-1.4 0-2.5 1-2.5 2.3 0 1.7 1.6 2.9 2.5 3.7.9-.8 2.5-2 2.5-3.7 0-1.3-1.1-2.3-2.5-2.3Z" />
    </svg>
  );
}

function IconoDestellos() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 3 12.3 8.7 18 10l-5.7 1.3L11 17l-1.3-5.7L4 10l5.7-1.3L11 3Z" />
      <path d="M18.5 14.5 19 17l2.5.5L19 18l-.5 2.5L18 18l-2.5-.5L18 17l.5-2.5Z" />
    </svg>
  );
}

function IconoHistorial() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4.6 9A8 8 0 1 1 4 13" />
      <path d="M4 5v4h4" />
      <path d="M12 8v4l3 2" />
    </svg>
  );
}
