// Um teste por caminho que escapava do clamp na v0.8.0 (o clamp morava nos
// handlers do ViewerView e cada caminho esquecido soltava a imagem pra fora).

import { beforeEach, describe, expect, it } from "vitest";
import { effectiveZoom, useView } from "../view";

/** Estado de partida: viewport 1000×700, bitmap 800×600 já medido, zoom 1. */
function ready() {
  const v = useView.getState();
  v.setViewSize(1000, 700);
  v.setImgSize(800, 600);
  v.zoomTo(1);
}

/** Limite legal do pan por eixo: (view + img·z)/2 − min(64, img·z, view). */
function limit(view: number, img: number) {
  return (view + img) / 2 - Math.min(64, img, view);
}

beforeEach(() => {
  useView.setState({
    zoom: 0,
    rotation: 0,
    pan: { x: 0, y: 0 },
    view: { w: 0, h: 0 },
    img: { w: 0, h: 0 },
  });
});

describe("arrasto", () => {
  it("clampa em vez de deixar a imagem sumir", () => {
    ready();
    useView.getState().panTo(99999, 99999);
    expect(useView.getState().pan).toEqual({ x: limit(1000, 800), y: limit(700, 600) });
  });
  it("arrasto pequeno passa intocado", () => {
    ready();
    useView.getState().panTo(30, -40);
    expect(useView.getState().pan).toEqual({ x: 30, y: -40 });
  });
});

describe("bitmap ainda não decodificado", () => {
  // Escape v0.8.0: sem naturalWidth o clampedPan devolvia o pan CRU, e o
  // arrasto antes do decode terminava com a imagem fora ao carregar.
  it("sem medida, o pan trava no centro", () => {
    useView.getState().setViewSize(1000, 700);
    useView.getState().panTo(5000, 4000);
    expect(useView.getState().pan).toEqual({ x: 0, y: 0 });
  });
  it("viewport não medido também trava no centro", () => {
    useView.getState().setImgSize(800, 600);
    useView.getState().panTo(5000, 4000);
    expect(useView.getState().pan).toEqual({ x: 0, y: 0 });
  });
  it("o decode tardio re-clampa o que já estava escrito", () => {
    useView.getState().setViewSize(1000, 700);
    useView.setState({ pan: { x: 9999, y: 9999 }, zoom: 1 }); // pan ilegal legado
    useView.getState().setImgSize(800, 600);
    expect(useView.getState().pan).toEqual({ x: limit(1000, 800), y: limit(700, 600) });
  });
});

describe("redimensionar o viewport", () => {
  // Escape v0.8.0: pan legal na área grande vira imagem 100% fora na pequena
  // (sair do fullscreen/imersivo, restaurar a janela) — nada re-clampava.
  it("encolher a área re-clampa o pan", () => {
    ready();
    useView.getState().panTo(99999, 99999);
    expect(useView.getState().pan.x).toBe(limit(1000, 800));
    useView.getState().setViewSize(400, 300);
    expect(useView.getState().pan).toEqual({ x: limit(400, 800), y: limit(300, 600) });
  });
});

describe("rotação", () => {
  it("gira o bounding box e re-clampa nos dois eixos", () => {
    ready();
    useView.getState().panTo(99999, 99999);
    useView.getState().rotateCw(); // 800×600 → 600×800
    // X aperta (a imagem ficou mais estreita); Y já estava dentro do novo limite.
    expect(useView.getState().pan.x).toBe(limit(1000, 600));
    expect(useView.getState().pan.y).toBeLessThanOrEqual(limit(700, 800));
  });
  it("volta a 0 depois de 4 giros", () => {
    ready();
    const v = useView.getState();
    v.rotateCw();
    v.rotateCw();
    v.rotateCw();
    v.rotateCw();
    expect(useView.getState().rotation).toBe(0);
  });
});

describe("zoom", () => {
  it("zoom out extremo re-clampa (imagem menor que a folga de 64px)", () => {
    ready();
    // Pan legal em 100% que fica ilegal a 10% — o limite encolhe com a imagem.
    useView.setState({ pan: { x: 836, y: 586 } });
    useView.getState().zoomTo(0.1, { ax: 836, ay: 586 }); // âncora segura o pan
    const p = useView.getState().pan;
    expect(p.x).toBe(limit(1000, 80)); // (1000+80)/2 − 64 = 476
    expect(p.y).toBe(limit(700, 60));
  });
  it("ancorado no cursor mantém o resultado dentro do limite", () => {
    ready();
    useView.getState().zoomTo(8, { ax: 400, ay: 300 });
    const p = useView.getState().pan;
    expect(Math.abs(p.x)).toBeLessThanOrEqual(limit(1000, 800 * 8));
    expect(Math.abs(p.y)).toBeLessThanOrEqual(limit(700, 600 * 8));
  });
  it("ajustar (nz ≤ 0) re-centra", () => {
    ready();
    useView.getState().panTo(500, 300);
    useView.getState().zoomTo(0);
    expect(useView.getState().pan).toEqual({ x: 0, y: 0 });
    expect(useView.getState().zoom).toBe(0);
  });
});

describe("troca de imagem", () => {
  // Escape v0.8.0: ←/→ com o botão do mouse ainda pressionado — o reset zerava
  // o pan, mas o arrasto em curso seguia escrevendo cru na imagem nova.
  it("reset zera transform e bitmap medido", () => {
    ready();
    useView.getState().panTo(99999, 0);
    useView.getState().rotateCw();
    useView.getState().reset();
    const s = useView.getState();
    expect(s.pan).toEqual({ x: 0, y: 0 });
    expect(s.zoom).toBe(0);
    expect(s.rotation).toBe(0);
    expect(s.img).toEqual({ w: 0, h: 0 });
  });
  it("depois do reset, arrastar não move até o novo bitmap ser medido", () => {
    ready();
    useView.getState().reset();
    useView.getState().panTo(7000, 6000);
    expect(useView.getState().pan).toEqual({ x: 0, y: 0 });
  });
});

describe("effectiveZoom", () => {
  it("sem medidas vale 1", () => {
    expect(effectiveZoom(useView.getState())).toBe(1);
  });
  it("ajustar usa o fit com o respiro de 24px", () => {
    useView.getState().setViewSize(1000, 700);
    useView.getState().setImgSize(2000, 1000);
    // fit = min(976/2000, 676/1000) → o eixo X manda.
    expect(effectiveZoom(useView.getState())).toBe((1000 - 24) / 2000);
  });
  it("rotação de 90° troca w/h no fit", () => {
    useView.getState().setViewSize(1000, 700);
    useView.getState().setImgSize(2000, 1000);
    useView.getState().rotateCw(); // efetivo 1000×2000 → agora o eixo Y manda.
    expect(effectiveZoom(useView.getState())).toBe((700 - 24) / 2000);
  });
  it("zoom explícito ignora o fit", () => {
    ready();
    expect(effectiveZoom(useView.getState())).toBe(1);
  });
});
