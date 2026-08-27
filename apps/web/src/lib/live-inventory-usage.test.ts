import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

type UsageRow = {
  productId: string;
  matched: boolean;
  actualUsage: number;
  idealUsage: number | string;
};

type UsageLog = {
  archived?: boolean;
  periodEnd: string;
  rows: UsageRow[];
};

type LiveRow = {
  live: number | string;
  par: number | string;
};

function loadLiveUsageCalculator(usageLogs: UsageLog[]) {
  const source = readFileSync(new URL("../../public/legacy/js/inventory.js", import.meta.url), "utf8");
  const context = {
    state: { usageLogs },
    liveInventoryBaselineId: null,
    liveInventoryRoomIds: null,
    currentCountRoomLock: null,
    document: {
      addEventListener: () => undefined,
      getElementById: () => null,
    },
    window: { addEventListener: () => undefined },
    ensureUsageLogs: () => usageLogs,
    usageLogPeriod: (log: UsageLog) => ({ start: "", end: log.periodEnd }),
    usageLogRows: (log: UsageLog) => log.rows,
    usageNumber: (value: number | string) => {
      if (value === "" || value === null || value === undefined) return "";
      const number = Number(value);
      return Number.isFinite(number) ? number : "";
    },
  };
  runInNewContext(
    `${source}\n;globalThis.__liveUsage={liveUsageDeductionQty,liveUsageQtyByProduct,liveBelowParQty};`,
    context,
  );
  return (
    context as typeof context & {
      __liveUsage: {
        liveUsageDeductionQty: (row: UsageRow) => number;
        liveUsageQtyByProduct: (baselineDate?: string) => Record<string, number>;
        liveBelowParQty: (row: LiveRow) => number;
      };
    }
  ).__liveUsage;
}

describe("live inventory deductions from usage reports", () => {
  it("deducts ideal usage without changing the report's actual usage", () => {
    const currentRows: UsageRow[] = [
      { productId: "p1", matched: true, actualUsage: 10, idealUsage: 6 },
      { productId: "p1", matched: true, actualUsage: 5, idealUsage: 2 },
      { productId: "p2", matched: true, actualUsage: 7, idealUsage: "" },
      { productId: "p3", matched: false, actualUsage: 20, idealUsage: 12 },
    ];
    const calculator = loadLiveUsageCalculator([
      { periodEnd: "2026-08-24", rows: currentRows },
      {
        periodEnd: "2026-08-20",
        rows: [{ productId: "p1", matched: true, actualUsage: 40, idealUsage: 30 }],
      },
      {
        archived: true,
        periodEnd: "2026-08-24",
        rows: [{ productId: "p1", matched: true, actualUsage: 50, idealUsage: 35 }],
      },
    ]);

    expect(calculator.liveUsageDeductionQty(currentRows[0])).toBe(6);
    expect(currentRows[0].actualUsage).toBe(10);
    expect(calculator.liveUsageQtyByProduct("2026-08-23")).toEqual({ p1: 8, p2: 0 });
  });

  it("shows only the amount that live inventory is below its par level", () => {
    const calculator = loadLiveUsageCalculator([]);

    expect(calculator.liveBelowParQty({ live: 6, par: 10 })).toBe(4);
    expect(calculator.liveBelowParQty({ live: 12, par: 10 })).toBe(0);
    expect(calculator.liveBelowParQty({ live: -2, par: 10 })).toBe(12);
    expect(calculator.liveBelowParQty({ live: 3, par: 0 })).toBe(0);
  });
});
