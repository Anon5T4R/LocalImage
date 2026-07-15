import { useEffect, useState } from "react";
import { LOCALE_LABELS, type Locale, setLocale, t, useLocale } from "../lib/i18n";
import { useStore } from "../state/store";
import { useUi } from "../state/ui";

const SHORTCUTS = ["", "Ctrl+Shift+S", "Ctrl+Shift+P", "Ctrl+Alt+S", "F9"];
const LOCALES: Locale[] = ["pt", "en", "es"];

/** Traduz uma tecla pressionada no acelerador que o Tauri entende
 *  (ex.: Ctrl+Shift+X). Retorna null pra combinação inválida como atalho global. */
function formatAccel(e: KeyboardEvent): string | null {
  const key = e.key;
  if (["Control", "Alt", "Shift", "Meta", "OS", "Dead"].includes(key)) return null;
  const mods: string[] = [];
  if (e.ctrlKey) mods.push("Ctrl");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  if (e.metaKey) mods.push("Super");
  const named: Record<string, string> = {
    " ": "Space",
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
    "+": "Plus",
    "-": "Minus",
  };
  const main = named[key] ?? (key.length === 1 ? key.toUpperCase() : key);
  // Tecla comum precisa de modificador; F1–F24 podem ir sozinhas.
  if (mods.length === 0 && !/^F\d{1,2}$/.test(main)) return null;
  return [...mods, main].join("+");
}

export default function SettingsModal() {
  const openState = useUi((s) => s.settingsOpen);
  const setOpen = useUi((s) => s.setSettingsOpen);
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const locale = useLocale();
  const [custom, setCustom] = useState("");
  const [recording, setRecording] = useState(false);

  // Enquanto grava, a próxima combinação vira o atalho.
  useEffect(() => {
    if (!recording) return;
    function onKey(e: KeyboardEvent) {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape" && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
        setRecording(false);
        return;
      }
      const accel = formatAccel(e);
      if (accel) {
        setSettings({ shortcut: accel });
        setRecording(false);
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recording, setSettings]);

  if (!openState) return null;

  return (
    <div className="modal-backdrop" onClick={() => setOpen(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{t("settings.title")}</h2>
          <button className="icon-btn" onClick={() => setOpen(false)}>
            ✕
          </button>
        </div>
        <div className="form-grid">
          <label>{t("settings.language")}</label>
          <select value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
            {LOCALES.map((l) => (
              <option key={l} value={l}>
                {LOCALE_LABELS[l]}
              </option>
            ))}
          </select>

          <label>{t("settings.theme")}</label>
          <select
            value={settings.theme}
            onChange={(e) => setSettings({ theme: e.target.value as "light" | "dark" })}
          >
            <option value="light">{t("settings.themeLight")}</option>
            <option value="dark">{t("settings.themeDark")}</option>
          </select>

          <label>{t("settings.shortcutLabel")}</label>
          <div className="form-inline">
            <button
              className={`btn small ${recording ? "primary" : ""}`}
              onClick={() => setRecording((r) => !r)}
            >
              {recording ? t("settings.pressKeys") : `🎬 ${t("settings.recordShortcut")}`}
            </button>
            {settings.shortcut ? (
              <>
                <span className="chip">{settings.shortcut}</span>
                <button className="btn small" onClick={() => setSettings({ shortcut: "" })}>
                  {t("settings.turnOff")}
                </button>
              </>
            ) : (
              <span className="card-hint" style={{ margin: 0 }}>
                {t("settings.off")}
              </span>
            )}
          </div>

          <label>{t("settings.orPreset")}</label>
          <div className="form-inline">
            <select
              value={SHORTCUTS.includes(settings.shortcut) ? settings.shortcut : "custom"}
              onChange={(e) => {
                const v = e.target.value;
                if (v !== "custom") setSettings({ shortcut: v });
              }}
            >
              <option value="">{t("settings.disabled")}</option>
              {SHORTCUTS.filter(Boolean).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              <option value="custom">{t("settings.custom")}</option>
            </select>
          </div>

          <label>{t("settings.orType")}</label>
          <div className="form-inline">
            <input
              placeholder={t("settings.shortcutPlaceholder")}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
            />
            <button
              className="btn small"
              disabled={!custom.trim()}
              onClick={() => {
                setSettings({ shortcut: custom.trim() });
                setCustom("");
              }}
            >
              {t("settings.apply")}
            </button>
          </div>

          <label>{t("settings.hideSelfLabel")}</label>
          <div className="form-inline">
            <input
              type="checkbox"
              checked={settings.hideSelf}
              onChange={(e) => setSettings({ hideSelf: e.target.checked })}
            />
            <span className="card-hint" style={{ margin: 0 }}>
              {t("settings.hideSelfHint")}
            </span>
          </div>

          <label>{t("settings.autostartLabel")}</label>
          <div className="form-inline">
            <input
              type="checkbox"
              checked={settings.autostart}
              onChange={(e) => setSettings({ autostart: e.target.checked })}
            />
            <span className="card-hint" style={{ margin: 0 }}>
              {t("settings.autostartHint")}
            </span>
          </div>
        </div>

        <p className="card-hint" style={{ marginTop: 10 }}>
          {t("settings.help1a")} <b>{t("settings.trayExit")}</b> {t("settings.help1b")}
        </p>
        <p className="card-hint" style={{ marginTop: 10 }}>
          {t("settings.help2a")} <b>{t("settings.recordShortcut")}</b> {t("settings.help2b")}{" "}
          <code>{t("settings.help2ModKey")}</code> {t("settings.help2c")}{" "}
          <code>Ctrl+Alt+S</code> {t("common.or")} <code>F9</code>
          {t("settings.help2d")}
        </p>
      </div>
    </div>
  );
}
