// "Copiar texto da imagem": OCR offline (tesseract.js, por/eng) do print, da
// foto de documento ou da placa. Portado do OcrPanel do LocalPDF — mesma pilha,
// mesmos idiomas —, mas com duas coisas que só fazem sentido em imagem:
// arrastar pra reconhecer SÓ um trecho, e as caixas por palavra desenhadas em
// cima da prévia (é o único jeito de o usuário ver ONDE o OCR errou).
//
// ROTAÇÃO: o OCR usa os pixels GIRADOS, como o usuário está vendo. Girar a
// visualização é o que ele faz justamente pra endireitar uma foto torta; rodar
// o tesseract no bitmap original devolveria lixo exatamente no caso em que ele
// girou a imagem de propósito. A rotação é lida do store de view (fonte única)
// e só é assada neste canvas local — nada aqui escreve zoom/rotação/pan.

import { save } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useRef, useState } from "react";
import * as be from "../lib/backend";
import { clampRect, fitScale, normRect, type Rect } from "../lib/geometry";
import { t } from "../lib/i18n";
import {
  cancelOcr,
  disposeOcr,
  MIN_SELECTION,
  ocrCanvas,
  ocrRegion,
  ocrScale,
  ocrTextName,
  OcrCanceled,
  rotatedDims,
  textToBase64,
} from "../lib/ocr";
import type { OcrWord } from "../lib/ocr";
import { dirName, fileName } from "../lib/types";
import { useStore } from "../state/store";
import { useUi } from "../state/ui";
import { useView } from "../state/view";

/** Teto de carga: acima disso o load_png_base64 já reduz (igual ao editor). */
const LOAD_MAX_DIM = 6000;

/** Etapas do tesseract que valem virar texto na UI; o resto vira "preparando". */
const STATUS_KEYS: Record<string, "ocr.stepLoading" | "ocr.stepRecognizing"> = {
  "loading tesseract core": "ocr.stepLoading",
  "loading language traineddata": "ocr.stepLoading",
  "initializing tesseract": "ocr.stepLoading",
  "initializing api": "ocr.stepLoading",
  "recognizing text": "ocr.stepRecognizing",
};

