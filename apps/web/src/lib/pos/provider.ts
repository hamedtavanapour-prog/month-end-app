import "server-only";

import type { PosConnectionMode, PosIntegrationProvider } from "./domain";
import { MockPosAdapter } from "./providers/mock";
import { OmnivoreAdapter } from "./providers/omnivore";

export function createPosProvider(provider: string, mode: PosConnectionMode): PosIntegrationProvider {
  if (provider !== "omnivore") throw new Error(`Unsupported POS provider: ${provider}`);
  return mode === "mock" ? new MockPosAdapter() : new OmnivoreAdapter();
}
