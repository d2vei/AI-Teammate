import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { Store } from '../dist/store.js';
const env = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA'].filter(k => process.env[k] !== undefined).map(k => [k, process.env[k]]));
const lockPath = resolve('.local/state/service.lock');
const snapshot = () => {
  const lock = openSync(lockPath, 'wx'); let store;
  try { store = new Store(resolve('.local/state/teammate.sqlite')); return { chargeRows: Number(store.db.prepare('SELECT COUNT(*) AS n FROM charges').get().n), budgetUsedOrReservedUsd: store.budgetUsed(), localSources: store.sources('local-conversation').length, localDecisions: store.decisions('local-conversation').length, localBriefs: store.briefs('local-conversation').length }; }
  finally { store?.close(); closeSync(lock); unlinkSync(lockPath); }
};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const paths = ['src/live-terminal.ts', 'src/live-conversation.ts', 'scripts/conversation-live.mjs', 'scripts/check-live-terminal-service.mjs', 'scripts/infisical.mjs', 'scripts/vault-child.mjs', 'scripts/vault-lib.mjs', 'dist/live-terminal.js', 'dist/live-conversation.js'];
const report = { at: new Date().toISOString(), status: 'RUNNING', kind: 'actual native Windows Infisical launcher and terminal start/status/quit twice; model entitlement GET only, no generation commands', candidateBase: execFileSync('git', ['-c', `safe.directory=${resolve('.').replaceAll('\\', '/')}`, 'rev-parse', 'HEAD'], { env, encoding: 'utf8' }).trim(), workingTreeDirty: true, files: paths.map(path => ({ path, sha256: hash(readFileSync(path)) })), modelCalls: 0, externalPosts: 0, cycles: [], humanRatings: 'NOT_RUN', limitations: 'Restart of the already-purged synthetic scope only, not persistence of the real generated brief or the full failed first-attempt run. No raw output/key is exported.' };
const file = resolve('evidence/live-terminal-lifecycle-v1.json'); mkdirSync(resolve('evidence'), { recursive: true });
if (existsSync(file)) throw new Error('Preserve existing native lifecycle attempt');
const save = () => writeFileSync(file, JSON.stringify(report, null, 2) + '\n');
try {
  report.before = snapshot(); save();
  for (let i = 0; i < 2; i++) {
    const started = Date.now(); let output = ''; let phase = 'startup'; let timedOut = false; let result;
    const child = spawn(process.execPath, ['scripts/infisical.mjs', 'conversation-live'], { env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    const reader = createInterface({ input: child.stdout });
    reader.on('line', line => {
      output += line + '\n';
      if (phase === 'startup' && line.startsWith('Shared allowance:')) { phase = 'status'; child.stdin.write('/status\n'); }
      else if (phase === 'status' && line.startsWith('[status] {')) { try { result = JSON.parse(line.slice(9)); phase = 'quit'; child.stdin.write('/quit\n'); } catch { phase = 'bad_status'; child.stdin.write('/quit\n'); } }
    });
    child.stderr.on('data', () => {}); child.stdin.on('error', () => {});
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, 30000);
    const exitCode = await new Promise(resolveExit => child.once('close', resolveExit)); clearTimeout(timer); reader.close();
    report.cycles.push({ cycle: i + 1, exitCode, timedOut, durationMs: Date.now() - started, reachedStatus: !!result, status: result ? { provider: result.provider, paused: result.paused, decisions: result.decisions, briefs: result.briefs, budgetUsedOrReservedUsd: result.budgetUsedOrReservedUsd, execution: result.execution } : null, outputSha256: hash(output) }); save();
    assert.equal(timedOut, false); assert.equal(exitCode, 0); assert.equal(result?.provider, 'meta'); assert.equal(result.execution, 'unavailable'); assert.equal(existsSync(lockPath), false);
  }
  report.after = snapshot(); assert.deepEqual(report.after, report.before); report.status = 'PASS_NATIVE_START_STATUS_QUIT_ONLY';
} catch { report.status = 'FAIL'; report.failure = 'Native startup/status/quit or unchanged-ledger check failed; no generation command was sent'; process.exitCode = 1; }
report.finishedAt = new Date().toISOString(); save();
console.log(JSON.stringify({ status: report.status, cycles: report.cycles.length, modelCalls: 0, usedOrReservedUsd: report.after?.budgetUsedOrReservedUsd ?? 'UNKNOWN', artifact: 'evidence/live-terminal-lifecycle-v1.json' }));
