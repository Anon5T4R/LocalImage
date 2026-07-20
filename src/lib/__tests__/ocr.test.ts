import { describe, expect, it } from "vitest";
import {
  MIN_SELECTION,
  ocrRegion,
  ocrScale,
  ocrTextName,
  rotatedDims,
  textToBase64,
} from "../ocr";

describe("ocrScale", () => {
  it("amplia o que é pequeno demais pro LSTM (recorte de print)", () => {
    // 300×20 é uma linha de print: no tamanho nativo sai vazio. O piso pelo
    // lado MENOR pediria 50×, mas o teto de ampliação segura em 4×.
    expect(ocrScale(300, 20)).toBe(4);
  });

  it("nunca reduz — reduzir destrói glifo", () => {
    expect(ocrScale(4000, 3000)).toBe(1);
    expect(ocrScale(12000, 9000)).toBe(1); // teto por lado empurraria pra <1
  });

  it("amplia até o piso de lado menor quando cabe", () => {
    // 1500×500: piso pede 1000/500 = 2×; o lado maior vira 3000 (< 4000). OK.
    expect(ocrScale(1500, 500)).toBe(2);
  });

  it("o teto por lado ganha do piso", () => {
    // 3000×800: o piso pediria 1.25×, mas 3000×1.25 = 3750 < 4000, então passa.
    expect(ocrScale(3000, 800)).toBeCloseTo(1.25, 5);
    // 3900×900: piso pede ~1.11×, mas estouraria 4000 no lado maior → cai.
    expect(ocrScale(3900, 900)).toBeCloseTo(4000 / 3900, 5);
  });

  it("degenerado não quebra", () => {
    expect(ocrScale(0, 0)).toBe(1);
    expect(ocrScale(-5, 100)).toBe(1);
  });
});

describe("rotatedDims", () => {
  it("90/270 trocam os eixos; 0/180 não", () => {
    expect(rotatedDims(800, 600, 0)).toEqual({ w: 800, h: 600 });
    expect(rotatedDims(800, 600, 90)).toEqual({ w: 600, h: 800 });
    expect(rotatedDims(800, 600, 180)).toEqual({ w: 800, h: 600 });
    expect(rotatedDims(800, 600, 270)).toEqual({ w: 600, h: 800 });
  });

  it("normaliza volta inteira e ângulo negativo", () => {
    expect(rotatedDims(800, 600, 360)).toEqual({ w: 800, h: 600 });
    expect(rotatedDims(800, 600, 450)).toEqual({ w: 600, h: 800 });
    expect(rotatedDims(800, 600, -90)).toEqual({ w: 600, h: 800 });
  });
});

describe("ocrRegion", () => {
  const W = 1000;
  const H = 800;

  it("sem seleção usa o quadro inteiro", () => {
    expect(ocrRegion(null, W, H)).toEqual({ x: 0, y: 0, w: W, h: H });
  });

  it("seleção válida é respeitada", () => {
    const sel = { x: 100, y: 50, w: 300, h: 200 };
    expect(ocrRegion(sel, W, H)).toEqual(sel);
  });

  it("clique sem arrastar cai pro quadro inteiro, não pra um retângulo de 2px", () => {
    expect(ocrRegion({ x: 10, y: 10, w: 2, h: 2 }, W, H)).toEqual({ x: 0, y: 0, w: W, h: H });
    expect(ocrRegion({ x: 10, y: 10, w: 400, h: MIN_SELECTION - 1 }, W, H)).toEqual({
      x: 0,
      y: 0,
      w: W,
      h: H,
    });
  });

  it("seleção que sai da imagem é recortada nos limites", () => {
    expect(ocrRegion({ x: 900, y: 700, w: 500, h: 500 }, W, H)).toEqual({
      x: 900,
      y: 700,
      w: 100,
      h: 100,
    });
  });

  it("seleção que sobra fina demais depois do clamp vira quadro inteiro", () => {
    // Começa dentro, mas só 3 px cabem antes da borda direita.
    expect(ocrRegion({ x: 997, y: 100, w: 400, h: 400 }, W, H)).toEqual({
      x: 0,
      y: 0,
      w: W,
      h: H,
    });
  });
});

describe("ocrTextName", () => {
  it("TROCA a extensão em vez de anexar", () => {
    // O `${name}.txt` ingênuo daria "foto.jpg.txt", que fica feio na pasta.
    expect(ocrTextName("foto.jpg")).toBe("foto.txt");
  });

  it("só a ÚLTIMA extensão sai — nome com ponto no meio fica inteiro", () => {
    expect(ocrTextName("backup.2026.png")).toBe("backup.2026.txt");
  });

  it("nome sem extensão só ganha o sufixo", () => {
    expect(ocrTextName("captura")).toBe("captura.txt");
  });
});

/** Volta base64 → texto sem depender de `Buffer` (o tsc do app não tem @types/node). */
function fromBase64(b64: string): string {
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

describe("textToBase64", () => {
  // Estes dois são o motivo da função existir: o caminho ingênuo é
  // `btoa(texto)`, que JOGA EXCEÇÃO em qualquer caractere fora do latin-1.
  // OCR em português acentua na primeira linha, então não é caso de borda.
  it("acento sobrevive (o btoa cru explodiria)", () => {
    const txt = "Endereço: Avenida São João, nº 1.200 — ação";
    const back = fromBase64(textToBase64(txt));
    expect(back).toBe(txt);
  });

  it("texto longo não estoura a pilha (spread em blocos)", () => {
    // O `String.fromCharCode(...bytes)` de uma vez estoura em ~100k argumentos;
    // documento escaneado passa disso com folga.
    const txt = "Parágrafo com acentuação. ".repeat(20000);
    const back = fromBase64(textToBase64(txt));
    expect(back).toBe(txt);
    expect(back.length).toBeGreaterThan(500000);
  });

  it("vazio vira vazio", () => {
    expect(textToBase64("")).toBe("");
  });
});
