// Estado central: modo (início/visualizador/editor), pasta em navegação,
// capturas e configurações (localStorage — o app não tem banco).

import { create } from "zustand";
import * as be from "../lib/backend";
import { t } from "../lib/i18n";
import { dirName, isMediaPath, type CaptureEntry, type Settings } from "../lib/types";
import { useUi } from "./ui";

const SETTINGS_KEY = "localimage-settings";

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw)
      return {
        theme: "light",
        shortcut: "",
        hideSelf: true,
        autostart: false,
        wallpaperFit: "cover",
        ...JSON.parse(raw),
      };
  } catch {
    /* defaults */
  }
  const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  return {
    theme: dark ? "dark" : "light",
    shortcut: "",
    hideSelf: true,
    autostart: false,
    wallpaperFit: "cover",
  };
}

/**
 * A intenção guardada pro "iniciar com o sistema", ou `null` se o usuário nunca
 * decidiu (instalação anterior à opção, ou storage limpo) — aí herdamos o que o
 * SO já tem em vez de ligar/desligar por conta própria.
 */
function storedAutostart(): boolean | null {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const v = raw ? JSON.parse(raw).autostart : undefined;
    return typeof v === "boolean" ? v : null;
  } catch {
    return null;
  }
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
    // "Iniciar com o sistema": a intenção mora AQUI, o registro do Windows é só
    // o efeito — e um efeito que se perde sozinho (entrada apagada por um
    // instalador, ou apontando pro exe antigo depois de uma mudança de lugar).
    // Reimpor a cada boot é o que conserta isso: antes, o app simplesmente
    // parava de subir no logon, calado, com a checkbox marcada.
    try {
      const os = await be.autostartOsState();
      const stored = storedAutostart();
      let want = stored ?? os === "ok";
      // O Gerenciador de Tarefas vence a checkbox: o usuário desligou na UI
      // oficial do SO, então a intenção passa a ser essa — senão reimporíamos
      // todo boot, brigando com ele.
      if (want && os === "user-disabled") want = false;
      if (want !== get().settings.autostart) {
        const settings = { ...get().settings, autostart: want };
        set({ settings });
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      }
      if ((want && os === "broken") || (!want && os === "ok")) {
        await be.autostartSet(want);
      }
    } catch {
      /* ignore */
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
    if ("autostart" in patch) {
      be.autostartSet(settings.autostart).catch((e) =>
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
        toast("error", t("store.noImages"));
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
      useUi.getState().toast("success", t("store.trashed"));
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
        toast("error", t("store.noScreen"));
        return;
      }
      const path = await be.captureMonitor(target.id, get().settings.hideSelf);
      await get().refreshCaptures();
      get().openEditor(path);
      await be.showMainWindow(); // pode ter vindo do atalho com o app na bandeja
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
      await be.showMainWindow();
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
