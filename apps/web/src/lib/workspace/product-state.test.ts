import { describe, expect, it } from "vitest";

import { mergeProductsInWorkspace } from "./product-state";

describe("shared workspace product merge", () => {
  it("atomically removes the duplicate and rewrites count and usage references", () => {
    const workspace = mergeProductsInWorkspace({
      products: [{ id: "keep", name: "Barolo" }, { id: "remove", name: "Batasiolo Barolo" }],
      suppliers: [{ id: "supplier", products: ["remove"] }],
      rooms: [{ id: "room", productIds: ["keep", "remove"], manualProductIds: ["remove"] }],
      inventories: [{ items: { keep: 2, remove: 4 }, rooms: [{ items: { remove: 3 }, extraProductIds: ["remove"] }] }],
      usageLogs: [{ rows: [{ productId: "keep", idealUsage: 1 }, { productId: "remove", idealUsage: 2 }] }],
      uploadedUsage: [],
      orders: [], drinks: [], menus: [],
    }, "keep", "remove", { id: "keep", name: "Barolo", aliases: "Batasiolo Barolo", suppliers: [] });

    expect(workspace.products).toEqual([{ id: "keep", name: "Barolo", aliases: "Batasiolo Barolo", suppliers: [] }]);
    expect(workspace.suppliers).toEqual([{ id: "supplier", products: [] }]);
    expect(workspace.inventories).toEqual([expect.objectContaining({ items: { keep: 6 } })]);
    expect(workspace.usageLogs).toEqual([{ rows: [{ productId: "keep", idealUsage: 3 }] }]);
  });
});
