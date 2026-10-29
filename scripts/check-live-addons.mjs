import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { Store } from '../dist/store.js';
import { ErrorWatchLedger } from '../dist/error-watch.js';
import { conversationEnvironment } from './vault-lib.mjs';
const root = resolve('.'); const dir = join(root, '.local/state'); const project = 'local-conversation';
const file = join(root, '.local/evidence/live-addons-v1.json'); const fixture = join(root, '.local/media-inbox/addon-check-v1.png');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const osEnv = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP'].filter(k => process.env[k] !== undefined).map(k => [k, process.env[k]]));
if (!process.env.META_API_KEY || existsSync(file) || !existsSync(fixture) || existsSync(join(dir, 'service.lock'))) throw new Error('Missing prepared fixture/key, preserved attempt or active state');
const inspect = fn => {
  const lockPath = join(dir, 'service.lock'); const lock = openSync(lockPath, 'wx'); let store; let ledger;
  try { store = new Store(join(dir, 'teammate.sqlite')); ledger = new ErrorWatchLedger(join(dir, 'watch-live-replay.sqlite')); return fn(store, ledger); }
  finally { ledger?.close(); store?.close(); closeSync(lock); unlinkSync(lockPath); }
};
const before = inspect((s, l) => {
  assert.equal(s.sources(project).length + s.decisions(project).length + s.briefs(project).length + s.pending(project).length, 0);
  assert.ok(!s.config(project) || s.config(project).paused); assert.ok(!l.tasks(project).some(t => t.active));
  return { use: s.budgetUsed(), charges: Number(s.db.prepare('SELECT count(*) AS n FROM charges').get().n), traceCount: s.traces().length };
});
const candidate = execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, 'rev-parse', 'HEAD'], { env: osEnv, encoding: 'utf8' }).trim();
const paths = ['src/live-conversation.ts', 'src/live-watch.ts', 'src/local-media-inbox.ts', 'src/live-terminal.ts', 'scripts/conversation-live.mjs', 'scripts/check-live-addons.mjs', 'scripts/vault-child.mjs', 'scripts/vault-lib.mjs', 'src/core.ts', 'src/store.ts', 'src/media.ts', 'src/media-meta.ts', 'src/media-codec.ts', 'src/error-watch.ts', 'src/watch-scheduler.ts', 'examples/error-watch-replay.json', 'examples/party-queue.json', 'prompts/response.md', 'dist/live-conversation.js', 'dist/live-watch.js', 'dist/local-media-inbox.js', 'dist/live-terminal.js'];
const record = { at: new Date().toISOString(), status: 'STARTED', kind: 'new combined real-Meta local terminal add-on integration; actual image bytes, saved JSON replay and synthetic role-play, not a repeat/relabel of the failed direct-only trial', candidate, files: paths.map(path => ({ path, sha256: hash(readFileSync(path)) })), fixture: { sha256: hash(readFileSync(fixture)), bytes: readFileSync(fixture).length, synthetic: true }, model: 'muse-spark-1.3', maximumResponseAttempts: 6, budgetBeforeUsd: before.use, chargeRowsBefore: before.charges, steps: [], privateTerminalLines: [], ownedEmptyScope: true, ownContentPurged: false, fixturePurged: false, humanRatings: 'NOT_RUN', externalPosts: 0, liveRoblox: 'NOT_RUN', liveDiscord: 'NOT_RUN' };
mkdirSync(join(root, '.local/evidence'), { recursive: true }); writeFileSync(file, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
const save = () => writeFileSync(file, JSON.stringify(record, null, 2) + '\n');
const step = name => { record.steps.push({ name, at: new Date().toISOString() }); save(); console.log(JSON.stringify({ phase: name })); };
const env = conversationEnvironment(process.env); let session;
function start(check) {
  const child = spawn(process.execPath, ['scripts/conversation-live.mjs', ...(check ? ['--addon-check'] : [])], { cwd: root, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  const lines = []; const notify = new Set(); let terminal = false; const reader = createInterface({ input: child.stdout });
  reader.on('line', line => { lines.push(line); if (record.privateTerminalLines.length < 3000) record.privateTerminalLines.push(line); for (const f of [...notify]) f(); });
  child.stderr.on('data', () => {}); child.stdin.on('error', () => {}); child.on('error', () => {});
  const closed = new Promise(resolveClosed => child.once('close', code => { terminal = true; reader.close(); for (const f of [...notify]) f(); resolveClosed(code); }));
  const wait = (predicate, after = 0, milliseconds = 70000) => new Promise((resolveFound, reject) => {
    const finish = (error, value) => { clearTimeout(timer); notify.delete(check); if (error) reject(error); else resolveFound(value); };
    const timer = setTimeout(() => finish(new Error('Native observation timeout; no retry')), milliseconds);
    const check = () => { const found = lines.slice(after).find(predicate); if (found !== undefined) finish(null, found); else if (terminal || lines.slice(after).some(l => /Provider unavailable or output invalid|^\[error\]|Diagnosis withheld/.test(l))) finish(new Error('Terminal/model gate failed; no retry')); };
    notify.add(check); check();
  });
  const command = async (text, predicate = l => /^\[(?:status|confirmation|silent|error|response)\]/.test(l)) => { const after = lines.length; child.stdin.write(text + '\n'); return wait(predicate, after); };
  const stop = async () => { if (!terminal) child.stdin.write('/quit\n'); let timer; try { return await Promise.race([closed, new Promise((_, reject) => { timer = setTimeout(() => { child.kill(); reject(new Error('Native shutdown timeout')); }, 60000); })]); } finally { clearTimeout(timer); } };
  return { command, wait, stop, get length() { return lines.length; }, get lines() { return lines; }, get terminal() { return terminal; } };
}
try {
  session = start(true); await session.wait(l => l.startsWith('LIVE_ADDON_CHECK_READY:')); step('empty_scope_native_session_ready');
  assert.match(await session.command('/reset-demo CONFIRM'), /New synthetic fixture/);
  const decision = (await session.command('/decision Party members must be assigned to the same room. Draft one concise decision for review; do not approve it.', l => /^\/accept accept:/.test(l))).slice(8);
  await session.command('/ambient yes, agreed'); const unapproved = JSON.parse((await session.command('/status')).slice(9)); assert.equal(unapproved.decisions, 0);
  await session.command('/as peer'); assert.match(await session.command(`/accept ${decision}`), /^\[error\] Not authorized/); await session.command('/as owner'); assert.match(await session.command(`/accept ${decision}`), /Approved decision:/); step('new_decision_authorized_ordinary_yes_and_peer_rejected');
  await session.command('/media image addon-check-v1.png --synthetic', l => /^\/media remove /.test(l)); step('actual_inbox_image_derived');
  const brief = (await session.command('/brief Draft a short investigation brief comparing the approved party rule with the selected party-route code and party_split log. Include the attachment review day and its approval warning as unverified evidence. Use the approved decision ID and actual media, code and log IDs. Keep every field concise, with an uncertain hypothesis, one next check and no execution.', l => /^\/accept accept:/.test(l))).slice(8);
  await session.command('/reply Briefly separate the attachment observation and code/log facts from the hypothesis. Cite the available IDs; no new proposal.', l => /^\[response\]/.test(l));
  assert.match(await session.command(`/accept ${brief}`), /Saved brief; not executed:/); assert.match(await session.command(`/accept ${brief}`), /Saved brief; not executed:/); step('media_grounded_brief_bound_followup_and_one_use_confirmation');
  await session.command('/watch start'); const watchStart = session.length; await session.command('/watch auto on');
  await session.wait(l => /^\[watch response\].*count 2/.test(l), watchStart); await session.wait(l => /AI analysis only; no execution or reproduction performed\./.test(l), watchStart); step('first_changed_replay_received_meta_diagnosis');
  const unchangedStart = session.length; await session.wait(l => /^\[watch silent\].*No Meta diagnosis requested/.test(l), unchangedStart); step('one_minute_unchanged_poll_silent_without_meta');
  const increasedStart = session.length; await session.wait(l => /^\[watch response\].*count 5/.test(l), increasedStart); await session.wait(l => /AI analysis only; no execution or reproduction performed\./.test(l), increasedStart); step('second_minute_increased_replay_received_meta_diagnosis');
  await session.command('/watch stop'); assert.equal(await session.stop(), 0); session = null;
  inspect(s => {
    assert.equal(s.decisions(project).length, 1); assert.equal(s.briefs(project).length, 1); const b = s.briefs(project)[0];
    assert.ok(b.decisionIds.length && b.sourceIds.some(id => id.startsWith('media:')) && b.sourceIds.some(id => id.startsWith('code:')) && b.sourceIds.some(id => id.startsWith('log:')));
    const media = s.sources(project).find(source => source.id.startsWith('media:')); const text = JSON.parse(media.text).text; assert.match(text, /Tuesday/i); assert.match(text, /no.{0,30}approv|not.{0,30}approv/i);
    record.imageFactsRecognized = true; record.origin = JSON.parse(media.text).originId; record.briefSourceKinds = ['media', 'code', 'log', 'approved_decision'];
    const traces = s.traces().filter(t => t.at >= Date.parse(record.at)); assert.equal(traces.length, 5); assert.ok(traces.every(t => t.mode === 'meta' && t.outcome === 'response' && t.result === 'delivered'));
    record.generations = traces.map(t => ({ outcome: t.outcome, delivery: t.result, usage: t.usage, contextSourceCount: t.sources.length })); record.budgetAfterUsd = s.budgetUsed();
    record.chargeRowsAfter = Number(s.db.prepare('SELECT count(*) AS n FROM charges').get().n); assert.equal(record.chargeRowsAfter - before.charges, 6); record.newStatePersisted = true;
  });
  record.actualResponseAttempts = Number(/^ADDON_INFERENCE_ATTEMPTS: (\d+)$/.exec(record.privateTerminalLines.find(l => /^ADDON_INFERENCE_ATTEMPTS:/.test(l)))[1]); assert.equal(record.actualResponseAttempts, 6);
  session = start(false); await session.wait(l => l.startsWith('Shared allowance:'));
  const state = JSON.parse((await session.command('/status')).slice(9)); assert.equal(state.paused, true); assert.equal(state.decisions, 1); assert.equal(state.briefs, 1); record.restartVerified = true;
  await session.command('/resume'); assert.match(await session.command(`/media remove ${record.origin}`), /1 attachment derivation/); await session.command('/forget-local-data CONFIRM');
  assert.equal(await session.stop(), 0); session = null; step('saved_state_restart_origin_removal_and_scoped_purge'); record.status = 'PASS_LOCAL_META_MEDIA_REPLAY_FLOW_ONLY';
} catch { record.status = 'FAIL'; record.failure = 'First combined native terminal/model/assertion failed; capture preserved without retry'; process.exitCode = 1; }
finally {
  if (session && !session.terminal) { try { await session.stop(); } catch { record.shutdown = 'BLOCKED'; process.exitCode = 1; } }
  if ((!session || session.terminal) && !existsSync(join(dir, 'service.lock'))) {
    try { inspect((s, l) => { const charged = s.budgetUsed(); s.purgeProject(project); l.purge(project); assert.equal(s.budgetUsed(), charged); assert.equal(s.sources(project).length + s.decisions(project).length + s.briefs(project).length + s.pending(project).length + l.tasks(project).length, 0); record.ownContentPurged = true; record.budgetAfterUsd = charged; record.chargeRowsAfter = Number(s.db.prepare('SELECT count(*) AS n FROM charges').get().n); }); }
    catch { record.cleanup = 'BLOCKED'; record.status = 'FAIL'; process.exitCode = 1; }
  }
  if (existsSync(fixture) && hash(readFileSync(fixture)) === record.fixture.sha256) { unlinkSync(fixture); record.fixturePurged = true; }
  record.finishedAt = new Date().toISOString(); save();
}
console.log(JSON.stringify({ status: record.status, actualResponseAttempts: record.actualResponseAttempts ?? 'CHECK_CAPTURE', ownContentPurged: record.ownContentPurged, fixturePurged: record.fixturePurged, usedOrReservedUsd: record.budgetAfterUsd, humanRatings: 'NOT_RUN', externalPosts: 0 }));
