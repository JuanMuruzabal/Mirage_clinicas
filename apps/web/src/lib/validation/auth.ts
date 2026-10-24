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
  .string({ error: "La contraseña es obligatoria." })
  .min(12, "La contraseña debe tener al menos 12 caracteres.")
  .max(128, "La contraseña es demasiado larga.");

// Un mensaje propio para cuando un campo falta o llega con otro tipo (una
// Server Action con el payload incompleto): sin el `error` del constructor,
// Zod responde su mensaje por defecto, en inglés.
const textoObligatorio = (mensaje: string) => z.string({ error: mensaje }).trim().min(1, mensaje);
const listaDeTextos = (mensaje: string) => z.array(z.string({ error: mensaje }), { error: mensaje });
// Un opcional que el formulario puede mandar como "" (ver onboardingPerfilSchema).
// Si fallan las dos ramas, la unión respondería "Invalid input": lleva el suyo.
const opcionalOVacio = <T extends z.ZodType>(campo: T, mensaje: string) =>
  z.union([campo.optional(), z.literal("")], { error: mensaje });

const ACEPTAR_TERMINOS = "Tenés que aceptar los términos y la política de privacidad.";
const ELEGI_PREFIJO = "Elegí el prefijo del teléfono.";
const ENLACE_DE_RESET_INVALIDO = "El enlace para cambiar la contraseña no es válido. Pedí uno nuevo.";
const telefonoSchema = z.string({ error: "Ingresá un teléfono válido." }).trim().min(6, "Ingresá un teléfono válido.");
const captchaSchema = z.string({ error: "No pudimos completar la verificación de seguridad. Probá de nuevo." }).optional();
const confirmarPasswordSchema = z.string({ error: "Repetí la contraseña." });
const emailSchema = textoObligatorio("El email es obligatorio.").email("El email no tiene un formato válido.");

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  aceptaTerminos: z
    .boolean({ error: ACEPTAR_TERMINOS })
    .refine((v) => v === true, { message: ACEPTAR_TERMINOS }),
  captchaToken: captchaSchema,
});
export type RegisterFormValues = z.infer<typeof registerSchema>;

// registerFormSchema — lo que de verdad completa el formulario de Paso 1
// (agrega confirmarPassword, solo para feedback inmediato del lado del
// cliente — nunca viaja al backend, ver registerSchema arriba).
export const registerFormSchema = registerSchema
  .extend({ confirmarPassword: confirmarPasswordSchema })
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
  password: z.string({ error: "La contraseña es obligatoria." }).min(1, "La contraseña es obligatoria."),
});
export type LoginFormValues = z.infer<typeof loginSchema>;

export const recuperarPasswordSchema = z.object({
  email: emailSchema,
  captchaToken: captchaSchema,
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
    .string({ error: "Ingresá el código de 6 dígitos." })
    .trim()
    .length(6, "El código tiene 6 dígitos.")
    .regex(/^\d+$/, "El código es solo números."),
});
export type VerificarEmailFormValues = z.infer<typeof verificarEmailSchema>;

export const resetPasswordSchema = z
  .object({
    token: z.string({ error: ENLACE_DE_RESET_INVALIDO }).min(1, ENLACE_DE_RESET_INVALIDO),
    newPassword: passwordSchema,
    confirmarPassword: confirmarPasswordSchema,
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
    tipoPerfil: z.enum(["profesional", "actividades"], { error: "Elegí Profesional o Actividades de la clínica." }).default("profesional"),
    nombre: textoObligatorio("El nombre es obligatorio."),
    apellido: textoObligatorio("El apellido es obligatorio."),
    telefonoPrefijo: textoObligatorio(ELEGI_PREFIJO).default("+54"),
    telefono: telefonoSchema,
    documento: opcionalOVacio(z.string().trim(), "Revisá el documento."),
    // `opcionalOVacio` no es decorativo: react-hook-form NO limpia el
    // valor de un campo que se desmonta (shouldUnregister es false por
    // default), así que si alguien empieza como profesional y cambia a
    // "actividades", el select ya registrado deja un "" que un enum puro
    // rechaza — y el error no tendría dónde mostrarse, porque ese campo
    // ya no está en pantalla. Resultado: un formulario que no se envía y
    // no dice por qué. Pasó.
    matriculaTipo: opcionalOVacio(z.enum(["nacional", "provincial"]), "Elegí el tipo de matrícula."),
    matriculaNumero: opcionalOVacio(z.string().trim(), "Revisá el número de matrícula."),
    especialidadIds: listaDeTextos("Revisá las especialidades elegidas.").default([]),
    aniosExperiencia: z.coerce
      .number({ error: "Ingresá los años de experiencia en números." })
      .int("Ingresá un número entero de años.")
      .min(0, "Los años de experiencia no pueden ser negativos.")
      .max(80, "Revisá los años de experiencia (máximo 80).")
      .optional(),
    bio: opcionalOVacio(z.string().trim().max(500, "Máximo 500 caracteres."), "Revisá la bio corta."),
    idiomas: listaDeTextos("Revisá los idiomas elegidos.").optional(),
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
// Lo que tiene el formulario antes de validar: los `.default()` hacen opcionales esos campos.
export type OnboardingPerfilFormInput = z.input<typeof onboardingPerfilSchema>;

// Paso 3 del wizard (spec §4) — dos cards seleccionables, no un <select>.
export const onboardingClinicaSchema = z.object({
  tipo: z.enum(["individual", "organizacion"], { error: "Elegí el tipo de clínica." }),
  nombre: textoObligatorio("El nombre de la clínica es obligatorio."),
  // Ubicación y contacto dejaron de ser opcionales (Fase 3.2.3, ronda de
  // QA): son los datos que la página pública muestra y por los que el
  // buscador encuentra a la clínica.
  direccion: textoObligatorio("La dirección es obligatoria."),
  ciudad: textoObligatorio("La ciudad es obligatoria."),
  provincia: textoObligatorio("Elegí la provincia."),
  // telefonoPrefijo solo vive en el formulario: la clínica guarda UNA
  // columna de teléfono (`clinics.telefono`), a diferencia del perfil
  // profesional, que sí tiene prefijo y número separados. El control es
  // el mismo (CampoTelefono) y los dos valores se unen al enviar.
  telefonoPrefijo: z.string({ error: ELEGI_PREFIJO }).trim().default("+54"),
  telefono: telefonoSchema,
});
export type OnboardingClinicaFormValues = z.infer<typeof onboardingClinicaSchema>;
export type OnboardingClinicaFormInput = z.input<typeof onboardingClinicaSchema>;
