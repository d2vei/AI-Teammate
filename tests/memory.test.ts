import { afterEach, beforeEach, expect, it } from 'vitest';
import { Store } from '../src/store.js';
import { Teammate } from '../src/core.js';
import { MemoryVault } from '../src/memory.js';
import { MockProvider, FakeAdapter } from '../src/fakes.js';
import { ingestBundle } from '../src/sources.js';
import type { RequestEvent } from '../src/domain.js';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, mkdirSync, realpathSync, rmSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { LocalHarness, ScriptedLocalProvider } from '../src/local-harness.js';
import { LiveConversation } from '../src/live-conversation.js';
let store: Store; const now = Date.parse('2026-10-30T09:00:00Z');
const event: RequestEvent = { id: 'memory-owner', projectId: 'p', platform: 'fake', workspaceId: 'w', roomId: 'r', actor: { id: 'owner', roleIds: ['reviewer'] }, invocation: 'action', text: 'Recall the hosting budget.', version: '1', replyTo: null, replyContext: null };
beforeEach(() => { store = new Store(':memory:'); store.putConfig({ projectId: 'p', platform: 'fake', workspaceId: 'w', roomId: 'r', memberIds: ['owner', 'peer'], approverIds: ['owner'], approverRoleIds: ['reviewer'], selectedSnapshot: 'memory-v1', paused: false, revision: 1 }); });
afterEach(() => store.close());
function decision(statement: string, at = now) { const card = store.propose({ ...event, id: statement }, { kind: 'decision', statement, sourceIds: [] }, [], at); return store.accept(event, card.buttonId, at); }
it('recalls an older relevant decision beyond both old recency cutoffs without exposing another project', async () => {
  const old = decision('The hosting budget ceiling is forty euros per month.', now - 1000); for (let i = 0; i < 25; i++) decision(`Use synthetic interface shade number ${i}.`, now + i);
  const provider = new MockProvider(); const core = new Teammate(store, provider, 1, () => now + 100);
  const vault = new MemoryVault(store, () => now + 100); expect(vault.search(event, 'hosting budget')[0]?.id).toBe(`decision:${old.id}`);
  await core.handle(event, new FakeAdapter()); expect(provider.calls[0]?.context.find(c => c.id === `decision:${old.id}`)?.text).toContain('forty euros');
  expect(core.context(event).filter(c => c.kind === 'approved_decision')).toHaveLength(8);
  expect(vault.search({ ...event, projectId: 'foreign' }, '')).toEqual([]);
});
it('persists topic organization separately from authority and promotes tagged proposals only on exact approval', () => {
  const vault = new MemoryVault(store, () => now); const card = store.propose(event, { kind: 'decision', statement: 'Synthetic hosting policy.', sourceIds: [] }, [], now);
  vault.tag(event, `proposal:${card.proposal.id}`, 'Hosting costs'); expect(vault.search(event, '', { topic: 'hosting COSTS' })[0]?.kind).toBe('proposed_decision'); expect(store.decisions('p')).toEqual([]);
  expect(() => vault.tag({ ...event, actor: { id: 'peer', roleIds: [] } }, `proposal:${card.proposal.id}`, 'Other')).toThrow('approver');
  store.accept(event, card.buttonId, now); const entry = vault.search(event, '', { topic: 'hosting costs' })[0]!;
  expect(entry.id).toBe(`decision:${card.proposal.id}`); expect(entry.topics).toEqual(['hosting costs']); expect(entry.kind).toBe('approved_decision');
  expect(vault.untag(event, entry.id, 'hosting costs')).toBe(true); expect(vault.topics(event)).toEqual([]);
});
it('withholds removed evidence and dependent brief contents and topics immediately, including during inference', async () => {
  const ids = ingestBundle(store, 'p', { snapshot: 'memory-v1', synthetic: true, files: [{ path: 'review.ts', text: '// Synthetic comet appointment information.' }], logs: [] }, now);
  const provider = new MockProvider(); const core = new Teammate(store, provider, 1, () => now); const vault = new MemoryVault(store, () => now); const source = ids[0]!;
  const card = store.propose(event, { kind: 'brief', objective: 'Review the comet appointment.', decisionIds: [], sourceIds: [source], hypothesis: 'The schedule may be unclear.', nextCheck: 'Ask the group.', exclusions: ['No execution.'] }, core.context(event), now); store.accept(event, card.buttonId, now);
  vault.tag(event, source, 'comet'); vault.tag(event, `brief:${card.proposal.id}`, 'comet');
  provider.beforeReturn = () => store.sourceState('p', source, 'deleted'); const adapter = new FakeAdapter(); await core.handle(event, adapter);
  expect(adapter.deliveries).toEqual([]); expect(vault.topics(event)).toEqual([]); expect(JSON.stringify(vault.search(event))).not.toContain('comet appointment');
  expect(vault.search(event).find(c => c.id === `brief:${card.proposal.id}`)?.text).toBe('Brief evidence unavailable; contents withheld.');
});
it.each([{ roomId: 'other' }, { workspaceId: 'other' }, { platform: 'fake-second' as const }, { actor: { id: 'outsider', roleIds: [] } }])('enforces current scope before browsing or tagging %j', patch => {
  const d = decision('A scoped synthetic rule.'); const vault = new MemoryVault(store, () => now); const foreign = { ...event, ...patch };
  expect(vault.search(foreign)).toEqual([]); expect(() => vault.tag(foreign, `decision:${d.id}`, 'notes')).toThrow(); expect(vault.topics(foreign)).toEqual([]);
});
it('does not retain metadata after withdrawal, proposal revision or project purge, and preserves charges', () => {
  const vault = new MemoryVault(store, () => now); const d = decision('A withdrawable synthetic rule.'); vault.tag(event, `decision:${d.id}`, 'temporary'); store.withdraw(event, d.id); expect(vault.topics(event)).toEqual([]);
  const card = store.propose(event, { kind: 'decision', statement: 'A proposed synthetic rule.', sourceIds: [] }, [], now); vault.tag(event, `proposal:${card.proposal.id}`, 'drafts');
  store.revise(event, card.proposal.id, { kind: 'decision', statement: 'A changed synthetic rule.', sourceIds: [] }, now); expect(vault.topics(event)).toEqual([]);
  store.reserve(5, 1000); const used = store.budgetUsed(); store.purgeProject('p'); expect(store.memoryTopics('p')).toEqual([]); expect(store.budgetUsed()).toBe(used);
});
it('retrieves an older brief without presenting it as an approved decision or executed work', () => {
  let old = '';
  for (let i = 0; i < 15; i++) { const c = store.propose(event, { kind: 'brief', objective: i ? `Review synthetic color ${i}.` : 'Investigate the comet deadline.', decisionIds: [], sourceIds: [], hypothesis: 'More evidence is needed.', nextCheck: 'Ask the group.', exclusions: ['No execution.'] }, [], now + i); const saved = store.accept(event, c.buttonId, now + i); if (!i) old = saved.id; }
  const context = new Teammate(store, new MockProvider(), 1, () => now + 100).context({ ...event, text: 'What was the comet deadline investigation?' });
  expect(context.find(c => c.id === `brief:${old}`)?.label).toContain('saved, not executed'); expect(context.filter(c => c.kind === 'saved_brief')).toHaveLength(3);
});
it('does not mistake the newly created fifth proposal for an unrelated context change', async () => {
  for (let i = 0; i < 4; i++) store.propose({ ...event, id: `old-${i}` }, { kind: 'decision', statement: `Synthetic pending rule ${i}.`, sourceIds: [] }, [], now - i - 1);
  const provider = new MockProvider(); provider.output = { answer: 'A new synthetic budget draft awaits review.', citations: [], proposal: { kind: 'decision', statement: 'A new synthetic budget draft.', sourceIds: [] } };
  const adapter = new FakeAdapter(); await new Teammate(store, provider, 1, () => now).handle(event, adapter);
  expect(adapter.deliveries[0]?.proposal).toBeDefined(); expect(store.pending('p')).toHaveLength(5); expect(store.decisions('p')).toEqual([]);
});
it('rechecks topic changes before displaying a delayed answer', async () => {
  const d = decision('Synthetic rule about hosting.'); const vault = new MemoryVault(store, () => now); const provider = new MockProvider();
  provider.beforeReturn = () => vault.tag(event, `decision:${d.id}`, 'hosting'); const adapter = new FakeAdapter(); await new Teammate(store, provider, 1, () => now).handle(event, adapter);
  expect(adapter.deliveries).toEqual([]); expect(store.traces().at(-1)?.result).toBe('suppressed');
});
it('searches Unicode topics, returns no unrelated search hits and keeps annotation size bounded', () => {
  const d = decision('Synthetic planning rule.'); const vault = new MemoryVault(store, () => now); const ref = `decision:${d.id}`;
  vault.tag(event, ref, '  ÜBERGABE   '); expect(vault.search(event, 'übergabe')[0]?.id).toBe(ref); expect(vault.search(event, 'nonexistentquasar')).toEqual([]);
  expect(() => vault.tag(event, ref, 'x'.repeat(49))).toThrow(); expect(() => vault.search(event, 'x'.repeat(241))).toThrow(); expect(() => vault.search(event, '', { limit: 1000 })).toThrow();
  for (let i = 0; i < 5; i++) vault.tag(event, ref, `topic-${i}`); expect(() => vault.tag(event, ref, 'seventh')).toThrow('limit'); vault.tag(event, ref, 'topic-0'); expect(vault.topics(event)).toHaveLength(6);
});
it('withholds foreign projects and paused state, then deletes only the current project topics', () => {
  const c = store.config('p')!; store.putConfig({ ...c, projectId: 'q', roomId: 'other-room' }); const q = { ...event, projectId: 'q', roomId: 'other-room' };
  const card = store.propose(q, { kind: 'decision', statement: 'Synthetic nebula project rule.', sourceIds: [] }, [], now); store.accept(q, card.buttonId, now); const vault = new MemoryVault(store, () => now); vault.tag(q, `decision:${card.proposal.id}`, 'nebula');
  expect(vault.search(event, 'nebula')).toEqual([]); expect(vault.topics(event)).toEqual([]); store.putConfig({ ...c, paused: true }); expect(vault.search(event)).toEqual([]); expect(() => vault.overview(event)).toThrow('paused');
  store.purgeProject('p'); expect(vault.search(q, 'nebula')).toHaveLength(1); expect(vault.topics(q)).toEqual([{ topic: 'nebula', records: 1 }]);
});
it('migrates a v3-shaped store without losing saved knowledge or charges and persists topics across restart', () => {
  mkdirSync('.local/test-memory', { recursive: true }); const dir = mkdtempSync(resolve('.local/test-memory/restart-')); const owned = realpathSync(dir); const path = join(dir, 'state.sqlite'); let s: Store | undefined; let raw: DatabaseSync | undefined;
  try {
    s = new Store(path); s.putConfig(store.config('p')!); const card = s.propose(event, { kind: 'decision', statement: 'Preserved synthetic migration rule.', sourceIds: [] }, [], now); const saved = s.accept(event, card.buttonId, now); s.reserve(5, 1200); s.close(); s = undefined;
    // Exact pre-v4 schema shape; all base record tables/JSON remain untouched.
    raw = new DatabaseSync(path); raw.exec('DROP TABLE memory_topics; PRAGMA user_version=3'); raw.close(); raw = undefined;
    s = new Store(path); expect(s.db.prepare('PRAGMA user_version').get()?.user_version).toBe(4); expect(s.memoryDecisions('p')).toEqual([saved]); expect(s.budgetUsed()).toBe(0.0012);
    new MemoryVault(s, () => now).tag(event, `decision:${saved.id}`, 'migration'); s.close(); s = new Store(path); expect(new MemoryVault(s, () => now).search(event, '', { topic: 'migration' })[0]?.id).toBe(`decision:${saved.id}`); expect(s.budgetUsed()).toBe(0.0012);
  } finally { raw?.close(); s?.close(); const r = relative(realpathSync('.local/test-memory'), realpathSync(dir)); if (!r || r.startsWith('..') || isAbsolute(r) || realpathSync(dir) !== owned) throw new Error('Cleanup scope changed'); rmSync(dir, { recursive: true }); }
});
it('exposes the same zero-model memory commands in the offline and real-provider wrappers', async () => {
  for (const live of [false, true]) {
    const s = new Store(':memory:'); const provider = new MockProvider(); const meta = { mode: 'meta' as const, model: 'synthetic-meta-interface', generate: provider.generate.bind(provider) };
    const h = live ? new LiveConversation(s, meta, 5, () => now) : new LocalHarness(s, new ScriptedLocalProvider(), 1, () => now);
    try {
      const e = { ...event, projectId: h.projectId, workspaceId: 'local-synthetic', roomId: 'conversation-room', actor: { id: 'synthetic-owner', roleIds: ['reviewer'] } };
      const c = s.propose(e, { kind: 'decision', statement: 'A synthetic vault rule.', sourceIds: [] }, [], now); s.accept(e, c.buttonId, now); const ref = `decision:${c.proposal.id}`;
      expect((await h.line(`/memory tag ${ref} priorities`)).kind).toBe('status'); expect((await h.line('/memory topics')).text).toContain('priorities'); expect((await h.line('/memory topic priorities')).text).toContain(ref);
      await h.line('/as peer'); expect((await h.line('/memory search vault')).text).toContain(ref); expect((await h.line(`/memory tag ${ref} altered`)).kind).toBe('error');
      await h.line('/pause'); expect((await h.line('/memory')).kind).toBe('error'); expect(provider.calls).toEqual([]);
    } finally { if (h instanceof LiveConversation) await h.close(); s.close(); }
  }
});
