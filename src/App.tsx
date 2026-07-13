import { useEffect, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { listen } from "@tauri-apps/api/event";
import BatchModal from "./components/BatchModal";
import ConvertModal from "./components/ConvertModal";
import EditorView from "./components/EditorView";
import HomeView from "./components/HomeView";
import SettingsModal from "./components/SettingsModal";
import Toasts from "./components/Toasts";
import TopBar from "./components/TopBar";
import ViewerView from "./components/ViewerView";
import WindowPickModal from "./components/WindowPickModal";
import { inTauri } from "./lib/backend";
import { isMediaPath } from "./lib/types";
import { useStore } from "./state/store";
import { useUi } from "./state/ui";

export default function App() {
  const init = useStore((s) => s.init);
  const mode = useStore((s) => s.mode);
  const theme = useStore((s) => s.settings.theme);
  const openPath = useStore((s) => s.openPath);
  const captureScreen = useStore((s) => s.captureScreen);
  const toast = useUi((s) => s.toast);
  const immersive = useUi((s) => s.immersive);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // Arrastar imagem/pasta pra janela + "abrir com" numa 2ª instância +
  // atalho global de captura.
  useEffect(() => {
    if (!inTauri()) return;
    const unlisteners: (() => void)[] = [];
    void getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type === "over") return;
        if (event.payload.type === "enter") setDragging(true);
        else if (event.payload.type === "leave") setDragging(false);
        else if (event.payload.type === "drop") {
          setDragging(false);
          const paths = event.payload.paths ?? [];
          const media = paths.find((p) => isMediaPath(p));
          const any = paths[0];
          if (media) void openPath(media);
          else if (any) void openPath(any); // pode ser uma pasta
          else toast("error", "Nada reconhecido nos itens soltos.");
        }
      })
      .then((fn) => unlisteners.push(fn));
    void listen<string>("open-file", (e) => {
      if (isMediaPath(e.payload)) void openPath(e.payload);
    }).then((fn) => unlisteners.push(fn));
    void listen("capture-shortcut", () => {
      void captureScreen();
    }).then((fn) => unlisteners.push(fn));
    return () => {
      unlisteners.forEach((fn) => fn());
    };
  }, [openPath, captureScreen, toast]);

  return (
    <div className="app">
      {mode !== "editor" && !immersive && <TopBar />}
      <main className="main">
        {mode === "home" && <HomeView />}
        {mode === "viewer" && <ViewerView />}
        {mode === "editor" && <EditorView />}
      </main>
      {dragging && (
        <div className="drop-overlay">
          <div className="drop-overlay-inner">Solte a imagem aqui</div>
        </div>
      )}
      <ConvertModal />
      <BatchModal />
      <SettingsModal />
      <WindowPickModal />
      <Toasts />
    </div>
  );
}
