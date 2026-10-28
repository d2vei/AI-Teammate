import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Store } from '../src/store.js';
import { Teammate } from '../src/core.js';
import { FakeAdapter, MockProvider } from '../src/fakes.js';
import type { ProjectConfig, RequestEvent } from '../src/domain.js';
const cfg: ProjectConfig = { projectId: 'p', platform: 'fake', workspaceId: 'g', roomId: 'r', memberIds: ['owner', 'peer'], approverIds: ['owner'], approverRoleIds: ['reviewer'], paused: false, selectedSnapshot: null, revision: 1 };
const e: RequestEvent = { id: 'e', platform: 'fake', workspaceId: 'g', projectId: 'p', roomId: 'r', actor: { id: 'owner', roleIds: ['reviewer'] }, invocation: 'mention', text: 'Propose a decision: keep parties intact.', version: '1', replyTo: null, replyContext: null };
let store: Store;
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-28T12:00:00Z')); store = new Store(':memory:'); store.putConfig(cfg); });
afterEach(() => { store.close(); vi.useRealTimers(); });
function propose() { return store.propose(e, { kind: 'decision', statement: 'Keep parties intact.', sourceIds: [] }, [], Date.now()); }
describe('version-bound decision approval', () => {
  it.each([{ actor: { id: 'peer', roleIds: ['reviewer'] } }, { actor: { id: 'owner', roleIds: [] } }, { projectId: 'other' }, { roomId: 'other' }, { workspaceId: 'other' }, { platform: 'fake-second' as const }])('rejects wrong authority/scope %j', patch => {
    const p = propose(); expect(() => store.accept({ ...e, ...patch }, p.buttonId, Date.now())).toThrow(); expect(store.decisions('p')).toHaveLength(0);
  });
  it('saves exactly one approved decision and remembers the source and approver', () => {
    const p = propose(); const first = store.accept(e, p.buttonId, Date.now()); const repeat = store.accept(e, p.buttonId, Date.now());
    expect(first.id).toBe(repeat.id); expect(store.decisions('p')).toHaveLength(1);
    expect(store.decisions('p')[0]).toMatchObject({ status: 'approved', approverId: 'owner', proposerId: 'owner', origin: { id: 'e', version: '1' } });
  });
  it('does not accept natural-language agreement', async () => {
    propose(); const provider = new MockProvider(); const core = new Teammate(store, provider, 1);
    await core.handle({ ...e, id: 'yes', text: 'yes 👍' }, new FakeAdapter()); expect(store.decisions('p')).toHaveLength(0);
  });
  it('expires, cancels and rejects a forged token', () => {
    const p = propose(); vi.advanceTimersByTime(16 * 60_000); expect(() => store.accept(e, p.buttonId, Date.now())).toThrow('expired');
    const fresh = propose(); store.cancel(e, fresh.proposal.id); expect(() => store.accept(e, fresh.buttonId, Date.now())).toThrow('cancelled');
    expect(() => store.accept(e, fresh.buttonId.slice(0, -1) + 'x', Date.now())).toThrow();
  });
  it('rejects old buttons after a content revision or config/snapshot change', () => {
    const p = propose(); store.revise(e, p.proposal.id, { kind: 'decision', statement: 'Allow splitting.', sourceIds: [] }, Date.now());
    expect(() => store.accept(e, p.buttonId, Date.now())).toThrow('changed');
    const next = propose(); store.putConfig({ ...cfg, selectedSnapshot: 'new' }); expect(() => store.accept(e, next.buttonId, Date.now())).toThrow('changed');
  });
  it('withdraws authoritative text without re-exposing it during retrieval', () => {
    const p = propose(); const saved = store.accept(e, p.buttonId, Date.now()); store.withdraw(e, saved.id);
    expect(store.decisions('p')).toHaveLength(0); expect(store.tombstones('p')[0]?.statement).toBeUndefined();
  });
  it('turns conversational model drafts into a card, never directly into approved state', async () => {
    const provider = new MockProvider(); provider.output = { answer: 'Proposed rule; please review.', citations: [], proposal: { kind: 'decision', statement: 'Keep parties intact.', sourceIds: [] } };
    const adapter = new FakeAdapter(); const core = new Teammate(store, provider, 1); await core.handle(e, adapter);
    const card = adapter.deliveries[0]?.proposal; expect(card?.buttonId).toBeTruthy(); expect(store.decisions('p')).toHaveLength(0);
    store.accept(e, card!.buttonId, Date.now()); expect(core.context(e).some(x => x.kind === 'approved_decision')).toBe(true);
  });
});
