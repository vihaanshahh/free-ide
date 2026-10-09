import { createMemoryLedger, type TokenLedger } from "./ledger.ts";

export const ledger: TokenLedger = createMemoryLedger();
