import { useStore } from "../state/store";
import { useUi } from "../state/ui";

export default function TopBar() {
  const goHome = useStore((s) => s.goHome);
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const captureScreen = useStore((s) => s.captureScreen);
  const setSettingsOpen = useUi((s) => s.setSettingsOpen);

  return (
    <header className="topbar">
      <button className="brand" onClick={goHome} title="Início">
        <span className="brand-mark">🖼</span>
        <span className="brand-name">LocalImage</span>
      </button>
      <div className="topbar-actions">
        <button className="btn" onClick={() => void captureScreen()}>
          ⛶ Capturar
        </button>
        <button
          className="icon-btn"
          onClick={() => setSettings({ theme: settings.theme === "dark" ? "light" : "dark" })}
          title={settings.theme === "dark" ? "Tema claro" : "Tema escuro"}
        >
          {settings.theme === "dark" ? "☀" : "🌙"}
        </button>
        <button className="icon-btn" onClick={() => setSettingsOpen(true)} title="Configurações">
          ⚙
        </button>
      </div>
    </header>
  );
}
