// Tipos espejo de los structs Go de apps/api (internal/http/auth.go,
// internal/http/especialidades.go). Se amplía en cada sprint que agregue
// un endpoint nuevo — mantenimiento a mano, no generado (mismo trade-off
// que Marcuzzi_Madryn, ver R8 en docs/implementation-plan.md).

export interface Especialidad {
  id: string;
  nombre: string;
}

export interface Profesional {
  id: string;
  nombre: string;
  email: string;
  telefono?: string | null;
  nombreClinica: string;
  slug: string;
  especialidades: Especialidad[];
}

export interface AuthResponse {
  profesional: Profesional;
  token: string;
}

// Resultado del buscador público de clínicas (spec §6, FR-10) — nunca
// datos sensibles del profesional (email, teléfono).
export interface ClinicaResultado {
  slug: string;
  nombreClinica: string;
  profesionalNombre: string;
  especialidades: string[];
}

// Catálogo por profesional (TR-001), no global — spec §4.3.
export interface TipoConsulta {
  id: string;
  nombre: string;
  color: string;
}

// Espejo de turnoResponse (internal/http/turnos.go) — sin
// tipoConsultaNombre/Color a propósito: el front cruza por tipoConsultaId
// contra el catálogo de TipoConsulta que ya tiene cargado.
export interface Turno {
  id: string;
  estado: "pendiente" | "agendado" | "cancelada";
  origen: "pagina_publica" | "manual";
  tipoConsultaId?: string;
  horaInicio?: string;
  horaFin?: string;
  pacienteId?: string;
  nombreContacto: string;
  apellidoContacto: string;
  dniContacto: string;
  telefonoContacto: string;
  emailContacto: string;
  motivo: string;
  createdAt: string;
}

export interface ResumenPanel {
  turnosPendientes: number;
  turnosConfirmados: number;
}

// --- Sprint 3: turnos entrantes + pacientes + formulario público ---

// Espejo de clinicaPublicaResponse (internal/http/clinicas.go) — a
// diferencia de ClinicaResultado (buscador), SÍ incluye teléfono: es lo que
// necesita el formulario público de pedir turno para armar el link de
// WhatsApp (TR-003). `oculta` (T4.4, spec §5.2) decide si un visitante ve
// el contenido o la pantalla de mantenimiento.
export interface ClinicaPublica {
  slug: string;
  nombreClinica: string;
  profesionalNombre: string;
  telefono?: string | null;
  especialidades: string[];
  oculta: boolean;
}

// --- Sprint 4: edición y deploy de página pública (spec §5) ---

// Espejo de paginaPublicaResponse (internal/http/pagina_publica.go).
// `deployadaEn` nulo = todavía no se publicó por primera vez (spec §5.2)
// — no aparece en el buscador (GET /clinicas) hasta que se deploya, pero
// la URL propia (`/{slug}`) ya se puede previsualizar antes.
export interface PaginaPublica {
  oculta: boolean;
  deployadaEn?: string | null;
}

// Espejo de pacienteResponse (internal/http/pacientes.go).
export interface Paciente {
  id: string;
  nombre: string;
  apellido: string;
  dni: string;
  telefono: string;
  email?: string | null;
  createdAt: string;
}

// Espejo de pacienteDetalleResponse — datos personales + historial
// completo de turnos (T3.6); el front separa "activos" de "historial".
export interface PacienteDetalle extends Paciente {
  turnos: Turno[];
}
