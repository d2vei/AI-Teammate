import { expect, it } from 'vitest';
import { budgetFromBanner } from '../scripts/live-terminal-evidence-lib.mjs';
it('parses the native six-decimal currency value without consuming sentence punctuation', () => {
  expect(budgetFromBanner('Shared allowance: USD 5; used/reserved USD 2.102858. /help lists commands.')).toEqual({ authorizedCapUsd: 5, usedOrReservedUsd: 2.102858 });
  expect(budgetFromBanner('Shared allowance: USD 1; used/reserved USD 2.125445. /help')).toEqual({ authorizedCapUsd: 1, usedOrReservedUsd: 2.125445 });
});
it('rejects absent, malformed or out-of-authorization budget metadata', () => {
  for (const text of [null, '', 'used/reserved USD 2.102858.', 'Shared allowance: USD 120; used/reserved USD 2.102858. /help', 'Shared allowance: USD 5; used/reserved USD NaN. /help', 'Shared allowance: USD 5; used/reserved USD 2.1. /help']) expect(() => budgetFromBanner(text)).toThrow();
});
