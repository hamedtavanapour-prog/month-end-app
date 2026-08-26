import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

type Cell = string | number;
type UsageRow = {
  productName: string;
  actualUsage: number;
  idealPercentSales: number;
  transferOut: number;
  production: number;
  end: number;
  periodStart: string;
  periodEnd: string;
  reportCategory: string;
  reportSubcategory: string;
  nameReconstructed: boolean;
  blankNameRecovered: boolean;
  activityReconciles: boolean;
};

type UsageImporter = {
  parseFoodtrakUsageRows: (rows: Cell[][], fileName: string) => UsageRow[];
  resolveFoodtrakUsageColumns: (rows: Cell[][]) => Record<string, number>;
};

function loadUsageImporter(): UsageImporter {
  const source = readFileSync(new URL("../../public/legacy/js/usage.js", import.meta.url), "utf8");
  const context = {
    state: { products: [] },
    normalizeProductUnits: () => undefined,
    normMatch: (value: unknown) => String(value ?? "").trim().toLowerCase(),
  };
  runInNewContext(
    `${source}\n;globalThis.__usageImporter={parseFoodtrakUsageRows,resolveFoodtrakUsageColumns};`,
    context,
  );
  return (context as typeof context & { __usageImporter: UsageImporter }).__usageImporter;
}

function row(values: Record<number, Cell>): Cell[] {
  const cells: Cell[] = Array.from({ length: 26 }, () => "");
  Object.entries(values).forEach(([column, value]) => {
    cells[Number(column)] = value;
  });
  return cells;
}

function usageRow(name: string, values: Partial<Record<number, Cell>> = {}): Cell[] {
  return row({
    1: name,
    3: "each",
    5: 11,
    6: 0.01,
    7: 10,
    9: 0.02,
    10: 1,
    11: 0.001,
    12: 4.5,
    14: 12,
    16: 5,
    17: 1,
    19: 2,
    21: 3,
    24: 8,
    ...values,
  });
}

describe("FOOD-TRAK usage imports", () => {
  it("detects displaced columns and preserves section and wrapped-name structure", () => {
    const rows = [
      row({ 1: "8/25/2026 9:33:19 PM", 20: "Page", 21: 1, 23: "of", 24: 1 }),
      row({ 3: "Item Usage" }),
      row({ 3: "8/23/2026 11:59 PM - 8/24/2026 11:59 PM by Report Group" }),
      row({ 1: "Item", 5: "Actual", 7: "Ideal", 10: "Variance", 13: "Activity" }),
      row({
        1: "Name",
        3: "Unit",
        5: "Usage",
        6: "% Sales",
        7: "Usage",
        8: "% Sales",
        10: "Usage",
        11: "% Sales",
        12: "Est Cost",
        13: "Begin",
        16: "Purch",
        17: "Xfr In",
        18: "Xfr Out",
        20: "Prod",
        22: "End",
      }),
      row({ 1: "Entree", 25: "Department Sales: $0.00" }),
      row({ 1: "Meat" }),
      usageRow("Steak Sirloin 8 Oz"),
      row({ 1: "Seafood" }),
      usageRow("House-made"),
      row({ 1: "Sauce" }),
      row({ 1: "Sauces" }),
      usageRow("", { 5: 5, 10: 5, 14: 7, 16: 0, 17: 0, 19: 0, 21: 0, 24: 2 }),
      row({ 1: "Carrots and Green Beans" }),
    ];

    const importer = loadUsageImporter();
    expect(importer.resolveFoodtrakUsageColumns(rows)).toMatchObject({
      name: 1,
      idealPercentSales: 9,
      begin: 14,
      transferOut: 19,
      production: 21,
      end: 24,
    });

    const parsed = JSON.parse(
      JSON.stringify(importer.parseFoodtrakUsageRows(rows, "Item Usage.xls")),
    ) as UsageRow[];

    expect(parsed).toHaveLength(3);
    expect(parsed.map((item) => item.productName)).toEqual([
      "Steak Sirloin 8 Oz",
      "House-made Sauce",
      "Carrots and Green Beans",
    ]);
    expect(parsed[0]).toMatchObject({
      idealPercentSales: 0.02,
      transferOut: 2,
      production: 3,
      end: 8,
      periodStart: "2026-08-23",
      periodEnd: "2026-08-24",
      reportCategory: "Entree",
      reportSubcategory: "Meat",
      nameReconstructed: false,
      activityReconciles: true,
    });
    expect(parsed[1]).toMatchObject({
      reportCategory: "Entree",
      reportSubcategory: "Seafood",
      nameReconstructed: true,
      blankNameRecovered: false,
      activityReconciles: true,
    });
    expect(parsed[2]).toMatchObject({
      reportCategory: "Entree",
      reportSubcategory: "Sauces",
      nameReconstructed: true,
      blankNameRecovered: true,
      activityReconciles: true,
    });
  });
});
