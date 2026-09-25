"use client";

import { useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Borrador } from "@/lib/pagina-publica/borrador";
import {
  CATALOGO_PRESETS_SECCION,
  DEFINICIONES_MODULOS,
  type EquipoElegible,
  type HorariosClinica,
  type ServicioVista,
  TOPE_FOTOS_SUELTAS,
  configInicial,
  definicionDeModulo,
  MAX_LARGO_NOMBRE_MODULO,
  conNombrePropio,
  moduloDePresetSeccion,
  moverModulo,
  nombrePropioDeModulo,
  nuevaClave,
  puedeAgregar,
  textoDeConfig,
  type ModuloBorrador,
} from "@/lib/pagina-publica/modulos";
import { EditorDePortada } from "./editor-de-portada";
import { EditorDeModulo } from "./editor-de-modulo";
import { OpcionesDeModulo } from "./opciones-de-modulo";
import { CLASE_AYUDA, CLASE_BOTON, CLASE_BOTON_PELIGRO, CLASE_CAMPO, CLASE_ETIQUETA, CLASE_TACTIL } from "./estilos";

interface ListaModulosProps {
  borrador: Borrador;
  direccionClinica?: string | null;
  telefono: string;
  equipoElegible?: EquipoElegible[];
  horariosClinica?: HorariosClinica;
  serviciosDisponibles?: ServicioVista[];
  guardarHorariosClinica?: (valor: HorariosClinica) => Promise<
    | { ok: true; valor: HorariosClinica }
    | { ok: false; error: string }
  >;
  onBorrador: (parcial: Partial<Borrador>) => void;
  /**
   * Un cambio con "Deshacer" (PP-3, H19): quitar un módulo borra su
   * configuración y sus fotos de un click, sin confirmar antes. Sin este
   * prop, quitar es un cambio común.
   */
  onBorradorDeshacible?: (parcial: Partial<Borrador>, mensaje: string) => void;
}

// El nombre que ve el admin en la lista: el que le puso él (para reconocer,
// p. ej., dos "Foto" distintas) o, si no le puso ninguno, el del tipo — con el
// título si es un texto libre.
function nombreDeModulo(m: ModuloBorrador): string {
  const propio = nombrePropioDeModulo(m.config);
  if (propio) return propio;
  return nombreDelTipo(m);
}

function nombreDelTipo(m: ModuloBorrador): string {
  const base = definicionDeModulo(m.tipo)?.nombre ?? m.tipo;
  const titulo = m.tipo === "texto_libre" ? textoDeConfig(m.config, "titulo").trim() : "";
  return titulo ? `${base}: ${titulo}` : base;
}

interface FilaProps {
  modulo: ModuloBorrador;
  indice: number;
  total: number;
  abierto: boolean;
  puedeQuitar: boolean;
  borrador: Borrador;
  direccionClinica?: string | null;
  telefono: string;
  equipoElegible?: EquipoElegible[];
  horariosClinica?: HorariosClinica;
  serviciosDisponibles?: ServicioVista[];
  guardarHorariosClinica?: (valor: HorariosClinica) => Promise<
    | { ok: true; valor: HorariosClinica }
    | { ok: false; error: string }
  >;
  onAbrir: () => void;
  onMover: (desde: number, hasta: number) => void;
  onCambiar: (cambios: Partial<ModuloBorrador>) => void;
  onQuitar: () => void;
  onBorrador: (parcial: Partial<Borrador>) => void;
}

