import { describe, expect, it } from "vitest";
import {
  clampPan,
  clampRect,
  fitScale,
  nextZoom,
  normRect,
  stepIndex,
  wallpaperLayout,
  WALLPAPER_FITS,
  ZOOM_STEPS,
} from "../geometry";

describe("fitScale", () => {
  it("cabe na área e nunca amplia", () => {
    expect(fitScale(2000, 1000, 1000, 1000)).toBe(0.5);
    expect(fitScale(100, 100, 1000, 1000)).toBe(1); // não amplia
    expect(fitScale(1000, 2000, 500, 500)).toBe(0.25);
  });
  it("dimensões inválidas viram 1", () => {
    expect(fitScale(0, 100, 500, 500)).toBe(1);
  });
});

describe("normRect / clampRect", () => {
  it("normaliza cantos invertidos", () => {
    expect(normRect(100, 100, 20, 40)).toEqual({ x: 20, y: 40, w: 80, h: 60 });
  });
  it("clampa nos limites da imagem", () => {
    const r = clampRect({ x: -10, y: 50, w: 200, h: 200 }, 100, 100);
    expect(r.x).toBe(0);
    expect(r.w).toBeLessThanOrEqual(100);
    expect(r.y + r.h).toBeLessThanOrEqual(100);
  });
});

describe("clampPan", () => {
  // Convenção: imagem centrada no viewport, pan em px de tela.
  it("pan dentro do limite passa intocado", () => {
    expect(clampPan({ x: 10, y: -20 }, 800, 600, 1000, 700)).toEqual({ x: 10, y: -20 });
  });
  it("nunca deixa a imagem sumir: ≥64px visíveis em cada eixo", () => {
    // Limite X: (1000+800)/2 − 64 = 836.
    const r = clampPan({ x: 5000, y: -5000 }, 800, 600, 1000, 700);
    expect(r.x).toBe(836);
    expect(r.y).toBe(-((700 + 600) / 2 - 64)); // −586
  });
  it("é simétrico nos dois sentidos", () => {
    const a = clampPan({ x: -9999, y: 9999 }, 800, 600, 1000, 700);
    const b = clampPan({ x: 9999, y: -9999 }, 800, 600, 1000, 700);
    expect(a).toEqual({ x: -b.x, y: -b.y });
  });
  it("imagem menor que 64px: exige a imagem inteira visível", () => {
    // m = min(64, 40) = 40 → limite X = (1000+40)/2 − 40 = 480.
    const r = clampPan({ x: 9999, y: 9999 }, 40, 30, 1000, 700);
    expect(r.x).toBe(480);
    expect(r.y).toBe((700 + 30) / 2 - 30);
  });
  it("zoom grande: a borda da imagem ainda alcança o viewport", () => {
    // Imagem 8000×6000 num viewport 1000×700 — dá pra arrastar muito, mas
    // o limite garante que 64px continuem dentro.
    const r = clampPan({ x: 999999, y: 0 }, 8000, 6000, 1000, 700);
    expect(r.x).toBe((1000 + 8000) / 2 - 64);
  });
  it("dimensões inválidas voltam pro centro", () => {
    expect(clampPan({ x: 50, y: 50 }, 0, 100, 1000, 700)).toEqual({ x: 0, y: 0 });
  });
  it("viewport minúsculo não inverte o intervalo", () => {
    // m também é limitado pelo viewport: min(64, img, view).
    const r = clampPan({ x: 9999, y: 9999 }, 800, 600, 40, 30);
    expect(r.x).toBe((40 + 800) / 2 - 40);
    expect(r.y).toBe((30 + 600) / 2 - 30);
  });
});

