/** Geometria pura do visualizador/editor (unit-testada). */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Escala pra caber (nunca amplia além de 1 — "ajustar" clássico). */
export function fitScale(iw: number, ih: number, vw: number, vh: number): number {
  if (iw <= 0 || ih <= 0 || vw <= 0 || vh <= 0) return 1;
  return Math.min(vw / iw, vh / ih, 1);
}

/** Normaliza dois cantos pra um Rect com w/h positivos. */
export function normRect(x1: number, y1: number, x2: number, y2: number): Rect {
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    w: Math.abs(x2 - x1),
    h: Math.abs(y2 - y1),
  };
}

/** Limita um Rect aos limites da imagem. */
export function clampRect(r: Rect, w: number, h: number): Rect {
  const x = Math.max(0, Math.min(r.x, w));
  const y = Math.max(0, Math.min(r.y, h));
  return {
    x,
    y,
    w: Math.max(0, Math.min(r.w, w - x)),
    h: Math.max(0, Math.min(r.h, h - y)),
  };
}

/** Índice circular da navegação ←/→. */
export function stepIndex(index: number, delta: number, length: number): number {
  if (length <= 0) return 0;
  return (((index + delta) % length) + length) % length;
}

/** Próximo zoom numa escada de passos (`dir` +1/-1). */
export const ZOOM_STEPS = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8];

export function nextZoom(current: number, dir: 1 | -1): number {
  if (dir > 0) {
    for (const z of ZOOM_STEPS) if (z > current + 0.001) return z;
    return ZOOM_STEPS[ZOOM_STEPS.length - 1];
  }
  for (let i = ZOOM_STEPS.length - 1; i >= 0; i--) {
    if (ZOOM_STEPS[i] < current - 0.001) return ZOOM_STEPS[i];
  }
  return ZOOM_STEPS[0];
}
