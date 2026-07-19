// Visualizador: zoom (Ctrl+roda nos passos, ajustar/100%), pan por arrasto,
// setas ←/→ navegam a pasta, tira de miniaturas, EXIF, lixeira, fullscreen.
// Rotação aqui é SÓ de visualização (girar de verdade = exportar no editor).
// O modo imersivo é também o "papel de parede": tela cheia sem cromo, com os
// ajustes do Windows (preencher/ajustar/esticar/centralizar/lado a lado) e as
// mesmas setas navegando a pasta.

import { useCallback, useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openPath } from "@tauri-apps/plugin-opener";
import * as be from "../lib/backend";
import {
  nextZoom,
  stepIndex,
  WALLPAPER_FITS,
  wallpaperLayout,
  type WallpaperFit,
} from "../lib/geometry";
import { t, type MessageKey } from "../lib/i18n";
import { fileName, fmtBytes, isVideoPath, type ExifEntry, type ImageInfo } from "../lib/types";
import { useStore } from "../state/store";
import { useUi } from "../state/ui";
import { effectiveZoom as calcZoom, useView, type ViewState } from "../state/view";

const FIT_LABELS: Record<WallpaperFit, MessageKey> = {
  free: "viewer.fitFree",
  cover: "viewer.fitCover",
  contain: "viewer.fitContain",
  stretch: "viewer.fitStretch",
  center: "viewer.fitCenter",
  tile: "viewer.fitTile",
};

/**
 * Layout do papel de parede a partir do estado de view. Render e ponte de DEV
 * chamam ESTE helper (nada de recalcular por fora): a geometria raciocina em
 * eixos de TELA, então o bitmap entra já girado — 90/270 trocam w/h.
 */
function layoutFor(fit: WallpaperFit, v: Pick<ViewState, "rotation" | "img" | "view">) {
  if (fit === "free") return null;
  const swap = v.rotation % 180 !== 0;
  return wallpaperLayout(
    fit,
    swap ? v.img.h : v.img.w,
    swap ? v.img.w : v.img.h,
    v.view.w,
    v.view.h,
  );
}

export default function ViewerView() {
  const files = useStore((s) => s.files);
  const index = useStore((s) => s.index);
  const step = useStore((s) => s.step);
  const setIndex = useStore((s) => s.setIndex);
  const goHome = useStore((s) => s.goHome);
  const openEditor = useStore((s) => s.openEditor);
  const deleteCurrent = useStore((s) => s.deleteCurrent);
  const fit = useStore((s) => s.settings.wallpaperFit);
  const setSettings = useStore((s) => s.setSettings);
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

  // Papel de parede ligado: imersivo, imagem (vídeo não é decodificado aqui) e
  // um ajuste que não seja "livre". Aqui o layout vem da geometria pura e
  // zoom/pan ficam DESLIGADOS — arrastar sob um layout que ignora o pan
  // escreveria no store um deslocamento invisível, que reapareceria ao sair.
  const wallpaper = immersive && !isVideo && fit !== "free";

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
        const f = useStore.getState().settings.wallpaperFit;
        const on = useUi.getState().immersive && f !== "free";
        return {
          pan: s.pan,
          zoom: s.zoom,
          rotation: s.rotation,
          view: s.view,
          img: s.img,
          fit: f,
          wallpaper: on,
          layout: on ? layoutFor(f, s) : null,
        };
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

  /** Alterna o ajuste do papel de parede (persiste como as demais preferências). */
  const cycleFit = useCallback(
    (delta: number) => {
      const i = Math.max(0, WALLPAPER_FITS.indexOf(useStore.getState().settings.wallpaperFit));
      useStore.getState().setSettings({
        wallpaperFit: WALLPAPER_FITS[stepIndex(i, delta, WALLPAPER_FITS.length)],
      });
    },
    [],
  );

  /** Bitmap decodificado: só aqui o clamp passa a ter medida real. */
  function onImgLoad() {
    const img = imgRef.current;
    if (img) useView.getState().setImgSize(img.naturalWidth, img.naturalHeight);
  }

  function onWheel(e: React.WheelEvent) {
    if (wallpaper || !e.ctrlKey) return;
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
    if (wallpaper) return;
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
      } else if (immersive && e.key.toLowerCase() === "m") cycleFit(1);
      // Com um ajuste de papel de parede ativo não há zoom nem pan: a escala é
      // derivada do viewport, então as teclas de zoom não teriam efeito visível.
      else if (!wallpaper && (e.key === "+" || e.key === "=")) applyZoom(nextZoom(effectiveZoom(), 1));
      else if (!wallpaper && e.key === "-") applyZoom(nextZoom(effectiveZoom(), -1));
      else if (!wallpaper && e.key === "0") applyZoom(0);
      else if (!wallpaper && e.key === "1") applyZoom(1);
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
  }, [step, effectiveZoom, applyZoom, cycleFit, openEditor, path, immersive, isVideo, wallpaper]);

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

  const swap = rotation % 180 !== 0;
  const layout = wallpaper
    ? layoutFor(fit, { rotation, img: imgSize, view: viewSize })
    : null;
  // O `scale` do CSS age nos eixos da IMAGEM e é aplicado antes do `rotate`;
  // com 90/270 os fatores de tela trocam de eixo na volta.
  const wallpaperTransform = layout
    ? `rotate(${rotation}deg) scale(${swap ? layout.scaleY : layout.scaleX}, ${
        swap ? layout.scaleX : layout.scaleY
      })`
    : "";

  return (
    <div className={`viewer${immersive ? " immersive" : ""}${wallpaper ? " wallpaper-mode" : ""}`}>
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
            <>
              {/* Mosaico: a repetição é do CSS (um <img> não se repete). O <img>
                  continua montado, escondido — é ele que mede o bitmap e dispara
                  o fallback de formato (TIFF via Rust), que o mosaico reusa. */}
              {wallpaper && fit === "tile" && (
                <div
                  className="wallpaper-tile"
                  style={{ backgroundImage: `url("${src.replace(/"/g, "%22")}")` }}
                />
              )}
              <img
                ref={imgRef}
                className={`viewer-img${wallpaper ? " wallpaper" : ""}`}
                src={src}
                alt=""
                draggable={false}
                onLoad={onImgLoad}
                onError={() => void onImgError()}
                style={
                  wallpaper && fit === "tile"
                    ? { display: "none" }
                    : {
                        transform: wallpaper
                          ? wallpaperTransform
                          : `translate(${pan.x}px, ${pan.y}px) rotate(${rotation}deg) scale(${z})`,
                      }
                }
              />
            </>
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
        {immersive && !isVideo && (
          <div className="wallpaper-bar" title={t("viewer.wallpaperFit")}>
            <select
              className="wallpaper-fit"
              value={fit}
              onChange={(e) => setSettings({ wallpaperFit: e.target.value as WallpaperFit })}
            >
              {WALLPAPER_FITS.map((f) => (
                <option key={f} value={f}>
                  {t(FIT_LABELS[f])}
                </option>
              ))}
            </select>
          </div>
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