describe("wallpaperLayout", () => {
  // Caso de referência (o mesmo medido no GUI): view 1000×700, imagem 800×600.
  // Razões: view 10:7 ≈ 1,4286; imagem 4:3 ≈ 1,3333 — a imagem é mais "alta".
  it("preencher: escala pelo maior fator e corta o excesso vertical", () => {
    const l = wallpaperLayout("cover", 800, 600, 1000, 700);
    expect(l.scaleX).toBe(1.25); // max(1000/800, 700/600) = 1,25
    expect(l.scaleY).toBe(1.25);
    expect(l.overflowX).toBe(0); // 800·1,25 = 1000, exato
    expect(l.overflowY).toBe(50); // 600·1,25 = 750 → 50px cortados
    expect(l.barX + l.barY).toBe(0); // preencher nunca deixa barra
  });
  it("ajustar: escala pelo menor fator e deixa barras laterais", () => {
    const l = wallpaperLayout("contain", 800, 600, 1000, 700);
    expect(l.scaleX).toBeCloseTo(700 / 600, 10); // ≈ 1,16667
    expect(l.overflowX + l.overflowY).toBe(0); // ajustar nunca corta
    expect(l.barX).toBeCloseTo(1000 - 800 * (700 / 600), 10); // ≈ 66,67
    expect(l.barY).toBe(0);
  });
  it("ajustar AMPLIA (ao contrário do fitScale do visualizador)", () => {
    // fitScale trava em 1; papel de parede que não preenche a tela não é papel
    // de parede — é a diferença de propósito entre as duas funções.
    expect(fitScale(100, 100, 1000, 700)).toBe(1);
    expect(wallpaperLayout("contain", 100, 100, 1000, 700).scaleX).toBe(7);
  });
  it("esticar: um fator por eixo, sem corte e sem barra (distorce)", () => {
    const l = wallpaperLayout("stretch", 800, 600, 1000, 700);
    expect(l.scaleX).toBe(1.25);
    expect(l.scaleY).toBeCloseTo(700 / 600, 10);
    expect(l.scaleX).not.toBeCloseTo(l.scaleY, 3); // é justamente a distorção
    expect(l.overflowX + l.overflowY + l.barX + l.barY).toBe(0);
  });
  it("centralizar: 1:1, o que sobra do viewport vira barra", () => {
    const l = wallpaperLayout("center", 800, 600, 1000, 700);
    expect([l.scaleX, l.scaleY]).toEqual([1, 1]);
    expect(l.barX).toBe(200);
    expect(l.barY).toBe(100);
  });
  it("centralizar imagem maior que a tela: 1:1 e corta (não encolhe)", () => {
    const l = wallpaperLayout("center", 1600, 1200, 1000, 700);
    expect(l.scaleX).toBe(1);
    expect(l.overflowX).toBe(600);
    expect(l.overflowY).toBe(500);
  });
  it("lado a lado: 1:1 com repetição (as barras são preenchidas por cópias)", () => {
    const l = wallpaperLayout("tile", 400, 300, 1000, 700);
    expect(l.repeat).toBe(true);
    expect([l.scaleX, l.scaleY]).toEqual([1, 1]);
    expect(l.barX).toBe(600);
    expect(wallpaperLayout("cover", 400, 300, 1000, 700).repeat).toBe(false);
  });
  it("view mais 'alta' que a imagem inverte quem manda no eixo", () => {
    // Imagem 4:3 numa view 1:2 — agora é o eixo Y que domina o preencher.
    const l = wallpaperLayout("cover", 800, 600, 500, 1000);
    expect(l.scaleX).toBeCloseTo(1000 / 600, 10);
    expect(l.overflowY).toBe(0);
    expect(l.overflowX).toBeCloseTo(800 * (1000 / 600) - 500, 8);
  });
  it("sem medida (bitmap ou viewport zerado) vira identidade", () => {
    const cases: [number, number, number, number][] = [
      [0, 600, 1000, 700],
      [800, 0, 1000, 700],
      [800, 600, 0, 700],
      [800, 600, 1000, 0],
    ];
    for (const [iw, ih, vw, vh] of cases) {
      const l = wallpaperLayout("cover", iw, ih, vw, vh);
      expect([l.scaleX, l.scaleY, l.overflowX, l.barX]).toEqual([1, 1, 0, 0]);
    }
  });
  it("nenhum modo produz corte E barra no mesmo eixo", () => {
    for (const fit of WALLPAPER_FITS) {
      if (fit === "free") continue;
      const l = wallpaperLayout(fit, 800, 600, 1000, 700);
      expect(l.overflowX * l.barX).toBe(0);
      expect(l.overflowY * l.barY).toBe(0);
    }
  });
});

describe("stepIndex", () => {
  it("navega circular", () => {
    expect(stepIndex(0, -1, 5)).toBe(4);
    expect(stepIndex(4, 1, 5)).toBe(0);
    expect(stepIndex(2, 1, 5)).toBe(3);
    expect(stepIndex(0, 1, 0)).toBe(0);
  });
});

describe("nextZoom", () => {
  it("sobe e desce a escada", () => {
    expect(nextZoom(1, 1)).toBe(1.5);
    expect(nextZoom(1, -1)).toBe(0.75);
    expect(nextZoom(0.6, 1)).toBe(0.75);
    expect(nextZoom(ZOOM_STEPS[ZOOM_STEPS.length - 1], 1)).toBe(
      ZOOM_STEPS[ZOOM_STEPS.length - 1],
    );
    expect(nextZoom(ZOOM_STEPS[0], -1)).toBe(ZOOM_STEPS[0]);
  });
});
