import { z } from "zod";

// Schemas compartidos entre los Client Components (React Hook Form, feedback
// inmediato) y las Server Actions (revalidación server-side, defensa en
// profundidad) — apps/api sigue siendo la fuente de verdad final, estos
// schemas solo evitan un viaje de ida y vuelta con un error que ya se podía
// detectar acá (docs/feature-sumarte-login.md §8).
//
// Contraseña — spec §7: "mínimo 12 caracteres, sin reglas de composición
// arbitrarias, sin límite máximo bajo (aceptar hasta 128)". Mismos números
// que minPasswordLen/maxPasswordLen en apps/api/internal/http/auth.go.
const passwordSchema = z
  .string()
  .min(12, "La contraseña debe tener al menos 12 caracteres.")
  .max(128, "La contraseña es demasiado larga.");

const emailSchema = z.string().trim().min(1, "El email es obligatorio.").email("El email no tiene un formato válido.");

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  aceptaTerminos: z
    .boolean()
    .refine((v) => v === true, { message: "Tenés que aceptar los términos y la política de privacidad." }),
  captchaToken: z.string().optional(),
});
export type RegisterFormValues = z.infer<typeof registerSchema>;

// registerFormSchema — lo que de verdad completa el formulario de Paso 1
// (agrega confirmarPassword, solo para feedback inmediato del lado del
// cliente — nunca viaja al backend, ver registerSchema arriba).
export const registerFormSchema = registerSchema
  .extend({ confirmarPassword: z.string() })
  .refine((data) => data.password === data.confirmarPassword, {
    message: "Las contraseñas no coinciden.",
    path: ["confirmarPassword"],
  });
export type CrearCuentaFormValues = z.infer<typeof registerFormSchema>;

// Login no valida longitud de contraseña — una cuenta migrada o vieja
// puede tener un password más corto que el mínimo actual, y el backend
// (que sigue siendo la fuente de verdad) responde 401 genérico si no
// matchea, sin necesidad de que el frontend adivine reglas.
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "La contraseña es obligatoria."),
});
export type LoginFormValues = z.infer<typeof loginSchema>;

export const recuperarPasswordSchema = z.object({
  email: emailSchema,
  captchaToken: z.string().optional(),
});
export type RecuperarPasswordFormValues = z.infer<typeof recuperarPasswordSchema>;

// verificarEmailSchema — TR-055 en docs/tradeoffs.md: código de 6 dígitos
// que se escribe a mano (antes era un token de link, sin validación de
// forma acá porque cualquier string era válido). El backend sigue siendo
// la fuente de verdad final (compara contra el hash guardado), esto es
// solo feedback inmediato ante un typo obvio (letras, longitud distinta).
export const verificarEmailSchema = z.object({
  email: emailSchema,
  codigo: z
    .string()
    .trim()
    .length(6, "El código tiene 6 dígitos.")
    .regex(/^\d+$/, "El código es solo números."),
});
export type VerificarEmailFormValues = z.infer<typeof verificarEmailSchema>;

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1),
    newPassword: passwordSchema,
    confirmarPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmarPassword, {
    message: "Las contraseñas no coinciden.",
    path: ["confirmarPassword"],
  });
export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

// Paso 2 del wizard (spec §4) — obligatorios: nombre, apellido, teléfono,
// matrícula, al menos una especialidad. El resto opcional pero visible.
export const onboardingPerfilSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio."),
  apellido: z.string().trim().min(1, "El apellido es obligatorio."),
  telefonoPrefijo: z.string().trim().min(1).default("+54"),
  telefono: z.string().trim().min(6, "Ingresá un teléfono válido."),
  documento: z.string().trim().optional().or(z.literal("")),
  matriculaTipo: z.enum(["nacional", "provincial"], {
    errorMap: () => ({ message: "Elegí el tipo de matrícula." }),
  }),
  matriculaNumero: z.string().trim().min(1, "La matrícula es obligatoria."),
  especialidadIds: z.array(z.string()).min(1, "Elegí al menos una especialidad."),
  aniosExperiencia: z.coerce.number().int().min(0).max(80).optional(),
  bio: z.string().trim().max(500, "Máximo 500 caracteres.").optional().or(z.literal("")),
  idiomas: z.array(z.string()).optional(),
});
export type OnboardingPerfilFormValues = z.infer<typeof onboardingPerfilSchema>;

// Paso 3 del wizard (spec §4) — dos cards seleccionables, no un <select>.
export const onboardingClinicaSchema = z.object({
  tipo: z.enum(["individual", "organizacion"], {
    errorMap: () => ({ message: "Elegí el tipo de clínica." }),
  }),
  nombre: z.string().trim().min(1, "El nombre de la clínica es obligatorio."),
  direccion: z.string().trim().optional().or(z.literal("")),
  ciudad: z.string().trim().optional().or(z.literal("")),
  provincia: z.string().trim().optional().or(z.literal("")),
  telefono: z.string().trim().optional().or(z.literal("")),
});
export type OnboardingClinicaFormValues = z.infer<typeof onboardingClinicaSchema>;
