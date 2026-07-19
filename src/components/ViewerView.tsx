// Visualizador: zoom (Ctrl+roda nos passos, ajustar/100%), pan por arrasto,
// setas ←/→ navegam a pasta, tira de miniaturas, EXIF, lixeira, fullscreen.
// Rotação aqui é SÓ de visualização (girar de verdade = exportar no editor).

import { useCallback, useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openPath } from "@tauri-apps/plugin-opener";
import * as be from "../lib/backend";
import { nextZoom } from "../lib/geometry";
import { t } from "../lib/i18n";
import { fileName, fmtBytes, isVideoPath, type ExifEntry, type ImageInfo } from "../lib/types";
import { useStore } from "../state/store";
import { useUi } from "../state/ui";
import { effectiveZoom as calcZoom, useView } from "../state/view";

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
  // Zoom/rotação/pan vivem no store de view: lá TODA escrita passa pelo clamp
  // (aqui era estado local com clamp espalhado nos handlers — e cada caminho
  // esquecido deixava a imagem sair inteira da tela).
  const zoom = useView((s) => s.zoom);
  const rotation = useView((s) => s.rotation);
  const pan = useView((s) => s.pan);
  // Assinados porque o zoom "ajustar" depende deles: sem isto, redimensionar a
  // janela não redesenhava a imagem na nova escala.
  const viewSize = useView((s) => s.view);
  const imgSize = useView((s) => s.img);
  const [fallbackSrc, setFallbackSrc] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const areaRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  // Reset por imagem + metadados. O reset zera também o bitmap medido: até o
  // onLoad da nova imagem não há como clampar, e o store trava o pan no centro
  // (antes, um arrasto em curso durante ←/→ escrevia pan cru na imagem nova).
  useEffect(() => {
    useView.getState().reset();
    dragRef.current = null;
    setFallbackSrc("");
    setConfirmDel(false);
    setInfo(null);
    setExif([]);
    if (!path || isVideoPath(path)) return; // vídeo não é decodificado aqui
    be.imageInfo(path).then(setInfo).catch(() => {});
    be.exifInfo(path).then(setExif).catch(() => {});
  }, [path]);

  // Ponte de DEV (nunca em produção): estado legível + src injetável pra
  // dirigir o GUI em testes sem o runtime Tauri. Reatribuída a cada render
  // de propósito — o closure precisa ver o estado corrente.
  if (import.meta.env.DEV) {
    (globalThis as unknown as Record<string, unknown>).__liViewer = {
      get: () => {
        const s = useView.getState();
        return { pan: s.pan, zoom: s.zoom, rotation: s.rotation, view: s.view, img: s.img };
      },
      setSrc: setFallbackSrc,
      view: useView,
    };
  }

  // O viewport medido é entrada do clamp: sem isto, encolher a área (sair do
  // fullscreen/imersivo, restaurar a janela) mantinha um pan que era legal na
  // área grande e joga a imagem inteira pra fora da pequena.
  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    const push = () => useView.getState().setViewSize(area.clientWidth, area.clientHeight);
    push();
    const obs = new ResizeObserver(push);
    obs.observe(area);
    return () => obs.disconnect();
  }, [isVideo]);

  const effectiveZoom = useCallback(() => calcZoom(useView.getState()), []);

  const applyZoom = useCallback((nz: number, anchor?: { ax: number; ay: number }) => {
    useView.getState().zoomTo(nz, anchor);
  }, []);

  /** Bitmap decodificado: só aqui o clamp passa a ter medida real. */
  function onImgLoad() {
    const img = imgRef.current;
    if (img) useView.getState().setImgSize(img.naturalWidth, img.naturalHeight);
  }

  function onWheel(e: React.WheelEvent) {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const cur = effectiveZoom();
    const nz = nextZoom(cur, e.deltaY < 0 ? 1 : -1);
    if (nz === cur) return;
    // Âncora no cursor, em coordenadas relativas ao centro do viewport.
    const area = areaRef.current;
    if (area) {
      const r = area.getBoundingClientRect();
      applyZoom(nz, {
        ax: e.clientX - r.left - r.width / 2,
        ay: e.clientY - r.top - r.height / 2,
      });
    } else {
      applyZoom(nz);
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    dragRef.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
    // Blindada: NotFoundError com pointer não-ativo mataria o pan inteiro.
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* segue sem captura */
    }
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    useView.getState().panTo(d.px + (e.clientX - d.x), d.py + (e.clientY - d.y));
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
      toast("error", t("viewer.openVideoFailed", { e: String(e) }));
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
      } else if (e.key === "+" || e.key === "=") applyZoom(nextZoom(effectiveZoom(), 1));
      else if (e.key === "-") applyZoom(nextZoom(effectiveZoom(), -1));
      else if (e.key === "0") applyZoom(0);
      else if (e.key === "1") applyZoom(1);
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
  }, [step, effectiveZoom, applyZoom, openEditor, path, immersive, isVideo]);

  // Formato que o webview não decodifica (ex.: TIFF) → fallback via Rust.
  async function onImgError() {
    try {
      const loaded = await be.loadPngBase64(path, 4096);
      setFallbackSrc(`data:image/png;base64,${loaded.b64}`);
    } catch {
      /* fica o ícone quebrado mesmo */
    }
  }

  const z = calcZoom({ zoom, rotation, view: viewSize, img: imgSize });
  const src = fallbackSrc || (path ? convertFileSrc(path) : "");

  return (
    <div className={`viewer${immersive ? " immersive" : ""}`}>
      {!immersive && (
      <div className="viewer-bar">
        <button className="icon-btn" onClick={goHome} title={t("topbar.home")}>
          ←
        </button>
        <span className="viewer-name" title={path}>
          {fileName(path)}
        </span>
        <span className="viewer-meta">
          {isVideo ? t("viewer.video") : info && `${info.width}×${info.height} · ${fmtBytes(info.sizeBytes)}`}
          {files.length > 1 && ` · ${index + 1}/${files.length}`}
        </span>
        <div className="viewer-actions">
          {isVideo ? (
            <button
              className="btn small primary"
              onClick={() => void openVideoExternally()}
              title={t("viewer.openInPlayerTitle")}
            >
              ▶ {t("viewer.openVideo")}
            </button>
          ) : (
          <>
          <button className="btn small" onClick={() => applyZoom(nextZoom(z, -1))} title={t("viewer.zoomOut")}>
            −
          </button>
          <span className="zoom-label">{Math.round(z * 100)}%</span>
          <button className="btn small" onClick={() => applyZoom(nextZoom(z, 1))} title={t("viewer.zoomIn")}>
            +
          </button>
          <button className="btn small" onClick={() => applyZoom(0)} title={t("viewer.fit")}>
            {t("viewer.fitLabel")}
          </button>
          <button className="btn small" onClick={() => applyZoom(1)} title={t("viewer.actualSize")}>
            100%
          </button>
          <button
            className="btn small"
            onClick={() => useView.getState().rotateCw()}
            title={t("viewer.rotate")}
          >
            ⟳
          </button>
          <button className="btn small" onClick={() => void toggleFullscreen()} title={t("viewer.fullscreen")}>
            ⛶
          </button>
          <button
            className="btn small"
            onClick={() => void setImmersiveMode(true)}
            title={t("viewer.immersive")}
          >
            ⤢
          </button>
          <button
            className={`btn small ${showExif ? "primary" : ""}`}
            onClick={() => setShowExif(!showExif)}
            title={t("viewer.exifTitle")}
          >
            EXIF
          </button>
          <button className="btn small" onClick={() => setConvertOpen(true)}>
            {t("viewer.convert")}
          </button>
          <button className="btn small primary" onClick={() => openEditor(path)} title={t("viewer.annotateTitle")}>
            ✎ {t("viewer.annotate")}
          </button>
          </>
          )}
          {confirmDel ? (
            <>
              <button className="btn small danger" onClick={() => void deleteCurrent()}>
                {t("viewer.trashConfirm")}
              </button>
              <button className="btn small" onClick={() => setConfirmDel(false)}>
                {t("viewer.no")}
              </button>
            </>
          ) : (
            <button className="icon-btn" onClick={() => setConfirmDel(true)} title={t("viewer.delete")}>
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
              ▶ {t("viewer.openVideo")}
            </button>
            <div className="video-ph-hint">{t("viewer.videoPlaceholderHint")}</div>
          </div>
        ) : (
          src && (
            <img
              ref={imgRef}
              className="viewer-img"
              src={src}
              alt=""
              draggable={false}
              onLoad={onImgLoad}
              onError={() => void onImgError()}
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) rotate(${rotation}deg) scale(${z})`,
              }}
            />
          )
        )}
        {showExif && (
          <aside className="exif-panel">
            <div className="exif-title">{t("viewer.exifPanelTitle")}</div>
            {exif.length === 0 ? (
              <div className="exif-empty">{t("viewer.exifEmpty")}</div>
            ) : (
              exif.map((e) => (
                <div key={e.label} className="exif-row">
                  <span>{e.label}</span>
                  <b>{e.value}</b>
                </div>
              ))
            )}
            <div className="exif-note">{t("viewer.exifNote")}</div>
          </aside>
        )}
        {immersive && (
          <button
            className="immersive-exit"
            onClick={() => void setImmersiveMode(false)}
            title={t("viewer.immersiveExit")}
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
