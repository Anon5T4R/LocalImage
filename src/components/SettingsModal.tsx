import { useState } from "react";
import { useStore } from "../state/store";
import { useUi } from "../state/ui";

const SHORTCUTS = ["", "Ctrl+Shift+S", "Ctrl+Shift+P", "Ctrl+Alt+S", "F9"];

export default function SettingsModal() {
  const openState = useUi((s) => s.settingsOpen);
  const setOpen = useUi((s) => s.setSettingsOpen);
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const [custom, setCustom] = useState("");

  if (!openState) return null;

  return (
    <div className="modal-backdrop" onClick={() => setOpen(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Configurações</h2>
          <button className="icon-btn" onClick={() => setOpen(false)}>
            ✕
          </button>
        </div>
        <div className="form-grid">
          <label>Tema</label>
          <select
            value={settings.theme}
            onChange={(e) => setSettings({ theme: e.target.value as "light" | "dark" })}
          >
            <option value="light">Claro</option>
            <option value="dark">Escuro</option>
          </select>

          <label>Atalho global de captura</label>
          <div className="form-inline">
            <select
              value={SHORTCUTS.includes(settings.shortcut) ? settings.shortcut : "custom"}
              onChange={(e) => {
                const v = e.target.value;
                if (v !== "custom") setSettings({ shortcut: v });
              }}
            >
              <option value="">Desligado</option>
              {SHORTCUTS.filter(Boolean).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              <option value="custom">Personalizado…</option>
            </select>
            {!SHORTCUTS.includes(settings.shortcut) && (
              <span className="chip">{settings.shortcut}</span>
            )}
          </div>

          <label>Atalho personalizado</label>
          <div className="form-inline">
            <input
              placeholder="ex.: Ctrl+Shift+X"
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
              Aplicar
            </button>
          </div>

          <label>Esconder o app na captura</label>
          <div className="form-inline">
            <input
              type="checkbox"
              checked={settings.hideSelf}
              onChange={(e) => setSettings({ hideSelf: e.target.checked })}
            />
            <span className="card-hint" style={{ margin: 0 }}>
              a janela do LocalImage some antes do clique da captura de tela
            </span>
          </div>
        </div>
        <p className="card-hint" style={{ marginTop: 10 }}>
          O atalho global é opt-in de propósito — desligado, o app não registra nada no sistema.
        </p>
      </div>
    </div>
  );
}
