import { afterEach, expect, it, vi } from 'vitest';
import { Store } from '../src/store.js';
import { ingestBundle } from '../src/sources.js';
import { ErrorWatch, ErrorWatchLedger, SyntheticErrorFeed, type ErrorFeed, type WatchTick } from '../src/error-watch.js';
import { WatchScheduler } from '../src/watch-scheduler.js';
import type { RequestEvent } from '../src/domain.js';
import { ParticipationLedger } from '../src/participation.js';
import { ScriptedLocalProvider } from '../src/local-harness.js';
import { OfflineConversation, ScriptedConversationReasoner, SuppliedMediaFixture } from '../src/local-conversation.js';
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); vi.restoreAllMocks(); vi.useRealTimers(); });
function setup(feed: ErrorFeed = new SyntheticErrorFeed()) {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-29T12:00:00Z'));
  const store = new Store(':memory:'); const ledger = new ErrorWatchLedger(':memory:');
  store.putConfig({ projectId: 'p', platform: 'fake', workspaceId: 'w', roomId: 'r', memberIds: ['owner', 'peer'], approverIds: ['owner'], approverRoleIds: ['reviewer'], paused: false, selectedSnapshot: 'scheduler-v1', revision: 1 });
  ingestBundle(store, 'p', { snapshot: 'scheduler-v1', synthetic: true, files: [{ path: 'party-route.ts', text: '// Synthetic fixture\nexport const value = 1;\nexport const result = value;' }], logs: [] }, Date.now());
  const event: RequestEvent = { id: 'start', projectId: 'p', platform: 'fake', workspaceId: 'w', roomId: 'r', actor: { id: 'owner', roleIds: ['reviewer'] }, invocation: 'action', text: 'Watch synthetic errors.', version: '1', replyTo: null, replyContext: null };
  const watch = new ErrorWatch(store, ledger); const ticks: WatchTick[] = [];
  const scheduler = new WatchScheduler(watch, feed, result => { ticks.push(result); });
  cleanup.push(async () => { await scheduler.shutdown(); ledger.close(); store.close(); });
  return { store, ledger, event, watch, ticks, scheduler, feed };
}
it('automatically polls one-minute intervals and produces only new/increased reports', async () => {
  const x = setup(); x.watch.start(x.event, '424242'); await x.scheduler.enable(x.event);
  await vi.advanceTimersByTimeAsync(0); expect(x.ticks[0]?.reports[0]?.count).toBe(2);
  await vi.advanceTimersByTimeAsync(59_999); expect(x.ticks).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(1); expect(x.ticks[1]?.reports).toEqual([]);
  await vi.advanceTimersByTimeAsync(60_000); expect(x.ticks[2]?.reports[0]?.count).toBe(5);
  expect(x.ticks.every(t => t.externalPosts === 0 && t.modelCalls === 0)).toBe(true);
  await x.scheduler.disable(x.event); await vi.advanceTimersByTimeAsync(180_000); expect(x.ticks).toHaveLength(3);
});
it('requires a configured approver and existing task, and will not weaken the minimum interval', async () => {
  const x = setup(); await expect(x.scheduler.enable(x.event)).rejects.toThrow('Start a fresh');
  expect(() => x.watch.start(x.event, '424242', 1)).toThrow(); x.watch.start(x.event, '424242');
  const peer = { ...x.event, actor: { id: 'peer', roleIds: [] } }; await expect(x.scheduler.enable(peer)).rejects.toThrow('approver');
  await x.scheduler.enable(x.event); await expect(x.scheduler.disable(peer)).rejects.toThrow('approver');
  await expect(x.scheduler.disable({ ...x.event, roomId: 'foreign' })).rejects.toThrow('approver');
});
it('cancels a delayed read on stop and ignores its late result without retaining sources', async () => {
  let resolve!: (value: unknown) => void;
  const feed: ErrorFeed = { mode: 'replay', read: () => new Promise(r => { resolve = r; }) };
  const x = setup(feed); x.watch.start(x.event, '424242'); await x.scheduler.enable(x.event); await vi.advanceTimersByTimeAsync(0);
  x.watch.stop(x.event); await x.scheduler.shutdown();
  resolve({ synthetic: true, universeId: '424242', windowStart: '2026-10-29T00:00:00Z', groups: [{ id: 'late', count: 1, message: 'Synthetic late error.', scriptPath: 'party-route.ts', line: 3 }] });
  await vi.advanceTimersByTimeAsync(180_000); expect(x.ticks).toEqual([]); expect(x.store.sources('p').filter(s => s.kind === 'log')).toEqual([]);
});
it('bounds a nonresponding feed, stops automatic retries and does not overlap polls', async () => {
  let calls = 0; const feed: ErrorFeed = { mode: 'replay', read: async () => { calls++; return new Promise(() => {}); } };
  const x = setup(feed); x.watch.start(x.event, '424242'); await x.scheduler.enable(x.event);
  vi.spyOn(AbortSignal, 'timeout').mockImplementation(milliseconds => { expect(milliseconds).toBe(30_000); const controller = new AbortController(); setTimeout(() => controller.abort(), milliseconds); return controller.signal; });
  await vi.advanceTimersByTimeAsync(0); expect(calls).toBe(1);
  // Adapt the native timeout to this test's JS clock; a separate real-timer
  // process check covers actual Node timeout behavior.
  await vi.advanceTimersByTimeAsync(29_999); expect(calls).toBe(1); expect(x.ticks).toEqual([]);
  await vi.advanceTimersByTimeAsync(1); expect(x.ticks[0]?.reason).toBe('poll_cancelled_or_timed_out');
  await vi.advanceTimersByTimeAsync(180_000); expect(calls).toBe(1); expect(x.scheduler.enabled).toBe(false);
});
it('rechecks source identities after polling and withholds a revoked result', async () => {
  const x = setup(); const tick = x.watch.tick.bind(x.watch);
  x.watch.tick = async (...args) => { const result = await tick(...args); const id = result.reports[0]?.sourceIds[0]; if (id) x.store.sourceState('p', id, 'deleted'); return result; };
  x.watch.start(x.event, '424242'); await x.scheduler.enable(x.event); await vi.advanceTimersByTimeAsync(0);
  expect(x.ticks[0]?.reports).toEqual([]); expect(x.ticks[0]?.reason).toBe('sources_or_task_changed');
});
it('does not schedule again if its synchronous observer stops it', async () => {
  const x = setup(); x.watch.start(x.event, '424242'); const scheduler = new WatchScheduler(x.watch, x.feed, () => { void scheduler.shutdown(); });
  cleanup.push(async () => scheduler.shutdown()); await scheduler.enable(x.event); await vi.advanceTimersByTimeAsync(0);
  expect(scheduler.enabled).toBe(false); expect(vi.getTimerCount()).toBe(0);
});
it('keeps replay progress/deduplication when the scheduler and feed restart', async () => {
  const x = setup(); x.watch.start(x.event, '424242'); await x.scheduler.enable(x.event); await vi.advanceTimersByTimeAsync(60_000); await x.scheduler.shutdown();
  const seen: WatchTick[] = []; const restarted = new WatchScheduler(x.watch, new SyntheticErrorFeed(), result => { seen.push(result); }); cleanup.push(async () => restarted.shutdown());
  await restarted.enable(x.event); await vi.advanceTimersByTimeAsync(60_000);
  expect(seen.flatMap(t => t.reports).map(r => r.count)).toEqual([5]);
});
it('stops on a changed audience/configuration without another substantive report', async () => {
  const x = setup(); x.watch.start(x.event, '424242'); await x.scheduler.enable(x.event); await vi.advanceTimersByTimeAsync(0);
  x.store.putConfig({ ...x.store.config('p')!, memberIds: ['owner', 'peer', 'new-member'] });
  await vi.advanceTimersByTimeAsync(60_000); expect(x.ticks.at(-1)?.status).toBe('BLOCKED'); expect(x.ticks.at(-1)?.reports).toEqual([]); expect(x.scheduler.enabled).toBe(false);
});
it('exposes owner-controlled automatic mode in the local conversation and stops it on member pause', async () => {
  const x = setup(); const ledger = new ParticipationLedger(':memory:'); const ticks: WatchTick[] = [];
  const conversation = new OfflineConversation(x.store, new ScriptedLocalProvider(), () => Date.now(), { ledger, watch: x.watch, reasoner: new ScriptedConversationReasoner(), media: new SuppliedMediaFixture(), onWatchTick: result => { ticks.push(result); } });
  cleanup.push(async () => { await conversation.close(); ledger.close(); });
  expect((await conversation.line('/watch auto on')).kind).toBe('error');
  await conversation.line('/watch start'); await conversation.line('/as peer'); expect((await conversation.line('/watch auto on')).kind).toBe('error');
  await conversation.line('/as owner'); expect((await conversation.line('/watch auto on')).kind).toBe('status'); await vi.advanceTimersByTimeAsync(0); expect(ticks).toHaveLength(1);
  expect((await conversation.line('/watch tick')).kind).toBe('error');
  await conversation.line('/as peer'); expect((await conversation.line('/watch auto off')).kind).toBe('error');
  await conversation.line('/pause'); expect(conversation.scheduler.enabled).toBe(false); await vi.advanceTimersByTimeAsync(180_000); expect(ticks).toHaveLength(1);
  await conversation.line('/as owner'); await conversation.line('/resume'); expect((await conversation.line('/watch auto on')).kind).toBe('error');
});
