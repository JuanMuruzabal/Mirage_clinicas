# Fase 5 — Documentos clínicos: diseño y plan

> Documento vivo. Brief del cliente: `fase5-documentos-clinicos.docx` (esta misma carpeta). Modelos de referencia: `Historias clinicas y consentimientos - odontolgia/` (19 PDF, 45 páginas). Escrito el 2026-09-27, antes de tocar código: la sección 3 tiene las decisiones que son del cliente, con la recomendación de cada una.

El brief lo dice en mayúsculas y tiene razón: es la fase **más sensible** del producto. Hasta acá PRISMA guardaba turnos y datos de contacto. Desde acá guarda **datos de salud** (datos sensibles, Ley 25.326) y **documentos con valor legal** que la ley obliga a conservar diez años sin que nadie los altere. Eso ordena todo el diseño: primero que un documento sellado no se pueda tocar y que se pueda probar quién firmó qué; después, la comodidad de completarlo.

---

## 1. Qué pide el brief

| # | Requisito | Dónde se resuelve |
|---|---|---|
| R1 | Módulo exclusivo, lo completan **solo profesionales** | §4.7 |
| R2 | Historias clínicas y consentimientos **precargados** (los de la carpeta) | §2, §4.2 |
| R3 | Navegar los documentos con flechas `<` `>` o un **buscador**, como el carrusel que ya existe | §4.3 |
| R4 | Al tocar un documento se abre un **sidebar**: primero el paciente, después los campos | §4.3 |
| R5 | **Un editor por documento**, con sus campos, sus checkboxes y sus herramientas — la principal, el **odontograma** con la simbología y los colores del modelo | §4.2, §4.4 |
| R6 | Ver el documento **completándose en vivo** (un calco editable) y, aparte, la **previsualización del original** | §4.3 |
| R7 | Terminado, la instancia se agrega al paciente y queda **inmodificable por ningún método** | §4.1, §4.5 |
| R8 | Debajo del selector, una **tabla de pacientes** (nombre y DNI) que lleva al **registro de instancias** de cada uno; lo mismo el botón hoy desactivado de la ficha | §4.3 |
| R9 | **Exportar a PDF**, y que quede almacenada en la app (*decidido el 2026-10-02: el PDF se descarga en el momento y no se guarda; lo que queda almacenado es el documento, TR-191*) | §4.6 |
| R10 | Cumplir las **leyes argentinas** durante todo el proceso | §3 (decisiones), §5 |
| R11 | Un sistema de **firma digital** conforme a la normativa | §3 (D1), §4.5 |
| R12 | Firma del paciente: **un vínculo** para firmar con el dedo en su celular, o **una alerta al celular del profesional** que abre lo mismo | §4.5 |

---

## 2. Los documentos

