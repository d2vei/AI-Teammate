import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Store } from '../dist/store.js';
import { ErrorWatch, ErrorWatchLedger, SyntheticErrorFeed } from '../dist/error-watch.js';
import { WatchScheduler } from '../dist/watch-scheduler.js';
import { ingestBundle } from '../dist/sources.js';
const root = resolve('.');
const files = ['src/error-watch.ts', 'src/watch-scheduler.ts', 'src/store.ts', 'src/domain.ts', 'src/sources.ts', 'examples/party-queue.json', 'scripts/watch-timed-demo.mjs', 'dist/error-watch.js', 'dist/watch-scheduler.js', 'dist/store.js', 'dist/domain.js', 'dist/sources.js', 'package-lock.json'];
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const identity = files.map(path => ({ path, sha256: hash(path) }));
const started = process.hrtime.bigint(); const elapsed = () => Number(process.hrtime.bigint() - started) / 1e6;
let finish; let fail; const complete = new Promise((resolve, reject) => { finish = resolve; fail = reject; });
const observations = []; let timeoutObservation; let timeoutCalls = 0;
const systems = [];
function setup(projectId, feed, onTick) {
  const store = new Store(':memory:'); const ledger = new ErrorWatchLedger(':memory:');
  store.putConfig({ projectId, platform: 'fake', workspaceId: 'timed-synthetic', roomId: projectId, memberIds: ['synthetic-owner'], approverIds: ['synthetic-owner'], approverRoleIds: [], paused: false, selectedSnapshot: 'timed-v1', revision: 1 });
  const bundle = JSON.parse(readFileSync('examples/party-queue.json', 'utf8')); bundle.snapshot = 'timed-v1'; bundle.logs = []; ingestBundle(store, projectId, bundle, Date.now());
  const event = { id: 'start-timed-replay', platform: 'fake', projectId, workspaceId: 'timed-synthetic', roomId: projectId, actor: { id: 'synthetic-owner', roleIds: [] }, invocation: 'action', text: 'Run read-only timed synthetic replay.', replyTo: null, replyContext: null, version: '1' };
  const watch = new ErrorWatch(store, ledger); watch.start(event, '424242', 60_000);
  const scheduler = new WatchScheduler(watch, feed, onTick); const system = { store, ledger, watch, scheduler, event }; systems.push(system); return system;
}
const normal = setup('timed-replay', new SyntheticErrorFeed(), tick => {
  observations.push({ elapsedMs: elapsed(), status: tick.status, reason: tick.reason, counts: tick.reports.map(r => r.count), polls: tick.polls });
  console.log(JSON.stringify({ observation: observations.at(-1), mode: 'REPLAY synthetic feed, actual Node timer', metaRequests: 0, externalPosts: 0 }));
  if (tick.status === 'BLOCKED' || observations.length > 3) fail(new Error('Unexpected timer result'));
  if (observations.length === 3) finish();
});
const stalled = setup('timed-timeout', { mode: 'replay', read() { timeoutCalls++; return new Promise(() => {}); } }, tick => { timeoutObservation = { elapsedMs: elapsed(), status: tick.status, reason: tick.reason, reports: tick.reports.length }; console.log(JSON.stringify({ nativeTimeout: timeoutObservation })); });
const guard = setTimeout(() => { fail(new Error('Timed replay exceeded 150 seconds')); }, 150_000);
const report = { startedAt: new Date().toISOString(), status: 'RUNNING', kind: 'actual Node timers over synthetic replay, not a live service or model test', node: process.versions.node, files: identity, metaRequests: 0, externalPosts: 0 };
try {
  await normal.scheduler.enable(normal.event); await stalled.scheduler.enable(stalled.event);
  console.log(JSON.stringify({ status: 'RUNNING', expectedDurationSeconds: 120, productionIntervalMs: 60_000, nativeReadTimeoutMs: 30_000, metaRequests: 0 }));
  await complete;
  for (const s of systems) { s.watch.stop(s.event); await s.scheduler.shutdown(); }
  const expected = [[2], [], [5]];
  if (observations.length !== 3 || observations.some((o, i) => JSON.stringify(o.counts) !== JSON.stringify(expected[i]))) throw new Error('Actual interval outputs mismatch');
  if (observations[1].elapsedMs - observations[0].elapsedMs < 59_000 || observations[2].elapsedMs - observations[1].elapsedMs < 59_000) throw new Error('Intervals were accelerated');
  if (timeoutCalls !== 1 || timeoutObservation?.reason !== 'poll_cancelled_or_timed_out' || timeoutObservation.elapsedMs < 29_000 || timeoutObservation.reports !== 0) throw new Error('Native bounded timeout/stop unverified');
  if (identity.some(f => hash(f.path) !== f.sha256)) throw new Error('Runtime changed during timer observation');
  report.status = 'PASS_SOFTWARE_TIMERS_ONLY'; report.observations = observations; report.nativeTimeout = timeoutObservation; report.timeoutReadCalls = timeoutCalls; report.stopped = systems.every(s => !s.scheduler.enabled && s.ledger.tasks(s.event.projectId).every(t => !t.active));
  report.costUsd = systems.reduce((n, s) => n + s.store.budgetUsed(), 0); report.semanticDiagnosis = 'NOT_RUN'; report.liveRoblox = 'NOT_RUN'; report.liveMeta = 'NOT_RUN';
} catch { report.status = 'FAIL'; report.observations = observations; report.nativeTimeout = timeoutObservation ?? null; process.exitCode = 1; }
finally { clearTimeout(guard); for (const s of systems) { await s.scheduler.shutdown(); s.ledger.close(); s.store.close(); } }
report.finishedAt = new Date().toISOString(); report.candidateBase = execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); report.workingTreeDirty = !!execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, 'status', '--porcelain'], { encoding: 'utf8' }).trim();
mkdirSync('evidence', { recursive: true }); writeFileSync('evidence/watch-timers-v1.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, costUsd: report.costUsd ?? 0, artifact: 'evidence/watch-timers-v1.json', metaRequests: 0, externalPosts: 0 }));
