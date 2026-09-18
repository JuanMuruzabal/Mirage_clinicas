"use client";

import type { Borrador } from "@/lib/pagina-publica/borrador";
import {
  ESTADISTICAS,
  MAX_LARGO_BIO,
  MAX_LARGO_RED,
  MAX_LARGO_TEXTO_LIBRE,
  MAX_LARGO_TITULO_TEXTO,
  REDES_SOCIALES,
  SUBTIPOS_FOTO,
  TOPE_FOTOS_GALERIA,
  listaDeConfig,
  subtipoDeConfig,
  textoDeConfig,
  type ModuloBorrador,
} from "@/lib/pagina-publica/modulos";
import { CLASE_AYUDA, CLASE_BOTON_PELIGRO, CLASE_CAMPO, CLASE_ETIQUETA } from "./estilos";
import { SubirFoto } from "./subir-foto";

interface EditorDeModuloProps {
  modulo: ModuloBorrador;
  borrador: Borrador;
  /** La dirección de la clínica: es lo que se muestra si no hay override. */
  direccionClinica?: string | null;
  /** El teléfono viene del perfil; acá solo se muestra cuál va a aparecer. */
  telefono: string;
  onConfig: (config: Record<string, unknown>) => void;
  onBorrador: (parcial: Partial<Borrador>) => void;
}

function Contador({ actual, max }: { actual: number; max: number }) {
  return (
    <span className={`${CLASE_AYUDA} self-end tabular-nums`}>
      {actual}/{max}
    </span>
  );
}

