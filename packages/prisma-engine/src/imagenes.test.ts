import { describe, expect, it } from "vitest";
import { srcsetDeFoto } from "./imagenes";

describe("srcsetDeFoto", () => {
  it("arma el srcset con las variantes que no superan la guardada", () => {
    expect(srcsetDeFoto("/uploads/abc_-1.w960.webp")).toBe("/uploads/abc_-1.w480.webp 480w, /uploads/abc_-1.w960.webp 960w");
    expect(srcsetDeFoto("https://fotos.example.com/x.w1600.webp")).toBe(
      "https://fotos.example.com/x.w480.webp 480w, https://fotos.example.com/x.w960.webp 960w, https://fotos.example.com/x.w1600.webp 1600w",
    );
  });

  it("no inventa variantes para una foto sin el patrón o con un ancho fuera del catálogo", () => {
    expect(srcsetDeFoto("/uploads/abc.jpg")).toBeUndefined();
    expect(srcsetDeFoto("/uploads/abc.w700.webp")).toBeUndefined();
    expect(srcsetDeFoto("/uploads/abc.w960.jpg")).toBeUndefined();
  });
});
