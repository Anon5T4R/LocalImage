import { useEffect, useState } from "react";
import { useStore } from "../state/store";
import { useUi } from "../state/ui";

const SHORTCUTS = ["", "Ctrl+Shift+S", "Ctrl+Shift+P", "Ctrl+Alt+S", "F9"];

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
            <button
              className={`btn small ${recording ? "primary" : ""}`}
              onClick={() => setRecording((r) => !r)}
            >
              {recording ? "Pressione as teclas…" : "🎬 Gravar atalho"}
            </button>
            {settings.shortcut ? (
              <>
                <span className="chip">{settings.shortcut}</span>
                <button className="btn small" onClick={() => setSettings({ shortcut: "" })}>
                  Desligar
                </button>
              </>
            ) : (
              <span className="card-hint" style={{ margin: 0 }}>
                desligado
              </span>
            )}
          </div>

          <label>Ou escolha um pronto</label>
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
          </div>

          <label>Ou digite/cole</label>
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

          <label>Iniciar com o sistema</label>
          <div className="form-inline">
            <input
              type="checkbox"
              checked={settings.autostart}
              onChange={(e) => setSettings({ autostart: e.target.checked })}
            />
            <span className="card-hint" style={{ margin: 0 }}>
              abre junto com o login, oculto na bandeja — o atalho já fica valendo
            </span>
          </div>
        </div>

        <p className="card-hint" style={{ marginTop: 10 }}>
          Fechar a janela (X) manda o app pra bandeja pro atalho continuar funcionando; para
          encerrar de vez, use <b>Sair</b> no ícone da bandeja.
        </p>
        <p className="card-hint" style={{ marginTop: 10 }}>
          O mais fácil é <b>Gravar atalho</b> e apertar a combinação (ex.: Ctrl+Shift+X); Esc
          cancela a gravação. Se preferir digitar, o formato é <code>Modificador+Tecla</code>
          {" "}(Ctrl, Alt, Shift, Super) — ex.: <code>Ctrl+Alt+S</code> ou <code>F9</code>. O
          atalho global é opt-in de propósito — desligado, o app não registra nada no sistema.
        </p>
      </div>
    </div>
  );
}
