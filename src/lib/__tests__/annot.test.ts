import { describe, expect, it } from "vitest";
import { isNoop, nextStepNumber, type Annot } from "../annot";

function base(tool: Annot["tool"], extra: Partial<Annot> = {}): Annot {
  return { tool, color: "#f00", width: 4, x1: 10, y1: 10, x2: 10, y2: 10, ...extra };
}

describe("nextStepNumber", () => {
  it("continua a contagem dos passos existentes", () => {
    expect(nextStepNumber([])).toBe(1);
    expect(nextStepNumber([base("step", { n: 1 }), base("step", { n: 4 })])).toBe(5);
    expect(nextStepNumber([base("rect")])).toBe(1);
  });
});

describe("isNoop", () => {
  it("clique sem arrasto não vira caixa/seta", () => {
    expect(isNoop(base("rect"))).toBe(true);
    expect(isNoop(base("rect", { x2: 60, y2: 40 }))).toBe(false);
    expect(isNoop(base("arrow", { x2: 11, y2: 11 }))).toBe(true);
  });
  it("texto vazio é noop; passo nunca é", () => {
    expect(isNoop(base("text", { text: "  " }))).toBe(true);
    expect(isNoop(base("text", { text: "olá" }))).toBe(false);
    expect(isNoop(base("step", { n: 1 }))).toBe(false);
  });
  it("pen precisa de pelo menos 2 pontos", () => {
    expect(isNoop(base("pen", { points: [{ x: 1, y: 1 }] }))).toBe(true);
    expect(
      isNoop(
        base("pen", {
          points: [
            { x: 1, y: 1 },
            { x: 5, y: 5 },
          ],
        }),
      ),
    ).toBe(false);
  });
});
