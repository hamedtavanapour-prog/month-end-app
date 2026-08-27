import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

type Product = {
  id: string;
  name: string;
  inventoryName?: string;
  aliases?: string;
  sku?: string;
  category: string;
  subcategory?: string;
  unit: string;
  unitSize?: string;
  units: Array<{ unit: string; unitSize?: string; sku?: string; cost?: number; par?: number }>;
  archived?: boolean;
};

type UsageEntry = {
  row: Record<string, unknown>;
  category: string;
  subcategory: string;
  suggestionAccepted?: boolean;
  manualMatch?: boolean;
  productCreated?: boolean;
};

function loadReviewHelpers(products: Product[]) {
  const source = readFileSync(new URL("../../public/legacy/js/usage.js", import.meta.url), "utf8");
  const context = {
    state: { products },
    pendingUsageImport: { fileName: "usage.xls" },
    normalizeProductUnits: (product: Product) => product.units,
    normMatch: (value: unknown) => String(value ?? "").trim().toLowerCase(),
    uid: () => "new-product",
  };
  runInNewContext(
    `${source}\n;globalThis.__review={usageImportCatalogMatches,linkUsageImportRow,createUsageImportProduct};`,
    context,
  );
  return (context as typeof context & { __review: {
    usageImportCatalogMatches: (query?: string) => Product[];
    linkUsageImportRow: (entry: UsageEntry, product: Product) => void;
    createUsageImportProduct: (entry: UsageEntry) => Product;
  } }).__review;
}

const catalog: Product[] = [
  { id: "vodka", name: "House Vodka", inventoryName: "Vodka 750", aliases: "rail vodka", sku: "V-750", category: "Spirits", subcategory: "Vodka", unit: "bottle", units: [{ unit: "bottle", unitSize: "750 ml" }] },
  { id: "lager", name: "Local Lager", category: "Beer", subcategory: "Cans", unit: "can", units: [{ unit: "can", unitSize: "473 ml" }] },
  { id: "old", name: "Archived Product", category: "Other", unit: "unit", units: [{ unit: "unit" }], archived: true },
];

describe("usage import review choices", () => {
  it("searches the entire active catalog by name, alias, SKU, or category", () => {
    const helpers = loadReviewHelpers([...catalog]);
    expect(helpers.usageImportCatalogMatches("rail").map((product) => product.id)).toEqual(["vodka"]);
    expect(helpers.usageImportCatalogMatches("V-750").map((product) => product.id)).toEqual(["vodka"]);
    expect(helpers.usageImportCatalogMatches("beer").map((product) => product.id)).toEqual(["lager"]);
    expect(helpers.usageImportCatalogMatches("").map((product) => product.id)).not.toContain("old");
  });

  it("can match an unmatched row to any chosen catalog product", () => {
    const helpers = loadReviewHelpers([...catalog]);
    const entry: UsageEntry = {
      row: { productName: "Mystery Item", unitSize: "473 ml", matched: false },
      category: "Beer",
      subcategory: "Cans",
    };
    helpers.linkUsageImportRow(entry, catalog[1]);
    expect(entry.row).toEqual(expect.objectContaining({
      reportProductName: "Mystery Item",
      productId: "lager",
      productName: "Local Lager",
      matchedName: "Local Lager",
      matched: true,
      sizeMatched: true,
    }));
  });

  it("can add one unmatched row directly as a new product", () => {
    const products = [...catalog];
    const helpers = loadReviewHelpers(products);
    const entry: UsageEntry = {
      row: { productName: "New Syrup", reportProductName: "New Syrup", unitSize: "1 L", sku: "S-1L", matched: false },
      category: "Other",
      subcategory: "Syrups",
    };
    const product = helpers.createUsageImportProduct(entry);
    expect(product).toEqual(expect.objectContaining({ id: "new-product", name: "New Syrup", sku: "S-1L" }));
    expect(entry.productCreated).toBe(true);
    expect(entry.row).toEqual(expect.objectContaining({ productId: "new-product", matched: true }));
    expect(products).toHaveLength(4);
  });
});
