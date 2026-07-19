// OCR offline com tesseract.js (Apache-2.0), portado do LocalPDF. O worker, o
// core WASM e os idiomas (por/eng, tessdata_fast) são servidos de
// public/tesseract — montados por scripts/fetch-tessdata e empacotados pelo
// vite no dist: nada sai da máquina, nem no primeiro uso.
//
// Diferença pro LocalPDF: lá a entrada é uma página de PDF rasterizada pelo
// pdf.js; aqui é um canvas que o chamador já montou (imagem inteira ou recorte,
// já girada). Toda a geometria de "o que vai pro tesseract" é função pura
// abaixo — o acerto do OCR depende dela e ela é a parte testável.

import { createWorker, type Worker } from "tesseract.js";
import { clampRect, type Rect } from "./geometry";

export interface OcrWord {
  text: string;
  /** Caixa em coordenadas do canvas ENVIADO (já dividida pela escala de OCR). */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface OcrResult {
  text: string;
  words: OcrWord[];
}

/**
 * Lado mínimo alvo antes de reconhecer. MEDIDO (não suposto): num recorte de
 * print com fonte de 9 pt (380×60), ampliar 4× subiu a confiança do tesseract
 * de 90 pra 96 com o mesmo texto — o LSTM foi treinado em ~300 dpi e trabalha
 * no limite com glifo de ~12 px de altura. Não é a diferença entre ler e não
 * ler: é margem, e é barata. Em imagem já grande a escala fica em 1 e não custa
 * nada. (Contraexemplo do mesmo teste: ampliar NÃO conserta ambiguidade de
 * forma — "BRA2E19" saiu "BRAZE19" em todas as escalas.)
 */
const OCR_MIN_SIDE = 1000;

/** Teto de ampliação e de lado, pra foto de 12 MP não virar canvas de 1 GB. */
const OCR_MAX_SCALE = 4;
const OCR_MAX_SIDE = 4000;

/**
 * Escala de render pro OCR. Amplia o que é pequeno demais (até OCR_MAX_SCALE) e
 * NUNCA reduz — reduzir destrói glifo, e o custo de tempo do tesseract vale
 * menos que o acerto. O teto por lado ganha do piso: se ampliar estourar
 * OCR_MAX_SIDE, a escala cai até caber (podendo voltar a 1).
 */
export function ocrScale(w: number, h: number): number {
  if (w <= 0 || h <= 0) return 1;
  const up = Math.min(OCR_MIN_SIDE / Math.min(w, h), OCR_MAX_SCALE);
  const cap = OCR_MAX_SIDE / Math.max(w, h);
  return Math.max(1, Math.min(up, cap));
}

/** Dimensões do bitmap depois de girado (90/270 trocam os eixos). */
export function rotatedDims(w: number, h: number, rotation: number): { w: number; h: number } {
  const norm = ((rotation % 360) + 360) % 360; // aceita negativo (giro anti-horário)
  return norm % 180 !== 0 ? { w: h, h: w } : { w, h };
}

/**
 * Região que vai pro OCR, em coordenadas da imagem JÁ GIRADA. Sem seleção (ou
 * com uma seleção degenerada — clique sem arrastar) usa o quadro inteiro: um
 * retângulo de 2 px devolveria texto vazio e pareceria bug do OCR, não do
 * gesto. O limiar é o mesmo do crop do editor (8 px).
 *
 * Recortar antes de reconhecer é o ganho real da seleção: o tesseract analisa
 * o layout da página inteira, então isolar uma linha tira do caminho tudo que
 * podia ser confundido com ela — além de ser muito mais rápido.
 */
export const MIN_SELECTION = 8;

export function ocrRegion(sel: Rect | null, w: number, h: number): Rect {
  if (!sel || sel.w < MIN_SELECTION || sel.h < MIN_SELECTION) return { x: 0, y: 0, w, h };
  const c = clampRect(sel, w, h);
  return c.w < MIN_SELECTION || c.h < MIN_SELECTION ? { x: 0, y: 0, w, h } : c;
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

let worker: Worker | null = null;
let workerLangs = "";

/**
 * Rejeitador do reconhecimento em curso. MEDIDO no webview: matar o worker com
 * um `recognize` em voo NÃO rejeita a promessa dele — ela fica pendente pra
 * sempre (testado: 20 s depois do terminate, nem resolve nem rejeita). Com
 * `await` puro, o `finally` do chamador nunca rodaria e o modal ficaria preso
 * em "reconhecendo" com um Cancelar que não cancela nada. Por isso o
 * cancelamento é uma promessa PRÓPRIA, corrida contra a do tesseract: quem
 * responde é o nosso reject, não o worker morto.
 */
let cancelReject: ((e: Error) => void) | null = null;

/**
 * Token da rodada. A promessa de cancelamento só existe DEPOIS que o worker
 * está de pé, e criar o worker é justamente a parte lenta (carregar os
 * traineddata): um Cancelar apertado nessa janela não teria em quem bater e o
 * reconhecimento seguiria num worker que o próprio cancelamento já matou.
 */
let runId = 0;
let canceledRun = -1;

export interface OcrProgress {
  /** Etapa crua do tesseract ("loading language traineddata", "recognizing text"…). */
  status: string;
  /** 0..1 dentro da etapa. */
  progress: number;
}

async function getWorker(langs: string, onProgress?: (p: OcrProgress) => void): Promise<Worker> {
  // O logger é fixado na CRIAÇÃO do worker, então trocar de callback obriga a
  // recriar; como o custo real é carregar os traineddata, só reusamos quando
  // não há callback novo. Idioma diferente também invalida o worker.
  if (worker && workerLangs === langs && !onProgress) return worker;
  if (worker) {
    await worker.terminate().catch(() => {});
    worker = null;
  }
  worker = await createWorker(langs.split("+"), 1, {
    workerPath: "/tesseract/worker.min.js",
    corePath: "/tesseract/core",
    langPath: "/tesseract/lang",
    gzip: false,
    logger: onProgress ? (m) => onProgress({ status: m.status, progress: m.progress }) : undefined,
  });
  workerLangs = langs;
  return worker;
}

export class OcrCanceled extends Error {
  constructor() {
    super("OCR cancelado");
    this.name = "OcrCanceled";
  }
}

/**
 * Reconhece o conteúdo de um canvas. O tesseract.js roda o WASM num Web Worker
 * de verdade (worker.min.js) — a janela não trava durante o reconhecimento, que
 * é o ponto: foto de documento leva dezenas de segundos.
 */
export async function ocrCanvas(
  canvas: HTMLCanvasElement,
  langs: string,
  scale: number,
  onProgress?: (p: OcrProgress) => void,
): Promise<OcrResult> {
  const mine = ++runId;
  const w = await getWorker(langs, onProgress);
  if (canceledRun === mine) throw new OcrCanceled(); // cancelado enquanto subia
  const canceledSignal = new Promise<never>((_, reject) => {
    cancelReject = reject;
  });
  let data;
  try {
    // O `.catch` no lado do tesseract não é decoração: se o cancelamento ganhar
    // a corrida, a promessa perdedora ainda pode rejeitar depois (worker morto)
    // e viraria unhandledrejection no console do usuário.
    const recognizing = w
      .recognize(canvas, {}, { text: true, blocks: true })
      .catch((e: unknown) => {
        if (cancelReject) throw e; // ninguém cancelou: é falha de verdade
        throw new OcrCanceled();
      });
    ({ data } = await Promise.race([recognizing, canceledSignal]));
  } finally {
    cancelReject = null;
  }

  const words: OcrWord[] = [];
  for (const block of data.blocks ?? []) {
    for (const par of block.paragraphs) {
      for (const line of par.lines) {
        for (const wd of line.words) {
          const txt = wd.text.trim();
          if (!txt) continue;
          words.push({
            text: txt,
            x: wd.bbox.x0 / scale,
            y: wd.bbox.y0 / scale,
            w: (wd.bbox.x1 - wd.bbox.x0) / scale,
            h: (wd.bbox.y1 - wd.bbox.y0) / scale,
          });
        }
      }
    }
  }
  return { text: (data.text ?? "").trim(), words };
}

/**
 * Cancela o reconhecimento em curso: devolve o controle ao chamador NA HORA
 * (pela promessa de cancelamento) e mata o worker em seguida — o tesseract não
 * aborta um `recognize` no meio, então terminar é o único jeito de parar o WASM
 * de queimar CPU. O próximo run recria o worker do zero.
 */
export function cancelOcr(): void {
  canceledRun = runId;
  const reject = cancelReject;
  cancelReject = null;
  reject?.(new OcrCanceled());
  void disposeOcr();
}

export async function disposeOcr(): Promise<void> {
  const w = worker;
  worker = null;
  workerLangs = "";
  if (w) await w.terminate().catch(() => {});
}
