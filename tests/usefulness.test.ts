import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Store } from '../src/store.js';
import { Teammate } from '../src/core.js';
import { MemoryVault } from '../src/memory.js';
import { FakeAdapter, MockProvider } from '../src/fakes.js';
import { ingestBundle } from '../src/sources.js';
import type { ProposalBody, RequestEvent } from '../src/domain.js';

// These are app/context contracts over synthetic inputs and controlled model
// replies. They do not score actual Meta usefulness or impersonate a user study.
let store: Store; let provider: MockProvider; let core: Teammate; let clock: number;
const owner: RequestEvent = { id: 'usefulness-owner', version: '1', projectId: 'p', platform: 'fake', workspaceId: 'w', roomId: 'r', actor: { id: 'owner', roleIds: ['reviewer'] }, invocation: 'mention', text: 'What should we check next?', replyTo: null, replyContext: null };
beforeEach(() => {
  clock = Date.parse('2026-10-30T12:00:00Z'); store = new Store(':memory:'); provider = new MockProvider(); core = new Teammate(store, provider, 1, () => clock);
  store.putConfig({ projectId: 'p', platform: 'fake', workspaceId: 'w', roomId: 'r', memberIds: ['owner', 'peer'], approverIds: ['owner'], approverRoleIds: ['reviewer'], paused: false, selectedSnapshot: 'usefulness-v1', revision: 1 });
});
afterEach(() => store.close());
const brief = (sourceIds: string[], decisionIds: string[] = []): Extract<ProposalBody, { kind: 'brief' }> => ({ kind: 'brief', objective: 'Investigate party assignment.', decisionIds, sourceIds, hypothesis: 'Per-member assignment may split the party; unconfirmed.', nextCheck: 'A developer can separately reproduce a two-member queue.', exclusions: ['No execution, edits or deployment by this app.'] });
function evidence() {
  return ingestBundle(store, 'p', { snapshot: 'usefulness-v1', synthetic: true, files: [{ path: 'route.ts', text: 'export function routeParty(members, rooms) { return members.map((m, i) => rooms[i % rooms.length]); }' }], logs: [{ id: 'party-observation', at: new Date(clock).toISOString(), event: 'party_split', partyId: 'synthetic-party', destinations: ['room-a', 'room-b'] }] }, clock);
}
function approved(statement: string) { const c = store.propose(owner, { kind: 'decision', statement, sourceIds: [] }, core.context(owner), clock); return store.accept(owner, c.buttonId, clock); }

