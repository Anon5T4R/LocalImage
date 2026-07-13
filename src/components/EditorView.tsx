// Anotador: seta, caixa, realce, tarja, texto, desenho livre, passos
// numerados e crop estilo captura. As anotações vivem em coordenadas da
// imagem original e "queimam" no export (canvas em resolução nativa —
// filosofia da suíte: raster no webview, Rust só move bytes).

import { useCallback, useEffect, useRef, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import * as be from "../lib/backend";
import { drawAll, isNoop, nextStepNumber, type Annot, type Tool } from "../lib/annot";
import { clampRect, fitScale, normRect, type Rect } from "../lib/geometry";
import { dirName, fileName } from "../lib/types";
import { useStore } from "../state/store";
import { useUi } from "../state/ui";

const COLORS = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "#111827", "#ffffff"];
const TOOLS: [Tool, string, string][] = [
  ["arrow", "↗", "Seta"],
  ["rect", "▭", "Caixa"],
  ["highlight", "▨", "Realce"],
  ["redact", "█", "Tarja"],
  ["pen", "✎", "Desenho livre"],
  ["text", "T", "Texto"],
  ["step", "①", "Passo numerado"],
  ["crop", "⬚", "Recortar"],
];

export default function EditorView() {
  const editorPath = useStore((s) => s.editorPath);
  const closeEditor = useStore((s) => s.closeEditor);
  const toast = useUi((s) => s.toast);

  const [base, setBase] = useState<HTMLImageElement | null>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [annots, setAnnots] = useState<Annot[]>([]);
  const [redo, setRedo] = useState<Annot[]>([]);
  const [tool, setTool] = useState<Tool>("arrow");
  const [color, setColor] = useState(COLORS[0]);
  const [stroke, setStroke] = useState(4);
  const [crop, setCrop] = useState<Rect | null>(null);
  const [pendingText, setPendingText] = useState<{ x: number; y: number } | null>(null);
  const [textValue, setTextValue] = useState("");
  const [saving, setSaving] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const draftRef = useRef<Annot | null>(null);
  const cropDraftRef = useRef<{ x: number; y: number } | null>(null);
  const [, forceRender] = useState(0);

  // Carrega a base via Rust (data: URL — canvas limpo pra toBlob, qualquer formato).
  useEffect(() => {
    let alive = true;
    setBase(null);
    setAnnots([]);
    setRedo([]);
    setCrop(null);
    be.loadPngBase64(editorPath, 6000)
      .then((loaded) => {
        if (!alive) return;
        const img = new Image();
        img.onload = () => {
          if (!alive) return;
          setDims({ w: loaded.width, h: loaded.height });
          setBase(img);
        };
        img.src = `data:image/png;base64,${loaded.b64}`;
      })
      .catch((e) => toast("error", String(e)));
    return () => {
      alive = false;
    };
  }, [editorPath, toast]);

  // Escala de exibição (imagem inteira visível).
  const [scale, setScale] = useState(1);
  const recalcScale = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap || dims.w === 0) return;
    setScale(fitScale(dims.w, dims.h, wrap.clientWidth - 24, wrap.clientHeight - 24));
  }, [dims]);
  useEffect(() => {
    recalcScale();
    const obs = new ResizeObserver(recalcScale);
    if (wrapRef.current) obs.observe(wrapRef.current);
    return () => obs.disconnect();
  }, [recalcScale]);

  // Redesenho: base + anotações + rascunho + máscara do crop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !base || dims.w === 0) return;
    canvas.width = dims.w;
    canvas.height = dims.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(base, 0, 0, dims.w, dims.h);
    drawAll(ctx, annots);
    if (draftRef.current) drawAll(ctx, [draftRef.current]);
    if (crop) {
      ctx.save();
      ctx.fillStyle = "rgba(8,10,14,0.55)";
      ctx.beginPath();
      ctx.rect(0, 0, dims.w, dims.h);
      ctx.rect(crop.x, crop.y, crop.w, crop.h);
      ctx.fill("evenodd");
      ctx.strokeStyle = "#60a5fa";
      ctx.lineWidth = Math.max(2, 2 / scale);
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(crop.x, crop.y, crop.w, crop.h);
      ctx.restore();
    }
  });

  function toImageCoords(e: React.PointerEvent): { x: number; y: number } {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * dims.w,
      y: ((e.clientY - rect.top) / rect.height) * dims.h,
    };
  }

  function commit(a: Annot) {
    if (isNoop(a)) return;
    setAnnots((prev) => [...prev, a]);
    setRedo([]);
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!base || pendingText) return;
    const p = toImageCoords(e);
    // Texto abre uma caixa flutuante — de propósito SEM captura de ponteiro:
    // com captura, o clique devolvia o foco pro canvas, disparava o onBlur e a
    // caixa sumia antes de dar pra digitar. O foco vai no requestAnimationFrame abaixo.
    if (tool === "text") {
      setPendingText(p);
      setTextValue("");
      return;
    }
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    if (tool === "crop") {
      cropDraftRef.current = p;
      setCrop({ x: p.x, y: p.y, w: 0, h: 0 });
      return;
    }
    if (tool === "step") {
      commit({
        tool: "step",
        color,
        width: stroke,
        x1: p.x,
        y1: p.y,
        x2: p.x,
        y2: p.y,
        fontSize: Math.max(14, stroke * 5),
        n: nextStepNumber(annots),
      });
      return;
    }
    draftRef.current = {
      tool,
      color,
      width: stroke,
      x1: p.x,
      y1: p.y,
      x2: p.x,
      y2: p.y,
      points: tool === "pen" ? [p] : undefined,
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    const p = toImageCoords(e);
    if (tool === "crop" && cropDraftRef.current) {
      const start = cropDraftRef.current;
      setCrop(clampRect(normRect(start.x, start.y, p.x, p.y), dims.w, dims.h));
      return;
    }
    const d = draftRef.current;
    if (!d) return;
    d.x2 = p.x;
    d.y2 = p.y;
    if (d.tool === "pen") d.points!.push(p);
    forceRender((n) => n + 1);
  }

  function onPointerUp() {
    if (tool === "crop") {
      cropDraftRef.current = null;
      if (crop && (crop.w < 8 || crop.h < 8)) setCrop(null);
      return;
    }
    const d = draftRef.current;
    draftRef.current = null;
    if (d) commit(d);
    forceRender((n) => n + 1);
  }

  function commitText() {
    if (pendingText && textValue.trim()) {
      commit({
        tool: "text",
        color,
        width: stroke,
        x1: pendingText.x,
        y1: pendingText.y,
        x2: pendingText.x,
        y2: pendingText.y,
        text: textValue,
        fontSize: Math.max(16, stroke * 7),
      });
    }
    setPendingText(null);
    setTextValue("");
  }

  function undo() {
    setAnnots((prev) => {
      if (prev.length === 0) return prev;
      setRedo((r) => [...r, prev[prev.length - 1]]);
      return prev.slice(0, -1);
    });
  }
  function redoOne() {
    setRedo((prev) => {
      if (prev.length === 0) return prev;
      setAnnots((a) => [...a, prev[prev.length - 1]]);
      return prev.slice(0, -1);
    });
  }

  // Foca a caixa de texto só no próximo frame — no mesmo tick do clique o foco
  // nativo do canvas ganha e a caixa piscava e sumia.
  useEffect(() => {
    if (!pendingText) return;
    const id = requestAnimationFrame(() => textRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [pendingText]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (pendingText) return;
      if (e.ctrlKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redoOne();
        else undo();
      } else if (e.ctrlKey && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redoOne();
      } else if (e.key === "Escape") {
        setCrop(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingText]);

  /** Canvas final em resolução nativa, com crop aplicado. */
  function renderFinal(): HTMLCanvasElement | null {
    if (!base) return null;
    const full = document.createElement("canvas");
    full.width = dims.w;
    full.height = dims.h;
    const ctx = full.getContext("2d")!;
    ctx.drawImage(base, 0, 0, dims.w, dims.h);
    drawAll(ctx, annots);
    if (!crop) return full;
    const out = document.createElement("canvas");
    out.width = Math.round(crop.w);
    out.height = Math.round(crop.h);
    out
      .getContext("2d")!
      .drawImage(full, crop.x, crop.y, crop.w, crop.h, 0, 0, out.width, out.height);
    return out;
  }

  function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  async function saveAs(format: "png" | "jpeg" | "webp") {
    const canvas = renderFinal();
    if (!canvas) return;
    const stem = fileName(editorPath).replace(/\.[^.]+$/, "");
    const ext = format === "jpeg" ? "jpg" : format;
    const suggested = `${dirName(editorPath)}${navigator.userAgent.includes("Windows") ? "\\" : "/"}${stem} - editado.${ext}`;
    const out = await save({
      title: "Salvar imagem",
      defaultPath: suggested,
      filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
    }).catch(() => null);
    if (!out) return;
    setSaving(true);
    try {
      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob(resolve, `image/${format}`, format === "png" ? undefined : 0.92),
      );
      if (!blob) throw new Error("falha ao encodar a imagem");
      await be.writeFileBase64(out, await blobToBase64(blob));
      toast("success", `Salvo: ${out}`);
      void revealItemInDir(out).catch(() => {});
    } catch (e) {
      toast("error", String(e));
    } finally {
      setSaving(false);
    }
  }

  async function copyToClipboard() {
    const canvas = renderFinal();
    if (!canvas) return;
    try {
      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (!blob) throw new Error("falha ao encodar");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast("success", "Imagem copiada.");
    } catch {
      toast("error", "Clipboard de imagem indisponível — use Salvar como.");
    }
  }

  const textScreenPos = pendingText
    ? { left: pendingText.x * scale, top: pendingText.y * scale }
    : null;

  return (
    <div className="editor">
      <div className="editor-bar">
        <button className="icon-btn" onClick={closeEditor} title="Voltar">
          ←
        </button>
        <span className="viewer-name" title={editorPath}>
          {fileName(editorPath)}
        </span>
        <div className="viewer-actions">
          <button className="btn small" onClick={undo} disabled={annots.length === 0}>
            ↶ Desfazer
          </button>
          <button className="btn small" onClick={redoOne} disabled={redo.length === 0}>
            ↷ Refazer
          </button>
          {crop && (
            <button className="btn small" onClick={() => setCrop(null)}>
              Limpar recorte
            </button>
          )}
          <button className="btn small" onClick={() => void copyToClipboard()}>
            Copiar
          </button>
          <button className="btn small" disabled={saving} onClick={() => void saveAs("png")}>
            Salvar PNG
          </button>
          <button className="btn small" disabled={saving} onClick={() => void saveAs("jpeg")}>
            JPG
          </button>
          <button className="btn small" disabled={saving} onClick={() => void saveAs("webp")}>
            WebP
          </button>
        </div>
      </div>

      <div className="editor-body">
        <div className="tool-rail">
          {TOOLS.map(([id, glyph, label]) => (
            <button
              key={id}
              className={`tool-btn ${tool === id ? "active" : ""}`}
              title={label}
              onClick={() => setTool(id)}
            >
              {glyph}
            </button>
          ))}
          <div className="tool-sep" />
          {COLORS.map((c) => (
            <button
              key={c}
              className={`color-dot ${color === c ? "active" : ""}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
            />
          ))}
          <div className="tool-sep" />
          <input
            className="stroke-range"
            type="range"
            min={2}
            max={12}
            value={stroke}
            title="Espessura"
            onChange={(e) => setStroke(Number(e.target.value))}
          />
        </div>

        <div className="editor-canvas-wrap" ref={wrapRef}>
          {!base ? (
            <div className="editor-loading">Carregando…</div>
          ) : (
            <div
              className="editor-canvas-holder"
              style={{ width: dims.w * scale, height: dims.h * scale }}
            >
              <canvas
                ref={canvasRef}
                style={{ width: dims.w * scale, height: dims.h * scale }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
              />
              {pendingText && textScreenPos && (
                <textarea
                  ref={textRef}
                  className="text-overlay"
                  style={textScreenPos}
                  value={textValue}
                  placeholder="Digite e Enter"
                  onChange={(e) => setTextValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      commitText();
                    } else if (e.key === "Escape") {
                      setPendingText(null);
                    }
                  }}
                  onBlur={commitText}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
