"use client";

import { useEffect, useState } from "react";
import type { TipoConsultaPublico, PacienteVerificadoPublico, SolicitarTurnoPublicoPayload } from "@/lib/api";
import {
  confirmarVerificacionEmailAction,
  enviarVerificacionEmailAction,
  listDisponibilidadMesPublicaAction,
  listDisponibilidadPublicaAction,
  listTiposConsultaPublicoAction,
  pacienteVerificadoPublicoAction,
  pacientesVerificadosDeTutorAction,
  solicitarTurnoPublicoAction,
} from "@/app/actions/turno-publico";
import { fechaISOLocal } from "@/lib/calendar-utils";
import { TurnstileWidget } from "@/components/auth/turnstile-widget";
import { PAIS_TELEFONO_DEFAULT, telefonoConPais } from "./pedir-turno/campo-telefono";
import { PantallaParaQuien, PantallaYaAtendiste, type ParaQuien, type YaAtendiste } from "./pedir-turno/pantallas-eleccion";
import { PantallaTusDatos, PantallaTusDatosTutor, PantallaDatosPaciente } from "./pedir-turno/pantalla-tus-datos";
import { PantallaBuscarFicha, PantallaBuscarPorMail } from "./pedir-turno/pantalla-buscar-ficha";
import { PantallaCodigo } from "./pedir-turno/pantalla-codigo";
import { PantallaSosVos, PantallaParaQuienLista } from "./pedir-turno/pantalla-resultado";
import { PantallaDiaHora } from "./pedir-turno/pantalla-dia-hora";

