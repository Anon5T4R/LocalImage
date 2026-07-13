// Estado central: modo (início/visualizador/editor), pasta em navegação,
// capturas e configurações (localStorage — o app não tem banco).

import { create } from "zustand";
import * as be from "../lib/backend";
import { dirName, isMediaPath, type CaptureEntry, type Settings } from "../lib/types";
import { useUi } from "./ui";

const SETTINGS_KEY = "localimage-settings";

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { theme: "light", shortcut: "", hideSelf: true, ...JSON.parse(raw) };
  } catch {
    /* defaults */
  }
  const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  return { theme: dark ? "dark" : "light", shortcut: "", hideSelf: true };
}

export type Mode = "home" | "viewer" | "editor";

interface Store {
  mode: Mode;
  runtimeReady: boolean;
  files: string[];
  index: number;
  /** Imagem aberta no editor (caminho absoluto). */
  editorPath: string;
  captures: CaptureEntry[];
  settings: Settings;

  init(): Promise<void>;
  setSettings(patch: Partial<Settings>): void;
  openPath(path: string): Promise<void>;
  goHome(): void;
  step(delta: number): void;
  setIndex(i: number): void;
  deleteCurrent(): Promise<void>;
  openEditor(path: string): void;
  closeEditor(): void;
  refreshCaptures(): Promise<void>;
  captureScreen(): Promise<void>;
  captureWindowId(id: number): Promise<void>;
  deleteCapture(path: string): Promise<void>;
}

export const useStore = create<Store>((set, get) => ({
  mode: "home",
  runtimeReady: false,
  files: [],
  index: 0,
  editorPath: "",
  captures: [],
  settings: loadSettings(),

  async init() {
    if (!be.inTauri()) {
      set({ runtimeReady: true });
      return;
    }
    await get().refreshCaptures();
    // Atalho global salvo (melhor esforço — pode estar em uso por outro app).
    const accel = get().settings.shortcut;
    if (accel) {
      be.shortcutSet(accel).catch((e) => useUi.getState().toast("error", String(e)));
    }
    // "Abrir com": imagem passada no launch.
    try {
      const startup = await be.getStartupFile();
      if (startup && isMediaPath(startup)) await get().openPath(startup);
    } catch {
      /* ignore */
    }
    set({ runtimeReady: true });
  },

  setSettings(patch) {
    const settings = { ...get().settings, ...patch };
    set({ settings });
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    if ("shortcut" in patch) {
      be.shortcutSet(settings.shortcut).catch((e) =>
        useUi.getState().toast("error", String(e)),
      );
    }
  },

  /** Abre um arquivo (navegação = a pasta dele) ou uma pasta (1ª imagem). */
  async openPath(path) {
    const toast = useUi.getState().toast;
    try {
      const isFile = isMediaPath(path);
      const dir = isFile ? dirName(path) : path;
      const files = await be.listDir(dir);
      if (files.length === 0) {
        toast("error", "Nenhuma imagem nesta pasta.");
        return;
      }
      const index = isFile
        ? Math.max(
            0,
            files.findIndex((f) => f.replace(/\\/g, "/") === path.replace(/\\/g, "/")),
          )
        : 0;
      set({ mode: "viewer", files, index });
    } catch (e) {
      toast("error", String(e));
    }
  },

  goHome() {
    set({ mode: "home", editorPath: "" });
    void get().refreshCaptures();
  },

  step(delta) {
    const { files, index } = get();
    if (files.length === 0) return;
    set({ index: (((index + delta) % files.length) + files.length) % files.length });
  },

  setIndex(i) {
    set({ index: i });
  },

  async deleteCurrent() {
    const { files, index } = get();
    const path = files[index];
    if (!path) return;
    try {
      await be.deleteToTrash(path);
      const rest = files.filter((_, i) => i !== index);
      if (rest.length === 0) set({ mode: "home", files: [], index: 0 });
      else set({ files: rest, index: Math.min(index, rest.length - 1) });
      useUi.getState().toast("success", "Enviado pra lixeira.");
    } catch (e) {
      useUi.getState().toast("error", String(e));
    }
  },

  openEditor(path) {
    set({ mode: "editor", editorPath: path });
  },

  closeEditor() {
    const { files } = get();
    set({ mode: files.length > 0 ? "viewer" : "home", editorPath: "" });
  },

  async refreshCaptures() {
    try {
      set({ captures: await be.capturesList() });
    } catch {
      /* fora do Tauri */
    }
  },

  /** Captura a tela primária (ou a única) e abre no anotador. */
  async captureScreen() {
    const toast = useUi.getState().toast;
    try {
      const monitors = await be.monitorsList();
      const target = monitors.find((m) => m.primary) ?? monitors[0];
      if (!target) {
        toast("error", "Nenhuma tela encontrada.");
        return;
      }
      const path = await be.captureMonitor(target.id, get().settings.hideSelf);
      await get().refreshCaptures();
      get().openEditor(path);
    } catch (e) {
      toast("error", String(e));
    }
  },

  async captureWindowId(id) {
    const toast = useUi.getState().toast;
    try {
      const path = await be.captureWindow(id);
      await get().refreshCaptures();
      get().openEditor(path);
    } catch (e) {
      toast("error", String(e));
    }
  },

  async deleteCapture(path) {
    try {
      await be.deleteToTrash(path);
      await get().refreshCaptures();
    } catch (e) {
      useUi.getState().toast("error", String(e));
    }
  },
}));
