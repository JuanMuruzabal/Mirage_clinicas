import { z } from "zod";

// Schemas compartidos entre los Client Components (React Hook Form, feedback
// inmediato) y las Server Actions (revalidación server-side, defensa en
// profundidad) — apps/api sigue siendo la fuente de verdad final, estos
// schemas solo evitan un viaje de ida y vuelta con un error que ya se podía
// detectar acá (docs/Login/feature-sumarte-login.md §8).
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

// verificarEmailSchema — TR-055 en docs/Arquitectura y base/tradeoffs.md: código de 6 dígitos
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
// Matrícula y especialidades son obligatorias SOLO para quien atiende
// pacientes (Fase 3.2.3): un recepcionista o quien administra la página
// no tiene matrícula, y con las invitaciones por mail (3.2.4) esa persona
// también va a crearse una cuenta acá. Por eso la validación es
// condicional (`superRefine`) y no un `z.enum` obligatorio: el mismo
// formulario sirve para los dos casos.
export const onboardingPerfilSchema = z
  .object({
    tipoPerfil: z.enum(["profesional", "actividades"]).default("profesional"),
    nombre: z.string().trim().min(1, "El nombre es obligatorio."),
    apellido: z.string().trim().min(1, "El apellido es obligatorio."),
    telefonoPrefijo: z.string().trim().min(1).default("+54"),
    telefono: z.string().trim().min(6, "Ingresá un teléfono válido."),
    documento: z.string().trim().optional().or(z.literal("")),
    // `.or(z.literal(""))` no es decorativo: react-hook-form NO limpia el
    // valor de un campo que se desmonta (shouldUnregister es false por
    // default), así que si alguien empieza como profesional y cambia a
    // "actividades", el select ya registrado deja un "" que un enum puro
    // rechaza — y el error no tendría dónde mostrarse, porque ese campo
    // ya no está en pantalla. Resultado: un formulario que no se envía y
    // no dice por qué. Pasó.
    matriculaTipo: z.enum(["nacional", "provincial"]).optional().or(z.literal("")),
    matriculaNumero: z.string().trim().optional().or(z.literal("")),
    especialidadIds: z.array(z.string()).default([]),
    aniosExperiencia: z.coerce.number().int().min(0).max(80).optional(),
    bio: z.string().trim().max(500, "Máximo 500 caracteres.").optional().or(z.literal("")),
    idiomas: z.array(z.string()).optional(),
  })
  .superRefine((valores, ctx) => {
    if (valores.tipoPerfil !== "profesional") return;
    if (!valores.matriculaTipo) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["matriculaTipo"], message: "Elegí el tipo de matrícula." });
    }
    if (!valores.matriculaNumero) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["matriculaNumero"], message: "La matrícula es obligatoria." });
    }
    if (valores.especialidadIds.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["especialidadIds"], message: "Elegí al menos una especialidad." });
    }
  });
export type OnboardingPerfilFormValues = z.infer<typeof onboardingPerfilSchema>;

// Paso 3 del wizard (spec §4) — dos cards seleccionables, no un <select>.
export const onboardingClinicaSchema = z.object({
  tipo: z.enum(["individual", "organizacion"], {
    errorMap: () => ({ message: "Elegí el tipo de clínica." }),
  }),
  nombre: z.string().trim().min(1, "El nombre de la clínica es obligatorio."),
  // Ubicación y contacto dejaron de ser opcionales (Fase 3.2.3, ronda de
  // QA): son los datos que la página pública muestra y por los que el
  // buscador encuentra a la clínica.
  direccion: z.string().trim().min(1, "La dirección es obligatoria."),
  ciudad: z.string().trim().min(1, "La ciudad es obligatoria."),
  provincia: z.string().trim().min(1, "Elegí la provincia."),
  // telefonoPrefijo solo vive en el formulario: la clínica guarda UNA
  // columna de teléfono (`clinics.telefono`), a diferencia del perfil
  // profesional, que sí tiene prefijo y número separados. El control es
  // el mismo (CampoTelefono) y los dos valores se unen al enviar.
  telefonoPrefijo: z.string().trim().default("+54"),
  telefono: z.string().trim().min(6, "Ingresá un teléfono válido."),
});
export type OnboardingClinicaFormValues = z.infer<typeof onboardingClinicaSchema>;
