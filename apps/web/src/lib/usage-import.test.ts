import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

type Cell = string | number;
type UsageRow = {
  productName: string;
  unitSize: string;
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
  parseFoodtrakUsagePdfRows: (rows: Cell[][], fileName: string) => UsageRow[];
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
    `${source}\n;globalThis.__usageImporter={parseFoodtrakUsageRows,parseFoodtrakUsagePdfRows,resolveFoodtrakUsageColumns};`,
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

  it("uses the PDF layout reader for merged cells, wrapped names, and repeated page-break rows", () => {
    const values: Cell[] = [
      "11.01",
      "1.00%",
      "10.00",
      "0.90%",
      "1.01",
      "0.10%",
      "$4.50",
      "12.00",
      "5.00",
      "1.00",
      "2.00",
      "3.00",
      "8.00",
    ];
    const carrotsValues: Cell[] = [
      "117.00",
      "0.65%",
      "117.00",
      "0.65%",
      "0.00",
      "0.00%",
      "$0.00",
      "0.00",
      "0.00",
      "0.00",
      "0.00",
      "117.00",
      "0.00",
    ];
    const repeatedCarrotsRow: Cell[] = [
      "Carrots and Green Beans",
      "Name",
      "recipe",
      "Unit",
      "Usage",
      carrotsValues[0],
      "% Sales",
      carrotsValues[1],
      "Usage",
      carrotsValues[2],
      "% Sales",
      carrotsValues[3],
      "Usage",
      carrotsValues[4],
      "% Sales",
      carrotsValues[5],
      "Est Cost",
      carrotsValues[6],
      "Begin",
      carrotsValues[7],
      "Purch",
      carrotsValues[8],
      "Xfr In",
      carrotsValues[9],
      "Xfr Out",
      carrotsValues[10],
      "Prod",
      carrotsValues[11],
      "End",
      carrotsValues[12],
    ];
    const rows: Cell[][] = [
      ["8/23/2026 11:59 PM - 8/24/2026 11:59 PM by Report Group"],
      ["Name", "Unit", "Usage", "% Sales", "Usage", "% Sales", "Usage", "% Sales", "Est Cost", "Begin", "Purch", "Xfr In", "Xfr Out", "Prod", "End"],
      ["Wine"],
      ["Champagne/Sparkling"],
      ["Jackson Triggs 'Grand", "750ml", ...values],
      ["Reserve'", "Brut Sparkling 2026"],
      ["Beer"],
      ["Bottled Beer"],
      ["Bellwoods Wizard Wolf (LCN) can", ...values],
      ["Bench Lager", "(LCN)", "can", ...values],
      ["Not Applicable"],
      ["Carrots and Green Beans", "recipe", ...carrotsValues],
      ["Plate Vegetable"],
      ["FOOD-TRAK System Copyright 2026 All Rights Reserved"],
      ["Item", "Actual", "Ideal", "Variance", "Activity"],
      repeatedCarrotsRow,
      ["Plate Vegetable"],
    ];

    const parsed = JSON.parse(
      JSON.stringify(loadUsageImporter().parseFoodtrakUsagePdfRows(rows, "Item Usage.pdf")),
    ) as UsageRow[];

    expect(parsed).toHaveLength(4);
    expect(parsed.map((item) => item.productName)).toEqual([
      "Jackson Triggs 'Grand Reserve' Brut Sparkling 2026",
      "Bellwoods Wizard Wolf (LCN)",
      "Bench Lager (LCN)",
      "Carrots and Green Beans Plate Vegetable",
    ]);
    expect(parsed[0]).toMatchObject({
      unitSize: "750ml",
      actualUsage: 11.01,
      reportCategory: "Wine",
      reportSubcategory: "Champagne/Sparkling",
      nameReconstructed: true,
      activityReconciles: true,
    });
    expect(parsed[1]).toMatchObject({
      unitSize: "can",
      reportCategory: "Beer",
      reportSubcategory: "Bottled Beer",
    });
    expect(parsed[2]).toMatchObject({
      unitSize: "can",
      productName: "Bench Lager (LCN)",
    });
    expect(parsed[3]).toMatchObject({
      unitSize: "recipe",
      reportCategory: "Not Applicable",
      nameReconstructed: true,
      activityReconciles: true,
    });
  });
});
