import { useEffect, useState } from "react";
import * as be from "../lib/backend";
import { t } from "../lib/i18n";
import type { WindowInfo } from "../lib/types";
import { useStore } from "../state/store";
import { useUi } from "../state/ui";

export default function WindowPickModal() {
  const openState = useUi((s) => s.windowPickOpen);
  const setOpen = useUi((s) => s.setWindowPickOpen);
  const toast = useUi((s) => s.toast);
  const captureWindowId = useStore((s) => s.captureWindowId);
  const [windows, setWindows] = useState<WindowInfo[]>([]);

  useEffect(() => {
    if (!openState) return;
    be.windowsList()
      .then(setWindows)
      .catch((e) => toast("error", String(e)));
  }, [openState, toast]);

  if (!openState) return null;

  return (
    <div className="modal-backdrop" onClick={() => setOpen(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{t("wpick.title")}</h2>
          <button className="icon-btn" onClick={() => setOpen(false)}>
            ✕
          </button>
        </div>
        {windows.length === 0 ? (
          <p className="card-hint">{t("wpick.empty")}</p>
        ) : (
          <div className="window-list">
            {windows.map((w) => (
              <button
                key={w.id}
                className="window-item"
                onClick={() => {
                  setOpen(false);
                  void captureWindowId(w.id);
                }}
              >
                <span className="window-title">{w.title}</span>
                {w.app && <span className="chip">{w.app}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
