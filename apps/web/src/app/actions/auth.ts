"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  apiGoogleLogin,
  apiGoogleState,
  apiLogin,
  apiLogout,
  apiOnboardingClinica,
  apiOnboardingPerfil,
  apiRecuperarPassword,
  apiReenviarVerificacion,
  apiRegister,
  apiResetPassword,
  apiUpdateMe,
  apiVerificarEmail,
} from "@/lib/api";
import type {
  GooglePayload,
  LoginPayload,
  OnboardingClinicaPayload,
  OnboardingPerfilPayload,
  RecuperarPasswordPayload,
  RegisterPayload,
  VerificarEmailPayload,
} from "@dental-mirage/shared-types";
import { clearSessionCookie, getSessionToken, setSessionCookie } from "@/lib/session";
import {
  loginSchema,
  onboardingClinicaSchema,
  onboardingPerfilSchema,
  recuperarPasswordSchema,
  registerSchema,
  resetPasswordSchema,
  verificarEmailSchema,
} from "@/lib/validation/auth";

export interface ActionResult {
  error: string;
}

export interface MensajeResult {
  mensaje: string;
}

// Cada Server Action revalida con el mismo schema zod que ya corrió en el
// cliente (defensa en profundidad, spec §8) — apps/api sigue siendo la
// fuente de verdad final y revalida todo de nuevo, esto solo evita
// mandarle a la API algo que ya se sabía inválido acá.

// registerAction — spec §4 Paso 1. Normalmente NO redirige por sí sola: la
// cuenta queda sin verificar (o, si el mail ya existía, la respuesta es la
// misma genérica sin token — anti-enumeración, spec §7) y la pantalla de
// "revisá tu correo" la muestra el propio wizard con este resultado, no
// una navegación aparte.
//
// Excepción (TR-051 en docs/tradeoffs.md): si el backend ya marcó la
// cuenta como verificada (AutoVerifyEmail, mientras Resend no esté
// configurado), no tiene sentido mostrar "revisá tu correo" para un mail
// que nunca se mandó — se comporta como loginAction, seteando la cookie y
// mandando directo a /sumarse, que ya va a reflejar el Paso 2.
export async function registerAction(payload: RegisterPayload): Promise<ActionResult | MensajeResult | undefined> {
  const parsed = registerSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const result = await apiRegister(parsed.data);
  if (!result.ok) {
    return { error: result.error };
  }
  if (result.data.token) {
    await setSessionCookie(result.data.token);
  }
  if (result.data.emailVerificado && result.data.token) {
    redirect("/sumarse");
  }
  return { mensaje: result.data.mensaje };
}

// loginAction — spec §5. Redirige siempre a /sumarse tras un login
// exitoso: esa página lee el estado real (`onboardingStep`) desde /me con
// la cookie recién seteada y decide si reenviar a /seleccionar-servicio
// (onboarding ya completo) o mostrar el paso pendiente — un solo lugar
// decide el ruteo post-auth, en vez de duplicarlo en cada acción.
export async function loginAction(payload: LoginPayload): Promise<ActionResult | MensajeResult | undefined> {
  const parsed = loginSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const result = await apiLogin(parsed.data);
  if (!result.ok) {
    return { error: result.error };
  }
  if (!result.data.emailVerificado || !result.data.token) {
    // Estado especial admitido por la spec (§7): credenciales correctas
    // pero mail sin verificar — no es un error genérico, el form muestra
    // la acción de reenvío.
    return { mensaje: result.data.mensaje ?? "confirmá tu mail antes de iniciar sesión" };
  }
  await setSessionCookie(result.data.token);
  redirect("/sumarse");
}

// googleLoginAction — botón único que resuelve signup y login (spec §2).
export async function googleLoginAction(payload: GooglePayload): Promise<ActionResult | undefined> {
  const result = await apiGoogleLogin(payload);
  if (!result.ok) {
    return { error: result.error };
  }
  await setSessionCookie(result.data.token);
  redirect("/sumarse");
}

