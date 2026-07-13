import { describe, expect, it } from "vitest";
import { dirName, fileName, fmtBytes, isImagePath } from "../types";

describe("paths", () => {
  it("fileName/dirName com barras do Windows", () => {
    expect(fileName("C:\\fotos\\praia.JPG")).toBe("praia.JPG");
    expect(dirName("C:\\fotos\\praia.JPG")).toBe("C:\\fotos");
    expect(fileName("/home/u/a.png")).toBe("a.png");
  });
  it("isImagePath por extensão, sem diferenciar caixa", () => {
    expect(isImagePath("a.PNG")).toBe(true);
    expect(isImagePath("b.webp")).toBe(true);
    expect(isImagePath("c.txt")).toBe(false);
    expect(isImagePath("semext")).toBe(false);
  });
});

describe("fmtBytes", () => {
  it("formata em PT", () => {
    expect(fmtBytes(0)).toBe("—");
    expect(fmtBytes(1500)).toBe("1,5 KB");
    expect(fmtBytes(123_456_789)).toBe("123 MB");
  });
});
