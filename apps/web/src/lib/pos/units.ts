export type ParsedRecipeQuantity = {
  quantity: number;
  unit: "ml" | "oz";
  millilitres: number;
};

const OUNCE_IN_ML = 29.5735295625;

function parseNumber(value: string) {
  const normalized = value.trim().replace(/¼/g, " 1/4").replace(/½/g, " 1/2").replace(/¾/g, " 3/4");
  const mixed = normalized.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const fraction = normalized.match(/^(\d+)\/(\d+)$/);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

export function parseRecipeQuantity(value: string): ParsedRecipeQuantity | null {
  const normalized = value.trim().toLowerCase().replace(/,/g, "");
  const match = normalized.match(/^(\d+(?:\.\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+)\s*(fl\s*oz|fluid\s*ounces?|ounces?|oz|millilit(?:er|re)s?|ml|centilit(?:er|re)s?|cl|lit(?:er|re)s?|l)\b/);
  if (!match) return null;
  const quantity = parseNumber(match[1]);
  if (quantity === null || quantity < 0) return null;
  const rawUnit = match[2].replace(/\s+/g, " ");
  if (/^(fl oz|fluid ounce|fluid ounces|ounce|ounces|oz)$/.test(rawUnit)) {
    return { quantity, unit: "oz", millilitres: quantity * OUNCE_IN_ML };
  }
  const multiplier = rawUnit === "cl" || rawUnit.startsWith("centilit") ? 10
    : rawUnit === "l" || rawUnit.startsWith("lit") ? 1000
      : 1;
  return { quantity: quantity * multiplier, unit: "ml", millilitres: quantity * multiplier };
}

export function millilitresToOunces(value: number) {
  return value / OUNCE_IN_ML;
}

export function roundUsage(value: number, precision = 4) {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
