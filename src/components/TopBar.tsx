import { t } from "../lib/i18n";
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
      <button className="brand" onClick={goHome} title={t("topbar.home")}>
        <span className="brand-mark">🖼</span>
        <span className="brand-name">LocalImage</span>
      </button>
      <div className="topbar-actions">
        <button className="btn" onClick={() => void captureScreen()}>
          ⛶ {t("topbar.capture")}
        </button>
        <button
          className="icon-btn"
          onClick={() => setSettings({ theme: settings.theme === "dark" ? "light" : "dark" })}
          title={settings.theme === "dark" ? t("topbar.themeLight") : t("topbar.themeDark")}
        >
          {settings.theme === "dark" ? "☀" : "🌙"}
        </button>
        <button className="icon-btn" onClick={() => setSettingsOpen(true)} title={t("topbar.settings")}>
          ⚙
        </button>
      </div>
    </header>
  );
}
