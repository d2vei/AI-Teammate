import { afterEach, expect, it } from 'vitest';
import { Store } from '../src/store.js';
import { ErrorWatch, ErrorWatchLedger } from '../src/error-watch.js';
import { ParticipationLedger } from '../src/participation.js';
import { ScriptedLocalProvider } from '../src/local-harness.js';
import { OfflineConversation, ScriptedConversationReasoner, SuppliedMediaFixture } from '../src/local-conversation.js';

const cleanup: (() => void)[] = [];
afterEach(() => { for (const close of cleanup.splice(0).reverse()) close(); });
function setup() {
  const store = new Store(':memory:'); const watchLedger = new ErrorWatchLedger(':memory:'); const ledger = new ParticipationLedger(':memory:');
  cleanup.push(() => store.close(), () => watchLedger.close(), () => ledger.close()); let now = Date.parse('2026-10-29T12:00:00Z');
  const conversation = new OfflineConversation(store, new ScriptedLocalProvider(), () => now, { ledger, watch: new ErrorWatch(store, watchLedger, () => now), reasoner: new ScriptedConversationReasoner(), media: new SuppliedMediaFixture() });
  return { store, ledger, watchLedger, conversation, advance: (ms = 1000) => { now += ms; } };
}
async function offer(x: ReturnType<typeof setup>) {
  await x.conversation.line('/shadow on'); const media = await x.conversation.line('/media voice');
  const decisions = [];
  for (let i = 0; i < 3; i++) { x.advance(); decisions.push(await x.conversation.line('/say Let us book Saturday.')); }
  expect(decisions[0]?.decision?.action).toBe('SILENT'); expect(decisions[1]?.decision?.action).toBe('SILENT');
  const raised = decisions[2]!; expect(raised.decision?.action).toBe('HAND_RAISE');
  return { raised, media };
}

it('composes supplied media, ordinary group talk, a bound invitation and direct saved state without conferring approval', async () => {
  const x = setup(); const { media, raised } = await offer(x); const token = raised.decision!.offerToken!;
  expect(media.text).toContain('WAV contains silence'); expect((await x.conversation.line('/sources')).text).toContain('I cannot attend on Saturday.');
  expect((await x.conversation.line('/why')).text).toContain('evidenced_persistent_claim');
  expect((await x.conversation.line(`/accept ${token}`)).kind).toBe('error');
  await x.conversation.line('/as peer'); const invited = await x.conversation.line(`/invite ${token}`);
  expect(invited.decision?.action).toBe('POST'); expect(invited.text).toContain(media.sourceId!); expect(invited.text).toContain('SHADOW MOCK');
  expect((await x.conversation.line(`/invite ${token}`)).decision?.action).toBe('SILENT');
  expect(x.store.decisions(x.conversation.projectId)).toEqual([]); expect(x.store.briefs(x.conversation.projectId)).toEqual([]);
  expect((await x.conversation.line('/ask What is recorded?')).text).toContain('0 approved');
});
it('keeps ordinary talk silent by default and applies steering only through the configured owner command', async () => {
  const x = setup(); expect((await x.conversation.line('/say Let us book Saturday.')).decision?.reason).toBe('mentions_only');
  await x.conversation.line('/as peer'); expect((await x.conversation.line('/shadow on')).kind).toBe('error');
  await x.conversation.line('/as owner'); await x.conversation.line('/shadow on');
  await x.conversation.line('/say /shadow off'); const why = await x.conversation.line('/why'); expect(why.text).toContain('on_track');
  await x.conversation.line('/steer only speak when tagged'); expect((await x.conversation.line('/say Let us book Saturday.')).decision?.reason).toBe('mentions_only');
});
it('lets the group repair the advertised demo before it raises a hand', async () => {
  const x = setup(); await x.conversation.line('/shadow on'); await x.conversation.line('/media voice');
  await x.conversation.line('/say Let us book Saturday.'); await x.conversation.line('/say Let us book Saturday.');
  expect((await x.conversation.line('/say We will book Sunday instead.')).decision?.action).toBe('SILENT');
  expect((await x.conversation.line('/say Let us book Saturday.')).decision?.reason).toBe('group_self_repaired');
});
it.each(['pause', 'expiry', 'remove-source'] as const)('suppresses the offered local intervention after %s', async change => {
  const x = setup(); const { media, raised } = await offer(x);
  if (change === 'pause') await x.conversation.line('/pause');
  if (change === 'expiry') x.advance(600_001);
  if (change === 'remove-source') await x.conversation.line(`/media remove ${media.originId}`);
  expect((await x.conversation.line(`/invite ${raised.decision!.offerToken}`)).decision?.action).toBe('SILENT');
});
it('saves a normal brief through the existing gate and withholds media evidence after deletion', async () => {
  const x = setup(); const media = await x.conversation.line('/media image');
  const brief = await x.conversation.line('/brief Inspect the supplied media and selected code.');
  expect(brief.card?.proposal.body.sourceIds).toContain(media.sourceId);
  await x.conversation.line('yes'); expect(x.store.briefs(x.conversation.projectId)).toHaveLength(0);
  await x.conversation.line(`/accept ${brief.card!.buttonId}`); expect(x.store.briefs(x.conversation.projectId)).toHaveLength(1);
  await x.conversation.line('/pause'); await x.conversation.line(`/media remove ${media.originId}`); await x.conversation.line('/resume');
  expect((await x.conversation.line('/sources')).text).toContain('Brief evidence unavailable');
});
it('performs one owner-authorized deletion across all three stores and keeps uncertain spending', async () => {
  const x = setup(); const { raised } = await offer(x); await x.conversation.line('/watch start');
  expect(x.store.reserve(1, 100000)).toBeTruthy();
  await x.conversation.line('/as peer'); expect((await x.conversation.line('/forget-local-data CONFIRM')).kind).toBe('error');
  await x.conversation.line('/as owner'); await x.conversation.line('/pause');
  expect((await x.conversation.line('/forget-local-data CONFIRM')).kind).toBe('status');
  expect(x.store.sources(x.conversation.projectId)).toEqual([]); expect(x.watchLedger.tasks(x.conversation.projectId)).toEqual([]);
  expect(x.ledger.db.prepare('SELECT COUNT(*) AS n FROM reasons').get()?.n).toBe(0); expect(x.ledger.db.prepare('SELECT COUNT(*) AS n FROM claims').get()?.n).toBe(0);
  expect(x.store.budgetUsed()).toBe(0.1); expect(x.store.config(x.conversation.projectId)?.paused).toBe(true); expect(x.store.config(x.conversation.projectId)?.selectedSnapshot).toBe(null);
  expect((await x.conversation.line(`/invite ${raised.decision!.offerToken}`)).kind).toBe('error');
});
it('pauses first if one part of a local content purge fails', async () => {
  const x = setup(); x.ledger.purge = () => { throw new Error('synthetic deletion failure'); };
  expect((await x.conversation.line('/forget-local-data CONFIRM')).kind).toBe('error'); expect(x.store.config(x.conversation.projectId)?.paused).toBe(true);
});
it('cannot turn the offline conversation into a live provider session', () => {
  const x = setup(); let calls = 0;
  const provider = { mode: 'meta' as const, model: 'disabled-test-only', async generate() { calls++; return { output: null, usage: null, requestId: null }; } };
  expect(() => new OfflineConversation(x.store, provider, () => Date.now(), x.conversation.services)).toThrow('MOCK providers only'); expect(calls).toBe(0);
});
