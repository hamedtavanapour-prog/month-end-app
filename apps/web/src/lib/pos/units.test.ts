import { describe, expect, it } from "vitest";

import { parseRecipeQuantity } from "./units";

describe("recipe unit conversion", () => {
  it.each([
    ["2 oz", 59.1471],
    ["0.5 fl oz", 14.7868],
    ["1/2 ounce", 14.7868],
    ["125 ml", 125],
    ["1.5 cl", 15],
    ["1 l", 1000],
  ])("converts %s to millilitres", (input, expected) => {
    expect(parseRecipeQuantity(input)?.millilitres).toBeCloseTo(expected, 3);
  });

  it.each(["Fill", "one dash", "", "-2 oz"])("does not guess an unsupported quantity: %s", (input) => {
    expect(parseRecipeQuantity(input)).toBeNull();
  });
});
