import { afterEach, beforeEach, expect, it } from 'vitest';
import { Store } from '../src/store.js';
import { LocalHarness, ScriptedLocalProvider } from '../src/local-harness.js';
let store: Store; let harness: LocalHarness;
beforeEach(() => { store = new Store(':memory:'); harness = new LocalHarness(store, new ScriptedLocalProvider(), 0); });
afterEach(() => store.close());
it('starts with synthetic evidence and zero approved decisions, then confirms through the exact token', async () => {
  expect(store.decisions(harness.projectId)).toHaveLength(0);
  const proposed = await harness.line('/decision Keep party members together.');
  expect(proposed.card?.proposal.body.kind).toBe('decision'); expect(proposed.text).toContain('MOCK');
  const token = proposed.card!.buttonId;
  await harness.line('/as peer'); expect((await harness.line(`/accept ${token}`)).kind).toBe('error'); expect(store.decisions(harness.projectId)).toHaveLength(0);
  await harness.line('/as owner'); expect((await harness.line(`/accept ${token}`)).kind).toBe('confirmation');
  expect((await harness.line(`/accept ${token}`)).kind).toBe('confirmation'); expect(store.decisions(harness.projectId)).toHaveLength(1);
});
it('does not accept casual yes, can prepare/save a brief and recalls saved state', async () => {
  const decision = await harness.line('/decision Keep a group in one room.');
  await harness.line('yes 👍'); expect(store.decisions(harness.projectId)).toHaveLength(0);
  await harness.line(`/accept ${decision.card!.buttonId}`);
  const brief = await harness.line('/brief Investigate the selected party split.');
  expect(brief.card?.proposal.body.kind).toBe('brief'); expect(store.briefs(harness.projectId)).toHaveLength(0);
  await harness.line(`/accept ${brief.card!.buttonId}`); expect(store.briefs(harness.projectId)[0]?.status).toBe('saved');
  const recall = await harness.line('/ask What is recorded?'); expect(recall.text).toContain('saved'); expect(recall.text).not.toContain('I ran');
});
it('routes ambient exchanges silently and supports pause with approver-only resume', async () => {
  expect((await harness.line('/ambient human conversation')).kind).toBe('silent');
  await harness.line('/as peer'); await harness.line('/pause'); expect((await harness.line('/resume')).kind).toBe('error');
  expect((await harness.line('/ask hello')).kind).toBe('silent'); await harness.line('/as owner'); await harness.line('/resume'); expect((await harness.line('/ask hello')).kind).toBe('response');
});
