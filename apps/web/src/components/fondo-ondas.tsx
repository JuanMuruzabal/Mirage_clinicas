"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

// FONDO DE ONDAS (correcciones generales, ítem 1, 2026-10-10). Reemplaza a la
// textura de crucecitas y al cascarón plano en toda la app con sesión:
// salvia, acero y un toque de arena fluyen como ondas grandes y lentas, a la manera de la luz del fondo
// "Prism" de reactbits pero sin la forma de prisma.
//
// - WebGL propio, sin librerías: la CSP no admite `eval` y un efecto solo
//   no justifica una dependencia.
// - El tiempo solo mueve fases acotadas
//   (las ondas fluctúan en el lugar, no viajan): ver los comentarios de
//   abajo.
// - Barato a propósito, porque el panel queda abierto todo el día: dibuja a
//   la mitad de los píxeles CSS (con tope de ancho) y lo estira el CSS, a 24
//   cuadros por segundo como máximo, y se pausa con la pestaña oculta.
// - El HTML del servidor trae el contenedor con un degradé estático en CSS
//   (`.fondo-ondas`, globals.css) con los mismos tonos: se ve igual sin
//   JavaScript o sin WebGL. El canvas aparece encima con un fundido recién
//   cuando dibujó su primer cuadro.
// - Con "reducir movimiento" se dibuja UN cuadro y queda quieto. La
//   preferencia no se lee en el render de hidratación (el servidor no la
//   conoce): `useSyncExternalStore` con el snapshot del servidor en `false`,
//   mismo patrón que `Dialogo` (TR-174).

const CUADROS_POR_SEGUNDO = 24;
const ESCALA = 0.5;
const ANCHO_MAXIMO = 960;
// EL TIEMPO SOLO MUEVE FASES ACOTADAS, NUNCA LAS COORDENADAS (pedido de la
// persona, 2026-10-10: "las ondas tienen que estar siempre en pantalla,
// fluctuando en el lugar"). La primera versión sumaba `t` a la coordenada y
// las bandas viajaban: salían por un lado y volvían a entrar por el otro,
// dejando ratos de pantalla solo hueso. Ahora `t` aparece únicamente dentro
// de `sin(t·k)`, que oscila alrededor de cero: cada banda cambia de forma,
// de fase y de color sin irse del lugar, y como las frecuencias espaciales
// dan más de una ondulación por pantalla, siempre hay color en todo el
// viewport.
//
// Todas las frecuencias temporales del shader son múltiplos enteros de
// 0,02 rad/s: el patrón se repite exacto cada 2π/0,02 segundos (~5 min), y
// envolver `t` ahí no produce ningún salto. Se envuelve en JS para que la
// precisión del flotante no se degrade con el panel abierto horas.
const PERIODO = (2 * Math.PI) / 0.02;

const VERTICE = `
attribute vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }
`;

// LA PALETA (cierre de la tanda, 2026-10-10): la de la PRIMERA iteración
// —salvia, acero y un toque de arena—, que la persona prefirió, pero con más
// color y menos blanco. Recorrido: la primera (salvia-claro y acero-claro
// sobre hueso) se veía "entre grisáceos y blancos"; una con todo el círculo
// de tonos pastel quedó "demasiados colores"; esta queda en el medio.
//
// - Tres tintes de los tokens llevados en OKLCH a luminosidad 0,905 y croma
//   0,032 (más del doble del croma de salvia-claro y acero-claro, un poco
//   menos que la versión pastel): salvia #d5e5d1, acero #cde3f3 y arena
//   #eadec8 (la arena cálida de antes del cambio a blancos).
// - Se mezclan como promedio ponderado EN OKLAB: pasar de verde a celeste
//   no cruza por el gris, como sí pasaba en RGB.
// - La base `hueso` pesa poco (0,15 contra pesos de 0 a 1 de cada color):
//   los colores cubren casi toda la pantalla.
// - El tinte más oscuro deja grafito/75 en 5,0:1 y el verde de marca en
//   5,0:1 (los subtítulos que van directo sobre el fondo usan grafito/80).
const FRAGMENTO = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 r;
uniform float t;

// OKLab de cada tinte.
const vec3 HUESO = vec3(0.9724, -0.0010, -0.0003);
const vec3 SALVIA = vec3(0.905, -0.0240, 0.0211);
const vec3 ACERO = vec3(0.905, -0.0176, -0.0267);
const vec3 ARENA = vec3(0.905, 0.0046, 0.0317);

vec3 oklabASrgb(vec3 c) {
  float l = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
  float m = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
  float s = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
  l = l * l * l; m = m * m * m; s = s * s * s;
  vec3 lin = vec3(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s);
  lin = clamp(lin, 0.0, 1.0);
  return mix(lin * 12.92, 1.055 * pow(lin, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, lin));
}

// Una banda: senoide sobre el plano deformado, con una fase que oscila.
float banda(vec2 q, vec2 dir, float frec, float fase, float k) {
  float v = 0.5 + 0.5 * sin(dot(q, dir) * frec + fase + 1.6 * sin(t * k + fase));
  return v * v * (3.0 - 2.0 * v);
}