// googleStateAction — el frontend pide un `state` firmado antes de abrir
// el popup de Google (spec §7: "state firmado y verificado").
export async function googleStateAction(): Promise<{ state: string } | ActionResult> {
  const result = await apiGoogleState();
  if (!result.ok) {
    return { error: result.error };
  }
  return { state: result.data.state };
}

// verificarEmailAction — TR-055 en docs/tradeoffs.md: valida el código de
// 6 dígitos que llegó por mail (antes era un link con un botón — el
// código se escribe a mano en la misma pantalla, no hace falta la
// protección contra escáneres de seguridad de email que sí justificaba el
// botón: un escáner no puede "clickear" un input de texto).
export async function verificarEmailAction(payload: VerificarEmailPayload): Promise<ActionResult | undefined> {
  const parsed = verificarEmailSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Código inválido." };
  }

  const sesionActual = await getSessionToken();
  const result = await apiVerificarEmail(parsed.data, sesionActual);
  if (!result.ok) {
    return { error: result.error };
  }
  await setSessionCookie(result.data.token);
  redirect("/sumarse");
}

export async function reenviarVerificacionAction(email: string): Promise<ActionResult | MensajeResult> {
  const result = await apiReenviarVerificacion({ email });
  if (!result.ok) {
    return { error: result.error };
  }
  return { mensaje: result.data.mensaje };
}

export async function recuperarPasswordAction(payload: RecuperarPasswordPayload): Promise<ActionResult | MensajeResult> {
  const parsed = recuperarPasswordSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const result = await apiRecuperarPassword(parsed.data);
  if (!result.ok) {
    return { error: result.error };
  }
  return { mensaje: result.data.mensaje };
}

export interface ResetPasswordActionInput {
  token: string;
  newPassword: string;
  confirmarPassword: string;
}

export async function resetPasswordAction(payload: ResetPasswordActionInput): Promise<ActionResult | undefined> {
  const parsed = resetPasswordSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const result = await apiResetPassword({ token: parsed.data.token, newPassword: parsed.data.newPassword });
  if (!result.ok) {
    return { error: result.error };
  }
  await setSessionCookie(result.data.token);
  redirect("/sumarse");
}

export async function logoutAction(): Promise<void> {
  const token = await getSessionToken();
  if (token) {
    await apiLogout(token);
  }
  await clearSessionCookie();
  redirect("/");
}

// onboardingPerfilAction — Paso 1 del modal de bienvenida (spec §4) —
// TR-057 en docs/tradeoffs.md: antes redirigía de vuelta a /sumarse (que
// mostraba el paso siguiente); ahora este paso vive en el modal sobre
// /seleccionar-servicio, así que redirige ahí — la próxima carga de esa
// página ya refleja `onboardingStep: "clinica"` y muestra el paso 2 del
// modal.
export async function onboardingPerfilAction(payload: OnboardingPerfilPayload): Promise<ActionResult | undefined> {
  const parsed = onboardingPerfilSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const token = await getSessionToken();
  if (!token) {
    redirect("/ingresar");
  }

  const result = await apiOnboardingPerfil(token, parsed.data);
  if (!result.ok) {
    return { error: result.error };
  }
  redirect("/seleccionar-servicio");
}

// onboardingClinicaAction — Paso 3 del wizard (spec §4), completa el
// onboarding.
export async function onboardingClinicaAction(payload: OnboardingClinicaPayload): Promise<ActionResult | undefined> {
  const parsed = onboardingClinicaSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const token = await getSessionToken();
  if (!token) {
    redirect("/ingresar");
  }

  const result = await apiOnboardingClinica(token, parsed.data);
  if (!result.ok) {
    return { error: result.error };
  }
  redirect("/seleccionar-servicio");
}

// updateMeAction — edición del perfil ya completo desde /perfil (no el
// wizard de onboarding, que usa onboardingPerfilAction).
export async function updateMeAction(payload: OnboardingPerfilPayload): Promise<ActionResult | undefined> {
  const parsed = onboardingPerfilSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const token = await getSessionToken();
  if (!token) {
    redirect("/ingresar");
  }

  const result = await apiUpdateMe(token, parsed.data);
  if (!result.ok) {
    return { error: result.error };
  }
  revalidatePath("/perfil");
}
