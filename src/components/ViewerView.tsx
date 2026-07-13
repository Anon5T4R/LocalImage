// Visualizador: zoom (Ctrl+roda nos passos, ajustar/100%), pan por arrasto,
// setas ←/→ navegam a pasta, tira de miniaturas, EXIF, lixeira, fullscreen.
// Rotação aqui é SÓ de visualização (girar de verdade = exportar no editor).

import { useCallback, useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openPath } from "@tauri-apps/plugin-opener";
import * as be from "../lib/backend";
import { fitScale, nextZoom } from "../lib/geometry";
import { fileName, fmtBytes, isVideoPath, type ExifEntry, type ImageInfo } from "../lib/types";
import { useStore } from "../state/store";
import { useUi } from "../state/ui";

export default function ViewerView() {
  const files = useStore((s) => s.files);
  const index = useStore((s) => s.index);
  const step = useStore((s) => s.step);
  const setIndex = useStore((s) => s.setIndex);
  const goHome = useStore((s) => s.goHome);
  const openEditor = useStore((s) => s.openEditor);
  const deleteCurrent = useStore((s) => s.deleteCurrent);
  const setConvertOpen = useUi((s) => s.setConvertOpen);
  const immersive = useUi((s) => s.immersive);
  const setImmersive = useUi((s) => s.setImmersive);
  const toast = useUi((s) => s.toast);

  const path = files[index] ?? "";
  const isVideo = isVideoPath(path);
  const [info, setInfo] = useState<ImageInfo | null>(null);
  const [exif, setExif] = useState<ExifEntry[]>([]);
  const [showExif, setShowExif] = useState(false);
  const [zoom, setZoom] = useState(0); // 0 = ajustar
  const [rotation, setRotation] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [fallbackSrc, setFallbackSrc] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const areaRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  // Reset por imagem + metadados.
  useEffect(() => {
    setZoom(0);
    setRotation(0);
    setPan({ x: 0, y: 0 });
    setFallbackSrc("");
    setConfirmDel(false);
    setInfo(null);
    setExif([]);
    if (!path || isVideoPath(path)) return; // vídeo não é decodificado aqui
    be.imageInfo(path).then(setInfo).catch(() => {});
    be.exifInfo(path).then(setExif).catch(() => {});
  }, [path]);

  const effectiveZoom = useCallback((): number => {
    if (zoom > 0) return zoom;
    const area = areaRef.current;
    if (!area || !info) return 1;
    const swap = rotation % 180 !== 0;
    const iw = swap ? info.height : info.width;
    const ih = swap ? info.width : info.height;
    return fitScale(iw, ih, area.clientWidth - 24, area.clientHeight - 24);
  }, [zoom, info, rotation]);

  function onWheel(e: React.WheelEvent) {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const cur = effectiveZoom();
    setZoom(nextZoom(cur, e.deltaY < 0 ? 1 : -1));
  }

  function onPointerDown(e: React.PointerEvent) {
    dragRef.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    setPan({ x: d.px + (e.clientX - d.x), y: d.py + (e.clientY - d.y) });
  }
  function onPointerUp() {
    dragRef.current = null;
  }

  async function toggleFullscreen() {
    try {
      const win = getCurrentWindow();
      await win.setFullscreen(!(await win.isFullscreen()));
    } catch {
      /* fora do Tauri */
    }
  }

  // Vídeo não é reproduzido aqui — abre no player padrão do sistema.
  async function openVideoExternally() {
    try {
      await openPath(path);
    } catch (e) {
      toast("error", `Não consegui abrir o vídeo: ${e}`);
    }
  }

  // Modo imersivo: tela cheia do SO + interface escondida (só a imagem).
  async function setImmersiveMode(on: boolean) {
    setImmersive(on);
    try {
      await getCurrentWindow().setFullscreen(on);
    } catch {
      /* fora do Tauri — só esconde a interface */
    }
  }

  // Ao sair do visualizador, garante que o modo imersivo não fique "grudado".
  useEffect(() => {
    return () => {
      if (useUi.getState().immersive) void setImmersiveMode(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Atalhos do visualizador.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
      else if (isVideo) {
        // Em vídeo, o resto dos atalhos de imagem não se aplica.
        if (e.key === "Enter") void openVideoExternally();
      } else if (e.key === "+" || e.key === "=") setZoom(nextZoom(effectiveZoom(), 1));
      else if (e.key === "-") setZoom(nextZoom(effectiveZoom(), -1));
      else if (e.key === "0") setZoom(0);
      else if (e.key === "1") setZoom(1);
      else if (e.key.toLowerCase() === "f") void toggleFullscreen();
      else if (e.key.toLowerCase() === "e") openEditor(path);
      else if (e.key.toLowerCase() === "i") setShowExif((v) => !v);
      else if (e.key === "Delete") setConfirmDel(true);
      else if (e.key === "Escape") {
        if (immersive) void setImmersiveMode(false);
        else setConfirmDel(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, effectiveZoom, openEditor, path, immersive, isVideo]);

  // Formato que o webview não decodifica (ex.: TIFF) → fallback via Rust.
  async function onImgError() {
    try {
      const loaded = await be.loadPngBase64(path, 4096);
      setFallbackSrc(`data:image/png;base64,${loaded.b64}`);
    } catch {
      /* fica o ícone quebrado mesmo */
    }
  }

  const z = effectiveZoom();
  const src = fallbackSrc || (path ? convertFileSrc(path) : "");

  return (
    <div className={`viewer${immersive ? " immersive" : ""}`}>
      {!immersive && (
      <div className="viewer-bar">
        <button className="icon-btn" onClick={goHome} title="Início">
          ←
        </button>
        <span className="viewer-name" title={path}>
          {fileName(path)}
        </span>
        <span className="viewer-meta">
          {isVideo ? "vídeo" : info && `${info.width}×${info.height} · ${fmtBytes(info.sizeBytes)}`}
          {files.length > 1 && ` · ${index + 1}/${files.length}`}
        </span>
        <div className="viewer-actions">
          {isVideo ? (
            <button
              className="btn small primary"
              onClick={() => void openVideoExternally()}
              title="Abrir no player padrão (Enter)"
            >
              ▶ Abrir vídeo
            </button>
          ) : (
          <>
          <button className="btn small" onClick={() => setZoom(nextZoom(z, -1))} title="Menos zoom (-)">
            −
          </button>
          <span className="zoom-label">{Math.round(z * 100)}%</span>
          <button className="btn small" onClick={() => setZoom(nextZoom(z, 1))} title="Mais zoom (+)">
            +
          </button>
          <button className="btn small" onClick={() => setZoom(0)} title="Ajustar (0)">
            Ajustar
          </button>
          <button className="btn small" onClick={() => setZoom(1)} title="Tamanho real (1)">
            100%
          </button>
          <button
            className="btn small"
            onClick={() => setRotation((r) => (r + 90) % 360)}
            title="Girar a visualização (o export gira no editor)"
          >
            ⟳
          </button>
          <button className="btn small" onClick={() => void toggleFullscreen()} title="Tela cheia (F)">
            ⛶
          </button>
          <button
            className="btn small"
            onClick={() => void setImmersiveMode(true)}
            title="Modo imersivo — só a imagem (Esc pra sair)"
          >
            ⤢
          </button>
          <button
            className={`btn small ${showExif ? "primary" : ""}`}
            onClick={() => setShowExif(!showExif)}
            title="Metadados EXIF (I)"
          >
            EXIF
          </button>
          <button className="btn small" onClick={() => setConvertOpen(true)}>
            Converter
          </button>
          <button className="btn small primary" onClick={() => openEditor(path)} title="Anotar (E)">
            ✎ Anotar
          </button>
          </>
          )}
          {confirmDel ? (
            <>
              <button className="btn small danger" onClick={() => void deleteCurrent()}>
                Lixeira?
              </button>
              <button className="btn small" onClick={() => setConfirmDel(false)}>
                Não
              </button>
            </>
          ) : (
            <button className="icon-btn" onClick={() => setConfirmDel(true)} title="Excluir (Del)">
              🗑
            </button>
          )}
        </div>
      </div>
      )}

      <div
        className="viewer-area"
        ref={areaRef}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {isVideo ? (
          <div className="video-placeholder">
            <div className="video-ph-icon">🎬</div>
            <div className="video-ph-name" title={path}>
              {fileName(path)}
            </div>
            <button className="btn primary" onClick={() => void openVideoExternally()}>
              ▶ Abrir vídeo
            </button>
            <div className="video-ph-hint">
              O LocalImage não reproduz vídeo — ele abre no player padrão do sistema.
            </div>
          </div>
        ) : (
          src && (
            <img
              className="viewer-img"
              src={src}
              alt=""
              draggable={false}
              onError={() => void onImgError()}
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) rotate(${rotation}deg) scale(${z})`,
              }}
            />
          )
        )}
        {showExif && (
          <aside className="exif-panel">
            <div className="exif-title">Metadados (EXIF)</div>
            {exif.length === 0 ? (
              <div className="exif-empty">Sem EXIF nesta imagem.</div>
            ) : (
              exif.map((e) => (
                <div key={e.label} className="exif-row">
                  <span>{e.label}</span>
                  <b>{e.value}</b>
                </div>
              ))
            )}
            <div className="exif-note">Qualquer export do LocalImage remove o EXIF.</div>
          </aside>
        )}
        {immersive && (
          <button
            className="immersive-exit"
            onClick={() => void setImmersiveMode(false)}
            title="Sair do modo imersivo (Esc)"
          >
            ✕
          </button>
        )}
      </div>

      {files.length > 1 && !immersive && (
        <div className="filmstrip">
          {files.map((f, i) =>
            isVideoPath(f) ? (
              <div
                key={f}
                className={`film-video ${i === index ? "active" : ""}`}
                onClick={() => setIndex(i)}
                title={fileName(f)}
              >
                ▶
              </div>
            ) : (
              <img
                key={f}
                src={convertFileSrc(f)}
                className={i === index ? "active" : ""}
                onClick={() => setIndex(i)}
                loading="lazy"
                alt=""
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}
