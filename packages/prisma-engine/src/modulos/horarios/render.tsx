import type { ReactNode } from "react";
import { CLASE_ALINEAR, CLASE_TARJETA, CLASE_TEXTO, CLASE_TEXTO_TENUE, Titulo } from "../../comunes";
import { textoDeConfig, varianteDeConfig } from "../../lectura-config";
import type { ContextoPublico, DiaClinica, HorariosClinicaVista, ModuloBorrador, SeccionPublica } from "../../tipos";
import { envolverSlots } from "../../efectos/envolver-slots";
import { SLOTS_HORARIOS } from "./slots";
import { VARIANTES } from "./variantes";

const NOMBRES_DIA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const ORDEN_DIAS: DiaClinica["diaSemana"][] = [1, 2, 3, 4, 5, 6, 0];

function horariosDelDia(dia: DiaClinica | undefined): string {
  if (!dia || dia.cerrado || dia.franjas.length === 0) return "Cerrado";
  return dia.franjas.map((franja) => `${franja.desde}–${franja.hasta}`).join(" · ");
}

function EstadoActual({ horarios }: { horarios: HorariosClinicaVista }) {
  return (
    <p className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium ${horarios.abiertoAhora ? "bg-[var(--pp-acento-suave,var(--color-salvia-claro))] text-[var(--pp-acento-texto,var(--color-grafito))]" : "border border-(--pp-borde) text-(--pp-texto)"}`}>
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${horarios.abiertoAhora ? "bg-[var(--pp-acento,var(--color-salvia))]" : "bg-(--pp-borde)"}`} />
      {horarios.abiertoAhora ? "Abierto ahora" : "Cerrado ahora"}
    </p>
  );
}

function TablaSemanal({ horarios, envolver }: { horarios: HorariosClinicaVista; envolver: (slot: string, nodo: ReactNode) => ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className={`w-full border-collapse text-left ${CLASE_TEXTO}`}>
        <tbody>
          {ORDEN_DIAS.map((diaSemana) => {
            const dia = horarios.dias.find((item) => item.diaSemana === diaSemana);
            return (
              <tr key={diaSemana} className="border-b border-(--pp-borde) last:border-b-0">
                <th scope="row" className="py-2 pr-4 font-medium">{NOMBRES_DIA[diaSemana]}</th>
                <td className="py-2">{envolver("texto", <span>{horariosDelDia(dia)}</span>)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ListaCompacta({ horarios, envolver }: { horarios: HorariosClinicaVista; envolver: (slot: string, nodo: ReactNode) => ReactNode }) {
  return (
    <ul className="flex flex-col gap-2">
      {ORDEN_DIAS.map((diaSemana) => {
        const dia = horarios.dias.find((item) => item.diaSemana === diaSemana);
        return envolver("tarjeta", <li key={diaSemana} className="flex items-baseline justify-between gap-4 border-b border-(--pp-borde) py-2 last:border-b-0">
          <span className={`font-medium ${CLASE_TEXTO}`}>{NOMBRES_DIA[diaSemana]}</span>
          {envolver("texto", <span className={`text-right ${CLASE_TEXTO_TENUE}`}>{horariosDelDia(dia)}</span>)}
        </li>);
      })}
    </ul>
  );
}

function Horarios({ modulo, contexto }: { modulo: ModuloBorrador; contexto: ContextoPublico }): ReactNode {
  const horarios = contexto.contenido.horariosClinica;
  if (!horarios) return null;

  const variante = varianteDeConfig(modulo.config, VARIANTES);
  const envolver = envolverSlots(modulo.config, contexto.estiloMovimiento, SLOTS_HORARIOS);
  const cuerpo = variante === "semanal" ? <TablaSemanal horarios={horarios} envolver={envolver} /> : <ListaCompacta horarios={horarios} envolver={envolver} />;
  const titulo = envolver("titulo", <Titulo>{textoDeConfig(modulo.config, "tituloPublico").trim() || "Horarios"}</Titulo>);
  const estadoHorario = contexto.utils.estadoHorario;
  const estado = variante === "abierto-ahora"
    ? estadoHorario
      ? estadoHorario(horarios)
      : <EstadoActual horarios={horarios} />
    : null;
  const nota = horarios.nota.trim() ? envolver("texto", <p className={CLASE_TEXTO_TENUE}>{horarios.nota}</p>) : null;
  const contenido = (
    <div className={`flex flex-col gap-4 ${CLASE_ALINEAR}`}>
      {titulo}
      {estado}
      {cuerpo}
      {nota}
    </div>
  );
  return variante === "contacto" ? <div className={CLASE_TARJETA}>{contenido}</div> : contenido;
}

export function seccion(modulo: ModuloBorrador, indice: number, contexto: ContextoPublico): SeccionPublica | null {
  const nodo = Horarios({ modulo, contexto });
  if (nodo === null) return null;
  const variante = varianteDeConfig(modulo.config, VARIANTES);
  return {
    id: `horarios-${indice + 1}`,
    etiqueta: textoDeConfig(modulo.config, "tituloPublico").trim() || "Horarios",
    ancho: variante === "contacto" ? "medio" : "completo",
    contenido: nodo,
  };
}
