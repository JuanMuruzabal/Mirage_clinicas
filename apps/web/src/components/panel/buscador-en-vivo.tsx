"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IconSearch } from "@/components/icons";

interface BuscadorEnVivoProps {
  q?: string;
  // hrefBase — el path + querystring YA VIGENTE (tab/estado, desde, hasta,
  // etc.) SIN el parámetro `q`. El componente le agrega `q` (con `?` o `&`
  // según corresponda) o lo saca del todo si el campo queda vacío. Cada
  // página arma este string con SUS PROPIOS filtros — a propósito no lee
  // `useSearchParams()` (evita el requisito de envolver en `<Suspense>`
  // solo para esto, ver TR-115) ni intenta ser genérico entre páginas con
  // filtros distintos.
  hrefBase: string;
  placeholder: string;
}

// BuscadorEnVivo — pedido textual del cliente (2026-09-06): "el buscador
// va buscando en tiempo real... si yo escribo 'jua' que me vaya
// apareciendo resultados sin tocar enter o el símbolo de buscar en el
// celular". Reemplaza el `<form method="get">` que necesitaba Enter (o,
// antes de TR-114, un botón "Buscar") — cada cambio de texto navega solo,
// con debounce de 300ms para no disparar una carga del servidor por cada
// letra. Mismo patrón de debounce que ya usa TurnosFiltros para el conteo
// en vivo, acá aplicado a la navegación en sí en vez de a un fetch aparte
// (Turnos/Pacientes ya son Server Component + searchParams, no hace falta
// nada más para que el resultado se actualice).
export function BuscadorEnVivo({ q, hrefBase, placeholder }: BuscadorEnVivoProps) {
  const router = useRouter();
  const [valor, setValor] = useState(q ?? "");
  // qAnterior — sincroniza `valor` si el `q` vigente cambia por fuera
  // (navegación por atrás/adelante del navegador, o un chip que resetea
  // `q` a "") ajustando el estado DURANTE el render en vez de en un
  // efecto (patrón recomendado por React para "adjusting state when a
  // prop changes" — evita el cascading-render que marca
  // react-hooks/set-state-in-effect).
  const [qAnterior, setQAnterior] = useState(q);
  if (q !== qAnterior) {
    setQAnterior(q);
    setValor(q ?? "");
  }

  useEffect(() => {
    if (valor === (q ?? "")) return;
    const timer = setTimeout(() => {
      const separador = hrefBase.includes("?") ? "&" : "?";
      const href = valor ? `${hrefBase}${separador}q=${encodeURIComponent(valor)}` : hrefBase;
      router.push(href);
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor]);

  return (
    <div className="relative flex-1 min-w-[12rem]">
      <IconSearch className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-grafito/40" />
      <input
        type="search"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full rounded-field border-[0.5px] border-arena bg-marfil py-2 pr-3 pl-9 text-sm text-grafito outline-none focus:border-salvia"
      />
    </div>
  );
}
