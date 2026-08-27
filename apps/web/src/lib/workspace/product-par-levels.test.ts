import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

import { describe, expect, it } from "vitest";

type SeedProduct = { name: string };
type ParContext = {
  PRODUCT_PAR_LEVEL_VERSION?: string;
  PRODUCT_PAR_LEVELS?: Record<string, number>;
};
type SeedContext = { SEED_PRODUCTS?: SeedProduct[] };

const dataDirectory = path.resolve(process.cwd(), "public/legacy/js/data");
const parSource = fs.readFileSync(path.join(dataDirectory, "par-levels-aug-2026.js"), "utf8");
const seedSource = fs.readFileSync(path.join(dataDirectory, "seed-products.js"), "utf8");
const parContext: ParContext = {};
const seedContext: SeedContext = {};
vm.runInNewContext(`${parSource}\nglobalThis.PRODUCT_PAR_LEVEL_VERSION = PRODUCT_PAR_LEVEL_VERSION; globalThis.PRODUCT_PAR_LEVELS = PRODUCT_PAR_LEVELS;`, parContext);
vm.runInNewContext(`${seedSource}\nglobalThis.SEED_PRODUCTS = SEED_PRODUCTS;`, seedContext);

describe("approved product par levels", () => {
  it("maps every approved workbook value to one catalog product", () => {
    const levels = parContext.PRODUCT_PAR_LEVELS ?? {};
    const productNames = new Set((seedContext.SEED_PRODUCTS ?? []).map((product) => product.name));
    expect(parContext.PRODUCT_PAR_LEVEL_VERSION).toBe("2026-08-26");
    expect(Object.keys(levels)).toHaveLength(209);
    expect(Object.keys(levels).every((name) => productNames.has(name))).toBe(true);
    expect(Object.values(levels).every((par) => Number.isFinite(par) && par >= 0)).toBe(true);
  });

  it("preserves representative whole and fractional new par values", () => {
    const levels = parContext.PRODUCT_PAR_LEVELS ?? {};
    expect(levels.Absolut).toBe(6);
    expect(levels.Corona).toBe(20);
    expect(levels["Cherry Brandy"]).toBe(1.5);
    expect(levels["Johnnie Walker Blue"]).toBe(0.2);
    expect(levels["Wizard Wolf"]).toBe(12);
  });
});
