import { create } from "zustand";

export interface Toast {
  id: number;
  kind: "info" | "error" | "success";
  text: string;
}

interface UiState {
  toasts: Toast[];
  convertOpen: boolean;
  batchOpen: boolean;
  settingsOpen: boolean;
  windowPickOpen: boolean;
  /** Modal de OCR ("Copiar texto da imagem"). */
  ocrOpen: boolean;
  /** Modo imersivo do visualizador: só a imagem, interface escondida. */
  immersive: boolean;

  toast(kind: Toast["kind"], text: string): void;
  dismissToast(id: number): void;
  setConvertOpen(open: boolean): void;
  setBatchOpen(open: boolean): void;
  setSettingsOpen(open: boolean): void;
  setWindowPickOpen(open: boolean): void;
  setOcrOpen(open: boolean): void;
  setImmersive(on: boolean): void;
}

let nextToast = 1;

export const useUi = create<UiState>((set) => ({
  toasts: [],
  convertOpen: false,
  batchOpen: false,
  settingsOpen: false,
  windowPickOpen: false,
  ocrOpen: false,
  immersive: false,

  toast(kind, text) {
    const id = nextToast++;
    set((s) => ({ toasts: [...s.toasts, { id, kind, text }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 6000);
  },
  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
  setConvertOpen(open) {
    set({ convertOpen: open });
  },
  setBatchOpen(open) {
    set({ batchOpen: open });
  },
  setSettingsOpen(open) {
    set({ settingsOpen: open });
  },
  setWindowPickOpen(open) {
    set({ windowPickOpen: open });
  },
  setOcrOpen(open) {
    set({ ocrOpen: open });
  },
  setImmersive(on) {
    set({ immersive: on });
  },
}));
