import { describe, expect, it } from "vitest";
import {
  clampPan,
  clampRect,
  fitScale,
  nextZoom,
  normRect,
  stepIndex,
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
