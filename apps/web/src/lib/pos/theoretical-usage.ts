import { millilitresToOunces, parseRecipeQuantity, roundUsage } from "./units";
import type { MonthEndMenuItem, MonthEndProduct } from "./workspace-catalog";

export type PosSaleLine = {
  id: string;
  ticketId: string;
  externalTicketId: string;
  ticketNumber?: string | null;
  ticketStatus: string;
  posMenuItemId?: string | null;
  externalMenuItemId?: string | null;
  name: string;
  quantity: number;
  voided: boolean;
  cancelled: boolean;
};

export type PosItemMapping = {
  posMenuItemId: string;
  status: "unmapped" | "mapped" | "ignored" | "needs_review";
  monthEndMenuItemId?: string | null;
  monthEndMenuVariantKey?: string | null;
};

export type TheoreticalUsageTrace = {
  ticketId: string;
  externalTicketId: string;
  ticketNumber?: string | null;
  ticketItemId: string;
  posItemName: string;
  soldQuantity: number;
  monthEndMenuItemId: string;
  monthEndMenuItemName: string;
  recipeVariantKey: string;
  recipeVariantName: string;
  recipeIngredientId: string;
  recipeIngredientName: string;
  recipeAmount: string;
  productId: string;
  productName: string;
  millilitres: number;
};

export type TheoreticalUsageIssue = {
  ticketItemId: string;
  posItemName: string;
  reason: "ignored" | "unmapped" | "needs_review" | "menu_item_missing" | "variant_missing" | "ingredient_unlinked" | "quantity_unresolved";
  detail: string;
};

export type TheoreticalUsageProduct = {
  productId: string;
  productName: string;
  millilitres: number;
  ounces: number;
  sourceTicketItems: number;
};

export function calculateTheoreticalUsage(input: {
  saleLines: PosSaleLine[];
  mappings: PosItemMapping[];
  menuItems: MonthEndMenuItem[];
  products: MonthEndProduct[];
}) {
  const mappings = new Map(input.mappings.map((mapping) => [mapping.posMenuItemId, mapping]));
  const menuItems = new Map(input.menuItems.map((item) => [item.id, item]));
  const products = new Map(input.products.map((product) => [product.id, product]));
  const traces: TheoreticalUsageTrace[] = [];
  const issues: TheoreticalUsageIssue[] = [];

  input.saleLines.forEach((line) => {
    if (line.voided || line.cancelled || ["voided", "cancelled", "refunded"].includes(line.ticketStatus.toLowerCase())) return;
    if (!line.posMenuItemId) {
      issues.push({ ticketItemId: line.id, posItemName: line.name, reason: "unmapped", detail: "The ticket item is not linked to an imported POS menu item." });
      return;
    }
    const mapping = mappings.get(line.posMenuItemId);
    if (!mapping || mapping.status === "unmapped") {
      issues.push({ ticketItemId: line.id, posItemName: line.name, reason: "unmapped", detail: "Map this POS item to a Month End menu item." });
      return;
    }
    if (mapping.status === "ignored") {
      issues.push({ ticketItemId: line.id, posItemName: line.name, reason: "ignored", detail: "This POS item is intentionally ignored." });
      return;
    }
    if (mapping.status === "needs_review") {
      issues.push({ ticketItemId: line.id, posItemName: line.name, reason: "needs_review", detail: "This POS item mapping requires manager review." });
      return;
    }
    const menuItem = mapping.monthEndMenuItemId ? menuItems.get(mapping.monthEndMenuItemId) : null;
    if (!menuItem) {
      issues.push({ ticketItemId: line.id, posItemName: line.name, reason: "menu_item_missing", detail: "The mapped Month End menu item no longer exists." });
      return;
    }
    const variant = menuItem.variants.find((candidate) => candidate.key === mapping.monthEndMenuVariantKey);
    if (!variant) {
      issues.push({ ticketItemId: line.id, posItemName: line.name, reason: "variant_missing", detail: "Choose a valid Month End recipe variant." });
      return;
    }
    menuItem.ingredients.forEach((ingredient) => {
      if (ingredient.linkKind !== "product" || !ingredient.productId || !products.has(ingredient.productId)) {
        issues.push({ ticketItemId: line.id, posItemName: line.name, reason: "ingredient_unlinked", detail: `${ingredient.name} is not linked to an inventory product.` });
        return;
      }
      const recipeAmount = ingredient.amounts?.[variant.key] || ingredient.amount || "";
      const parsed = parseRecipeQuantity(recipeAmount);
      if (!parsed) {
        issues.push({ ticketItemId: line.id, posItemName: line.name, reason: "quantity_unresolved", detail: `${ingredient.name}: “${recipeAmount || "no quantity"}” cannot be converted to volume.` });
        return;
      }
      const product = products.get(ingredient.productId)!;
      traces.push({
        ticketId: line.ticketId,
        externalTicketId: line.externalTicketId,
        ticketNumber: line.ticketNumber,
        ticketItemId: line.id,
        posItemName: line.name,
        soldQuantity: line.quantity,
        monthEndMenuItemId: menuItem.id,
        monthEndMenuItemName: menuItem.name,
        recipeVariantKey: variant.key,
        recipeVariantName: variant.name,
        recipeIngredientId: ingredient.id,
        recipeIngredientName: ingredient.name,
        recipeAmount,
        productId: product.id,
        productName: product.name,
        millilitres: roundUsage(parsed.millilitres * line.quantity),
      });
    });
  });

  const sourceIds = new Map<string, Set<string>>();
  const totals = new Map<string, TheoreticalUsageProduct>();
  traces.forEach((trace) => {
    const current = totals.get(trace.productId) ?? { productId: trace.productId, productName: trace.productName, millilitres: 0, ounces: 0, sourceTicketItems: 0 };
    current.millilitres += trace.millilitres;
    const ids = sourceIds.get(trace.productId) ?? new Set<string>();
    ids.add(trace.ticketItemId);
    sourceIds.set(trace.productId, ids);
    current.sourceTicketItems = ids.size;
    totals.set(trace.productId, current);
  });
  const productUsage = [...totals.values()].map((usage) => ({
    ...usage,
    millilitres: roundUsage(usage.millilitres, 2),
    ounces: roundUsage(millilitresToOunces(usage.millilitres), 2),
  })).sort((left, right) => left.productName.localeCompare(right.productName));

  return { productUsage, traces, issues };
}
