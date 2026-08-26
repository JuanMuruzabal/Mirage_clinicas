import { ConfirmarCodigoForm } from "@/components/auth/confirmar-codigo-form";

// "Revisá tu correo" (spec §4 Paso 1, §6): pantalla intermedia entre crear
// la cuenta y verificar el mail — TR-055 en docs/tradeoffs.md: ahora pide
// el código de 6 dígitos ahí mismo (antes solo esperaba a que se
// clickeara un link llegado por mail, con "reenviar" como única acción
// disponible en esta pantalla).
export function RevisaCorreo({ email }: { email: string }) {
  return <ConfirmarCodigoForm email={email} />;
}