function FilaModulo({
  modulo,
  indice,
  total,
  abierto,
  puedeQuitar,
  borrador,
  direccionClinica,
  telefono,
  equipoElegible,
  horariosClinica,
  serviciosDisponibles,
  guardarHorariosClinica,
  onAbrir,
  onMover,
  onCambiar,
  onQuitar,
  onBorrador,
}: FilaProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: modulo.clave });
  const nombre = nombreDeModulo(modulo);

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`rounded-card border-[0.5px] border-arena bg-marfil ${isDragging ? "relative z-10 shadow-soft" : ""} ${
        modulo.visible ? "" : "opacity-70"
      }`}
    >
      <div className="flex items-center gap-1.5 p-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Arrastrar ${nombre}`}
          className={`cursor-grab touch-none rounded px-1.5 py-1 text-grafito/75 hover:text-grafito active:cursor-grabbing ${CLASE_TACTIL}`}
        >
          <span aria-hidden="true">⠿</span>
        </button>
        <button type="button" onClick={onAbrir} aria-expanded={abierto} className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm text-grafito">
          <span className="truncate font-medium">{nombre}</span>
          {/* Espacio real entre nombre y etiqueta: sin él un lector de pantalla
              lee "Sala de esperaFoto" como una sola palabra. */}
          {" "}
          {/* Con nombre propio se pierde a la vista qué ES el módulo: el tipo
              queda como una etiqueta chica al lado. */}
          {nombrePropioDeModulo(modulo.config) && (
            <span className="shrink-0 rounded-full bg-hueso px-2 py-0.5 text-[10px] uppercase tracking-widest text-grafito/75">
              {nombreDelTipo(modulo)}
            </span>
          )}
          {!modulo.visible && <span className="rounded-full bg-hueso px-2 py-0.5 text-[10px] uppercase tracking-widest text-grafito/75">Oculto</span>}
        </button>
        <button
          type="button"
          aria-label={`Subir ${nombre}`}
          disabled={indice === 0}
          onClick={() => onMover(indice, indice - 1)}
          className={CLASE_BOTON}
        >
          <span aria-hidden="true">↑</span>
        </button>
        <button
          type="button"
          aria-label={`Bajar ${nombre}`}
          disabled={indice === total - 1}
          onClick={() => onMover(indice, indice + 1)}
          className={CLASE_BOTON}
        >
          <span aria-hidden="true">↓</span>
        </button>
      </div>

      {abierto && (
        <div className="flex flex-col gap-4 border-t-[0.5px] border-arena p-3">
          <label className="flex flex-col gap-1.5">
            <span className={CLASE_ETIQUETA}>Nombre en la lista</span>
            <input
              type="text"
              maxLength={MAX_LARGO_NOMBRE_MODULO}
              // El valor CRUDO, no el recortado: con el recortado, escribir un
              // espacio al final lo borraba al instante y no se podía tipear
              // "Sala de espera". El recorte se aplica al mostrar y al guardar.
              value={textoDeConfig(modulo.config, "nombre")}
              onChange={(e) => onCambiar({ config: conNombrePropio(modulo.config, e.target.value) })}
              placeholder={nombreDelTipo(modulo)}
              className={CLASE_CAMPO}
            />
            <span className={CLASE_AYUDA}>Solo lo ves vos, para reconocerlo en esta lista. No cambia lo que ve el público.</span>
          </label>
          <EditorDeModulo
            modulo={modulo}
            borrador={borrador}
            direccionClinica={direccionClinica}
            telefono={telefono}
            equipoElegible={equipoElegible}
            horariosClinica={horariosClinica}
            serviciosDisponibles={serviciosDisponibles}
            guardarHorariosClinica={guardarHorariosClinica}
            onConfig={(config) => onCambiar({ config })}
            onBorrador={onBorrador}
          />
          <OpcionesDeModulo modulo={modulo} onConfig={(config) => onCambiar({ config })} />
          <div className="flex flex-wrap gap-2 border-t-[0.5px] border-arena pt-3">
            {/* aria-label con el nombre: en la misma pantalla está el "Ocultar" de
                la PÁGINA entera, y dos botones con el mismo nombre no se
                distinguen con un lector de pantalla. */}
            <button
              type="button"
              aria-label={`${modulo.visible ? "Ocultar" : "Mostrar"} ${nombre}`}
              onClick={() => onCambiar({ visible: !modulo.visible })}
              className={CLASE_BOTON}
            >
              {modulo.visible ? "Ocultar" : "Mostrar"}
            </button>
            <button
              type="button"
              aria-label={`Quitar ${nombre}`}
              onClick={onQuitar}
              disabled={!puedeQuitar}
              title={puedeQuitar ? undefined : "Tiene que quedar al menos un módulo — podés ocultarlo."}
              className={CLASE_BOTON_PELIGRO}
            >
              Quitar
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

// ListaModulos (Fase 4.4) — la estructura de la página: primero lo fijo
// (portada y "Pedí tu turno", que no se mueven ni se ocultan) y después los
// módulos, que se reordenan arrastrando (dnd-kit, con teclado) o con las
// flechas — las flechas no son un extra: arrastrar no funciona bien con un
// lector de pantalla ni en todos los dispositivos táctiles.
export function ListaModulos({ borrador, direccionClinica, telefono, equipoElegible, horariosClinica, serviciosDisponibles, guardarHorariosClinica, onBorrador, onBorradorDeshacible }: ListaModulosProps) {
  const { modulos } = borrador;
  const [abierto, setAbierto] = useState<string | null>(null);
  const [tipoNuevo, setTipoNuevo] = useState("");
  const [presetNuevo, setPresetNuevo] = useState("");

  const sensores = useSensors(
    // Con una distancia mínima, un click simple sobre el asa no arranca un
    // arrastre sin querer.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const agregables = DEFINICIONES_MODULOS.filter((d) => puedeAgregar(modulos, d.tipo));
  const presetsAgregables = CATALOGO_PRESETS_SECCION.filter((preset) => puedeAgregar(modulos, preset.modulo.tipo));

  function alSoltar(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const desde = modulos.findIndex((m) => m.clave === e.active.id);
    const hasta = modulos.findIndex((m) => m.clave === e.over?.id);
    onBorrador({ modulos: moverModulo(modulos, desde, hasta) });
  }

  function agregar() {
    const tipo = tipoNuevo || agregables[0]?.tipo;
    if (!tipo || !puedeAgregar(modulos, tipo)) return;
    const nuevo: ModuloBorrador = { clave: nuevaClave(), tipo, visible: true, config: configInicial(tipo) };
    onBorrador({ modulos: [...modulos, nuevo] });
    setAbierto(nuevo.clave);
    setTipoNuevo("");
  }

  function agregarPreset() {
    const preset = presetsAgregables.find((item) => item.id === presetNuevo) ?? presetsAgregables[0];
    if (!preset) return;
    const clave = nuevaClave();
    const { datosVista, ...base } = moduloDePresetSeccion(preset, clave);
    void datosVista;
    const nuevo: ModuloBorrador = { ...base, clave, visible: true };
    onBorrador({ modulos: [...modulos, nuevo] });
    setAbierto(nuevo.clave);
    setPresetNuevo("");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span className={CLASE_ETIQUETA}>Siempre primero</span>
        <ul className="flex flex-col gap-2">
          <li className="rounded-card border-[0.5px] border-arena bg-marfil">
            <button
              type="button"
              onClick={() => setAbierto(abierto === "portada" ? null : "portada")}
              aria-expanded={abierto === "portada"}
              className="flex w-full items-center justify-between p-3 text-left text-sm font-medium text-grafito"
            >
              Portada
              <span className={`${CLASE_AYUDA} font-normal`}>Nombre de la clínica{borrador.fotoPortadaUrl ? " y foto" : ""}</span>
            </button>
            {abierto === "portada" && (
              <div className="border-t-[0.5px] border-arena p-3">
                <EditorDePortada borrador={borrador} onBorrador={onBorrador} />
              </div>
            )}
          </li>
          <li className="flex items-center justify-between rounded-card border-[0.5px] border-arena bg-marfil p-3 text-sm font-medium text-grafito">
            Pedí tu turno
            <span className={`${CLASE_AYUDA} font-normal`}>Siempre visible</span>
          </li>
        </ul>
      </div>

      <div className="flex flex-col gap-2">
        <span className={CLASE_ETIQUETA}>Módulos</span>
        <DndContext sensors={sensores} collisionDetection={closestCenter} onDragEnd={alSoltar}>
          <SortableContext items={modulos.map((m) => m.clave)} strategy={verticalListSortingStrategy}>
            <ul className="flex flex-col gap-2">
              {modulos.map((m, i) => (
                <FilaModulo
                  key={m.clave}
                  modulo={m}
                  indice={i}
                  total={modulos.length}
                  abierto={abierto === m.clave}
                  puedeQuitar={modulos.length > 1}
                  borrador={borrador}
                  direccionClinica={direccionClinica}
                  telefono={telefono}
                  equipoElegible={equipoElegible}
                  horariosClinica={horariosClinica}
                  serviciosDisponibles={serviciosDisponibles}
                  guardarHorariosClinica={guardarHorariosClinica}
                  onAbrir={() => setAbierto(abierto === m.clave ? null : m.clave)}
                  onMover={(desde, hasta) => onBorrador({ modulos: moverModulo(modulos, desde, hasta) })}
                  onCambiar={(cambios) => onBorrador({ modulos: modulos.map((x) => (x.clave === m.clave ? { ...x, ...cambios } : x)) })}
                  onQuitar={() => {
                    const sinEste = { modulos: modulos.filter((x) => x.clave !== m.clave) };
                    if (onBorradorDeshacible) onBorradorDeshacible(sinEste, `Quitaste “${nombreDeModulo(m)}”.`);
                    else onBorrador(sinEste);
                  }}
                  onBorrador={onBorrador}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      </div>

      <div className="flex flex-col gap-2 rounded-card border-[0.5px] border-dashed border-arena p-3">
        {agregables.length > 0 ? (
          <>
            <label className="flex flex-col gap-1.5">
              <span className={CLASE_ETIQUETA}>Agregar un módulo</span>
              <select value={tipoNuevo || agregables[0].tipo} onChange={(e) => setTipoNuevo(e.target.value)} className={CLASE_CAMPO}>
                {agregables.map((d) => (
                  <option key={d.tipo} value={d.tipo}>
                    {d.nombre} — {d.descripcion}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={agregar} className={`${CLASE_BOTON} self-start`}>
              Agregar
            </button>
          </>
        ) : (
          <p className={CLASE_AYUDA}>Ya tenés todos los módulos disponibles en tu página.</p>
        )}
        <p className={CLASE_AYUDA}>Fotos sueltas: hasta {TOPE_FOTOS_SUELTAS} por página.</p>
      </div>
      {presetsAgregables.length > 0 && (
        <div className="flex flex-col gap-2 rounded-card border-[0.5px] border-dashed border-arena p-3">
          <label className="flex flex-col gap-1.5">
            <span className={CLASE_ETIQUETA}>Secciones prearmadas</span>
            <select aria-label="Preset de sección" value={presetNuevo || presetsAgregables[0].id} onChange={(event) => setPresetNuevo(event.target.value)} className={CLASE_CAMPO}>
              {presetsAgregables.map((preset) => <option key={preset.id} value={preset.id}>{preset.nombre} — {preset.descripcion}</option>)}
            </select>
          </label>
          <button type="button" onClick={agregarPreset} className={`${CLASE_BOTON} self-start`}>Agregar sección prearmada</button>
        </div>
      )}
    </div>
  );
}
