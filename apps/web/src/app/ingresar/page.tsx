import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Ingresar — Dental Mirage" };

// Identidad cálida (TR-015 en docs/tradeoffs.md).
export default function IngresarPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 bg-hueso px-6 py-16 pt-[calc(var(--header-height)+2rem)]">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium text-grafito">Ingresar</h1>
      <LoginForm />
    </main>
  );
}
