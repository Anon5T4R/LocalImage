/** Modelo e desenho das anotações do editor. Coordenadas SEMPRE em pixels da
 *  imagem original — o canvas de exibição aplica escala, e o export desenha
 *  1:1 no tamanho natural (a anotação "queima" nítida, não borrada). */

import { normRect } from "./geometry";

export type DrawTool = "arrow" | "rect" | "highlight" | "redact" | "pen" | "text" | "step";
export type Tool = DrawTool | "crop";

export interface Annot {
  tool: DrawTool;
  color: string;
  /** Espessura do traço em px da imagem. */
  width: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Traço livre (pen). */
  points?: { x: number; y: number }[];
  /** Texto (tool=text) — fontSize em px da imagem. */
  text?: string;
  fontSize?: number;
  /** Número do passo (tool=step). */
  n?: number;
}

export function drawAnnot(ctx: CanvasRenderingContext2D, a: Annot) {
  ctx.save();
  ctx.strokeStyle = a.color;
  ctx.fillStyle = a.color;
  ctx.lineWidth = a.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  switch (a.tool) {
    case "rect": {
      const r = normRect(a.x1, a.y1, a.x2, a.y2);
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      break;
    }
    case "highlight": {
      const r = normRect(a.x1, a.y1, a.x2, a.y2);
      ctx.globalAlpha = 0.35;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      break;
    }
    case "redact": {
      const r = normRect(a.x1, a.y1, a.x2, a.y2);
      ctx.fillStyle = "#0b0d10";
      ctx.fillRect(r.x, r.y, r.w, r.h);
      break;
    }
    case "arrow": {
      const { x1, y1, x2, y2 } = a;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      // Ponta proporcional à espessura.
      const head = Math.max(10, a.width * 4);
      const ang = Math.atan2(y2 - y1, x2 - x1);
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - head * Math.cos(ang - 0.45), y2 - head * Math.sin(ang - 0.45));
      ctx.lineTo(x2 - head * Math.cos(ang + 0.45), y2 - head * Math.sin(ang + 0.45));
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "pen": {
      const pts = a.points ?? [];
      if (pts.length > 1) {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
      break;
    }
    case "text": {
      const size = a.fontSize ?? 24;
      ctx.font = `600 ${size}px "Segoe UI", system-ui, sans-serif`;
      ctx.textBaseline = "top";
      // Contorno sutil pra ler sobre qualquer fundo.
      ctx.lineWidth = Math.max(2, size / 8);
      ctx.strokeStyle = "rgba(0,0,0,0.55)";
      const lines = (a.text ?? "").split("\n");
      lines.forEach((line, i) => {
        ctx.strokeText(line, a.x1, a.y1 + i * size * 1.25);
        ctx.fillText(line, a.x1, a.y1 + i * size * 1.25);
      });
      break;
    }
    case "step": {
      const r = a.fontSize ?? 18;
      ctx.beginPath();
      ctx.arc(a.x1, a.y1, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = `700 ${r * 1.1}px "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(a.n ?? 1), a.x1, a.y1 + r * 0.05);
      break;
    }
  }
  ctx.restore();
}

export function drawAll(ctx: CanvasRenderingContext2D, annots: Annot[]) {
  for (const a of annots) drawAnnot(ctx, a);
}

/** O próximo número de passo (badge numerado) dado o que já existe. */
export function nextStepNumber(annots: Annot[]): number {
  let max = 0;
  for (const a of annots) if (a.tool === "step" && (a.n ?? 0) > max) max = a.n ?? 0;
  return max + 1;
}

/** Uma anotação "vazia" (clique sem arrasto) não vale a pena ser commitada. */
export function isNoop(a: Annot): boolean {
  if (a.tool === "text") return !(a.text ?? "").trim();
  if (a.tool === "step") return false;
  if (a.tool === "pen") return (a.points?.length ?? 0) < 2;
  return Math.abs(a.x2 - a.x1) < 3 && Math.abs(a.y2 - a.y1) < 3;
}
