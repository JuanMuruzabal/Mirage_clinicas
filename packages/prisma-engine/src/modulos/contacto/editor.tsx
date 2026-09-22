import { MAX_LARGO_RED, REDES_SOCIALES } from "../../constantes";
import { CLASE_AYUDA, CLASE_CAMPO, CLASE_ETIQUETA } from "../../comunes";
import type { EditorModuloProps } from "../../tipos";

// "contacto" tampoco tiene config propia: edita dirección, mapa y redes,
// campos de la PÁGINA (ver el comentario de sobre-nosotros/editor.tsx).
export function Editor({ pagina, direccionClinica, telefono, onPagina }: EditorModuloProps) {
  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className={CLASE_ETIQUETA}>Dirección</span>
        <input
          type="text"
          value={pagina.direccionOverride}
          onChange={(e) => onPagina({ direccionOverride: e.target.value })}
          placeholder={direccionClinica || "Calle y número, ciudad"}
          className={CLASE_CAMPO}
        />
        <span className={CLASE_AYUDA}>
          {direccionClinica ? "Vacía, se usa la dirección de tu clínica." : "Tu clínica no tiene una dirección cargada."}
        </span>
      </label>

      <label className="flex items-center gap-2 text-sm text-grafito">
        <input type="checkbox" checked={pagina.mostrarMapa} onChange={(e) => onPagina({ mostrarMapa: e.target.checked })} />
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
              value={pagina.redes[r.id] ?? ""}
              onChange={(e) => onPagina({ redes: { ...pagina.redes, [r.id]: e.target.value } })}
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
}
