import { z } from "zod";
import { campoEfectos, campoNombrePropio, camposDeSeccion } from "../../schema-base";
import { SLOTS_VIDEO } from "./variantes";

// Solo se aceptan enlaces HTTPS de video público de YouTube o Vimeo. El render
// vuelve a analizar el enlace y genera una URL de embed sobre hosts fijos.
const URL_VIDEO = /^$|^https:\/\/(?:(?:www\.)?youtube\.com\/(?:watch\?v=[A-Za-z0-9_-]{11}(?:&[A-Za-z0-9_~%-]+=[A-Za-z0-9_~%.-]*)*|embed\/[A-Za-z0-9_-]{11})|youtu\.be\/[A-Za-z0-9_-]{11}|(?:www\.)?youtube-nocookie\.com\/embed\/[A-Za-z0-9_-]{11}|(?:www\.)?vimeo\.com\/[0-9]{1,12}|player\.vimeo\.com\/video\/[0-9]{1,12})(?:\?[A-Za-z0-9_~%=&.-]*)?(?:#[A-Za-z0-9_~%=&.-]*)?$/i;

export const schema = z.object({
  ...campoNombrePropio,
  ...camposDeSeccion,
  ...campoEfectos(SLOTS_VIDEO),
  url: z.string().max(300).regex(URL_VIDEO, "Usá un enlace público de YouTube o Vimeo.").optional(),
});
