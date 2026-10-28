import { expect, it } from 'vitest';
import { buildRunArgs } from '../scripts/vault-lib.mjs';
it.each(['bot', 'init', 'seed', 'register'])('defers Discord launch action %s while the local core is being developed', action => {
  expect(() => buildRunArgs(action)).toThrow('Discord is deferred');
});
