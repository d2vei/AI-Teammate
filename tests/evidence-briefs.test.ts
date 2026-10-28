import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Store } from '../src/store.js';
import { Teammate } from '../src/core.js';
import { FakeAdapter, MockProvider } from '../src/fakes.js';
import { ingestBundle } from '../src/sources.js';
import type { ProjectConfig, RequestEvent, ProposalBody } from '../src/domain.js';
const cfg: ProjectConfig = { projectId: 'p', platform: 'fake', workspaceId: 'g', roomId: 'r', memberIds: ['owner'], approverIds: ['owner'], approverRoleIds: [], paused: false, selectedSnapshot: 'seeded-v1', revision: 1 };
const e: RequestEvent = { id: 'investigate', platform: 'fake', workspaceId: 'g', projectId: 'p', roomId: 'r', actor: { id: 'owner', roleIds: [] }, invocation: 'mention', text: 'Investigate party split in route.ts', version: 'v1', replyTo: null, replyContext: null };
let store: Store; let core: Teammate; let provider: MockProvider;
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-28T13:00:00Z')); store = new Store(':memory:'); store.putConfig(cfg); provider = new MockProvider(); core = new Teammate(store, provider, 1); });
afterEach(() => { store.close(); vi.useRealTimers(); });
function load() { return ingestBundle(store, 'p', { snapshot: 'seeded-v1', synthetic: true, files: [{ path: 'route.ts', text: 'for (const member of party) assign(member, nextRoom());' }], logs: [{ id: 'ev1', at: '2026-10-28T12:59:00Z', event: 'party_split', partyId: 'partyA', destinations: ['r1', 'r2'], api_key: 'SYNTHETIC_SECRET_DO_NOT_SEND', token: 'SYNTHETIC_TOKEN' }] }, Date.now()); }
const brief = (sourceIds: string[]): Extract<ProposalBody, { kind: 'brief' }> => ({ kind: 'brief', objective: 'Investigate party assignment.', decisionIds: [], sourceIds, hypothesis: 'Member assignment may select different rooms.', nextCheck: 'In a separate authorized development session, reproduce with two members.', exclusions: ['No code execution, edits or deployment by this app.'] });
describe('selected source and confirmed saved brief', () => {
  it('constructs bounded line-linked source and allowlisted sanitized log context', () => {
    load(); const context = core.context(e); const encoded = JSON.stringify(context);
    expect(context.some(x => x.label.includes('route.ts') && x.label.includes('L1'))).toBe(true);
    expect(encoded).toContain('party_split'); expect(encoded).not.toContain('SYNTHETIC_SECRET'); expect(encoded).not.toContain('SYNTHETIC_TOKEN');
  });
  it.each(['deleted', 'stale'] as const)('does not expose %s content and invalidates an old card', state => {
    load(); const context = core.context(e); const code = context.find(x => x.kind === 'code')!; const p = store.propose(e, brief([code.id]), context, Date.now());
    store.sourceState('p', code.id, state); expect(JSON.stringify(core.context(e))).not.toContain('for (const member');
    expect(() => store.accept(e, p.buttonId, Date.now())).toThrow('source');
  });
  it('does not silently overwrite an immutable source ID', () => {
    load(); expect(() => ingestBundle(store, 'p', { snapshot: 'seeded-v1', synthetic: true, files: [{ path: 'route.ts', text: 'changed source' }], logs: [] }, Date.now())).toThrow('immutable');
  });
  it('labels missing selection, old records and out-of-window logs honestly', () => {
    load(); const p = store.propose(e, brief([]), core.context(e), Date.now()); store.accept(e, p.buttonId, Date.now());
    store.putConfig({ ...cfg, selectedSnapshot: 'seeded-v2' });
    const encoded = JSON.stringify(core.context(e)); expect(encoded).toContain('seeded-v1'); expect(encoded).toContain('unavailable'); expect(encoded).not.toContain('for (const member');
  });
  it('rechecks source deletion after inference, before sending or creating a card', async () => {
    load(); const code = core.context(e).find(x => x.kind === 'code')!;
    provider.output = { answer: 'The loop may split members.', citations: [code.id], proposal: brief([code.id]) };
    provider.beforeReturn = () => store.sourceState('p', code.id, 'deleted'); const adapter = new FakeAdapter(); await core.handle(e, adapter);
    expect(adapter.deliveries).toHaveLength(0); expect(store.pending('p')).toHaveLength(0);
  });
  it('saves one bounded brief without an execution field, then recalls saved status', () => {
    load(); const context = core.context(e); const p = store.propose(e, brief(context.filter(x => ['code', 'log'].includes(x.kind)).map(x => x.id)), context, Date.now());
    const saved = store.accept(e, p.buttonId, Date.now()); expect(saved.status).toBe('saved'); expect(store.accept(e, p.buttonId, Date.now()).id).toBe(saved.id);
    expect(store.briefs('p')).toHaveLength(1); expect(saved).not.toHaveProperty('execution');
    expect(core.context(e).find(x => x.kind === 'saved_brief')?.label).toContain('saved, not executed');
  });
  it('rejects a pending suggestion masquerading as an approved decision in a brief', () => {
    const p = store.propose(e, { kind: 'decision', statement: 'Tentative.', sourceIds: [] }, [], Date.now());
    expect(() => store.propose(e, { ...brief([]), decisionIds: [`proposal:${p.proposal.id}`] }, core.context(e), Date.now())).toThrow();
  });
  it('does not expose private state through an unconfigured second adapter', async () => {
    load(); const foreign = { ...e, platform: 'fake-second' as const }; expect(core.context(foreign)).toHaveLength(0);
    await core.handle(foreign, new FakeAdapter()); expect(provider.calls).toHaveLength(0);
  });
  it.each(['actor', 'room', 'expiry', 'version', 'cancelled'] as const)('rejects a brief confirmation with invalid %s', failure => {
    const p = store.propose(e, brief([]), core.context(e), Date.now()); let click = e;
    if (failure === 'actor') click = { ...e, actor: { id: 'outsider', roleIds: [] } };
    if (failure === 'room') click = { ...e, roomId: 'elsewhere' };
    if (failure === 'expiry') vi.advanceTimersByTime(16 * 60_000);
    if (failure === 'version') store.revise(e, p.proposal.id, { ...brief([]), objective: 'Changed objective.' }, Date.now());
    if (failure === 'cancelled') store.cancel(e, p.proposal.id);
    expect(() => store.accept(click, p.buttonId, Date.now())).toThrow(); expect(store.briefs('p')).toHaveLength(0);
  });
  it('omits expired logs from available observations', () => {
    load(); vi.advanceTimersByTime(61 * 60_000); const context = core.context(e);
    expect(context.filter(c => c.kind === 'log')).toHaveLength(0); expect(JSON.stringify(context)).not.toContain('party_split');
  });
  it('invalidates an approved decision and duplicate proposal copy after origin deletion', () => {
    const sourceEvent = { ...e, sourceMessageId: 'message-to-delete' };
    const p = store.propose(sourceEvent, { kind: 'decision', statement: 'A removable private rule.', sourceIds: [] }, [], Date.now()); store.accept(e, p.buttonId, Date.now());
    store.invalidateOrigin('p', 'r', 'message-to-delete'); expect(store.decisions('p')).toHaveLength(0); expect(store.proposal(p.proposal.id)).toBeUndefined();
    expect(JSON.stringify(core.context(e))).not.toContain('removable private rule');
  });
  it('purges pilot content while keeping uncertain charged usage and stopping replies', () => {
    load(); store.reserve(1, 5000); const p = store.propose(e, brief([]), core.context(e), Date.now()); store.accept(e, p.buttonId, Date.now());
    store.purgeProject('p'); expect(store.briefs('p')).toHaveLength(0); expect(store.sources('p')).toHaveLength(0); expect(store.pending('p')).toHaveLength(0);
    expect(store.budgetUsed()).toBe(0.005); expect(core.context(e)).toHaveLength(0);
  });
});