export default function OcrModal() {
  const open = useUi((s) => s.ocrOpen);
  const setOpen = useUi((s) => s.setOcrOpen);
  const toast = useUi((s) => s.toast);
  const files = useStore((s) => s.files);
  const index = useStore((s) => s.index);
  const path = files[index] ?? "";

  // A rotação é capturada na ABERTURA (não assinada): mudar o bitmap com um
  // reconhecimento em curso deixaria as caixas por palavra apontando pro lugar
  // errado. Fechar e reabrir é o caminho pra reconhecer noutra rotação.
  const [base, setBase] = useState<HTMLCanvasElement | null>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [langPor, setLangPor] = useState(true);
  const [langEng, setLangEng] = useState(false);
  const [langSpa, setLangSpa] = useState(false);
  const [sel, setSel] = useState<Rect | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");
  // `origin` = canto da região reconhecida. Guardado JUNTO do resultado (e não
  // recalculado do `sel` na hora de desenhar) porque limpar a seleção depois de
  // reconhecer deslocaria todas as caixas pro canto da imagem.
  const [result, setResult] = useState<{
    text: string;
    words: OcrWord[];
    origin: { x: number; y: number };
  } | null>(null);
  const [note, setNote] = useState("");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const [scale, setScale] = useState(1);

  // Ordem fixa (não a de clique): o tesseract usa a PRIMEIRA língua da lista
  // como principal, então "por+eng" e "eng+por" não dão o mesmo resultado. Fixar
  // aqui evita que o acerto dependa da ordem em que o usuário marcou as caixas.
  const langs = [langPor && "por", langEng && "eng", langSpa && "spa"]
    .filter(Boolean)
    .join("+");

  // Carrega e assa a rotação. O load vem do Rust (mesma via do editor) porque é
  // o único caminho que decodifica TIFF & cia — o webview não decodifica.
  useEffect(() => {
    if (!open || !path) return;
    let alive = true;
    setBase(null);
    setSel(null);
    setResult(null);
    setNote("");
    setStep("");
    const rotation = useView.getState().rotation;
    be.loadPngBase64(path, LOAD_MAX_DIM)
      .then((loaded) => {
        if (!alive) return;
        const img = new Image();
        img.onload = () => {
          if (!alive) return;
          const { w: cw, h: ch } = rotatedDims(loaded.width, loaded.height, rotation);
          const c = document.createElement("canvas");
          c.width = cw;
          c.height = ch;
          const ctx = c.getContext("2d")!;
          // Gira em torno do centro do canvas de DESTINO e desenha o bitmap
          // centrado: com 90/270 os eixos já trocaram em cw/ch, então a origem
          // do drawImage sai das dimensões da FONTE, não do destino.
          ctx.translate(cw / 2, ch / 2);
          ctx.rotate((rotation * Math.PI) / 180);
          ctx.drawImage(img, -loaded.width / 2, -loaded.height / 2);
          setDims({ w: cw, h: ch });
          setBase(c);
        };
        img.src = `data:image/png;base64,${loaded.b64}`;
      })
      .catch((e) => alive && setNote(String(e)));
    return () => {
      alive = false;
    };
  }, [open, path]);

  // Worker do tesseract é caro (WASM + traineddata em RAM): morre com o modal.
  useEffect(() => {
    if (!open) void disposeOcr();
  }, [open]);

  const recalcScale = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap || dims.w === 0) return;
    setScale(fitScale(dims.w, dims.h, wrap.clientWidth - 8, wrap.clientHeight - 8));
  }, [dims]);
  useEffect(() => {
    recalcScale();
    const obs = new ResizeObserver(recalcScale);
    if (wrapRef.current) obs.observe(wrapRef.current);
    return () => obs.disconnect();
  }, [recalcScale, base]);

  // Prévia: base + caixas das palavras + máscara da seleção. Sem deps de
  // propósito (mesmo padrão do EditorView): o rascunho da seleção vive num ref.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !base || dims.w === 0) return;
    canvas.width = dims.w;
    canvas.height = dims.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(base, 0, 0);
    if (result) {
      ctx.save();
      ctx.strokeStyle = "rgba(34,197,94,0.9)";
      ctx.fillStyle = "rgba(34,197,94,0.18)";
      ctx.lineWidth = Math.max(1, 1.5 / scale);
      // As caixas vêm em coordenadas da REGIÃO reconhecida; somar a origem
      // devolve elas pro quadro inteiro (que é o que a prévia desenha).
      const o = result.origin;
      for (const wd of result.words) {
        ctx.fillRect(o.x + wd.x, o.y + wd.y, wd.w, wd.h);
        ctx.strokeRect(o.x + wd.x, o.y + wd.y, wd.w, wd.h);
      }
      ctx.restore();
    }
    if (sel) {
      ctx.save();
      ctx.fillStyle = "rgba(8,10,14,0.5)";
      ctx.beginPath();
      ctx.rect(0, 0, dims.w, dims.h);
      ctx.rect(sel.x, sel.y, sel.w, sel.h);
      ctx.fill("evenodd");
      ctx.strokeStyle = "#60a5fa";
      ctx.lineWidth = Math.max(2, 2 / scale);
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(sel.x, sel.y, sel.w, sel.h);
      ctx.restore();
    }
  });

  function toImageCoords(e: React.PointerEvent): { x: number; y: number } {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * dims.w,
      y: ((e.clientY - rect.top) / rect.height) * dims.h,
    };
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!base || busy) return;
    const p = toImageCoords(e);
    dragRef.current = p;
    setSel({ x: p.x, y: p.y, w: 0, h: 0 });
    setResult(null); // caixas da rodada anterior não valem pra outra região
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* sem captura: a seleção segue, só perde o "arrastar fora da janela" */
    }
  }
  function onPointerMove(e: React.PointerEvent) {
    const start = dragRef.current;
    if (!start) return;
    const p = toImageCoords(e);
    setSel(clampRect(normRect(start.x, start.y, p.x, p.y), dims.w, dims.h));
  }
  function onPointerUp() {
    if (!dragRef.current) return;
    dragRef.current = null;
    // Clique sem arrastar limpa a seleção (volta pra imagem inteira) em vez de
    // deixar um retângulo de 0 px que o ocrRegion ignoraria calado.
    setSel((s) => (s && (s.w < MIN_SELECTION || s.h < MIN_SELECTION) ? null : s));
  }

  async function run() {
    if (!base || busy || !langs) return;
    setBusy(true);
    setResult(null);
    setNote("");
    setStep(t("ocr.stepLoading", { pct: 0 }));
    try {
      const region = ocrRegion(sel, dims.w, dims.h);
      const s = ocrScale(region.w, region.h);
      const shot = document.createElement("canvas");
      shot.width = Math.max(1, Math.round(region.w * s));
      shot.height = Math.max(1, Math.round(region.h * s));
      const ctx = shot.getContext("2d")!;
      // `imageSmoothingQuality: high` importa: a ampliação do ocrScale é o que
      // torna um recorte pequeno legível, e o reescalonamento grosso serrilha
      // o glifo — mais ruído justamente onde o LSTM já está no limite.
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(
        base,
        region.x,
        region.y,
        region.w,
        region.h,
        0,
        0,
        shot.width,
        shot.height,
      );

      const res = await ocrCanvas(shot, langs, s, (p) => {
        const key = STATUS_KEYS[p.status];
        setStep(
          key
            ? t(key, { pct: Math.round((p.progress || 0) * 100) })
            : t("ocr.stepPreparing"),
        );
      });
      shot.width = 0; // libera a RAM do canvas ampliado (pode ser 4000×4000)
      setResult({ ...res, origin: { x: region.x, y: region.y } });
      if (!res.text) setNote(t("ocr.empty"));
    } catch (e) {
      if (e instanceof OcrCanceled) setNote(t("ocr.canceled"));
      else setNote(t("ocr.failed", { e: String(e) }));
    } finally {
      setBusy(false);
      setStep("");
    }
  }

  async function copy() {
    if (!result?.text) return;
    try {
      await navigator.clipboard.writeText(result.text);
      toast("success", t("ocr.copied"));
    } catch {
      toast("error", t("ocr.clipboardUnavailable"));
    }
  }

  // Salvar em .txt ao lado da imagem. Copiar resolve o caso "colar agora";
  // documento escaneado com 3 mil caracteres o usuário quer em arquivo, e o
  // clipboard perde tudo no próximo Ctrl+C.
  async function saveTxt() {
    if (!result?.text) return;
    const sep = navigator.userAgent.includes("Windows") ? "\\" : "/";
    const out = await save({
      title: t("ocr.saveTitle"),
      defaultPath: `${dirName(path)}${sep}${ocrTextName(fileName(path))}`,
      filters: [{ name: "TXT", extensions: ["txt"] }],
    }).catch(() => null);
    if (!out) return;
    try {
      await be.writeFileBase64(out, textToBase64(result.text));
      toast("success", t("ocr.saved", { name: fileName(out) }));
    } catch (e) {
      toast("error", t("ocr.saveFailed", { e: String(e) }));
    }
  }

  function close() {
    if (busy) cancelOcr();
    setOpen(false);
  }

  if (!open || !path) return null;

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{t("ocr.title", { name: fileName(path) })}</h2>
          <button className="icon-btn" onClick={close}>
            ✕
          </button>
        </div>

        <div className="ocr-body">
          <div className="ocr-preview" ref={wrapRef}>
            {!base ? (
              <div className="editor-loading">{t("ocr.loading")}</div>
            ) : (
              <canvas
                ref={canvasRef}
                style={{ width: dims.w * scale, height: dims.h * scale }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
              />
            )}
          </div>

          <div className="ocr-side">
            <label className="form-inline">
              <input
                type="checkbox"
                checked={langPor}
                disabled={busy}
                onChange={(e) => setLangPor(e.target.checked)}
              />
              <span>{t("ocr.langPor")}</span>
            </label>
            <label className="form-inline">
              <input
                type="checkbox"
                checked={langEng}
                disabled={busy}
                onChange={(e) => setLangEng(e.target.checked)}
              />
              <span>{t("ocr.langEng")}</span>
            </label>
            <label className="form-inline">
              <input
                type="checkbox"
                checked={langSpa}
                disabled={busy}
                onChange={(e) => setLangSpa(e.target.checked)}
              />
              <span>{t("ocr.langSpa")}</span>
            </label>
            <p className="card-hint">{sel ? t("ocr.selectionOn") : t("ocr.selectionHint")}</p>
            {sel && (
              <button className="btn small" disabled={busy} onClick={() => setSel(null)}>
                {t("ocr.clearSelection")}
              </button>
            )}

            {busy ? (
              <>
                <p className="card-hint">{step}</p>
                <button className="btn small danger" onClick={cancelOcr}>
                  {t("ocr.cancel")}
                </button>
              </>
            ) : (
              <button className="btn primary" disabled={!langs || !base} onClick={() => void run()}>
                {t("ocr.recognize")}
              </button>
            )}

            {result && (
              <>
                <textarea
                  className="ocr-text"
                  readOnly
                  value={result.text}
                  placeholder={t("ocr.empty")}
                />
                <div className="ocr-result-row">
                  <button className="btn small primary" disabled={!result.text} onClick={() => void copy()}>
                    {t("ocr.copy")}
                  </button>
                  <button className="btn small" disabled={!result.text} onClick={() => void saveTxt()}>
                    {t("ocr.save")}
                  </button>
                  <span className="card-hint">
                    {t("ocr.stats", { words: result.words.length, chars: result.text.length })}
                  </span>
                </div>
                {/* MEDIDO: num print de conversa com balão verde, o tesseract
                    devolveu 3 das 6 mensagens — a luminância do balão cai do
                    lado do TEXTO na binarização global, então glifo e fundo se
                    fundem. Não dá erro: o resultado vem parcial e plausível, que
                    é o pior jeito de falhar. Recortar só o balão lê os mesmos
                    dizeres com confiança 96, então a saída é dizer isso a quem
                    olha o resultado — sem seleção, não temos como detectar. */}
                {!sel && <p className="card-hint">{t("ocr.partialHint")}</p>}
              </>
            )}
            {note && <p className="card-hint">{note}</p>}
            <p className="card-hint">{t("ocr.footer")}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
