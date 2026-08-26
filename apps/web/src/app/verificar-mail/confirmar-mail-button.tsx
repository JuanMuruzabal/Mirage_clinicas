"use client";

import { useState } from "react";
import { verificarEmailAction } from "@/app/actions/auth";
import { authErrorClass, authSubmitClass } from "@/components/auth/auth-shell";

// Decisión ya confirmada (docs/tradeoffs.md TR-043): el link de mail abre
// esta pantalla con un botón — el clic dispara la verificación real (POST,
// vía Server Action), nunca se verifica automáticamente al cargar la
// página. Evita que un escáner de seguridad de email (Outlook/Gmail
// abriendo links de forma automática) queme el token de un solo uso antes
// de que la persona real lo vea.
export function ConfirmarMailButton({ token }: { token: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmar() {
    setPending(true);
    setError(null);
    const result = await verificarEmailAction(token);
    // Si tuvo éxito, la acción ya redirigió a /sumarse y esta línea no se
    // alcanza.
    setPending(false);
    if (result?.error) {
      setError(result.error);
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <button type="button" onClick={confirmar} disabled={pending} className={authSubmitClass}>
        {pending ? "Confirmando…" : "Confirmar mi cuenta"}
      </button>
      {error && (
        <p role="alert" className={authErrorClass}>
          {error}
        </p>
      )}
    </div>
  );
}
