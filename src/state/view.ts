// Transformação de visualização do Viewer (zoom/rotação/pan) num store único:
// TODA escrita converge pro commit(), que re-clampa o pan contra o viewport e o
// bitmap correntes. O bug da v0.8.0 nasceu de clamp espalhado nos handlers:
// resize (sair de fullscreen/imersivo, restaurar a janela) não re-clampava —
// pan legal na view grande vira imagem 100% fora na pequena — e sem bitmap
// medido o clamp devolvia o pan CRU (drag antes do decode, ←/→ no meio do
// drag). Sem medida, o pan agora trava no centro em vez de correr solto.

import { create } from "zustand";
import { clampPan, fitScale } from "../lib/geometry";

export interface Dims {
  w: number;
  h: number;
}

/** Respiro visual do modo "ajustar" (px descontados do viewport). */
export const FIT_PAD = 24;

export interface ViewState {
  zoom: number; // 0 = ajustar
  rotation: number; // múltiplos de 90 — só visualização
  pan: { x: number; y: number }; // px de tela; imagem centrada no viewport + pan
  view: Dims; // viewport medido (ResizeObserver)
  img: Dims; // bitmap natural (sem rotação/zoom), medido no onLoad
}

interface ViewStore extends ViewState {
  /** Nova imagem: transform zera; o bitmap será medido de novo no onLoad. */
  reset(): void;
  setImgSize(w: number, h: number): void;
  setViewSize(w: number, h: number): void;
  panTo(x: number, y: number): void;
  /** nz ≤ 0 = ajustar (re-centra). Âncora em px relativos ao centro do viewport. */
  zoomTo(nz: number, anchor?: { ax: number; ay: number }): void;
  rotateCw(): void;
}

/** Dimensões efetivas do bitmap (rotação de 90/270 troca w/h). */
function rotated(s: Pick<ViewState, "rotation" | "img">): Dims {
  const swap = s.rotation % 180 !== 0;
  return swap ? { w: s.img.h, h: s.img.w } : { w: s.img.w, h: s.img.h };
}

/** Zoom efetivo: o explícito, ou o fit corrente (1 enquanto não há medidas). */
export function effectiveZoom(
  s: Pick<ViewState, "zoom" | "rotation" | "img" | "view">,
): number {
  if (s.zoom > 0) return s.zoom;
  const d = rotated(s);
  if (d.w <= 0 || s.view.w <= 0) return 1;
  return fitScale(d.w, d.h, s.view.w - FIT_PAD, s.view.h - FIT_PAD);
}

export const useView = create<ViewStore>((set, get) => {
  /** Único ponto de escrita: aplica o patch e re-clampa o pan no estado resultante. */
  function commit(patch: Partial<ViewState>, pan?: { x: number; y: number }) {
    const next = { ...get(), ...patch };
    const p = pan ?? next.pan;
    const z = effectiveZoom(next);
    const d = rotated(next);
    // Sem medida (bitmap não decodificado, viewport 0) não existe clamp possível —
    // aceitar o valor cego era o escape da v0.8.0; o centro é o único pan seguro.
    const clamped =
      d.w > 0 && next.view.w > 0
        ? clampPan(p, d.w * z, d.h * z, next.view.w, next.view.h)
        : { x: 0, y: 0 };
    set({ ...patch, pan: clamped });
  }

  return {
    zoom: 0,
    rotation: 0,
    pan: { x: 0, y: 0 },
    view: { w: 0, h: 0 },
    img: { w: 0, h: 0 },

    reset: () => commit({ zoom: 0, rotation: 0, img: { w: 0, h: 0 } }, { x: 0, y: 0 }),
    setImgSize: (w, h) => commit({ img: { w, h } }),
    setViewSize: (w, h) => commit({ view: { w, h } }),
    panTo: (x, y) => commit({}, { x, y }),
    rotateCw: () => commit({ rotation: (get().rotation + 90) % 360 }),

    zoomTo: (nz, anchor) => {
      if (nz <= 0) {
        commit({ zoom: 0 }, { x: 0, y: 0 });
        return;
      }
      const s = get();
      const k = nz / (effectiveZoom(s) || 1);
      const ax = anchor?.ax ?? 0;
      const ay = anchor?.ay ?? 0;
      // Mantém o ponto sob a âncora parado: p' = a − (a − p)·k.
      commit({ zoom: nz }, { x: ax - (ax - s.pan.x) * k, y: ay - (ay - s.pan.y) * k });
    },
  };
});
