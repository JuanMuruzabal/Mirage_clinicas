import { describe, expect, it } from "vitest";
import { esUrlDeFotoSegura, hrefDeTelefono, urlDeComoLlegar, urlDeMapaEmbebido, urlDeRedSocial } from "./enlaces";

describe("urlDeRedSocial", () => {
  it("un usuario (con o sin @) arma el link de la red", () => {
    expect(urlDeRedSocial("instagram", "@clinica")).toBe("https://instagram.com/clinica");
    expect(urlDeRedSocial("instagram", "clinica.sonrisas")).toBe("https://instagram.com/clinica.sonrisas");
    expect(urlDeRedSocial("facebook", "clinica")).toBe("https://facebook.com/clinica");
  });

  it("una URL http(s) se respeta tal cual", () => {
    expect(urlDeRedSocial("facebook", "https://facebook.com/clinica")).toBe("https://facebook.com/clinica");
    expect(urlDeRedSocial("instagram", "HTTPS://instagram.com/x")).toBe("https://instagram.com/x");
  });

  it("whatsapp toma solo los dígitos", () => {
    expect(urlDeRedSocial("whatsapp", "+54 9 351 123-4567")).toBe("https://wa.me/5493511234567");
    expect(urlDeRedSocial("whatsapp", "123")).toBeNull();
  });

  it("esquemas que no son http(s) NUNCA dan un link", () => {
    expect(urlDeRedSocial("instagram", "javascript:alert(1)")).toBeNull();
    expect(urlDeRedSocial("facebook", "data:text/html,<script>")).toBeNull();
    expect(urlDeRedSocial("instagram", "ftp://x")).toBeNull();
    expect(urlDeRedSocial("instagram", "javascript://algo")).toBeNull();
  });

  it("vacío, solo @ o una red desconocida dan null", () => {
    expect(urlDeRedSocial("instagram", "  ")).toBeNull();
    expect(urlDeRedSocial("instagram", "@")).toBeNull();
    expect(urlDeRedSocial("tiktok", "@x")).toBeNull();
  });

  it("un usuario con caracteres raros se codifica, no se interpola", () => {
    expect(urlDeRedSocial("instagram", "a/b?c=d")).toBe("https://instagram.com/a%2Fb%3Fc%3Dd");
  });
});

describe("mapas", () => {
  it("codifica la dirección en el embed y en 'cómo llegar'", () => {
    expect(urlDeMapaEmbebido("Av. Colón 100 & 2")).toBe("https://www.google.com/maps?q=Av.%20Col%C3%B3n%20100%20%26%202&output=embed");
    expect(urlDeComoLlegar("Av. Colón 100")).toBe("https://www.google.com/maps/search/?api=1&query=Av.%20Col%C3%B3n%20100");
  });
});

describe("hrefDeTelefono", () => {
  it("deja solo dígitos y +", () => {
    expect(hrefDeTelefono("+54 (351) 123-4567")).toBe("tel:+543511234567");
  });

  it("algo que no parece un teléfono da null", () => {
    expect(hrefDeTelefono("abc")).toBeNull();
    expect(hrefDeTelefono("123")).toBeNull();
  });
});

describe("esUrlDeFotoSegura", () => {
  it("acepta nuestra ruta de uploads y http(s)", () => {
    expect(esUrlDeFotoSegura("/uploads/a.jpg")).toBe(true);
    expect(esUrlDeFotoSegura("https://cdn.example.com/a.jpg")).toBe(true);
    expect(esUrlDeFotoSegura("http://localhost:8080/uploads/a.jpg")).toBe(true);
  });

  it("rechaza el resto", () => {
    expect(esUrlDeFotoSegura("javascript:alert(1)")).toBe(false);
    expect(esUrlDeFotoSegura("data:image/png;base64,AAAA")).toBe(false);
    expect(esUrlDeFotoSegura("//evil.example/a.jpg")).toBe(false);
    expect(esUrlDeFotoSegura("")).toBe(false);
  });
});
