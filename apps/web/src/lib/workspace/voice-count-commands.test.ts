import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

import { describe, expect, it } from "vitest";

type ParsedCommand = { nameStr: string; qty: number; operation: "set" | "add" | "subtract" };
type VoiceCommands = {
  parseVoice: (text: string) => ParsedCommand[];
  applyCountOperation: (current: number | string, quantity: number, operation?: ParsedCommand["operation"]) => number;
};

const source = fs.readFileSync(path.resolve(process.cwd(), "public/legacy/js/voice-commands.js"), "utf8");
const context: { MonthEndVoiceCommands?: VoiceCommands } = {};
vm.runInNewContext(source, context);
const commands = context.MonthEndVoiceCommands as VoiceCommands;

describe("count voice commands", () => {
  it("keeps the existing quantity-only command as a set operation", () => {
    expect(commands.parseVoice("Absolut 2")).toEqual([{ nameStr: "Absolut", qty: 2, operation: "set" }]);
  });

  it("parses additive and subtractive commands and their synonyms", () => {
    expect(commands.parseVoice("add three Absoluts, deduct one Bacardi and plus a couple Jameson")).toEqual([
      { nameStr: "Absoluts", qty: 3, operation: "add" },
      { nameStr: "Bacardi", qty: 1, operation: "subtract" },
      { nameStr: "Jameson", qty: 2, operation: "add" },
    ]);
  });

  it("supports product-first adjustment phrasing", () => {
    expect(commands.parseVoice("increase Absolut by twenty three; take away 2 from Goose")).toEqual([
      { nameStr: "Absolut", qty: 23, operation: "add" },
      { nameStr: "Goose", qty: 2, operation: "subtract" },
    ]);
  });

  it("adds, subtracts without going below zero, and sets totals", () => {
    expect(commands.applyCountOperation(2, 3, "add")).toBe(5);
    expect(commands.applyCountOperation(2, 3, "subtract")).toBe(0);
    expect(commands.applyCountOperation(2, 3, "set")).toBe(3);
  });
});
