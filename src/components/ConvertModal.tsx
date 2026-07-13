// Converter/redimensionar/comprimir a imagem aberta. WebP lossy sai pelo
// canvas do webview (o crate image só faz WebP lossless); o resto vai pelo
// Rust. Nos dois caminhos o EXIF morre no export.

import { useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import * as be from "../lib/backend";
import { dirName, fileName, fmtBytes } from "../lib/types";
import { useStore } from "../state/store";
import { useUi } from "../state/ui";

const FORMATS = ["png", "jpeg", "webp", "bmp", "tiff", "gif"] as const;
const WIDTHS = [0, 3840, 1920, 1280, 800, 480];

export default function ConvertModal() {
  const open = useUi((s) => s.convertOpen);
  const setOpen = useUi((s) => s.setConvertOpen);
  const toast = useUi((s) => s.toast);
  const files = useStore((s) => s.files);
  const index = useStore((s) => s.index);
  const [format, setFormat] = useState<(typeof FORMATS)[number]>("jpeg");
  const [quality, setQuality] = useState(85);
  const [maxWidth, setMaxWidth] = useState(0);
  const [busy, setBusy] = useState(false);

  const path = files[index] ?? "";
  if (!open || !path) return null;

  const lossy = format === "jpeg" || format === "webp";
  const ext = format === "jpeg" ? "jpg" : format;

  function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  async function run() {
    const stem = fileName(path).replace(/\.[^.]+$/, "");
    const sep = navigator.userAgent.includes("Windows") ? "\\" : "/";
    const out = await save({
      title: "Salvar como",
      defaultPath: `${dirName(path)}${sep}${stem} - convertida.${ext}`,
      filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
    }).catch(() => null);
    if (!out) return;
    setBusy(true);
    try {
      if (format === "webp") {
        // Canvas: único caminho de WebP lossy sem dependência nativa extra.
        const loaded = await be.loadPngBase64(path, maxWidth > 0 ? maxWidth : 0);
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("decodificar"));
          img.src = `data:image/png;base64,${loaded.b64}`;
        });
        const canvas = document.createElement("canvas");
        canvas.width = loaded.width;
        canvas.height = loaded.height;
        canvas.getContext("2d")!.drawImage(img, 0, 0);
        const blob: Blob | null = await new Promise((resolve) =>
          canvas.toBlob(resolve, "image/webp", quality / 100),
        );
        if (!blob) throw new Error("encodar WebP");
        await be.writeFileBase64(out, await blobToBase64(blob));
      } else {
        await be.convertImage(path, out, format, quality, maxWidth);
      }
      const info = await be.imageInfo(out).catch(() => null);
      toast(
        "success",
        `Salvo: ${fileName(out)}${info ? ` (${fmtBytes(info.sizeBytes)})` : ""}`,
      );
      void revealItemInDir(out).catch(() => {});
      setOpen(false);
    } catch (e) {
      toast("error", String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={() => setOpen(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Converter — {fileName(path)}</h2>
          <button className="icon-btn" onClick={() => setOpen(false)}>
            ✕
          </button>
        </div>
        <div className="form-grid">
          <label>Formato</label>
          <select value={format} onChange={(e) => setFormat(e.target.value as typeof format)}>
            {FORMATS.map((f) => (
              <option key={f} value={f}>
                {f.toUpperCase()}
              </option>
            ))}
          </select>

          {lossy && (
            <>
              <label>Qualidade</label>
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

          <label>Largura máxima</label>
          <select value={maxWidth} onChange={(e) => setMaxWidth(Number(e.target.value))}>
            {WIDTHS.map((w) => (
              <option key={w} value={w}>
                {w === 0 ? "Original" : `${w}px`}
              </option>
            ))}
          </select>
        </div>
        <p className="card-hint" style={{ marginTop: 10 }}>
          O export re-encoda a imagem — metadados EXIF (GPS, câmera, data) são removidos.
        </p>
        <div className="tab-foot">
          <button className="btn primary" disabled={busy} onClick={() => void run()}>
            {busy ? "Convertendo…" : "Converter…"}
          </button>
        </div>
      </div>
    </div>
  );
}