describe('documented useful teammate journeys (OFFLINE, controlled model)', () => {
  it('U01 answers a focused file question without unrelated large files exhausting the context', async () => {
    const files = [{ path: 'route.ts', text: 'export function routeParty() { return "synthetic-route"; }' }, ...Array.from({ length: 7 }, (_, i) => ({ path: `unrelated-${i}.ts`, text: '// Synthetic unrelated padding material.\n'.repeat(135) }))];
    const [focus] = ingestBundle(store, 'p', { snapshot: 'usefulness-v1', synthetic: true, files, logs: [] }, clock);
    provider.output = { answer: 'The selected function returns the synthetic route; this is source inspection.', citations: [focus] };
    const adapter = new FakeAdapter(); await core.handle({ ...owner, text: 'Explain routeParty.' }, adapter);
    expect(provider.calls).toHaveLength(1); expect(Buffer.byteLength(JSON.stringify(provider.calls[0]))).toBeLessThanOrEqual(24000);
    expect(provider.calls[0]!.context.find(c => c.id === focus)?.text).toContain('synthetic-route'); expect(adapter.deliveries[0]?.text).toContain('source inspection');
  });
  it('U02 carries the approved rule and evidence into a saved next check without making the returning member paste it again', async () => {
    const ids = evidence(); const decision = approved('Keep every party in one room.'); const decisionRef = `decision:${decision.id}`;
    const peer = { ...owner, id: 'peer-investigation', actor: { id: 'peer', roleIds: [] }, text: 'Compare routeParty and the party_split observation with our approved party rule. Draft an investigation brief.' };
    provider.output = { answer: 'The inspected assignment can differ from the approved rule; the observation is consistent, not proof of cause.', citations: [decisionRef, ...ids], proposal: brief(ids, [decisionRef]) };
    const first = new FakeAdapter(); await core.handle(peer, first); const card = first.deliveries[0]!.proposal!;
    expect(provider.calls[0]!.context.some(c => c.id === decisionRef && c.kind === 'approved_decision')).toBe(true);
    expect(ids.every(id => provider.calls[0]!.context.some(c => c.id === id))).toBe(true);
    await core.handle({ ...peer, id: 'casual-yes', invocation: 'ambient', text: 'yes, good' }, new FakeAdapter()); expect(provider.calls).toHaveLength(1); expect(store.briefs('p')).toEqual([]);
    expect(() => store.accept(peer, card.buttonId, clock)).toThrow('authorized');
    const saved = store.accept({ ...owner, invocation: 'action' }, card.buttonId, clock); expect(store.accept({ ...owner, invocation: 'action' }, card.buttonId, clock).id).toBe(saved.id);
    provider.output = { answer: 'Saved next check: a developer can separately reproduce a two-member queue. It has not been executed.', citations: [`brief:${saved.id}`] };
    const second = new FakeAdapter(); await core.handle({ ...owner, id: 'returning-member', text: 'What next check did we save?' }, second);
    expect(provider.calls).toHaveLength(2); expect(provider.calls[1]!.question).toBe('What next check did we save?');
    const recalled = provider.calls[1]!.context.find(c => c.id === `brief:${saved.id}`)!; expect(recalled.kind).toBe('saved_brief'); expect(recalled.label).toContain('saved, not executed'); expect(recalled.text).toContain('two-member queue');
    expect(second.deliveries[0]?.text).toContain('has not been executed'); expect(store.briefs('p')).toHaveLength(1); expect(saved).not.toHaveProperty('execution');
  });
  it('U03 recalls the correction after an explicit withdrawal instead of reviving the old rule', async () => {
    const old = approved('The hosting ceiling is forty euros per month.'); store.withdraw(owner, old.id); const current = approved('The hosting ceiling is eighty euros per month.');
    provider.output = { answer: 'The approved ceiling is eighty euros per month.', citations: [`decision:${current.id}`] };
    const adapter = new FakeAdapter(); await core.handle({ ...owner, text: 'Which hosting ceiling is approved?' }, adapter);
    expect(provider.calls[0]!.context.some(c => c.id === `decision:${current.id}` && c.kind === 'approved_decision')).toBe(true); expect(JSON.stringify(provider.calls[0])).not.toContain('forty'); expect(adapter.deliveries[0]?.text).toContain('eighty');
  });
  it('U04 can ask for missing evidence without fabricating a source or saving a proposal', async () => {
    store.putConfig({ ...store.config('p')!, selectedSnapshot: null }); provider.output = { answer: 'Which permitted snapshot should I inspect?', citations: [] };
    const adapter = new FakeAdapter(); await core.handle(owner, adapter); expect(adapter.deliveries[0]?.text).toContain('Which permitted snapshot'); expect(store.pending('p')).toEqual([]); expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]!.context.some(c => c.kind === 'missing_evidence')).toBe(true);
  });
  it.each(['deleted', 'stale', 'expired log'] as const)('U05 rejects a factual citation to %s evidence even though the ID is still present', async state => {
    const ids = evidence(); const id = state === 'expired log' ? ids[1]! : ids[0]!;
    if (state === 'expired log') clock += 61 * 60_000; else store.sourceState('p', id, state);
    expect(core.context(owner).find(c => c.id === id)?.kind).toBe('missing_evidence');
    provider.output = { answer: 'SYNTHETIC_UNSUPPORTED_ASSERTION about the removed observation.', citations: [id] };
    const adapter = new FakeAdapter(); await core.handle(owner, adapter);
    expect(store.traces().at(-1)?.outcome).toBe('invalid_or_unavailable'); expect(adapter.deliveries[0]?.text).toContain('No answer was accepted'); expect(adapter.deliveries[0]?.text).not.toContain('SYNTHETIC_UNSUPPORTED_ASSERTION');
  });
  it('U06 rejects a citation to a saved brief whose underlying evidence was removed', async () => {
    const ids = evidence(); const card = store.propose(owner, brief(ids), core.context(owner), clock); const saved = store.accept(owner, card.buttonId, clock); store.sourceState('p', ids[0]!, 'deleted');
    expect(core.context(owner).find(c => c.id === `brief:${saved.id}`)?.text).toContain('withheld');
    provider.output = { answer: 'SYNTHETIC_UNSUPPORTED_BRIEF_FACT', citations: [`brief:${saved.id}`] }; const adapter = new FakeAdapter(); await core.handle(owner, adapter);
    expect(store.traces().at(-1)?.outcome).toBe('invalid_or_unavailable'); expect(adapter.deliveries[0]?.text).not.toContain('SYNTHETIC_UNSUPPORTED_BRIEF_FACT');
  });
  it('U07 does not offer an unusable confirmation card grounded in known-missing evidence', async () => {
    const ids = evidence(); store.sourceState('p', ids[0]!, 'deleted'); provider.output = { answer: 'A synthetic draft.', citations: [], proposal: brief([ids[0]!]) };
    const adapter = new FakeAdapter(); await core.handle(owner, adapter); expect(store.pending('p')).toEqual([]); expect(adapter.deliveries[0]?.proposal).toBeUndefined(); expect(store.traces().at(-1)?.outcome).toBe('invalid_or_unavailable');
  });
  it('U08 cannot use an invalidated proposal as an indirect shortcut to stale evidence', () => {
    const ids = evidence(); const parent = store.propose(owner, { kind: 'decision', statement: 'A source-dependent synthetic suggestion.', sourceIds: [ids[0]!] }, core.context(owner), clock); store.sourceState('p', ids[0]!, 'deleted');
    expect(() => { const next = store.propose(owner, brief([`proposal:${parent.proposal.id}`]), core.context(owner), clock); store.accept(owner, next.buttonId, clock); }).toThrow(); expect(store.briefs('p')).toEqual([]);
  });
  it('U09 finds an exact unavailable reference before unrelated available matches and exposes no removed text', () => {
    const ids = ingestBundle(store, 'p', { snapshot: 'usefulness-v1', synthetic: true, files: Array.from({ length: 8 }, (_, i) => ({ path: `part-${i}.ts`, text: `// Synthetic removable payload ${i}.` })), logs: [] }, clock);
    const id = ids[0]!; store.sourceState('p', id, 'deleted'); const result = new MemoryVault(store, () => clock).search(owner, id, { limit: 1 });
    expect(result[0]?.id).toBe(id); expect(result[0]?.available).toBe(false); expect(result[0]?.text).not.toContain('removable payload');
  });
  it('U10 can ground the latest observation after more than one hundred retained source rows', async () => {
    let focus = '';
    for (let batch = 0; batch < 10; batch++) {
      const logs = Array.from({ length: 12 }, (_, i) => { const n = batch * 12 + i; return { id: `signal-${n}`, at: new Date(clock).toISOString(), event: 'warning', partyId: n === 119 ? 'lantern' : `filler-${n}`, destinations: [] }; });
      focus = ingestBundle(store, 'p', { snapshot: 'usefulness-v1', synthetic: true, files: [], logs }, clock).at(-1)!;
    }
    provider.output = { answer: 'The selected synthetic observation records a warning for lantern; its cause is unknown.', citations: [focus] };
    const adapter = new FakeAdapter(); await core.handle({ ...owner, text: 'Explain lantern.' }, adapter);
    expect(provider.calls[0]!.context.some(c => c.id === focus && c.kind === 'log')).toBe(true); expect(store.traces().at(-1)?.outcome).toBe('response'); expect(adapter.deliveries[0]?.text).toContain('cause is unknown');
  });
  it('U11 still asks to narrow an actually oversized relevant selection without dispatching', async () => {
    const files = Array.from({ length: 8 }, (_, i) => ({ path: `synthetic-${i}.ts`, text: '// Synthetic relevant padding material.\n'.repeat(135) }));
    ingestBundle(store, 'p', { snapshot: 'usefulness-v1', synthetic: true, files, logs: [] }, clock); const adapter = new FakeAdapter(); await core.handle({ ...owner, text: 'Compare the synthetic files.' }, adapter);
    expect(provider.calls).toEqual([]); expect(adapter.deliveries[0]?.text).toContain('Narrow the question'); expect(store.traces().at(-1)?.outcome).toBe('context_too_large'); expect(store.budgetUsed()).toBe(0);
  });
  it('U12 labels withheld saved and pending records as missing evidence while allowing an uncited limitation answer', async () => {
    const ids = evidence(); const card = store.propose(owner, brief(ids), core.context(owner), clock); const saved = store.accept(owner, card.buttonId, clock);
    const pending = store.propose(owner, { kind: 'decision', statement: 'A source-dependent suggestion.', sourceIds: ids }, core.context(owner), clock);
    store.sourceState('p', ids[0]!, 'deleted'); const context = core.context(owner);
    for (const id of [`brief:${saved.id}`, `proposal:${pending.proposal.id}`]) expect(context.find(c => c.id === id)?.kind).toBe('missing_evidence');
    provider.output = { answer: 'The supporting evidence is unavailable. Completion outside this app cannot be verified.', citations: [] };
    const adapter = new FakeAdapter(); await core.handle(owner, adapter); expect(store.traces().at(-1)?.outcome).toBe('response'); expect(adapter.deliveries[0]?.text).toContain('cannot be verified');
  });
});
