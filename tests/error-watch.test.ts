import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../src/store.js';
import { ingestBundle } from '../src/sources.js';
import { ErrorWatch, ErrorWatchLedger, type ErrorFeed, type ErrorFrame } from '../src/error-watch.js';
import { LocalHarness, ScriptedLocalProvider } from '../src/local-harness.js';
import type { RequestEvent } from '../src/domain.js';
const cleanup: (() => void)[] = [];
afterEach(() => { for (const close of cleanup.splice(0).reverse()) close(); });
function setup(path = ':memory:') {
  const store = new Store(':memory:'); const ledger = new ErrorWatchLedger(path); cleanup.push(() => store.close(), () => ledger.close()); let now = Date.parse('2026-10-29T10:00:00Z');
  store.putConfig({ projectId: 'p', platform: 'fake', workspaceId: 'w', roomId: 'r', memberIds: ['owner', 'peer'], approverIds: ['owner'], approverRoleIds: ['reviewer'], paused: false, selectedSnapshot: 'watch-source-v1', revision: 1 });
  ingestBundle(store, 'p', { snapshot: 'watch-source-v1', synthetic: true, files: [{ path: 'party-route.ts', text: '// Synthetic example\nexport const value = 1;\nexport const selected = value;' }], logs: [] }, now);
  const event: RequestEvent = { id: 'watch-action', projectId: 'p', platform: 'fake', workspaceId: 'w', roomId: 'r', actor: { id: 'owner', roleIds: ['reviewer'] }, invocation: 'action', text: 'Watch the selected synthetic game.', version: '1', replyTo: null, replyContext: null };
  let frame: ErrorFrame = { synthetic: true, universeId: '424242', windowStart: '2026-10-29T00:00:00Z', groups: [{ id: 'synthetic-error', count: 2, message: 'Synthetic failure.', scriptPath: 'party-route.ts', line: 3 }] };
  let calls = 0; let beforeReturn: (() => void) | undefined;
  const feed: ErrorFeed = { mode: 'replay', async read() { calls++; beforeReturn?.(); return frame; } };
  const clock = () => now; const watch = new ErrorWatch(store, ledger, clock);
  return { store, ledger, event, watch, feed, clock, calls: () => calls, frame: (f: ErrorFrame) => { frame = f; }, getFrame: () => structuredClone(frame), advance: () => { now += 60_000; }, hook: (f: () => void) => { beforeReturn = f; } };
}
it('reports new and increased groups, withholds unchanged counts, and cites the actual selected line', async () => {
  const x = setup(); const task = x.watch.start(x.event, '424242'); expect(x.watch.start(x.event, '424242').id).toBe(task.id);
  const initial = await x.watch.tick(x.event, x.feed); expect(initial.reports[0]?.kind).toBe('new'); expect(initial.reports[0]?.text).toContain('party-route.ts@watch-source-v1:L3'); expect(initial.reports[0]?.text).toContain('3: export const selected');
  expect(initial.reports[0]?.sourceIds).toHaveLength(2); expect(initial.externalPosts).toBe(0); expect(initial.modelCalls).toBe(0);
  expect((await x.watch.tick(x.event, x.feed)).reason).toBe('not_due_or_stopped'); expect(x.calls()).toBe(1);
  x.advance(); expect((await x.watch.tick(x.event, x.feed)).status).toBe('SILENT');
  const frame = x.getFrame(); frame.groups[0]!.count = 5; x.frame(frame); x.advance();
  const increased = await x.watch.tick(x.event, x.feed); expect(increased.reports[0]?.kind).toBe('increased'); expect(increased.reports[0]?.increase).toBe(3); expect(increased.reports[0]?.text).toContain('cause unverified');
});
it('does not misreport a new counting window or decreasing count as an increase', async () => {
  const x = setup(); x.watch.start(x.event, '424242'); await x.watch.tick(x.event, x.feed);
  const frame = x.getFrame(); frame.groups[0]!.count = 1; x.frame(frame); x.advance(); expect((await x.watch.tick(x.event, x.feed)).reason).toBe('nonmonotonic_same_window');
  frame.windowStart = '2026-10-29T09:00:00Z'; x.frame(frame); x.advance(); expect((await x.watch.tick(x.event, x.feed)).status).toBe('SILENT');
});
it('requires an approver to select or stop a watch and denies foreign destinations', async () => {
  const x = setup(); const peer = { ...x.event, actor: { id: 'peer', roleIds: [] } };
  expect(() => x.watch.start(peer, '424242')).toThrow(); const task = x.watch.start(x.event, '424242'); expect(task.roomId).toBe('r');
  expect(() => x.watch.start(x.event, '12345')).toThrow('existing'); expect(() => x.watch.stop(peer)).toThrow();
  expect((await x.watch.tick({ ...x.event, roomId: 'foreign' }, x.feed)).status).toBe('BLOCKED'); expect(x.calls()).toBe(0);
  x.watch.stop(x.event); expect((await x.watch.tick(x.event, x.feed)).reason).toBe('not_due_or_stopped');
});
it('rechecks pause and audience after a delayed read and supports stop while paused', async () => {
  const x = setup(); x.watch.start(x.event, '424242'); x.hook(() => x.store.putConfig({ ...x.store.config('p')!, paused: true }));
  expect((await x.watch.tick(x.event, x.feed)).reason).toBe('configuration_changed'); expect(x.store.sources('p').filter(s => s.kind === 'log')).toEqual([]);
  x.watch.stop(x.event); expect(x.ledger.tasks('p')[0]?.active).toBe(false);
});
it('does not infer a cause from missing source/line and never reads an arbitrary local path', async () => {
  const x = setup(); const frame = x.getFrame(); frame.groups[0]!.scriptPath = 'missing.ts'; x.frame(frame); x.watch.start(x.event, '424242');
  const result = await x.watch.tick(x.event, x.feed); expect(result.reports[0]?.sourceIds).toHaveLength(1); expect(result.reports[0]?.text).toContain('source/line unavailable');
});
it('strips unknown fields and blocks obvious secret assignments before source ingress', async () => {
  const x = setup(); const frame = { ...x.getFrame(), groups: [{ ...x.getFrame().groups[0]!, privateField: 'SYNTHETIC_DO_NOT_RETAIN' }] };
  x.frame(frame); x.watch.start(x.event, '424242'); await x.watch.tick(x.event, x.feed);
  expect(JSON.stringify(x.store.sources('p'))).not.toContain('SYNTHETIC_DO_NOT_RETAIN');
  frame.groups[0]!.count = 3; frame.groups[0]!.message = 'token = SYNTHETIC_SECRET_SHAPE'; x.frame(frame); x.advance();
  expect((await x.watch.tick(x.event, x.feed)).reason).toBe('unsanitized_replay'); expect(JSON.stringify(x.store.sources('p'))).not.toContain('SYNTHETIC_SECRET_SHAPE');
});
it('persists deduplication across restart and removes watch state during an explicit two-store purge', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'teammate-watch-')); cleanup.push(() => rmSync(dir, { recursive: true, force: true })); const path = join(dir, 'watch.sqlite');
  const x = setup(path); x.watch.start(x.event, '424242'); await x.watch.tick(x.event, x.feed); x.advance();
  const second = new ErrorWatchLedger(path); cleanup.push(() => second.close()); const restarted = new ErrorWatch(x.store, second, x.clock);
  expect((await restarted.tick(x.event, x.feed)).status).toBe('SILENT'); restarted.purge(x.event); x.store.purgeProject('p');
  expect(second.tasks('p')).toEqual([]); expect(x.store.sources('p')).toEqual([]); expect(x.store.config('p')?.paused).toBe(true);
});
it('exposes the replay flow in the actual local harness with synthetic participants', async () => {
  const x = setup(); const harness = new LocalHarness(x.store, new ScriptedLocalProvider(), 0, x.clock, x.watch);
  expect((await harness.line('/watch start')).text).toContain('REPLAY watch');
  expect((await harness.line('/watch tick')).text).toContain('New error group');
  x.advance(); expect((await harness.line('/watch tick')).kind).toBe('silent');
  x.advance(); expect((await harness.line('/watch tick')).text).toContain('Increased error group');
  await harness.line('/as peer'); expect((await harness.line('/watch stop')).kind).toBe('error');
  await harness.line('/as owner'); expect((await harness.line('/watch stop')).kind).toBe('status');
});
