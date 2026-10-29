import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { Store } from '../dist/store.js';
import { conversationEnvironment } from './vault-lib.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const root = resolve('.'); const dir = join(root, '.local/state'); const file = join(root, '.local/evidence/live-conversation-v1.json');
mkdirSync(join(root, '.local/evidence'), { recursive: true });
if (!process.env.META_API_KEY || existsSync(file) || existsSync(join(dir, 'service.lock'))) throw new Error('Preserved attempt, missing credential or active shared state');
const env = conversationEnvironment(process.env);
const osEnv = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP'].filter(k => process.env[k] !== undefined).map(k => [k, process.env[k]]));
const candidate = execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, 'rev-parse', 'HEAD'], { env: osEnv, encoding: 'utf8' }).trim();
const files = ['src/live-conversation.ts', 'src/live-terminal.ts', 'scripts/conversation-live.mjs', 'scripts/check-live-conversation.mjs', 'scripts/vault-child.mjs', 'scripts/vault-lib.mjs', 'src/local-harness.ts', 'src/core.ts', 'src/store.ts', 'src/meta.ts', 'src/meta-runtime.ts', 'prompts/response.md', 'examples/party-queue.json', 'dist/live-conversation.js', 'dist/live-terminal.js'].map(path => ({ path, sha256: hash(readFileSync(path)) }));
const record = { at: new Date().toISOString(), status: 'STARTED', kind: 'actual built terminal stdin/stdout over three real Meta requests; synthetic actors/evidence/confirmations, not Discord or human evaluation', candidate, files, model: 'muse-spark-1.3', maxInferenceAttempts: 3, steps: [], privateTerminalLines: [], ownedFreshProject: false, ownContentPurged: false, humanRatings: 'NOT_RUN', externalPosts: 0 };
writeFileSync(file, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' }); const save = () => writeFileSync(file, JSON.stringify(record, null, 2) + '\n');
let session; let previousChargeCount = null;
function start(fresh) {
  const child = spawn(process.execPath, ['scripts/conversation-live.mjs', ...(fresh ? ['--fresh-check'] : [])], { cwd: root, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  const lines = []; const notify = new Set(); let terminal = false; let code = null;
  const reader = createInterface({ input: child.stdout });
  reader.on('line', line => { lines.push(line); if (record.privateTerminalLines.length < 2000) record.privateTerminalLines.push(line); for (const f of [...notify]) f(); });
  child.stderr.on('data', () => {}); child.stdin.on('error', () => {}); child.on('error', () => {});
  const closed = new Promise(resolveClosed => child.once('close', value => { terminal = true; code = value; reader.close(); for (const f of [...notify]) f(); resolveClosed(value); }));
  const wait = (predicate, after = 0) => new Promise((resolveFound, reject) => {
    const timer = setTimeout(() => { notify.delete(check); reject(new Error('Terminal observation timeout; no retry')); }, 60000);
    const finish = (error, value) => { clearTimeout(timer); notify.delete(check); if (error) reject(error); else resolveFound(value); };
    const check = () => { const found = lines.slice(after).find(predicate); if (found !== undefined) finish(null, found); else if (terminal) finish(new Error('Terminal exited before expected output')); else if (lines.slice(after).some(l => /Provider unavailable or output invalid/.test(l))) finish(new Error('Model output invalid; no retry')); };
    notify.add(check); check();
  });
  const command = async (text, predicate = line => /^\[(?:status|confirmation|silent|error|response)\]/.test(line)) => { const after = lines.length; child.stdin.write(text + '\n'); return wait(predicate, after); };
  const stop = async () => {
    if (!terminal) child.stdin.write('/quit\n');
    let timer; try { return await Promise.race([closed, new Promise((_, reject) => { timer = setTimeout(() => { child.kill(); reject(new Error('Terminal failed to drain; state lock may need inspection')); }, 60000); })]); } finally { clearTimeout(timer); }
  };
  return { child, wait, command, stop, closed, get terminal() { return terminal; }, get code() { return code; } };
}
const inspect = fn => {
  const lockPath = join(dir, 'service.lock'); const lock = openSync(lockPath, 'wx'); let store;
  try { store = new Store(join(dir, 'teammate.sqlite')); return fn(store); } finally { store?.close(); closeSync(lock); unlinkSync(lockPath); }
};
const step = name => { record.steps.push(name); save(); console.log(JSON.stringify({ phase: name })); };
try {
  session = start(true); await session.wait(line => line.startsWith('NEW_SYNTHETIC_CHECK_SESSION:')); record.ownedFreshProject = true;
  const allowance = record.privateTerminalLines.find(l => l.startsWith('Shared allowance:')); record.budgetBeforeUsd = Number(/used\/reserved USD ([\d.]+)/.exec(allowance)[1]);
  const status = JSON.parse((await session.command('/status')).slice('[status] '.length)); assert.equal(status.decisions + status.briefs, 0);
  step('fresh_terminal_ready');
  const decisionLine = await session.command('/decision Party members must be assigned to the same room. Draft this for review; do not approve it.', l => /^\/accept accept:/.test(l)); const decisionToken = decisionLine.slice(8);
  await session.command('/ambient yes, sounds good'); await session.command('/as peer'); assert.match(await session.command(`/accept ${decisionToken}`), /^\[error\] Not authorized/);
  await session.command('/as owner'); assert.match(await session.command(`/accept ${decisionToken}`), /^\[confirmation\] Approved decision:/); assert.match(await session.command(`/accept ${decisionToken}`), /^\[confirmation\] Approved decision:/);
  step('new_decision_confirmed_wrong_actor_rejected');
  const briefLine = await session.command('/brief Compare the approved party rule with the selected party-route code and party_split log. Cite the approved decision and both source/log IDs, with an uncertain hypothesis, next check and no execution.', l => /^\/accept accept:/.test(l)); const briefToken = briefLine.slice(8);
  const reply = await session.command('/reply Which parts of that answer are observations versus hypotheses? Explain briefly, with the same available evidence. Do not draft another proposal.', l => /^\[response\]/.test(l)); assert.ok(!reply.includes('Provider unavailable'));
  assert.match(await session.command(`/accept ${briefToken}`), /^\[confirmation\] Saved brief; not executed:/);
  const saved = JSON.parse((await session.command('/status')).slice('[status] '.length)); assert.equal(saved.decisions, 1); assert.equal(saved.briefs, 1);
  step('brief_saved_after_real_bound_followup');
  assert.equal(await session.stop(), 0); session = null;
  inspect(store => {
    const recent = store.traces().slice(-3); assert.equal(recent.length, 3); assert.ok(recent.every(t => t.mode === 'meta' && t.outcome === 'response' && t.result === 'delivered'));
    record.actualInferenceAttempts = Number(/^CHECK_INFERENCE_ATTEMPTS: (\d+)$/.exec(record.privateTerminalLines.findLast(l => /^CHECK_INFERENCE_ATTEMPTS: \d+$/.test(l)))[1]); assert.equal(record.actualInferenceAttempts, 3);
    record.generationStages = recent.map(t => ({ outcome: t.outcome, delivery: t.result, usage: t.usage, citedContextSources: t.sources.length }));
    assert.equal(store.decisions('local-conversation').length, 1); const brief = store.briefs('local-conversation')[0]; assert.ok(brief?.status === 'saved' && brief.decisionIds.length && brief.sourceIds.some(s => s.startsWith('code:')) && brief.sourceIds.some(s => s.startsWith('log:')));
    previousChargeCount = Number(store.db.prepare('SELECT COUNT(*) AS n FROM charges').get().n); record.budgetAfterUsd = store.budgetUsed(); record.newDecisionAndBriefPersisted = true;
  });
  session = start(false); await session.wait(l => l.startsWith('Shared allowance:'));
  const restarted = JSON.parse((await session.command('/status')).slice('[status] '.length)); assert.equal(restarted.decisions, 1); assert.equal(restarted.briefs, 1); assert.equal(restarted.paused, true); record.restartVerified = true;
  assert.match(await session.command('/forget-local-data CONFIRM'), /^\[status\] This local project content was deleted/); assert.equal(await session.stop(), 0); session = null;
  step('restart_and_scoped_deletion_verified'); record.status = 'PASS_LOCAL_TERMINAL_FLOW_ONLY';
} catch { record.status = 'FAIL'; record.failure = 'Real terminal/model/assertion failed. Preserved first attempt; no automatic repeat'; process.exitCode = 1; }
finally {
  if (session && !session.terminal) { try { await session.stop(); } catch { record.shutdown = 'BLOCKED'; process.exitCode = 1; } }
  if (record.ownedFreshProject && (!session || session.terminal) && !existsSync(join(dir, 'service.lock'))) {
    try { inspect(store => {
      const charged = store.budgetUsed(); store.purgeProject('local-conversation'); assert.equal(store.budgetUsed(), charged);
      assert.equal(store.sources('local-conversation').length + store.decisions('local-conversation').length + store.briefs('local-conversation').length + store.pending('local-conversation').length, 0);
      if (previousChargeCount !== null) assert.equal(Number(store.db.prepare('SELECT COUNT(*) AS n FROM charges').get().n), previousChargeCount);
      record.ownContentPurged = true; record.budgetAfterUsd = charged; record.chargeLedgerRetained = true;
    }); } catch { record.cleanup = 'BLOCKED'; record.status = 'FAIL'; process.exitCode = 1; }
  }
  const counted = record.privateTerminalLines.findLast(l => /^CHECK_INFERENCE_ATTEMPTS: \d+$/.test(l));
  if (counted) record.actualInferenceAttempts = Number(counted.slice('CHECK_INFERENCE_ATTEMPTS: '.length));
  record.finishedAt = new Date().toISOString(); save();
}
console.log(JSON.stringify({ status: record.status, actualInferenceAttempts: record.actualInferenceAttempts ?? 'CHECK_CAPTURE', ownContentPurged: record.ownContentPurged, usedOrReservedUsd: record.budgetAfterUsd ?? 'UNKNOWN', humanRatings: 'NOT_RUN', externalPosts: 0 }));