// EditorDeModulo (Fase 4.4) — el formulario de UN módulo, según su tipo.
// Edita el borrador, nunca llama al backend: guardar es una sola acción, en
// la barra de arriba. Los campos que son de la PÁGINA y no del módulo (la
// bio, las redes, el mapa) se editan desde el módulo que los muestra.
export function EditorDeModulo({ modulo, borrador, direccionClinica, telefono, onConfig, onBorrador }: EditorDeModuloProps) {
  const { config } = modulo;

  switch (modulo.tipo) {
    case "sobre_nosotros":
      return (
        <label className="flex flex-col gap-1.5">
          <span className={CLASE_ETIQUETA}>Texto</span>
          <textarea
            rows={5}
            maxLength={MAX_LARGO_BIO}
            value={borrador.bio}
            onChange={(e) => onBorrador({ bio: e.target.value })}
            placeholder="Contá quiénes son, cómo trabajan, qué los distingue."
            className={CLASE_CAMPO}
          />
          <Contador actual={borrador.bio.length} max={MAX_LARGO_BIO} />
          <span className={CLASE_AYUDA}>Sin texto, esta sección no aparece en tu página.</span>
        </label>
      );

    case "texto_libre":
      return (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className={CLASE_ETIQUETA}>Título</span>
            <input
              type="text"
              maxLength={MAX_LARGO_TITULO_TEXTO}
              value={textoDeConfig(config, "titulo")}
              onChange={(e) => onConfig({ ...config, titulo: e.target.value })}
              placeholder="Ej.: Nuestra filosofía"
              className={CLASE_CAMPO}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={CLASE_ETIQUETA}>Texto</span>
            <textarea
              rows={5}
              maxLength={MAX_LARGO_TEXTO_LIBRE}
              value={textoDeConfig(config, "texto")}
              onChange={(e) => onConfig({ ...config, texto: e.target.value })}
              className={CLASE_CAMPO}
            />
            <Contador actual={textoDeConfig(config, "texto").length} max={MAX_LARGO_TEXTO_LIBRE} />
          </label>
        </div>
      );

    case "especialidades":
      return <p className={CLASE_AYUDA}>Se arma sola con las especialidades de los profesionales de la clínica: no hay nada para cargar acá.</p>;

    case "foto": {
      const subtipo = subtipoDeConfig(config);
      return (
        <div className="flex flex-col gap-3">
          <SubirFoto
            etiqueta="foto"
            url={textoDeConfig(config, "fotoUrl")}
            onSubida={(url) => onConfig({ ...config, fotoUrl: url })}
            onQuitar={() => onConfig({ ...config, fotoUrl: "" })}
          />
          <fieldset className="flex flex-col gap-1.5">
            <legend className={CLASE_ETIQUETA}>Formato</legend>
            <div role="radiogroup" aria-label="Formato de la foto" className="flex flex-wrap gap-3">
              {SUBTIPOS_FOTO.map((s) => (
                <label key={s.id} className="flex items-center gap-1.5 text-sm text-grafito">
                  <input
                    type="radio"
                    name={`subtipo-${modulo.clave}`}
                    checked={subtipo === s.id}
                    onChange={() => onConfig({ ...config, subtipo: s.id })}
                  />
                  {s.etiqueta}
                </label>
              ))}
            </div>
            <span className={CLASE_AYUDA}>{SUBTIPOS_FOTO.find((s) => s.id === subtipo)?.descripcion}</span>
          </fieldset>
        </div>
      );
    }

    case "galeria": {
      const fotos = listaDeConfig(config, "fotoUrls");
      return (
        <div className="flex flex-col gap-3">
          {fotos.length > 0 && (
            <ul className="grid grid-cols-3 gap-2">
              {fotos.map((url, i) => (
                <li key={`${url}-${i}`} className="flex flex-col gap-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="aspect-square w-full rounded-field border-[0.5px] border-arena object-cover" />
                  <button
                    type="button"
                    aria-label={`Quitar foto ${i + 1}`}
                    onClick={() => onConfig({ ...config, fotoUrls: fotos.filter((_, j) => j !== i) })}
                    className={CLASE_BOTON_PELIGRO}
                  >
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
          )}
          {fotos.length < TOPE_FOTOS_GALERIA ? (
            <SubirFoto
              modo="agregar"
              etiqueta="foto"
              url=""
              onSubida={(url) => onConfig({ ...config, fotoUrls: [...fotos, url] })}
            />
          ) : (
            <p className={CLASE_AYUDA}>Llegaste al máximo de {TOPE_FOTOS_GALERIA} fotos en la galería.</p>
          )}
        </div>
      );
    }

    case "estadisticas": {
      const elegidas = listaDeConfig(config, "mostrar");
      return (
        <fieldset className="flex flex-col gap-2">
          <legend className={CLASE_ETIQUETA}>Qué mostrar</legend>
          {ESTADISTICAS.map((e) => (
            <label key={e.id} className="flex items-start gap-2 text-sm text-grafito">
              <input
                type="checkbox"
                className="mt-1"
                checked={elegidas.includes(e.id)}
                onChange={(ev) =>
                  onConfig({ ...config, mostrar: ev.target.checked ? [...elegidas, e.id] : elegidas.filter((x) => x !== e.id) })
                }
              />
              <span>
                {e.etiqueta}
                <span className={`${CLASE_AYUDA} block`}>{e.descripcion}</span>
              </span>
            </label>
          ))}
          <span className={CLASE_AYUDA}>Son números reales del sistema: no se cargan a mano.</span>
        </fieldset>
      );
    }

    case "contacto":
      return (
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className={CLASE_ETIQUETA}>Dirección</span>
            <input
              type="text"
              value={borrador.direccionOverride}
              onChange={(e) => onBorrador({ direccionOverride: e.target.value })}
              placeholder={direccionClinica || "Calle y número, ciudad"}
              className={CLASE_CAMPO}
            />
            <span className={CLASE_AYUDA}>
              {direccionClinica ? "Vacía, se usa la dirección de tu clínica." : "Tu clínica no tiene una dirección cargada."}
            </span>
          </label>

          <label className="flex items-center gap-2 text-sm text-grafito">
            <input type="checkbox" checked={borrador.mostrarMapa} onChange={(e) => onBorrador({ mostrarMapa: e.target.checked })} />
            Mostrar mapa
          </label>

          <fieldset className="flex flex-col gap-2">
            <legend className={CLASE_ETIQUETA}>Redes sociales</legend>
            {REDES_SOCIALES.map((r) => (
              <label key={r.id} className="flex flex-col gap-1">
                <span className="text-sm text-grafito">{r.etiqueta}</span>
                <input
                  type="text"
                  maxLength={MAX_LARGO_RED}
                  value={borrador.redes[r.id] ?? ""}
                  onChange={(e) => onBorrador({ redes: { ...borrador.redes, [r.id]: e.target.value } })}
                  placeholder={r.placeholder}
                  className={CLASE_CAMPO}
                />
              </label>
            ))}
            <span className={CLASE_AYUDA}>Un usuario o el link completo (https://…).</span>
          </fieldset>

          <p className={CLASE_AYUDA}>Teléfono: {telefono || "sin cargar"} — sale de tu perfil.</p>
        </div>
      );

    default:
      return <p className={CLASE_AYUDA}>Este módulo todavía no se puede editar acá.</p>;
  }
}
