import { expect, it } from 'vitest';
import { MetaProvider } from '../src/meta.js';
import { MetaParticipationReasoner } from '../src/participation-meta.js';
import { Store } from '../src/store.js';
import type { ParticipationInput } from '../src/participation.js';
const input: ParticipationInput = { messages: [], evidence: [], openClaims: [] };
it('serializes monitor/repair HTTP calls through the shared budget and settles reported usage', async () => {
  const store = new Store(':memory:'); let active = 0; let maximum = 0; const bodies: Record<string, unknown>[] = [];
  const http: typeof fetch = async (_url, init) => {
    active++; maximum = Math.max(maximum, active); const body = JSON.parse(init!.body as string); bodies.push(body); await Promise.resolve(); active--;
    return new Response(JSON.stringify({ id: 'synthetic-http', status: 'completed', model: 'muse-spark-1.3', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(body.instructions.includes('open claim') ? { resolved: [] } : { status: 'on_track', claim: '', confidence: 1, evidenceIds: [] }) }] }], usage: { input_tokens: 10, output_tokens: 10 } }));
  };
  try {
    const reasoner = new MetaParticipationReasoner(new MetaProvider('SYNTHETIC-HTTP-ONLY', http), store, 5);
    await Promise.all([reasoner.monitor(input), reasoner.selfRepair(input)]);
    expect(maximum).toBe(1); expect(bodies).toHaveLength(2); expect(store.budgetUsed()).toBe(0.00011); expect(bodies.every(b => b.store === false && b.model === 'muse-spark-1.3')).toBe(true);
  } finally { store.close(); }
});
it('blocks zero/excess caps before HTTP and preserves uncertain charges on a failed request', async () => {
  const store = new Store(':memory:'); let calls = 0;
  const http: typeof fetch = async () => { calls++; throw new Error('synthetic timeout'); };
  try {
    for (const cap of [0, 5.01]) await expect(new MetaParticipationReasoner(new MetaProvider('SYNTHETIC-HTTP-ONLY', http), store, cap).monitor(input)).rejects.toThrow();
    expect(calls).toBe(0);
    await expect(new MetaParticipationReasoner(new MetaProvider('SYNTHETIC-HTTP-ONLY', http), store, 5).monitor(input)).rejects.toThrow();
    expect(calls).toBe(1); expect(store.budgetUsed()).toBeGreaterThan(0);
  } finally { store.close(); }
});
