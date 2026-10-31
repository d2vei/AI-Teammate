import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { Store } from '../src/store.js';
import { Teammate } from '../src/core.js';
import { FakeAdapter } from '../src/fakes.js';
import { ingestBundle } from '../src/sources.js';
import { configureLongConversation, longProject, runLongConversation } from '../scripts/long-conversation-lib.mjs';

const corpus = JSON.parse(readFileSync('evals/long-conversation-v1/conversation.json', 'utf8'));
const cleanup = [];
afterEach(() => { for (const close of cleanup.splice(0).reverse()) close(); });
function setup(failDraft = false) {
  const dir = mkdtempSync(join(tmpdir(), 'teammate-long-unit-')); const db = join(dir, 'state.sqlite');
  cleanup.push(() => { const path = resolve(dir); if (!path.startsWith(resolve(tmpdir()) + sep) || !basename(path).startsWith('teammate-long-unit-')) throw new Error('Unexpected fixture cleanup path'); rmSync(path, { recursive: true, force: true }); });
  const state = { store: new Store(db), core: null }; cleanup.push(() => state.store.close());
  let clock = Date.parse('2026-10-31T12:00:00Z'); const now = () => clock; const inputs = [];
  const provider = { mode: 'mock', model: 'explicit-long-scenario-fixture', async generate(input) {
    inputs.push(input); let output = { answer: 'Controlled synthetic response for software checks only.', citations: [] };
    if (/^Draft (?:a decision|the replacement hosting decision):/.test(input.question)) {
      output.proposal = { kind: 'decision', statement: input.question.split(': ').slice(1).join(': '), sourceIds: [] };
      if (failDraft && input.question.includes('sixty')) output = { invalid: 'Missing proposal; preserve failure' };
    } else if (input.question.startsWith('Draft an investigation brief')) {
      output.proposal = { kind: 'brief', objective: 'Investigate the synthetic party split.', decisionIds: input.context.filter(c => c.kind === 'approved_decision').map(c => c.id), sourceIds: input.context.filter(c => ['code', 'log'].includes(c.kind)).map(c => c.id), hypothesis: 'Per-member routing may split the party; unconfirmed.', nextCheck: 'A developer can reproduce one two-member queue separately.', exclusions: ['No execution, edits or deployment by this app.'] };
    }
    return { output, usage: { inputTokens: 0, outputTokens: 0 }, requestId: null };
  } };
  const connect = () => { state.core = new Teammate(state.store, provider, 1, now); }; connect();
  configureLongConversation(state.store, corpus, ingestBundle, now);
  return { state, inputs, options: { state, corpus, adapterFactory: () => new FakeAdapter(), calls: () => inputs.length, now, advance: () => { clock += 1000; }, restart: async () => { state.store.close(); state.store = new Store(db); connect(); } } };
}

it('replays 90 turns across four roles, 18 explicit requests, correction, actual reopen and source withdrawal', async () => {
  const x = setup(); const result = await runLongConversation(x.options);
  expect(result).toMatchObject({ actorCount: 4, conversationalTurns: 90, ambientTurns: 72, explicitRequests: 18, scopeAndPauseProbes: 3, finalDecisionCount: 2, finalBriefCount: 1 });
  expect(x.inputs).toHaveLength(18); expect(result.turns.filter(t => t.type !== 'ambient').every(t => t.status === 'DELIVERED')).toBe(true);
  expect(result.controls.filter(c => c.status === 'SAVED_ONCE')).toHaveLength(4); expect(result.controls.find(c => c.id === 'restart')).toMatchObject({ status: 'REOPENED', decisionCount: 2, briefCount: 1 });
  expect(new Set(x.inputs.map(i => i.event.actor.id)).size).toBe(4);
  expect(x.inputs[2].reply.text).toContain('Controlled synthetic response'); expect(x.inputs[2].event.actor.id).toBe('synthetic-developer');
  const afterRestart = x.inputs[10].context.filter(c => c.kind === 'approved_decision');
  expect(afterRestart.some(c => c.text.includes('eighty'))).toBe(true); expect(afterRestart.some(c => c.text.includes('sixty'))).toBe(false);
  expect(x.inputs[13].context.some(c => c.kind === 'missing_evidence')).toBe(true); expect(JSON.stringify(x.inputs[13])).not.toContain('members.map');
  expect(x.inputs[14].context.find(c => c.kind === 'saved_brief').text).toContain('withheld');
  expect(x.state.store.config(longProject).paused).toBe(true); expect(x.state.store.budgetUsed()).toBe(0);
});
it('never supplies ambient chatter, actor display names, rubric or expected answers as model context', async () => {
  const x = setup(); await runLongConversation(x.options);
  const all = JSON.stringify(x.inputs); expect(all).not.toContain('violet'); expect(all).not.toContain('PARTIAL'); expect(all).not.toContain('criterion');
  for (const input of x.inputs) expect(Object.keys(input).sort()).toEqual(['context', 'event', 'question', 'reply']);
  expect(x.inputs[15].context.some(c => /violet|orange/.test(c.text))).toBe(false);
});
it('preserves a failed model draft and marks dependent confirmations unavailable rather than inventing saved state', async () => {
  const x = setup(true); const result = await runLongConversation(x.options);
  expect(result.turns.find(t => t.id === 'L07').status).toBe('invalid_or_unavailable');
  expect(result.controls.find(c => c.id === 'L07-accept').status).toBe('NOT_RUN_NO_CARD');
  expect(result.controls.find(c => c.id === 'withdraw-old-hosting').status).toBe('NOT_RUN_NO_DECISION');
  expect(result.turns.find(t => t.id === 'L18').status).toBe('DELIVERED'); expect(x.inputs).toHaveLength(18);
});