interface PedirTurnoFormProps {
  slug: string;
  nombreClinica: string;
  telefonoClinica?: string | null;
  /** Cierra el modal completo (lo abre/monta PedirTurnoButton) — cada pantalla del rediseño trae su propia [×] adentro (docs/rediseno-flujo-turnos.md §3.1). */
  onClose: () => void;
  /**
   * Fase 2, ítem 5 ("compartir calendario") — presente cuando el wizard
   * se abrió desde un link generado por el profesional (`?enlace=` en la
   * página pública, ver PedirTurnoButton). Cambia el flujo en 3 puntos:
   * se saltea la pantalla [2] "¿Ya te atendiste?" (el camino "ya he
   * venido antes" depende del código de verificación, que este modo no
   * tiene — directo a "primera vez"), no se manda ningún código de
   * verificación ni se muestra el CAPTCHA, y el pedido final manda
   * `enlaceToken` en vez de `verificacionToken`.
   */
  enlaceToken?: string;
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
//     que completa el formulario — son 2 personas distintas). El código de
//     verificación se manda recién al terminar "otro-paciente" (a
//     diferencia del mapa de pantallas de docs/rediseno-flujo-turnos.md
//     §4, que lo pone entre tutor y paciente) — se mantiene el orden real
//     ya construido en vez de reordenar CUÁNDO se dispara el envío del
//     código, solo se ajustó la numeración de "paso N de M" para reflejar
//     el orden real (tutor=3, paciente=4, código=5).
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
  paisTelefono: string;
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
  paisTelefonoTutor: string;
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
// punta, docs/implementation-plan.md §11.6) + rediseño visual completo
// (docs/rediseno-flujo-turnos.md, "2.4.2.1"): la lógica de estado y las
// llamadas al backend no cambiaron con el rediseño — lo que cambió es
// qué componente de pantalla renderiza cada `paso` (antes JSX inline acá
// mismo, ahora los componentes de `./pedir-turno/*`) y, puntualmente, la
// pareja `paisTelefono`/`paisTelefonoTutor` nueva (el campo de teléfono
// del doc separa país y número local — antes era un solo input de texto
// libre). El turno sigue naciendo `agendado`, con horario fijo, de punta
// a punta.
export function PedirTurnoForm({ slug, nombreClinica, telefonoClinica, onClose, enlaceToken }: PedirTurnoFormProps) {
  // estadoInicial — se lee UNA sola vez (useState solo evalúa el
  // inicializador en el primer render), ver el comentario grande de
  // leerEstadoGuardado/PEDIR_TURNO_VENTANA_RESUMEN_MS arriba.
  const [estadoInicial] = useState<EstadoGuardado | null>(() => leerEstadoGuardado(slug));

  const [paso, setPaso] = useState<Paso>(() => estadoInicial?.paso ?? "para-quien");
  const [flujo, setFlujo] = useState<Flujo>(() => estadoInicial?.flujo ?? "primera-vez");
  const [campos, setCampos] = useState(() => estadoInicial?.campos ?? CAMPOS_INICIALES);
  const [paisTelefono, setPaisTelefono] = useState(() => estadoInicial?.paisTelefono ?? PAIS_TELEFONO_DEFAULT);
  // esOtro (Fase 2.4.2) — se fija en el paso "para-quien" ("Para mí" vs
  // "Para otra persona") y decide, en el paso "ya-te-atendiste" (LA MISMA
  // pregunta para los 2 caminos), a cuál de los 2 grupos de pasos saltar.
  const [esOtro, setEsOtro] = useState(() => estadoInicial?.esOtro ?? false);
  const [tutorCampos, setTutorCampos] = useState(() => estadoInicial?.tutorCampos ?? TUTOR_CAMPOS_INICIALES);
  const [paisTelefonoTutor, setPaisTelefonoTutor] = useState(() => estadoInicial?.paisTelefonoTutor ?? PAIS_TELEFONO_DEFAULT);

  // paraQuienSel/yaAtendisteSel — selección TRANSITORIA de las pantallas
  // [1]/[2] antes de tocar "Continuar" (docs/rediseno-flujo-turnos.md
  // §3.5: tarjeta de opción, elegir ≠ avanzar). No se persisten: si se
  // resume el wizard justo en uno de estos 2 pasos, todavía no hay nada
  // elegido para ESE paso puntual (si ya se había elegido, `paso` ya
  // habría avanzado más allá).
  const [paraQuienSel, setParaQuienSel] = useState<ParaQuien | null>(null);
  const [yaAtendisteSel, setYaAtendisteSel] = useState<YaAtendiste | null>(null);

  // Verificación de mail ("Confirmanos que sos vos") — reusada por los DOS
  // caminos ("primera vez" y "ya he venido antes"): emailEnVerificacion
  // guarda a qué mail le corresponde el código que se está tipeando,
  // independiente de en qué paso del wizard se originó.
  const [emailEnVerificacion, setEmailEnVerificacion] = useState(() => estadoInicial?.emailEnVerificacion ?? "");
  const [verificacionToken, setVerificacionToken] = useState(() => estadoInicial?.verificacionToken ?? "");
  const [enviandoCodigo, setEnviandoCodigo] = useState(false);
  const [verificando, setVerificando] = useState(false);
  // codigoDev (Fase 2.4.1, pedido del cliente) — SOLO viene en local (sin
  // RESEND_API_KEY configurada, ver AuthDeps.ExponerCodigoVerificacion en
  // el backend), nunca en producción: se muestra debajo del campo para no
  // tener que ir a buscar el código a los logs mientras se prueba el
  // wizard en desarrollo.
  const [codigoDev, setCodigoDev] = useState<string | null>(null);
  // captchaToken (corrección de seguridad, Fase 2.4.1) — el widget de
  // Turnstile vive en todos los pasos que disparan
  // enviarVerificacionEmailAction, compartiendo un solo estado — sin
  // NEXT_PUBLIC_TURNSTILE_SITE_KEY el widget no se renderiza y esto queda
  // en "" (mismo criterio que crear-cuenta-form.tsx).
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
  const [pacienteListaSeleccionado, setPacienteListaSeleccionado] = useState<string | null>(null);
  const [buscandoPaciente, setBuscandoPaciente] = useState(false);
  const [pacienteNoEncontrado, setPacienteNoEncontrado] = useState(false);

  const [tipos, setTipos] = useState<TipoConsultaPublico[]>([]);
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

  // Calendario mensual (3.8, docs/prompt-claude-code-fecha-horario.md) —
  // `mesVisible` es del PANEL, no necesariamente el mes de `fecha`: se
  // puede navegar mes a mes sin mover la selección. Arranca en el mes de
  // `fecha` porque es el valor sensato la primera vez que se abre.
  const [mesVisible, setMesVisible] = useState(() => (estadoInicial?.fecha ?? hoyISO).slice(0, 7));
  const [diasConTurnos, setDiasConTurnos] = useState<string[]>([]);
  const [cargandoMes, setCargandoMes] = useState(false);

  function cambiarMesVisible(mes: string) {
    setMesVisible(mes);
    if (!tipoConsultaId) return;
    setCargandoMes(true);
    listDisponibilidadMesPublicaAction(slug, tipoConsultaId, mes).then((dias) => {
      setDiasConTurnos(dias);
      setCargandoMes(false);
    });
  }

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
      paisTelefono,
      yaVineDni,
      emailEnVerificacion,
      verificacionToken,
      pacienteVerificado,
      tipoConsultaId,
      fecha,
      hora,
      esOtro,
      tutorCampos,
      paisTelefonoTutor,
      pacientesVerificadosTutor,
    });
  }, [
    slug,
    confirmado,
    paso,
    flujo,
    campos,
    paisTelefono,
    yaVineDni,
    emailEnVerificacion,
    verificacionToken,
    pacienteVerificado,
    tipoConsultaId,
    fecha,
    hora,
    esOtro,
    tutorCampos,
    paisTelefonoTutor,
    pacientesVerificadosTutor,
  ]);

  // Tipos de consulta de la clínica — se piden una sola vez, al montar.
  useEffect(() => {
    let activo = true;
    listTiposConsultaPublicoAction(slug).then((lista) => {
      if (!activo) return;
      setTipos(lista);
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
      setHora((actual) => (disponibilidad.slots.includes(actual) ? actual : ""));
    });
    return () => {
      activo = false;
    };
  }, [slug, tipoConsultaId, fecha]);

  async function continuar() {
    setError(null);

    const nombreContacto = campos.nombreContacto.trim();
    const apellidoContacto = campos.apellidoContacto.trim();
    const dniContacto = campos.dniContacto.trim();
    const telefonoContacto = telefonoConPais(paisTelefono, campos.telefonoContacto);
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
      setError("El teléfono no tiene un formato válido.");
      return;
    }
    if (!EMAIL_REGEX.test(emailContacto)) {
      setError("El email no tiene un formato válido.");
      return;
    }

    setCampos((c) => ({ ...c, emailContacto }));

    // Fase 2, ítem 5: con enlace no hay ningún código que mandar — directo
    // al paso de turno, el pedido final va a mandar enlaceToken en vez de
    // verificacionToken (ver confirmar()).
    if (enlaceToken) {
      setPaso("turno");
      return;
    }

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
  // nombre/teléfono/mail, todos obligatorios).
  function continuarOtroTutor() {
    setError(null);

    const tutorNombre = tutorCampos.nombre.trim();
    const tutorTelefono = telefonoConPais(paisTelefonoTutor, tutorCampos.telefono);
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
      setError("Tu teléfono no tiene un formato válido.");
      return;
    }
    if (!EMAIL_REGEX.test(tutorEmail)) {
      setError("Tu email no tiene un formato válido.");
      return;
    }

    setTutorCampos((c) => ({ ...c, nombre: tutorNombre, email: tutorEmail }));
    setPaso("otro-paciente");
  }

  // continuarOtroPaciente — Fase 2.4.2, camino "para otro" + "primera
  // vez", SEGUNDO paso: datos del PACIENTE (nombre/apellido/DNI
  // obligatorios, teléfono/mail propios opcionales). Recién acá se manda
  // el código de verificación — al mail del TUTOR (ya validado en el paso
  // anterior), no al del paciente.
  async function continuarOtroPaciente() {
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
      setError("El teléfono del paciente no tiene un formato válido.");
      return;
    }
    if (emailContacto && !EMAIL_REGEX.test(emailContacto)) {
      setError("El email del paciente no tiene un formato válido.");
      return;
    }

    setCampos((c) => ({ ...c, emailContacto }));

    // Fase 2, ítem 5: con enlace, directo al paso de turno (ver
    // continuar(), mismo criterio).
    if (enlaceToken) {
      setPaso("turno");
      return;
    }

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
  async function continuarYaVine() {
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
  async function continuarOtroYaVine() {
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
  // pertenecen a una ficha verificada?" no tiene el mismo sentido —
  // sigue de largo al paso de turno.
  //
  // "otro-ya-vine-codigo" (para otro, ya he venido antes): busca por
  // MAIL DEL TUTOR (pacientesVerificadosDeTutorAction) — puede devolver
  // una LISTA (otro-tarjeta-paciente) en vez de una sola tarjeta.
  async function confirmarCodigo(codigo: string) {
    setError(null);

    setVerificando(true);
    const result = await confirmarVerificacionEmailAction(slug, emailEnVerificacion, codigo);
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
    setEnviandoCodigo(true);
    const result = await enviarVerificacionEmailAction(slug, emailEnVerificacion, captchaToken);
    setEnviandoCodigo(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setCodigoDev(result.codigoDev ?? null);
  }

  function confirmarTarjetaPaciente() {
    setFlujo("verificado");
    setPaso("turno");
  }

  // elegirPacienteVerificadoTutor — Fase 2.4.2: variante de
  // confirmarTarjetaPaciente para la LISTA de "otro-tarjeta-paciente" —
  // el tutor elige entre varias fichas antes de continuar.
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

  // irAlProximoDisponible — [6], estado vacío ("No hay turnos este día."):
  // avanza día a día (tope defensivo de 60, ~2 meses) hasta encontrar el
  // primer día con slots para el tipo de consulta elegido.
  async function irAlProximoDisponible() {
    if (!tipoConsultaId) return;
    setCargandoSlots(true);
    let cursor = fecha;
    for (let i = 0; i < 60; i++) {
      cursor = fechaISOLocal(new Date(new Date(cursor + "T00:00:00").getTime() + 86_400_000));
      const disponibilidad = await listDisponibilidadPublicaAction(slug, tipoConsultaId, cursor);
      if (disponibilidad.slots.length > 0) {
        setFecha(cursor);
        setSlots(disponibilidad.slots);
        setCargandoSlots(false);
        setHora("");
        return;
      }
    }
    setCargandoSlots(false);
  }

  async function confirmar() {
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
      // datos del TUTOR. El mail del tutor: con código, es el que ya se
      // verificó (emailEnVerificacion); con enlace (Fase 2, ítem 5) esa
      // verificación nunca corrió, así que se manda el que se tipeó en
      // el propio formulario.
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
        ...(enlaceToken ? { enlaceToken } : { verificacionToken }),
        paraOtro: true,
        tutorRelacion: tutorCampos.relacion,
        tutorNombre: tutorCampos.nombre.trim(),
        tutorTelefono: telefonoConPais(paisTelefonoTutor, tutorCampos.telefono),
        tutorEmail: enlaceToken ? tutorCampos.email.trim().toLowerCase() : emailEnVerificacion,
      };
    } else {
      payload = {
        nombreContacto: campos.nombreContacto.trim(),
        apellidoContacto: campos.apellidoContacto.trim(),
        dniContacto: campos.dniContacto.trim(),
        telefonoContacto: telefonoConPais(paisTelefono, campos.telefonoContacto),
        emailContacto: campos.emailContacto.trim().toLowerCase(),
        motivo: motivo || undefined,
        tipoConsultaId,
        fecha,
        hora,
        ...(enlaceToken ? { enlaceToken } : { verificacionToken }),
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
      <div className="relative w-full max-w-[480px] rounded-card bg-marfil p-6 text-center">
        <p className="font-display text-[22px] font-semibold text-grafito">¡Listo! Tu turno en {nombreClinica} quedó confirmado</p>
        <p className="mt-2 text-sm text-grafito/70">
          {confirmado.fecha} a las {confirmado.hora}hs.
        </p>
        {linkWhatsapp && (
          <a
            href={linkWhatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="mx-auto mt-5 inline-block rounded-lg bg-salvia-oscuro px-6 py-3 text-sm font-semibold text-marfil hover:brightness-95"
          >
            Escribir también por WhatsApp
          </a>
        )}
      </div>
    );
  }

  const relacionActual = RELACION_LABEL_INTERNA[tutorCampos.relacion] ?? tutorCampos.relacion;

  switch (paso) {
    case "para-quien":
      return (
        <PantallaParaQuien
          value={paraQuienSel ?? (estadoInicial ? (esOtro ? "otro" : "mi") : null)}
          onChange={setParaQuienSel}
          onContinuar={() => {
            const elegido = paraQuienSel ?? (esOtro ? "otro" : "mi");
            setEsOtro(elegido === "otro");
            // Con enlace (Fase 2, ítem 5) se saltea [2] del todo — "ya he
            // venido antes" depende del código de verificación, que este
            // modo no tiene, así que directo a "primera vez".
            if (enlaceToken) {
              setFlujo(elegido === "otro" ? "otro-primera-vez" : "primera-vez");
              setPaso(elegido === "otro" ? "otro-tutor" : "contacto");
            } else {
              setPaso("ya-te-atendiste");
            }
          }}
          onClose={onClose}
        />
      );

    case "ya-te-atendiste":
      return (
        <PantallaYaAtendiste
          paraQuien={esOtro ? "otro" : "mi"}
          value={yaAtendisteSel}
          onChange={setYaAtendisteSel}
          onBack={() => setPaso("para-quien")}
          onContinuar={() => {
            if (!yaAtendisteSel) return;
            if (yaAtendisteSel === "primera-vez") setPaso(esOtro ? "otro-tutor" : "contacto");
            else setPaso(esOtro ? "otro-ya-vine-datos" : "ya-vine-datos");
          }}
          onClose={onClose}
          onCambiarParaQuien={() => {
            setParaQuienSel(esOtro ? "otro" : "mi");
            setPaso("para-quien");
          }}
        />
      );

    case "contacto":
      return (
        <PantallaTusDatos
          values={{
            nombre: campos.nombreContacto,
            apellido: campos.apellidoContacto,
            dni: campos.dniContacto,
            paisTelefono,
            telefono: campos.telefonoContacto,
            email: campos.emailContacto,
            motivo: campos.motivo,
          }}
          onChange={(field, value) => {
            if (field === "paisTelefono") setPaisTelefono(value);
            else if (field === "nombre") actualizar("nombreContacto", value);
            else if (field === "apellido") actualizar("apellidoContacto", value);
            else if (field === "dni") actualizar("dniContacto", value);
            else if (field === "telefono") actualizar("telefonoContacto", value);
            else if (field === "email") actualizar("emailContacto", value);
            else if (field === "motivo") actualizar("motivo", value);
          }}
          onSubmit={continuar}
          onBack={() => setPaso(enlaceToken ? "para-quien" : "ya-te-atendiste")}
          onClose={onClose}
          paso={3}
          total={4}
          submitDisabled={enviandoCodigo}
          extra={
            <>
              {!enlaceToken && <TurnstileWidget onToken={setCaptchaToken} />}
              {error && <ErrorMsg>{error}</ErrorMsg>}
            </>
          }
        />
      );

    case "ya-vine-datos":
      return (
        <PantallaBuscarFicha
          dni={yaVineDni}
          email={campos.emailContacto}
          onChangeDni={setYaVineDni}
          onChangeEmail={(v) => actualizar("emailContacto", v)}
          onSubmit={continuarYaVine}
          onBack={() => setPaso("ya-te-atendiste")}
          onClose={onClose}
          paso={3}
          total={5}
          enviando={enviandoCodigo}
          extra={
            <>
              <TurnstileWidget onToken={setCaptchaToken} />
              {error && <ErrorMsg>{error}</ErrorMsg>}
            </>
          }
        />
      );

    case "otro-tutor":
      return (
        <PantallaTusDatosTutor
          values={{
            nombre: tutorCampos.nombre,
            relacion: tutorCampos.relacion,
            paisTelefono: paisTelefonoTutor,
            telefono: tutorCampos.telefono,
            email: tutorCampos.email,
          }}
          onChange={(field, value) => {
            if (field === "paisTelefono") setPaisTelefonoTutor(value);
            else actualizarTutor(field, value);
          }}
          onSubmit={continuarOtroTutor}
          onBack={() => setPaso(enlaceToken ? "para-quien" : "ya-te-atendiste")}
          onClose={onClose}
          onCambiarParaQuien={() => {
            setParaQuienSel("mi");
            setPaso("para-quien");
          }}
          paso={3}
          total={5}
          submitDisabled={false}
        />
      );

    case "otro-paciente":
      return (
        <PantallaDatosPaciente
          values={{
            nombre: campos.nombreContacto,
            apellido: campos.apellidoContacto,
            dni: campos.dniContacto,
            telefono: campos.telefonoContacto,
            email: campos.emailContacto,
          }}
          onChange={(field, value) => actualizar(field === "nombre" ? "nombreContacto" : field === "apellido" ? "apellidoContacto" : field === "dni" ? "dniContacto" : field === "telefono" ? "telefonoContacto" : "emailContacto", value)}
          onSubmit={continuarOtroPaciente}
          onBack={() => setPaso("otro-tutor")}
          onClose={onClose}
          onEditarTutor={() => setPaso("otro-tutor")}
          tutorNombre={tutorCampos.nombre}
          tutorRelacion={relacionActual}
          paso={4}
          total={5}
          submitDisabled={enviandoCodigo}
          extra={
            <>
              {!enlaceToken && <TurnstileWidget onToken={setCaptchaToken} />}
              {error && <ErrorMsg>{error}</ErrorMsg>}
            </>
          }
        />
      );

    case "otro-ya-vine-datos":
      return (
        <PantallaBuscarPorMail
          email={tutorCampos.email}
          onChangeEmail={(v) => actualizarTutor("email", v)}
          onSubmit={continuarOtroYaVine}
          onBack={() => setPaso("ya-te-atendiste")}
          onClose={onClose}
          paso={3}
          total={5}
          enviando={enviandoCodigo}
          extra={
            <>
              <TurnstileWidget onToken={setCaptchaToken} />
              {error && <ErrorMsg>{error}</ErrorMsg>}
            </>
          }
        />
      );

    case "verificacion":
    case "ya-vine-codigo":
    case "otro-verificacion":
    case "otro-ya-vine-codigo": {
      const backTarget: Paso =
        paso === "ya-vine-codigo" ? "ya-vine-datos" : paso === "otro-verificacion" ? "otro-paciente" : paso === "otro-ya-vine-codigo" ? "otro-ya-vine-datos" : "contacto";
      const pasoActual = paso === "verificacion" ? 4 : paso === "otro-verificacion" ? 5 : 4;
      const totalActual = paso === "verificacion" ? 4 : 5;
      return (
        <PantallaCodigo
          email={emailEnVerificacion}
          onCambiarEmail={() => setPaso(backTarget)}
          onBack={() => setPaso(backTarget)}
          onClose={onClose}
          paso={pasoActual}
          total={totalActual}
          verificando={verificando || buscandoPaciente}
          error={error}
          onSubmit={confirmarCodigo}
          onReenviar={reenviarCodigo}
          codigoDev={codigoDev ?? undefined}
          pacienteNoEncontrado={pacienteNoEncontrado}
          onEmpezarComoNuevo={esOtro ? empezarComoNuevoOtro : empezarComoNuevo}
          extra={<TurnstileWidget onToken={setCaptchaToken} />}
        />
      );
    }

    case "tarjeta-paciente":
      if (!pacienteVerificado) return null;
      return (
        <PantallaSosVos
          paciente={pacienteVerificado}
          onNoSoyYo={() => {
            setPacienteVerificado(null);
            setPaso("ya-vine-datos");
          }}
          onConfirmar={confirmarTarjetaPaciente}
          onClose={onClose}
          paso={5}
          total={5}
        />
      );

    case "otro-tarjeta-paciente":
      if (pacientesVerificadosTutor.length === 0) return null;
      return (
        <PantallaParaQuienLista
          pacientes={pacientesVerificadosTutor}
          seleccionado={pacienteListaSeleccionado}
          onSeleccionar={setPacienteListaSeleccionado}
          onBack={() => {
            setPacientesVerificadosTutor([]);
            setPaso("otro-ya-vine-datos");
          }}
          onClose={onClose}
          onContinuar={() => {
            const elegido = pacientesVerificadosTutor.find((p) => p.id === pacienteListaSeleccionado);
            if (elegido) elegirPacienteVerificadoTutor(elegido);
          }}
          paso={5}
          total={5}
        />
      );

    case "turno":
      return (
        <PantallaDiaHora
          tipos={tipos}
          tipoConsultaId={tipoConsultaId}
          onTipoConsultaChange={(id) => {
            setTipoConsultaId(id);
            setCargandoSlots(true);
          }}
          fecha={fecha}
          onFechaChange={(f) => {
            setFecha(f);
            setCargandoSlots(true);
          }}
          slots={slots}
          cargandoSlots={cargandoSlots}
          hora={hora}
          onHoraChange={setHora}
          error={error}
          confirmando={pending}
          onConfirmar={confirmar}
          onIrProximoDisponible={irAlProximoDisponible}
          onBack={() => {
            // Fase 2, ítem 5: con enlace nunca se pasó por ningún paso de
            // código — "Atrás" vuelve directo a la última pantalla de
            // datos real.
            if (enlaceToken) {
              setPaso(flujo === "otro-primera-vez" ? "otro-paciente" : "contacto");
              return;
            }
            if (flujo === "verificado") setPaso("tarjeta-paciente");
            else if (flujo === "otro-verificado") setPaso("otro-tarjeta-paciente");
            else if (flujo === "otro-primera-vez") setPaso("otro-verificacion");
            else setPaso("verificacion");
          }}
          onClose={onClose}
          mesVisible={mesVisible}
          diasConTurnos={diasConTurnos}
          cargandoMes={cargandoMes}
          onMesChange={cambiarMesVisible}
          extra={
            // Corrección de QA sobre TR-107 (regla universal: "sea
            // paciente verificado o no verificado solo puede tener un
            // turno activo con el mismo dni"): el error de turno activo
            // suma un contacto directo por WhatsApp — el paciente no
            // puede resolverlo solo desde acá.
            error && error.startsWith("ya tenés un turno pendiente") && telefonoClinica ? (
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
            ) : undefined
          }
        />
      );

    default:
      return null;
  }
}

const RELACION_LABEL_INTERNA: Record<string, string> = {
  familiar: "familiar",
  amigo: "amigo/a",
  otro: "vínculo distinto",
};

function ErrorMsg({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="text-sm text-terracota-oscuro">
      {children}
    </p>
  );
}