void main() {
  vec2 uv = gl_FragCoord.xy / r;
  vec2 p = (uv - 0.5) * vec2(r.x / r.y, 1.0) * 2.4;

  // Domain warping cuyo desplazamiento oscila alrededor de cero.
  vec2 q = p;
  q += 0.45 * vec2(sin(p.y * 1.3 + 1.2 * sin(t * 0.14)), sin(p.x * 1.1 + 1.2 * sin(t * 0.18 + 1.0)));
  q += 0.25 * vec2(sin(q.y * 2.1 + 1.5 * sin(t * 0.22 + 2.0)), sin(q.x * 1.9 + 1.5 * sin(t * 0.26 + 0.5)));

  float ws = banda(q, vec2(0.8, 0.6), 1.8, 0.0, 0.10);
  float wa = banda(q, vec2(-0.5, 0.87), 1.6, 2.1, 0.12);
  float wr = banda(q, vec2(0.97, -0.26), 1.4, 4.2, 0.16) * 0.55;
  float wh = 0.15;

  vec3 color = (HUESO * wh + SALVIA * ws + ACERO * wa + ARENA * wr) / (wh + ws + wa + wr);
  vec3 rgb = oklabASrgb(color);

  // Tramado de 1/255 para que los degradés tan suaves no se escalonen.
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  rgb += (n - 0.5) / 255.0;

  gl_FragColor = vec4(rgb, 1.0);
}
`;

function suscribirMovimiento(avisar: () => void) {
  const consulta = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  consulta?.addEventListener?.("change", avisar);
  return () => consulta?.removeEventListener?.("change", avisar);
}

function prefiereQuieto(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function compilar(gl: WebGLRenderingContext, tipo: number, fuente: string): WebGLShader | null {
  const sh = gl.createShader(tipo);
  if (!sh) return null;
  gl.shaderSource(sh, fuente);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

export function FondoOndas() {
  const ref = useRef<HTMLCanvasElement>(null);
  const quieto = useSyncExternalStore(suscribirMovimiento, prefiereQuieto, () => false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let gl: WebGLRenderingContext | null = null;
    try {
      gl = canvas.getContext("webgl", {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: false,
        powerPreference: "low-power",
      }) as WebGLRenderingContext | null;
    } catch {
      gl = null;
    }
    // Sin WebGL queda el degradé de CSS del contenedor.
    if (!gl) return;

    const vs = compilar(gl, gl.VERTEX_SHADER, VERTICE);
    const fs = compilar(gl, gl.FRAGMENT_SHADER, FRAGMENTO);
    const prog = gl.createProgram();
    if (!vs || !fs || !prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uR = gl.getUniformLocation(prog, "r");
    const uT = gl.getUniformLocation(prog, "t");

    let raf = 0;
    let ultimo = 0;
    let perdido = false;
    // `t` en segundos. Arranca en un punto del ciclo distinto de cero para
    // que la primera vista ya tenga ondas cruzadas.
    let t = 23;

    const ajustar = () => {
      const w = Math.max(1, Math.round(Math.min(window.innerWidth * ESCALA, ANCHO_MAXIMO)));
      const h = Math.max(1, Math.round((window.innerHeight * w) / Math.max(1, window.innerWidth)));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl!.viewport(0, 0, w, h);
      gl!.uniform2f(uR, w, h);
    };

    const dibujar = () => {
      gl!.uniform1f(uT, t);
      gl!.drawArrays(gl!.TRIANGLES, 0, 3);
    };

    const cuadro = (ahora: number) => {
      raf = requestAnimationFrame(cuadro);
      if (ultimo === 0) ultimo = ahora;
      const dt = ahora - ultimo;
      if (dt < 1000 / CUADROS_POR_SEGUNDO - 2) return;
      ultimo = ahora;
      // Un salto grande (la pestaña volvió de estar oculta) no adelanta el
      // patrón de golpe.
      t = (t + Math.min(dt, 100) / 1000) % PERIODO;
      dibujar();
    };

    const arrancar = () => {
      if (quieto || perdido || raf || document.hidden) return;
      ultimo = 0;
      raf = requestAnimationFrame(cuadro);
    };
    const parar = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };

    const alCambiarVisibilidad = () => (document.hidden ? parar() : arrancar());
    const alRedimensionar = () => {
      ajustar();
      if (quieto) dibujar();
    };
    const alPerder = (e: Event) => {
      e.preventDefault();
      perdido = true;
      parar();
      canvas.style.opacity = "0";
    };

    ajustar();
    dibujar();
    // Opacidad directa sobre el nodo y no un estado: no es dato de React,
    // y un setState dentro del efecto dispararía otro render.
    canvas.style.opacity = "1";
    arrancar();

    document.addEventListener("visibilitychange", alCambiarVisibilidad);
    window.addEventListener("resize", alRedimensionar);
    canvas.addEventListener("webglcontextlost", alPerder);

    return () => {
      parar();
      document.removeEventListener("visibilitychange", alCambiarVisibilidad);
      window.removeEventListener("resize", alRedimensionar);
      canvas.removeEventListener("webglcontextlost", alPerder);
      gl!.deleteBuffer(buf);
      gl!.deleteProgram(prog);
      gl!.deleteShader(vs);
      gl!.deleteShader(fs);
      gl!.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [quieto]);

  return (
    <div aria-hidden="true" className="fondo-ondas pointer-events-none fixed inset-0 -z-10">
      {/* `key`: al cambiar la preferencia se monta un canvas nuevo. El efecto
          anterior libera su contexto (`loseContext`), y pedirle otro al
          mismo nodo devolvería ese contexto perdido. */}
      <canvas
        key={quieto ? "quieto" : "en-movimiento"}
        ref={ref}
        className="h-full w-full opacity-0 transition-opacity duration-700"
      />
    </div>
  );
}