**Son los modelos oficiales del Colegio Odontológico de la Provincia de Córdoba**, que los publica para que los usen los odontólogos en su "archivo oficial de historias clínicas y documentos de consentimiento informado" ([colodontcba.org.ar](https://colodontcba.org.ar/informacion-general/modelo-historia-clinica/)). Cada plantilla cita esa fuente.

Diecinueve archivos, que dan **veinte plantillas posibles** —el consentimiento de ortodoncia viene adentro del PDF de la historia de ortodoncia y se separa; los dos "registros de prestaciones" que traen al final la historia de PcD y la de ortodoncia son la misma cosa que el Anexo— y **diecinueve** con el de COVID afuera (D6). A esas se suman dos propias de PRISMA, la enmienda y la revocación (§4.8).

### 2.1 Historias clínicas y anexos

| Plantilla | Págs. | Qué tiene | Herramientas propias | Firmas |
|---|---|---|---|---|
| **Historia clínica general** | 2 | Datos del profesional y del paciente (obra social, afiliado, estado civil, profesión, titular…); cuestionario de ~45 preguntas SI/NO con "tenor de declaración jurada" y aclaraciones; historia odontológica (dolor, golpes, lesiones, higiene); **odontograma**; estado bucal (sarro, enfermedad periodontal); diagnóstico presuntivo; plan de tratamiento con fecha; observaciones; consentimiento al tratamiento | Odontograma adulto + temporarios | Paciente o tutor (aclaración, DNI) |
| **Historia clínica general para PcD** | 3 | Lo de la general más: padre/madre/hermanos, diagnóstico médico y medicación, centro de día, movilidad asistida, silla de ruedas, grupo sanguíneo, CUD, informe médico, clínica de derivación, **ASA**; dificultad para hablar/masticar/tragar; se cepilla solo; índice de placa; estudios radiográficos | Odontograma | Paciente o tutor |
| **Historia clínica para módulo de ortodoncia** | 4 | Antecedentes (nacimiento, parto, hábitos de chupete/mamadera); **análisis facial** y **funcional** (una opción por fila: patrón facial, perfil, respiración, deglución, labios…); **cefalogramas de Ricketts y McNamara** (norma fija + valor del paciente); tipo facial; análisis de arcos; **planificación del VTO** (+/−); plan, técnica y aparatología, tiempo estimado, pronóstico | Tablas numéricas con norma, odontograma | Padre o tutor ("conformidad del paciente") + profesional |
| **Anexo de odontopediatría** | 2 | Peso, talla, edad en años y meses, grado escolar, actitud del niño y de los padres; **genograma**; embarazo, parto, alimentación; cepillado, flúor, hábitos; examen de tejidos blandos y duros (dentición primaria/mixta/permanente, anomalías), traumatismos; diagnóstico con derivación, plan presuntivo, aparatología | **Genograma** (dibujo), odontograma pediátrico con **sellador (△)** y **traumatizado (T)** | Representante legal + profesional |
| **Registro de prestaciones** (Anexo) | 1 | Una tabla: fecha y hora, tratamiento realizado e indicaciones, **debe / haber / saldo**, profesional actuante, próximo turno, **firma del paciente en cada fila**; folio | — | Paciente, **por fila** |

### 2.2 Consentimientos informados

Todos tienen la misma forma: **texto legal fijo**, unos pocos **huecos** que completa el profesional y un **bloque de firmas**. Lo que cambia entre uno y otro es el texto y qué huecos trae.

| Plantilla | Huecos | Firmas |
|---|---|---|
| **Extracción** | Elementos a extraer; tratamientos alternativos (riesgos, beneficios, perjuicios); riesgos personalizados; medicación pre y post quirúrgica; otros; próxima consulta (día y hora) | Paciente o representante + profesional |
| **Tratamiento de conducto** | Fecha de nacimiento; elemento(s); indicaciones; medicación; próxima consulta | Paciente o representante + profesional |
| **Biopsia** | Zona/objetivo; alternativas; riesgos personalizados; medicación pre y post; otros | Paciente o representante + profesional |
| **Implantes** | Edad; alternativas; especificación de tratamiento alternativo | Paciente o representante + profesional |
| **Periodoncia** | Diagnóstico; alternativas; medicación pre, durante y post | Paciente + profesional |
| **Prótesis completa / fija / parcial removible** | Material convenido; alternativas; riesgos de no hacerlo; elementos (fija); próxima consulta | Paciente o representante + profesional |
| **Ortodoncia** | Procedimientos alternativos, riesgo y beneficio; consecuencias del abandono; tiempo estimado | Paciente o responsable + profesional + **asentimiento del menor** ("pido lo que quiero": sí quiero / no quiero atenderme) |
| **Ortopedia** | Tipo de tratamiento; tipo de aparatología | Responsable legal + profesional + **asentimiento del paciente** con sus datos |
| **Odontopediatría** | Diagnóstico; tratamiento; alternativas; beneficios; consecuencias; observaciones | Representante legal + profesional + asentimiento del menor |
| **Atención de pacientes con discapacidad** | Consiento / no consiento | Paciente + representante legal/curador/acompañante (con relación) + profesional |
| **Sedoanalgesia** (cuidados anestésicos monitoreados) | Anestesista actuante (MP, póliza); motivo; odontólogo que deriva; farmacología; cardiólogo que autoriza; lugar (hospital / centro de salud / consultorio) e institución; diagnóstico; tratamiento; alternativas; consecuencias; observaciones | Paciente + representante + odontólogo + **otro profesional interviniente** (el anestesista, que no tiene cuenta en PRISMA) |
| **Toma de imágenes y difusión** | Medios y redes donde se difunden | Paciente o representante + profesional |
| **Básico COVID-19** | Cinco preguntas SI/NO | Paciente + profesional — **el modelo dice "de puño y letra"**; ver D6 |

### 2.3 El odontograma de los modelos

Notación **FDI de dos dígitos** (la que exige la Ley 26.812, "sistema dígito dos"): permanentes 18–11 · 21–28 arriba y 48–41 · 31–38 abajo; temporarios 55–51 · 61–65 y 85–81 · 71–75. Cada pieza es un cuadrado con **cinco caras** (el cuadro central y los cuatro trapecios).

| Símbolo | Historia general, PcD, ortodoncia | Odontopediatría |
|---|---|---|
| **Rojo** | Prestaciones existentes | Trabajos realizados |
| **Azul** | Prestaciones requeridas | Trabajos a realizar |
| **X** | Diente ausente o a extraer | Elemento a extraer, extraído o ausente |
| **○** | Corona | Corona |
| Prótesis fija / removible | Una caja cada una en la leyenda, **sin el símbolo dibujado** (ver D5) | — |
| **△** | — | Sellador |
| **T** | — | Elemento traumatizado |
| Casillero | Cantidad de dientes existentes | — |

---

## 3. Decisiones que son del cliente

Todo lo demás de este documento es técnico y tiene una recomendación firme. Estas siete no: cambian qué valor legal tiene lo que se guarda, o qué ve cada persona.

**Estado (2026-09-27):**

| | Decisión | Quedó |
|---|---|---|
| D1 | Firma del profesional | ✅ **Electrónica con evidencias**, preparada para digital certificada (opción A). **Los consentimientos, en papel** (2026-09-29, TR-188): se completan para imprimir y se firman a mano |
| D2 | Identidad del paciente que firma por vínculo | ✅ **Solo el vínculo** (opción B) — ver la nota en D2 |
| D3 | Registro de prestaciones | ✅ **Entra, con debe/haber/saldo como importes informativos** |
| D4 | Quién ve | ✅ **Todos los profesionales que atienden al paciente**; recepción solo sabe cuántos hay |
| D5 | Símbolo de prótesis fija y removible | ⏳ Se usa la propuesta; se confirma con el odontólogo en la QA de la 5.5 |
| D6 | Orden, y el consentimiento de COVID | ⏳ Se usa el orden de §6; COVID **afuera** salvo que el cliente lo pida |
| D7 | Datos nuevos en la ficha | ✅ Los cinco, en la ficha y en "Editar datos" (5.1); se precargan en cada documento. Guardar en la ficha lo completado en un documento queda para la 5.6 (ver §4.1) |

### D1 — Qué firma usa el profesional (la "firma digital" del brief)

En la ley argentina **"firma digital" es un término técnico**, no un sinónimo de "firma en pantalla" (Ley 25.506):

- **Firma digital** (arts. 2, 3, 7, 8 y 9): un certificado emitido por un **certificador licenciado**. Reemplaza a la manuscrita en todo lo que la ley exige firmado (art. 3), y la ley **presume** que la firmó el titular del certificado y que el documento no cambió. Desde el Decreto 743/2024 el certificado se tramita a distancia, con validación biométrica. Cuesta un abono por profesional y una integración con el proveedor.
- **Firma electrónica** (art. 5): cualquier otro medio de identificación — un trazo dibujado, una cuenta con contraseña y un código. **Es válida**, pero no tiene esa presunción: si alguien la desconoce, quien la presenta tiene que probarla. Por eso vale tanto como las **evidencias** que la acompañan.

**El paciente no puede tener firma digital** (no tiene certificado), así que su firma va a ser electrónica de todos modos: un trazo con el dedo más las evidencias de §4.5. La pregunta es solo por el profesional:

| Opción | Qué implica |
|---|---|
| **A. Electrónica con evidencias, preparada para digital** *(recomendada para arrancar)* | El profesional registra su rúbrica una vez en su perfil y firma cada documento reconfirmando su identidad (contraseña o código al mail). Todo documento sellado lleva la huella SHA-256 y una cadena que delata cualquier alteración (§4.5). El modelo de datos ya tiene el lugar para agregar la firma digital certificada después, sin rehacer nada. |
| **B. Firma digital certificada desde el día uno** | Integración con un certificador licenciado (firma remota, formato PAdES sobre el PDF). Cada profesional tramita y paga su certificado. Más fuerte en un juicio; más fricción para empezar. |

**Cambio del 2026-09-29 (TR-188): los consentimientos informados se firman en papel.** El cliente averiguó que la firma del consentimiento tiene que ser física y que una firma electrónica no la reemplaza. Un consentimiento se completa en la pantalla igual que antes, y al terminarlo queda **listo para imprimir**: sale la hoja exacta del Colegio con lo cargado y los renglones de firma en blanco, y se firma a mano. El papel firmado es el documento legal. Lo de esta sección sigue valiendo para lo que se firma en el sistema: **las historias clínicas se firman en el sistema** (confirmado por el cliente el mismo día).

**Por qué A primero:** la Ley 27.706 (historia clínica digital única, 2023) sí pide la firma digital del responsable, pero **todavía no está reglamentada** y no fija plazo para consultorios privados. A deja el producto usable ya, y B se suma como mejora sin migrar datos. **Esto hay que validarlo con un abogado o con el Colegio antes de salir a producción** — no es una opinión legal (ver §5.3).

### D2 — Cómo prueba su identidad el paciente que firma desde un vínculo

| Opción | Qué implica |
|---|---|
| **A. Vínculo + código al mail de la ficha** *(recomendada)* | Antes de firmar, el paciente recibe un código de 6 dígitos al mail que ya tiene su ficha — el mismo mecanismo del wizard público (TR-103). La constancia dice "firmó quien demostró tener acceso a *x@y.com*". Si la ficha no tiene mail, se ofrece firmar en el consultorio. |
| **B. Solo el vínculo** | Más simple, pero la única prueba es que alguien abrió un link que el profesional mandó por WhatsApp. |

La firma **en el consultorio** (en el dispositivo del profesional, o con la alerta a su celular) no necesita código: la identidad la constata el profesional, que está presente, y la constancia lo dice.

**Quedó B** (2026-09-27). Consecuencia a tener presente: la constancia de una firma por vínculo prueba *que alguien abrió el link que el profesional generó y firmó ahí*, con su IP, su dispositivo y la hora — no qué persona era. Para compensarlo sin sumar un paso: el vínculo se genera para **un firmante con nombre y DNI ya cargados** (el paciente no los tipea, los confirma), vence en 24 h, se usa una vez, y la constancia registra **a qué número o por qué medio lo mandó el profesional** si lo mandó desde la app (botón de WhatsApp al teléfono de la ficha). Si más adelante hace falta más fuerza, el código al mail (opción A) se suma sin tocar el modelo: la firma ya tiene el campo `mail_verificado`.

### D3 — El registro de prestaciones: ¿entra, y con plata?

La recomendación es que **entre**, como una **evolución**: cada fila es un asiento que se sella solo (fecha, lo que se hizo, próximo turno, profesional) y se puede firmar por el paciente en el momento. Es lo que la ley llama historia clínica "cronológica y foliada" (art. 12). La pregunta es por **debe / haber / saldo**: la recomendación es cargarlos como **importes informativos** del asiento, sin cuentas corrientes ni cobros — "presupuesto con funcionalidad real" sigue fuera de alcance. Alternativa: dejar esas tres columnas afuera.

### D4 — Quién ve los documentos

| | Recomendación |
|---|---|
| **El autor** | Ve y exporta todo lo suyo. |
| **Otro profesional que atiende al mismo paciente** (lo tiene en su lista, los tres criterios de `soloMisPacientes`) | Ve los documentos de ese paciente **aunque los haya hecho un colega**, en solo lectura y con el autor a la vista. La historia clínica es **única por establecimiento** (art. 17): partirla por profesional haría que cada uno trabaje con la mitad de los antecedentes del paciente. Es el mismo criterio de "el historial de un paciente se ve entero, con su dueño" de la Fase 3.2.5. |
| **Un profesional que NO tiene al paciente en su lista** | No ve nada (404). |
| **Recepción y administrador de página** | **No entran al módulo** (403, como cualquier sección que exige un rol). El brief dice "exclusivo de profesionales", y el contenido es secreto profesional. Recepción sí ve, en la ficha, *cuántos* documentos firmados hay — no qué dicen. |

Alternativa más estricta: cada profesional ve solo lo suyo.

### D5 — Qué se dibuja para prótesis fija y removible

La leyenda de los modelos tiene una caja vacía al lado de "PRÓTESIS FIJA" y otra al lado de "PRÓTESIS REMOVIBLE": el símbolo no está. Propuesta a confirmar con el odontólogo: **fija**, una barra que une las piezas pilares con un trazo vertical en cada extremo (⊓); **removible**, la misma barra en línea de trazos. Las dos toman el color: rojo si existe, azul si hay que hacerla.

### D6 — Cuáles primero, y si el de COVID entra

Orden recomendado (§6): primero un consentimiento simple para probar el circuito completo, después todos los consentimientos (comparten motor y son la mayoría), después el odontograma y las historias clínicas. **El de COVID-19** pide expresamente que se conteste "de puño y letra" y responde a un protocolo de 2020: se propone **no incluirlo** salvo que el cliente lo pida.

### D7 — Datos que se agregan a la ficha del paciente

Todos los documentos piden datos que la ficha hoy no tiene: **fecha de nacimiento, domicilio, obra social, plan y número de afiliado**, y varios piden estado civil, nacionalidad y profesión. Recomendación: sumar a la ficha los cinco primeros (se repiten en casi todos) y **precargarlos** en cada documento, con la opción de guardar en la ficha lo que se complete en el documento. Los demás quedan como campos del documento.

Y una cuestión que no es de diseño: **los modelos son del Colegio Odontológico de la Provincia de Córdoba**, publicados en su web para uso de los odontólogos (§2). Usarlos como plantillas es para lo que se publicaron, y cada una cita la fuente; aun así, **conviene avisarle al Colegio** y, si se puede, tener su conformidad por escrito. De paso, es el interlocutor natural para la revisión legal de §5.3. Los PDF originales no se versionan en el repo (es público): la vista del original se arma con imágenes de sus páginas, que se suman con la conformidad del Colegio.

---

## 4. El diseño

### 4.1 El modelo de datos

Un **documento clínico** es una instancia de una plantilla, para un paciente, hecha por un profesional, en una clínica. Pasa por estos estados, y **nunca vuelve atrás desde "sellado"**:

```
borrador ──(Terminar, con confirmación)──▶ a_firmar ──(última firma requerida)──▶ sellado
   │                                          │
   │                                          └──(Anular con motivo)──▶ anulado   (si ya firmó alguien, queda registrado)
   ├──(Terminar un consentimiento)──▶ para_imprimir   (con su folio; se firma a mano, TR-188)
   └──(Descartar)──▶ ✕
```

**Nada terminado vuelve a borrador** (corregido el 2026-09-29, TR-188): si hay que cambiar algo, se hace otro documento. Por eso terminar pide confirmación.

- **Borrador:** privado del autor, se guarda solo mientras se completa, se puede descartar. **No es historia clínica** todavía.
- **Borrador, uno solo por documento y paciente:** pedir otro del mismo documento para el mismo paciente con un borrador abierto lleva a ese (2026-09-29).
- **A firmar:** el contenido queda **congelado** y se calcula su huella. Cada firma se ata a esa huella: si el contenido cambiara, las firmas dejarían de coincidir. Ya no vuelve a borrador.
- **Anulado:** un pedido de firma que no se concretó (el paciente se negó, cambió el plan). Si alguien ya había firmado, **no se borra**: queda con su motivo, porque el rechazo de un procedimiento también se documenta por escrito (Ley 26.529, art. 7 inc. f).
- **Sellado:** con todas las firmas requeridas. Es historia clínica: **no se modifica ni se borra, nunca.**

Tablas nuevas:

| Tabla | Qué guarda | Regla de escritura |
|---|---|---|
| `documentos_clinicos` | `clinic_id`, `paciente_id`, `autor_user_id`, `plantilla_id`, `plantilla_version`, `estado`, `contenido` (jsonb: lo cargado), `folio` (correlativo por paciente, asignado al sellar), `hash_contenido`, `hash_sello`, `hash_anterior`, `pdf_archivo`, `pdf_hash`, `codigo_verificacion`, fechas de cada estado; `enmienda_de` / `revoca_a` (§4.8) | Un **trigger** rechaza cualquier `UPDATE` o `DELETE` de una fila `sellada` o `anulada` |
| `documento_firmas` | Una fila por firma: rol, nombre, DNI, vínculo, método, trazo (puntos vectoriales), la huella que firmó, fecha y hora, IP, dispositivo, mail verificado, usuario (si es el profesional) y el lugar para una firma digital certificada (D1-B) | **Solo `INSERT`**: el trigger rechaza `UPDATE`/`DELETE` siempre |
| `documento_pedidos_firma` | El vínculo o la alerta: hash del token, rol, canal, vencimiento, uso, quién lo generó | Mismo patrón que `enlaces_turno` (TR-120) |
| `documento_eventos` | Auditoría: creado, guardado, terminado, pedido de firma, firmado, sellado, **visto**, **exportado**, anulado — con usuario, IP y hora | **Solo `INSERT`** |

Foreign keys con `NO ACTION` hacia `pacientes`, `clinics` y la **clave compuesta a `clinic_members`** del autor (como `turnos`): una membresía no se borra nunca (se marca `removed`), así que el documento de alguien que dejó la clínica sigue siendo válido y queda en ella — la ley hace depositario al establecimiento (art. 18).

**Lo que cambia en código existente:**

- **Una ficha con documentos no se borra nunca.** Hoy cuatro caminos borran fichas solos (`borrarFichaPacienteConSusHijas`: cancelar un turno o marcar ausencia de un no verificado, las dos resoluciones de conflicto y el barrido de fichas sin turno del wizard). Esa función va a negarse si la ficha tiene documentos, y la FK lo garantiza en la base aunque alguien se olvide.
- **No se crea un documento sobre una ficha `en_conflicto`**: primero se resuelve la identidad. Así la ficha duplicada que un conflicto borra nunca tiene documentos.
- **Una ficha con un documento sellado cuenta como verificada**: alguien la atendió en persona.
- Crear un documento para un paciente de la clínica lo **suma a la lista** del autor (`pacientes_en_mi_lista`, TR-157).
- **Los datos de D7 se editan en la ficha** ("Editar datos") y se precargan en cada documento. Lo que se completa en un documento **no** se escribe de vuelta en la ficha en la 5.1: en el consentimiento de conducto los datos son de *quien suscribe*, que puede ser un representante —escribirlos en la ficha le pondría al paciente la fecha de nacimiento de su madre—. Llega en la 5.6, con una marca por campo que diga que el dato es del paciente.

### 4.2 Las plantillas son datos, no diecinueve editores

El brief pide "un editor único por documento". La forma de dárselo sin escribir y mantener diecinueve editores a mano es que **cada documento sea una definición** y haya **un solo motor** que la dibuje de tres maneras: el formulario del sidebar, el documento en vivo y el PDF. El documento en vivo es la **lámina** (TR-187, decisión 14): la página original del Colegio con lo cargado escrito sobre sus renglones, compuesto igual en TypeScript y en Go y congelado al terminar. Cada documento tiene así *su* editor —sus campos, sus opciones, sus herramientas—, y un arreglo en el motor llega a todos. Es el mismo camino que tomó la página pública con `packages/prisma-engine`.

- **Paquete nuevo `packages/documentos-clinicos`** (TypeScript + zod), con un generador que exporta cada plantilla a JSON y lo copia a `apps/api` (`go:embed`), como `pnpm run engine:generar`. CI falla si lo generado difiere de lo commiteado.
- **Una plantilla** = `id`, `version`, título, tipo, **secciones** con bloques, y la lista de **firmas** (qué roles, cuáles obligatorias).
- **Bloques:** texto fijo (con marcas para los datos: `{paciente.nombre}`, `{profesional.matricula}`) y campos.
- **Tipos de campo:** texto, texto largo, fecha, fecha y hora, número (con unidad), **SI/NO con aclaración condicional**, opción única, opción múltiple, tabla (filas fijas o que se agregan), **selector de piezas FDI** ("elementos a extraer: 36, 37"), **odontograma** (§4.4), **dibujo libre** (el genograma, con el mismo lienzo que la firma), **asentimiento** (las dos caritas), próxima consulta, y los bloques de datos del paciente y del profesional, que se precargan.
- **Versiones:** el texto legal de una versión no se edita nunca. Si cambia, es una versión nueva; los documentos ya sellados guardan la versión y **el texto tal cual lo leyó el paciente** dentro de su contenido congelado.
- **Validación en el backend**, contra el esquema de esa versión: tolerante al guardar un borrador, estricta al terminar (campos obligatorios, piezas FDI válidas).
- **Sin espacios en blanco** (Decreto 1089/2012, art. 15): al terminar, un campo opcional vacío queda impreso como "No consigna", para que no haya hueco donde agregar algo después.
- **La lámina** (`lamina` en la plantilla): el tamaño de cada página en puntos del PDF, una **zona** por dato (dónde empieza el renglón, su ancho, cuántos renglones tiene, el texto con marcas; `{{campo:dia}}` para las fechas en partes) y el **lugar de cada firma**. Se miden sobre el PDF con PyMuPDF. Lo que no entra en su renglón ni al tamaño mínimo es un error al terminar.

### 4.3 Las pantallas

**Sidebar del panel:** una entrada nueva, **Documentos**, con ícono propio (TR-180), visible solo para quien tiene rol `profesional`.

**`/panel/documentos`**

1. **El selector**: el nombre del documento entre `<` y `>` (mismo dibujo que `CarruselDeProfesionales`). Tocarlo despliega todos los documentos separados en consentimientos informados, historias clínicas y el resto (el buscador de la primera versión se sacó a pedido del cliente, 2026-09-28).
2. **El modelo, sin rótulo** (se sacó el 2026-09-29: lo nombra el selector): las páginas del modelo original **como imágenes** —exactas al PDF, pre-renderizadas con `scripts/renderizar-originales.py`, no un visor de PDF (en iOS un PDF embebido muestra solo la primera página)—, por versión de plantilla. Debajo del selector, el botón **Completar este documento** y, debajo, **tus documentos en curso**. En el celular, **Ver en pantalla completa** abre la hoja en una capa con "Acercar". Los PDF no se versionan; las imágenes de sus páginas sí. Una plantilla sin original renderizado muestra el calco vacío. **Los modelos se apilan** (`PilaDeModelos`, TR-188, tercera ronda):
   - el elegido va adelante, y el anterior y el siguiente asoman detrás, más apagados;
   - cambiar con las flechas o el menú baraja las hojas;
   - la de adelante flota y se inclina hacia el mouse, como una carta de Balatro;
   - con "reducir movimiento" todo es un fundido.

   Mientras haya menos de tres modelos, la pila se completa con **hojas de muestra** que no se pueden completar; desde la 5.2, con los catorce consentimientos, ya no aparecen.
3. **Al fondo, después del modelo: pacientes con documentos**, en blanco: nombre, DNI, cantidad y fecha del último (misma caja con alto de cuatro filas en el celular, TR-180). Tocar una fila lleva al registro de ese paciente.

**El editor** (`/panel/documentos/{id}`, un borrador):

- **Escritorio**: sidebar con el formulario a la izquierda —fija debajo del header mientras se recorre la hoja—; a la derecha, **la lámina**: la página del modelo con lo cargado escrito encima, que es exactamente lo que se firma, se imprime y va al PDF (TR-187, decisión 14). Lo que falta se ve teñido; lo que no entra, en terracota. "Ver en pantalla completa" va por encima de las dos columnas, así la primera tarjeta arranca a la altura de la hoja.
- **Celular**: una cosa por vez, **Completar** o **Ver documento** (el mismo criterio que el editor de página, TR-172). En los dos tamaños, **Ver en pantalla completa** abre la hoja en una capa con "Acercar" (solo para leer: los renglones se tocan en la hoja del editor).
- **Paso 1, el paciente**: el mismo buscador que "Paciente conocido" de "+ Agregar turno" (`BuscadorPacientes`), en un diálogo blanco; al elegirlo se precargan sus datos y los del profesional.
- **Los campos**, sección por sección. Tocar un renglón de la hoja abre esa sección en el sidebar y pone el foco en su campo (como TR-173).
- **Se guarda solo**. **Terminar** valida, **pide confirmación** —después ya no se edita— y pasa a firmas; un consentimiento, en cambio, queda **listo para imprimir** (TR-188).

**Un consentimiento terminado** (TR-188): en lugar de las firmas, **Imprimir**. Sale la hoja exacta a tamaño del papel del modelo, con la página a 300 dpi y sin el encabezado del navegador, y los renglones de firma en blanco. **Recibe su folio** al terminarse, queda en el registro del paciente como "Listo para imprimir" y **ya no se edita**: si hay que corregir algo, "hacé uno nuevo".

**Firmas** (§4.5), para lo que se firma en el sistema: una tarjeta por firmante requerido, con tres acciones — **Firmar en este dispositivo**, **Enviar vínculo** (copiar o abrir WhatsApp) y **Avisar a mi celular**. El estado de cada una se actualiza solo. Con la última firma, el documento se sella y aparece **Descargar PDF**.

**Registro del paciente** (`/panel/pacientes/{id}/documentos`): los documentos terminados del paciente, del folio más nuevo al más viejo, con folio, documento **con su tipo adelante** ("Consentimiento informado: Tratamiento de conducto"), fecha, profesional, **huella** y estado. Los **filtros** son los de Turnos: un buscador a la vista (documento, profesional, folio o huella) y el botón "Filtros" con el **modelo puntual**, Hoy/Semana/Mes y desde/hasta. Lo aplicado se ve en etiquetas que se quitan de a una, como en Turnos. "+ Nuevo documento" va en la fila del título. Cada uno se abre en solo lectura (la hoja, las firmas y la constancia) y lo sellado se descarga en PDF. **El bloque "Historia clínica" de la ficha** pasa a ser "Documentos clínicos": **solo el botón** para entrar al registro (2026-09-29); recepción ve cuántos hay. "Presupuesto" sigue como está.

### 4.4 El odontograma

Un componente SVG propio, accesible con teclado, que se usa igual en el editor, en el calco y (con la misma geometría) en el PDF.

- **Dentición**: permanente, temporaria o las dos (la historia general muestra ambas; odontopediatría separa "Temporarios" y "Permanentes").
- **Caras**: vestibular, lingual/palatina, mesial, distal y oclusal/incisal. Mesial siempre mira a la línea media, así que se invierte entre cuadrantes; la cara de arriba del cuadrado es vestibular en el maxilar superior y lingual en el inferior (**a confirmar con el odontólogo en la QA**).
- **Uso**: se elige **color** (rojo = existente / realizado, azul = requerido / a realizar) y **herramienta** (cara, X, corona, prótesis fija, prótesis removible y, en pediatría, sellador y T), y se toca la pieza o la cara. Tocar de nuevo borra. La leyenda está siempre a la vista, con los rótulos exactos de cada modelo.
- **Cantidad de dientes existentes**: se sugiere sola (piezas sin X) y se puede corregir.
- **Guarda datos, no un dibujo**: `{ "16": { "caras": { "O": "rojo" }, "marcas": [{ "tipo": "corona", "color": "azul" }] } }` más las prótesis como tramos (`desde`/`hasta`). Así el odontograma de un documento viejo se puede leer como punto de partida del siguiente.

### 4.5 Firma, sellado y la prueba de que nadie tocó nada

> **Desde el 2026-09-29 los consentimientos no pasan por acá** (TR-188): se imprimen y se firman a mano. Esta sección vale para lo que se firma en el sistema.

**La huella.** Al terminar, el contenido se pasa a **JSON canónico** (claves ordenadas, RFC 8785) con todo lo que el firmante ve: plantilla y versión, el texto legal ya armado, los datos, los del paciente y del profesional, fecha y hora. Su **SHA-256** es `hash_contenido`. Cada firma guarda esa huella: firmar es firmar *ese* contenido exacto.

**Quién firma.** Cada plantilla declara los roles: paciente, representante legal (tutor, curador, acompañante, con vínculo), asentimiento del menor, profesional, otro profesional interviniente (el anestesista de la sedoanalgesia) y **dos testigos** para cuando el paciente no puede firmar (Decreto 1089/2012, art. 7). El representante se precarga de los tutores de la ficha (`PacienteTutor`).

**Tres formas de firmar** — todas terminan en la misma pantalla (`/firmar/{token}`):

1. **En este dispositivo**: la computadora o tablet del consultorio, en persona.
2. **Vínculo al celular del paciente**: token de un solo uso, vence en 24 h, solo sirve para esa firma de ese documento, con el nombre y el DNI del firmante ya cargados (D2 quedó en "solo el vínculo").
3. **Alerta al celular del profesional**: una notificación nueva (`firma_pendiente`) por Web Push (TR-179) a los otros dispositivos del profesional; tocarla abre la misma pantalla, y el paciente firma en el celular del profesional, en persona.

La pantalla de firma **muestra el documento entero** —firmar un consentimiento sin poder leerlo no es consentimiento informado—, pide nombre, DNI y (si corresponde) vínculo, y tiene un lienzo para firmar con el dedo que guarda el **trazo como vectores con sus tiempos** (no una foto): es más difícil de fabricar y se puede volver a dibujar exacto en el PDF.

**La constancia.** El PDF termina con una hoja de constancia por firma: método, fecha y hora de Córdoba, IP, dispositivo, mail verificado si lo hubo y la huella firmada. Es la evidencia que hace valer una firma electrónica (D1).

**El profesional** firma con la rúbrica registrada en su perfil, reconfirmando su identidad en ese momento (5.4). El "sello" es su nombre y matrícula impresos al lado. **En la 5.1** dibuja su firma en el dispositivo, igual que el paciente, con la sesión como identidad: la API toma su nombre y documento del perfil e ignora lo que mande la pantalla.

**El sellado.** Con la última firma requerida, en una sola transacción:

1. `hash_sello = SHA-256(hash_contenido + huellas de las firmas + hash_anterior)`, donde `hash_anterior` es el sello del documento anterior **de la misma clínica** (bajo un `pg_advisory_xact_lock` por clínica). Es una **cadena**: alterar un documento viejo rompe todos los sellos que vienen después, y se nota.
2. Se asigna el **folio** (correlativo por paciente, art. 12).
3. Queda el **código de verificación** corto, derivado del sello, que se imprime en el PDF (§4.6). El PDF no se genera acá ni se guarda: se arma en cada descarga (TR-191).

**"Inmodificable por ningún método", dicho con precisión.** Dentro de la app no hay ningún camino: no existe endpoint que edite o borre un sellado, y la base rechaza el `UPDATE`/`DELETE` con un trigger, aunque venga de SQL crudo (hay un test que lo intenta). Lo que ningún software puede impedir es que alguien con acceso de administrador a la base desactive un trigger. Para eso está la cadena: la alteración queda **a la vista**. Y para que ni siquiera se pueda reescribir la cadena entera sin que se note, el sello más reciente de cada clínica se **ancla afuera** una vez por día (§6, subfase 5.8): un sello de tiempo de una autoridad externa (RFC 3161) y la copia del PDF en un bucket con retención bloqueada.

### 4.6 El PDF

- **Se genera en el backend (Go), en cada descarga, y no se guarda** (*corregido el 2026-10-02, TR-191, que revierte TR-185*). `GET /documentos/{id}/pdf` lo arma con un escritor propio (`internal/pdf`: Helvetica y Courier base 14, JPEG sin recomprimir, Flate) y es **determinista**: mismos bytes en cada descarga, con la fecha tomada del sellado (o de cuando se terminó) y el `/ID` derivado de la huella. Por eso guardarlo no agrega prueba: el documento legal es lo sellado, que ya es inmutable, y el PDF es su representación. No hay storage, tabla ni configuración de PDF.
- **Es la lámina** (*TR-187 decisión 14*): la página original del Colegio con la composición **congelada** al terminar dibujada encima, en Helvetica —con las mismas métricas con las que se compuso—. No se vuelve a componer: se dibuja lo que se firmó. Los originales van **embebidos en la API** como JPEG a 200 dpi (gris salvo las páginas con color), generados con `scripts/originales-para-la-api.py`.
- **Qué lleva cada uno.** Un **sellado**: la lámina, las firmas en su renglón, la constancia de cada firma y el **código de verificación** (derivado del sello, `XXXX-XXXX`) en el pie, que lleva además folio y hoja. Un **consentimiento terminado**: solo la lámina, sin firmas, constancia ni código (se firma en papel y no tiene sello), con pie "Folio N · Hoja i de n".
- **Todo documento terminado ofrece "Imprimir" y "Descargar PDF"** —en la pantalla del documento y en cada fila terminada de las listas—; `?para=imprimir` lo sirve `inline`. Cada exportación válida deja un evento `exportado` (`pdf` o `impresión`), con sesión, permiso y la misma regla de alcance que el resto del módulo.
- **Los sellados de la 5.1 anteriores a la lámina no tienen PDF** (su contenido no trae la composición): se ven en pantalla y la API responde 409 (`tienePDF`).
- **Subfase 5.3 implementada.**

### 4.7 Permisos, aislamiento y privacidad

- Todas las rutas del módulo exigen rol **`profesional`** (`requireRol`). Recepción y administrador de página reciben 403, como en cualquier sección con rol; un documento o un paciente fuera de mi alcance, 404.
- **Crear**: sobre un paciente de la clínica (queda en la lista del autor). **Ver**: según D4.
- Los endpoints nuevos entran a las dos auditorías de aislamiento (`TestAislamiento_NingunaConsultaDelPanelSinAcotar` y `TestAislamiento_LosIDsDeLaURLSeAcotan`): todo id de la URL se acota por clínica y por los pacientes visibles.
- **Nada del contenido va a los logs** (ya se loguea el patrón de ruta, no la URL), ni a una notificación push: la alerta dice "Hay una firma pendiente", sin nombre de paciente ni de documento, porque aparece en la pantalla bloqueada del celular.
- Cada vez que alguien **abre** o **descarga** un documento sellado queda un evento en la auditoría. La ley de datos personales (25.326, arts. 9 y 10) pide seguridad y confidencialidad; el registro de accesos es cómo se demuestra.

### 4.8 Corregir, revocar y dar copia

Un documento sellado no se toca, pero la vida sigue:

- **Enmienda**: una plantilla corta ("Nota aclaratoria") que apunta al documento original (`enmienda_de`), se firma y se sella como cualquier otro. El original la muestra al pie. Es la versión digital de lo que pide el decreto: nada de tachaduras, se deja constancia del error.
- **Revocación de un consentimiento** (Ley 26.529, art. 10): otra plantilla que apunta al consentimiento (`revoca_a`), firmada por el paciente. El consentimiento queda marcado "revocado el …" en su vista y en el registro.
- **Copia para el paciente** (art. 14, 48 horas): un botón en el registro que arma un único PDF con todos los documentos sellados del paciente, con su constancia.

---

## 5. El marco legal

### 5.1 Qué exige cada norma y cómo se cumple

| Norma | Exige | Cómo lo cumple el diseño |
|---|---|---|
| **Ley 26.529, art. 5 a 7** (mod. Ley 26.742) | Consentimiento con información sobre procedimiento, riesgos, beneficios, alternativas y consecuencias de no hacerlo; **por escrito** en procedimientos invasivos o con riesgo | Las plantillas son los modelos del cliente, con esos apartados; el paciente ve el documento entero antes de firmar |
| **Ley 26.529, art. 10** | El consentimiento es **revocable**; se deja constancia | Plantilla de revocación (§4.8) |
| **Ley 26.529, art. 12** | Historia clínica **cronológica, foliada y completa** | Folio correlativo por paciente, registro en orden cronológico, registro de prestaciones como evolución (D3) |
| **Ley 26.529, art. 13** | Historia informatizada: **integridad, autenticidad, inalterabilidad, perdurabilidad y recuperabilidad**; accesos restringidos, almacenamiento no reescribible, control de modificación de campos | Estados con trigger, cadena de sellos, auditoría, y en la 5.8 copia con retención bloqueada y PDF/A si hace falta (§4.1, §4.5, §4.6) |
| **Ley 26.529, art. 14** | El paciente es el **titular**; copia autenticada en **48 horas** | Copia completa en PDF con constancia (§4.8) |
| **Ley 26.529, art. 15** (mod. Ley 26.812) | Datos del paciente y del profesional; **registro odontológico estandarizado en sistema dígito dos, con marcas y colores** | Bloques de datos precargados, odontograma FDI (§4.4) |
| **Ley 26.529, art. 17** | Historia **única por establecimiento** | Los documentos son del paciente de la clínica (D4) |
| **Ley 26.529, art. 18** | **Inviolable**; conservación **mínima de 10 años**; depositarios el establecimiento y los profesionales | Sin borrado de sellados ni de fichas con documentos; quedan en la clínica aunque el autor se vaya |
| **Decreto 1089/2012, art. 5 y 7** | El consentimiento lo **suscribe el profesional** y se agrega a la historia; si el paciente no puede firmar, **dos testigos**; revocación por escrito | Firma del profesional obligatoria en toda plantilla; roles de testigo; revocación (§4.8) |
| **Decreto 1089/2012, art. 13** | La historia informatizada se adapta a la **Ley 25.506** | Firma electrónica con evidencias; digital certificada preparada (D1) |
| **Decreto 1089/2012, art. 15** | Fecha y hora de cada asiento; sin tachaduras ni **espacios en blanco**; errores con constancia | Fecha y hora de Córdoba en cada estado; "No consigna" en lo vacío; enmiendas (§4.8) |
| **Ley 25.506** y **Código Civil y Comercial, arts. 286 a 288 y 319** | Firma digital = certificador licenciado, con presunciones; firma electrónica válida sin presunción, se aprecia por la fiabilidad del procedimiento | D1 y la constancia de firma (§4.5). El art. 4, que excluía los actos personalísimos, **está derogado** desde 2018 (Ley 27.446) — el argumento de que "un consentimiento no se puede firmar electrónicamente" que circula en artículos anteriores ya no tiene esa base |
| **Ley 27.706** (2023) | Historia clínica electrónica **única federal**, firmada digitalmente por el responsable, con marca temporal | Sin reglamentar al 2026-09; el diseño deja lugar a la firma digital y al sello de tiempo |
| **Ley 25.326, arts. 2, 7 a 10** | Los datos de salud son **sensibles**; los profesionales los pueden tratar con secreto profesional; seguridad y confidencialidad | Acceso solo de profesionales, nada en logs ni notificaciones, auditoría de accesos, almacenamiento privado |

### 5.2 Lo que hace falta además del software

- **Registro de la base ante la AAIP** (Ley 25.326, art. 21): lo hace cada clínica como responsable de sus datos. PRISMA es el **encargado del tratamiento**, y eso tiene que quedar escrito en los términos del servicio.
- **Resguardo por diez años**: los backups de la base y del bucket tienen que durar eso. Hoy dependen de lo que ofrece Render; hay que revisarlo antes de producción.

### 5.3 Límite de este análisis

Este relevamiento lo hizo el equipo técnico leyendo las normas; **no es asesoramiento legal**. Antes de usarlo con pacientes reales, un abogado (o el área legal del Colegio) tiene que revisar tres cosas: que la firma electrónica con evidencias alcanza para consentimientos (D1), el texto de la constancia de firma, y los términos del servicio como encargado del tratamiento.

Fuentes: [Ley 26.529 actualizada](https://www.argentina.gob.ar/normativa/nacional/ley-26529-160432/actualizacion) · [Decreto 1089/2012](https://servicios.infoleg.gob.ar/infolegInternet/anexos/195000-199999/199296/norma.htm) · [Ley 26.812](https://www.argentina.gob.ar/normativa/nacional/ley-26812-207587/texto) · [Ley 25.506 texto actualizado](https://servicios.infoleg.gob.ar/infolegInternet/anexos/70000-74999/70749/texact.htm) · [Ley 27.706](https://www.argentina.gob.ar/normativa/nacional/ley-27706-380710/texto) · [Decreto 743/2024](https://www.argentina.gob.ar/normativa/nacional/decreto-743-2024-403042/texto) · [CCyC art. 288](https://leyfacil.com.ar/codigo-civil-y-comercial/articulo-288/).

---

## 6. Plan por subfases

Una rama y un PR a `dev` por subfase; el merge lo hace el cliente. Cada una deja algo usable y se puede probar sola.

| Subfase | Qué | Depende de |
|---|---|---|
| **5.1 Cimientos** | Tablas, triggers de inmutabilidad y auditoría; paquete `documentos-clinicos` con el motor, los tipos de campo básicos y el generador a Go; validación en el backend; la pantalla del módulo (selector, original, tabla de pacientes, borradores); el editor con sidebar y calco en vivo; el registro del paciente y el bloque de la ficha; la protección de fichas con documentos. **Primer documento de punta a punta: consentimiento de tratamiento de conducto**, con firma en este dispositivo y sellado | D4, D7 |
| **5.2 Consentimientos** — *reordenada el 2026-09-29, era la 5.4 (TR-189)* | Los trece restantes (incluido el de ortodoncia), con casillas para el asentimiento y las opciones del papel. Se imprimen y se firman a mano (TR-188) | 5.1, D6 |
| **5.3 PDF** ✅ | El PDF se arma en Go en cada descarga y no se guarda (TR-191): sellados y consentimientos para imprimir, descarga con auditoría, código de verificación, constancia de firma. Sin storage | 5.1 |
| **5.4 Firma a distancia** — *solo historias clínicas (TR-188)* | Vínculo al celular del paciente (sin código, D2), alerta push al celular del profesional (`firma_pendiente`), testigos, representante desde los tutores, anular, rúbrica del profesional en su perfil | 5.2, D1, D2 |
| **5.5 Odontograma** | El componente (editor, calco y PDF), permanentes y temporarios, las dos leyendas | 5.3, D5 |
| **5.6 Historias clínicas** | General, PcD, ortodoncia (cefalogramas, VTO, análisis facial y funcional) y anexo de odontopediatría (genograma) | 5.5 |
| **5.7 Evolución y copias** | Registro de prestaciones como asientos sellados (D3), enmiendas, revocación, copia completa para el paciente | 5.6, D3 |
| **5.8 Anclaje y cierre** | Sello de tiempo externo diario de la cadena, bucket con retención bloqueada, verificación de la cadena, revisión legal, QA en dispositivos reales, documentación | 5.7 |

**El camino crítico** cambió con TR-188: los consentimientos se imprimen y se firman a mano, así que les alcanza la 5.1 y están todos desde la 5.2. Para las historias clínicas sigue siendo 5.3 (PDF) → 5.4 (firma a distancia): hasta que no se puede sellar, exportar y firmar a distancia, una historia clínica no sirve en un consultorio. Las plantillas se suman solas sobre el motor; una herramienta nueva (el odontograma, el cefalograma) es un tipo de campo más.

### Criterios de aceptación de la fase

- Un documento sellado **no se puede modificar ni borrar** desde la app ni con SQL directo (test), y alterar uno a mano en la base **se detecta** al verificar la cadena (test).
- Una ficha con documentos **no se borra** por ningún camino automático (un test por cada uno de los cuatro).
- Recepción y administrador de página reciben **403** en todo el módulo; un profesional sin el paciente en su lista, **404**.
- El PDF de un documento terminado es **siempre el mismo** (mismo SHA-256 en dos descargas) y se descarga solo con sesión, dejando un evento `exportado`.
- Un vínculo de firma **vence**, se usa **una sola vez** y no abre ningún otro documento.
- Las plantillas (las diecinueve del Colegio y las dos propias) generan su JSON sin diferencias en CI, y cada una tiene un test que la completa, la sella y genera su PDF.
- Cobertura ≥ 80 % en los dos lados, como siempre.

---

## 7. Riesgos

| Riesgo | Mitigación |
|---|---|
| La firma electrónica se desconoce en un juicio | Constancia con evidencias por firma; firma digital certificada preparada (D1); código al mail disponible como refuerzo (D2); revisión legal antes de producción |
| Se pierde un documento | Sin borrado en ningún nivel; backups de diez años; bucket con retención bloqueada (5.8) |
| Un vínculo de firma se filtra | Un uso, vence en 24 h, solo esa firma, muestra un solo documento; sin código al mail (D2) quien lo tenga puede firmar, así que conviene mandarlo desde la app al teléfono de la ficha |
| El editor genérico queda corto para una plantilla rara | Los tipos de campo son extensibles: una herramienta nueva (como el cefalograma) es un tipo más del motor, no un editor aparte |
| Generar PDFs consume memoria en la instancia de Render | Escritor propio, sin librería ni navegador: una lámina de una a cuatro páginas con JPEG sin recomprimir. Se arma en cada descarga (TR-191) |
| El trabajo de cargar 19 plantillas a mano tiene errores de tipeo en el texto legal | Test que compara el texto de cada plantilla con el del PDF original (extraído una vez) y marca diferencias |
| El Colegio objeta el uso de sus modelos | Se publicaron para uso de los odontólogos y cada plantilla cita la fuente; avisarle antes de producción (final de §3) |
