import { MAX_LARGO_BIO } from "../../constantes";
import { CLASE_AYUDA, CLASE_CAMPO, CLASE_ETIQUETA, Contador } from "../../comunes";
import type { EditorModuloProps } from "../../tipos";

// "sobre_nosotros" no tiene config propia: edita `bio`, un campo de la
// PÁGINA (así una clínica puede tener el texto cargado aunque este módulo
// esté oculto) — ver CamposDePagina en tipos.ts.
export function Editor({ pagina, onPagina }: EditorModuloProps) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className={CLASE_ETIQUETA}>Texto</span>
      <textarea
        rows={5}
        maxLength={MAX_LARGO_BIO}
        value={pagina.bio}
        onChange={(e) => onPagina({ bio: e.target.value })}
        placeholder="Contá quiénes son, cómo trabajan, qué los distingue."
        className={CLASE_CAMPO}
      />
      <Contador actual={pagina.bio.length} max={MAX_LARGO_BIO} />
      <span className={CLASE_AYUDA}>Sin texto, esta sección no aparece en tu página.</span>
    </label>
  );
}
