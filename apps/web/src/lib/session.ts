import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Especialidad, ClinicRole, ClinicTipo, Me, MatriculaTipo } from "@dental-mirage/shared-types";
import { apiMe } from "./api";

// Token de sesión opaco en cookie httpOnly de primera parte — nunca en
// localStorage (spec §9.3/§7). Ya no es un JWT (docs/feature-sumarte-login.md,
// TR-037 en docs/tradeoffs.md): apps/api valida contra internal/auth.Session
// (Postgres), esta cookie solo transporta el token, nunca lo interpreta acá
// — la única fuente de verdad sobre validez/expiración es la API.
// TTL absoluto 30 días (mismo valor que SessionAbsoluteTTL en session.go).
const COOKIE_NAME = "dm_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
}

export async function getSessionToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(COOKIE_NAME)?.value;
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

// getMe — helper base: sin cookie o con un token que la API ya no acepta
// (expirado/revocado), devuelve null (y limpia la cookie vieja en el
// segundo caso) en vez de redirigir — lo usa tanto site-header.tsx (solo
// necesita saber si hay sesión) como los guards de abajo.
export async function getMe(): Promise<Me | null> {
  const token = await getSessionToken();
  if (!token) return null;

  const result = await apiMe(token);
  if (!result.ok) {
    await clearSessionCookie();
    return null;
  }
  return result.data;
}

// requireSession — helper para Server Components que necesitan sesión
// pero NO necesariamente onboarding completo (ej. el wizard mismo). Sin
// sesión válida, redirige a /ingresar.
export async function requireSession(): Promise<Me> {
  const me = await getMe();
  if (!me) {
    redirect("/ingresar");
  }
  return me;
}

// SesionCompleta — vista aplanada de Me para pantallas que solo pueden
// existir con onboarding ya terminado (/panel, /perfil,
// /personalizar-pagina, /seleccionar-servicio): ahí `perfil`/`clinica`
// están garantizados, así que esta forma evita que cada consumidor tenga
// que repetir el chequeo de undefined. Nombres de campo alineados a los
// que ya usaban los componentes existentes (nombre/telefono/nombreClinica/
// slug/especialidades) para minimizar cambios en PerfilForm/PaginaEditor.
export interface SesionCompleta {
  id: string;
  email: string;
  nombre: string;
  apellido: string;
  telefonoPrefijo: string;
  telefono: string;
  documento?: string | null;
  matriculaTipo: MatriculaTipo;
  matriculaNumero: string;
  aniosExperiencia?: number | null;
  bio?: string | null;
  idiomas?: string[] | null;
  especialidades: Especialidad[];
  nombreClinica: string;
  slug: string;
  clinicaId: string;
  clinicaTipo: ClinicTipo;
  rol: ClinicRole;
}

function toSesionCompleta(me: Me): SesionCompleta | null {
  if (!me.perfil || !me.clinica) return null;
  return {
    id: me.id,
    email: me.email,
    nombre: me.perfil.nombre,
    apellido: me.perfil.apellido,
    telefonoPrefijo: me.perfil.telefonoPrefijo,
    telefono: me.perfil.telefono,
    documento: me.perfil.documento,
    matriculaTipo: me.perfil.matriculaTipo,
    matriculaNumero: me.perfil.matriculaNumero,
    aniosExperiencia: me.perfil.aniosExperiencia,
    bio: me.perfil.bio,
    idiomas: me.perfil.idiomas,
    especialidades: me.perfil.especialidades,
    nombreClinica: me.clinica.nombre,
    slug: me.clinica.slug,
    clinicaId: me.clinica.id,
    clinicaTipo: me.clinica.tipo,
    rol: me.clinica.rol,
  };
}

// requireOnboardingComplete — guard de /panel, /perfil,
// /personalizar-pagina, /seleccionar-servicio: exige sesión Y onboarding
// terminado. Sin sesión → /ingresar. Con sesión pero onboarding incompleto
// → /sumarse (que retoma en el paso correcto leyendo `onboardingStep`).
// Reemplaza a `requireProfesional()`.
export async function requireOnboardingComplete(): Promise<SesionCompleta> {
  const me = await requireSession();
  if (!me.onboardingCompletado) {
    redirect("/sumarse");
  }
  const sesion = toSesionCompleta(me);
  if (!sesion) {
    // No debería pasar nunca si onboardingCompletado es true (el backend
    // solo lo marca así tras crear perfil+clínica) — cinturón y tirantes.
    redirect("/sumarse");
  }
  return sesion;
}

// redirectSiOnboardingCompleto — usado por /sumarse (no puede reentrar al
// wizard con onboarding ya terminado, spec §4) y por /ingresar (si ya hay
// sesión, no tiene sentido mostrar el form de login). A diferencia de
// requireSession/requireOnboardingComplete, NO redirige por falta de
// sesión — /sumarse Paso 1 y /ingresar son justamente las pantallas para
// quien todavía no tiene una.
export async function redirectSiOnboardingCompleto(me: Me | null): Promise<void> {
  if (me?.onboardingCompletado) {
    redirect("/seleccionar-servicio");
  }
}
