// Lote: converter/redimensionar N imagens de uma vez (PNG/JPG via Rust),
// saída ao lado de cada original com sufixo e unique_path.

import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import * as be from "../lib/backend";
import { t } from "../lib/i18n";
import { dirName, fileName, IMAGE_EXTENSIONS } from "../lib/types";
import { useUi } from "../state/ui";

const WIDTHS = [0, 3840, 1920, 1280, 800, 480];

export default function BatchModal() {
  const openState = useUi((s) => s.batchOpen);
  const setOpen = useUi((s) => s.setBatchOpen);
  const toast = useUi((s) => s.toast);
  const [files, setFiles] = useState<string[]>([]);
  const [format, setFormat] = useState<"png" | "jpeg">("jpeg");
  const [quality, setQuality] = useState(85);
  const [maxWidth, setMaxWidth] = useState(1920);
  const [progress, setProgress] = useState(-1);

  if (!openState) return null;

  async function pick() {
    const picked = await open({
      multiple: true,
      title: t("batch.pickTitle"),
      filters: [{ name: t("common.imagesFilter"), extensions: IMAGE_EXTENSIONS }],
    }).catch(() => null);
    if (!picked) return;
    setFiles(Array.isArray(picked) ? picked : [picked]);
  }

  async function run() {
    if (files.length === 0) return;
    const ext = format === "jpeg" ? "jpg" : "png";
    const sep = navigator.userAgent.includes("Windows") ? "\\" : "/";
    let ok = 0;
    setProgress(0);
    for (let i = 0; i < files.length; i++) {
      setProgress(i);
      const f = files[i];
      try {
        const stem = fileName(f).replace(/\.[^.]+$/, "");
        const out = await be.uniquePath(`${dirName(f)}${sep}${stem} - convertida.${ext}`);
        await be.convertImage(f, out, format, quality, maxWidth);
        ok++;
      } catch (e) {
        toast("error", `${fileName(f)}: ${e}`);
      }
    }
    setProgress(-1);
    toast("success", t("batch.done", { ok, total: files.length }));
    setOpen(false);
    setFiles([]);
  }

  return (
    <div className="modal-backdrop" onClick={() => progress < 0 && setOpen(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{t("batch.title")}</h2>
          <button className="icon-btn" onClick={() => setOpen(false)}>
            ✕
          </button>
        </div>
        <div className="form-grid">
          <label>{t("batch.files")}</label>
          <div className="form-inline">
            <button className="btn small" onClick={() => void pick()}>
              {t("batch.choose")}
            </button>
            <span className="card-hint" style={{ margin: 0 }}>
              {files.length === 0 ? t("batch.noneChosen") : t("batch.imageCount", { n: files.length })}
            </span>
          </div>

          <label>{t("convert.format")}</label>
          <select value={format} onChange={(e) => setFormat(e.target.value as "png" | "jpeg")}>
            <option value="jpeg">JPG</option>
            <option value="png">PNG</option>
          </select>

          {format === "jpeg" && (
            <>
              <label>{t("convert.quality")}</label>
              <div className="crf-row">
                <input
                  type="range"
                  min={40}
                  max={100}
                  value={quality}
                  onChange={(e) => setQuality(Number(e.target.value))}
                />
                <b className="crf-value">{quality}</b>
              </div>
            </>
          )}

          <label>{t("convert.maxWidth")}</label>
          <select value={maxWidth} onChange={(e) => setMaxWidth(Number(e.target.value))}>
            {WIDTHS.map((w) => (
              <option key={w} value={w}>
                {w === 0 ? t("convert.original") : `${w}px`}
              </option>
            ))}
          </select>
        </div>
        {progress >= 0 && (
          <div className="progress" style={{ marginTop: 12 }}>
            <div
              className="progress-fill"
              style={{ width: `${Math.round((progress / Math.max(1, files.length)) * 100)}%` }}
            />
          </div>
        )}
        <div className="tab-foot">
          <button
            className="btn primary"
            disabled={files.length === 0 || progress >= 0}
            onClick={() => void run()}
          >
            {progress >= 0
              ? t("batch.converting", { i: progress + 1, total: files.length })
              : t("batch.convertN", { n: files.length || "" })}
          </button>
        </div>
      </div>
    </div>
  );
}
