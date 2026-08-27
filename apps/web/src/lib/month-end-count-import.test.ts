import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

function loadHelper() {
  const source = readFileSync(new URL("../../public/legacy/js/usage.js", import.meta.url), "utf8");
  const context = {};
  runInNewContext(`${source}\n;globalThis.__helper={monthEndCountItemsFromRows};`, context);
  return (context as { __helper: { monthEndCountItemsFromRows: (rows: Array<Record<string, unknown>>) => { items: Record<string, number>; accepted: unknown[]; duplicates: unknown[]; unmatched: unknown[] } } }).__helper;
}

describe("month-end End-value extraction", () => {
  it("copies one End value per matched product without summing duplicates", () => {
    const result = loadHelper().monthEndCountItemsFromRows([
      { productId: "barolo", matched: true, end: 6 },
      { productId: "barolo", matched: true, end: 3 },
      { productId: "vodka", matched: true, end: "8.5" },
      { productId: null, matched: false, end: 4 },
      { productId: "bad", matched: true, end: "" },
    ]);

    expect(result.items).toEqual({ barolo: 6, vodka: 8.5 });
    expect(result.accepted).toHaveLength(2);
    expect(result.duplicates).toHaveLength(1);
    expect(result.unmatched).toHaveLength(1);
  });
});
