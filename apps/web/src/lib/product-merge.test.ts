import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

type Workspace = Record<string, unknown>;

function mergeHelpers(state: Workspace) {
  const source = readFileSync(new URL("../../public/legacy/js/products.js", import.meta.url), "utf8");
  const context = {
    state,
    document: { addEventListener: () => undefined },
    normalizeProductUnits: (product: Record<string, unknown>) => Array.isArray(product.units) ? product.units : [],
  };
  runInNewContext(`${source}\n;globalThis.__merge={mergeProductState};`, context);
  return (context as typeof context & { __merge: { mergeProductState: (workspace: Workspace, keepId: string, removeId: string, fieldSources?: Record<string, string>) => boolean } }).__merge;
}

describe("product merge", () => {
  it("keeps the chosen record while accepting field values from either product", () => {
    const state = {
      departments: [{ id: "bar", name: "Bar", archived: false, managerId: "", roomIds: [], userIds: [] }],
      products: [
        { id: "keep", name: "Barolo", inventoryName: "", aliases: "", departments: ["bar"], suppliers: ["s1"], units: [{ unit: "bottle", unitSize: "750 ml", sku: "A" }], cost: 10, par: 2 },
        { id: "remove", name: "Batasiolo Barolo", inventoryName: "Batasiolo", aliases: "barolo wine", departments: ["bar"], suppliers: ["s2"], units: [{ unit: "case", unitSize: "12 x 750 ml", sku: "B" }], cost: 20, par: 4 },
      ],
      suppliers: [{ id: "s1", products: ["keep"] }, { id: "s2", products: ["remove"] }],
      rooms: [{ id: "room", productIds: ["keep", "remove"], manualProductIds: ["remove"] }],
      inventories: [{ items: { keep: 2, remove: 3 }, rooms: [{ items: { keep: 1, remove: 4 }, extraProductIds: ["remove"] }] }],
      orders: [{ lines: [{ productId: "remove" }] }],
      usageLogs: [{ rows: [{ productId: "keep", actualUsage: 2, idealUsage: 1 }, { productId: "remove", actualUsage: 3, idealUsage: 4 }] }],
      uploadedUsage: [{ productId: "remove", actualUsage: 3 }],
      drinks: [], menus: [],
    };
    const helpers = mergeHelpers(state);

    expect(helpers.mergeProductState(state, "keep", "remove", {
      name: "remove", cost: "remove", par: "keep", suppliers: "remove", aliases: "remove",
    })).toBe(true);
    expect(state.products.map((product) => product.id)).toEqual(["keep"]);
    expect(state.products[0].name).toBe("Batasiolo Barolo");
    expect(state.products[0].cost).toBe(20);
    expect(state.products[0].par).toBe(2);
    expect(state.products[0].aliases).toBe("barolo wine");
    expect(state.products[0].units).toHaveLength(2);
    expect(state.suppliers[0].products).toEqual([]);
    expect(state.suppliers[1].products).toEqual(["keep"]);
    expect(state.rooms[0].productIds).toEqual(["keep"]);
    expect(state.inventories[0].items).toEqual({ keep: 5 });
    expect(state.inventories[0].rooms[0].items).toEqual({ keep: 5 });
    expect(state.orders[0].lines[0].productId).toBe("keep");
    expect(state.usageLogs[0].rows).toEqual([expect.objectContaining({ productId: "keep", actualUsage: 5, idealUsage: 5 })]);
  });
});
