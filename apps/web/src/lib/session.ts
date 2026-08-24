import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Profesional } from "@dental-mirage/shared-types";
import { apiMe } from "./api";

// JWT de sesión en cookie httpOnly de primera parte — nunca en
// localStorage (spec §9.3). 7 días, mismo TTL que emite apps/api
// (internal/auth/jwt.go, tokenTTL).
const COOKIE_NAME = "dm_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

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

// requireProfesional — helper para Server Components de rutas protegidas
// (T1.2: "rutas de /panel redirigen si no hay sesión"; en Sprint 1 aplica
// a /seleccionar-servicio y /perfil). Sin cookie, o con un token que la API
// ya no acepta (expirado/inválido), redirige a /ingresar y limpia la
// cookie vieja en ese segundo caso.
export async function requireProfesional(): Promise<Profesional> {
  const token = await getSessionToken();
  if (!token) {
    redirect("/ingresar");
  }

  const result = await apiMe(token);
  if (!result.ok) {
    await clearSessionCookie();
    redirect("/ingresar");
  }

  return result.data;
}
