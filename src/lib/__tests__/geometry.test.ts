import { describe, expect, it } from "vitest";
import { clampRect, fitScale, nextZoom, normRect, stepIndex, ZOOM_STEPS } from "../geometry";

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
