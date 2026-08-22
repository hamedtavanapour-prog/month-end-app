import { describe, expect, it } from "vitest";

import { calculateTheoreticalUsage, type PosSaleLine } from "./theoretical-usage";
import type { MonthEndMenuItem, MonthEndProduct } from "./workspace-catalog";

const products: MonthEndProduct[] = [
  { id: "grey-goose", name: "Grey Goose" },
  { id: "vermouth", name: "Vermouth" },
];
const menuItems: MonthEndMenuItem[] = [{
  id: "martini",
  name: "Grey Goose Martini",
  menuId: "cocktails",
  menuName: "Cocktails",
  variants: [{ key: "2oz", name: "2 oz" }],
  ingredients: [
    { id: "vodka", name: "Grey Goose", linkKind: "product", productId: "grey-goose", amounts: { "2oz": "2 oz" } },
    { id: "vermouth", name: "Vermouth", linkKind: "product", productId: "vermouth", amounts: { "2oz": "0.5 oz" } },
  ],
}];
const line = (overrides: Partial<PosSaleLine> = {}): PosSaleLine => ({
  id: "line-1",
  ticketId: "ticket-db-1",
  externalTicketId: "ticket-1001",
  ticketNumber: "1001",
  ticketStatus: "closed",
  posMenuItemId: "pos-martini",
  externalMenuItemId: "external-martini",
  name: "GREY GOOSE MARTINI 2OZ",
  quantity: 10,
  voided: false,
  cancelled: false,
  ...overrides,
});

describe("theoretical usage", () => {
  it("expands sold quantities through confirmed recipes with traceability", () => {
    const result = calculateTheoreticalUsage({
      saleLines: [line()],
      mappings: [{ posMenuItemId: "pos-martini", status: "mapped", monthEndMenuItemId: "martini", monthEndMenuVariantKey: "2oz" }],
      menuItems,
      products,
    });

    expect(result.productUsage).toEqual([
      expect.objectContaining({ productId: "grey-goose", ounces: 20, sourceTicketItems: 1 }),
      expect.objectContaining({ productId: "vermouth", ounces: 5, sourceTicketItems: 1 }),
    ]);
    expect(result.traces).toHaveLength(2);
    expect(result.traces[0]).toMatchObject({ externalTicketId: "ticket-1001", monthEndMenuItemId: "martini", soldQuantity: 10 });
  });

  it.each([
    ["voided line", line({ voided: true })],
    ["cancelled line", line({ cancelled: true })],
    ["cancelled ticket", line({ ticketStatus: "cancelled" })],
  ])("does not count a %s", (_label, saleLine) => {
    const result = calculateTheoreticalUsage({
      saleLines: [saleLine],
      mappings: [{ posMenuItemId: "pos-martini", status: "mapped", monthEndMenuItemId: "martini", monthEndMenuVariantKey: "2oz" }],
      menuItems,
      products,
    });
    expect(result.productUsage).toEqual([]);
  });

  it.each(["unmapped", "ignored", "needs_review"] as const)("keeps %s items out of usage", (status) => {
    const result = calculateTheoreticalUsage({
      saleLines: [line()],
      mappings: status === "unmapped" ? [] : [{ posMenuItemId: "pos-martini", status }],
      menuItems,
      products,
    });
    expect(result.productUsage).toEqual([]);
    expect(result.issues[0]?.reason).toBe(status);
  });
});
