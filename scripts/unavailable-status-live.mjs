import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { Store } from '../dist/store.js';
import { Teammate } from '../dist/core.js';
import { FakeAdapter } from '../dist/fakes.js';
import { createMetaRuntime } from '../dist/meta-runtime.js';
import { spendCap } from '../dist/runtime-config.js';
import { ingestBundle } from '../dist/sources.js';
const dir = resolve('.local/state'); const project = 'unavailable-status-live-v1'; const path = '.local/evidence/unavailable-status-live-v1.json';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const osEnv = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP'].filter(k => process.env[k] !== undefined).map(k => [k, process.env[k]]));
const git = args => execFileSync('git', ['-c', `safe.directory=${resolve('.').replaceAll('\\', '/')}`, ...args], { env: osEnv, encoding: 'utf8' }).trim();
async function run() {
  const authorized = spendCap(process.env);
  if (!process.env.META_API_KEY || process.env.META_MODEL_ID !== 'muse-spark-1.3' || process.env.META_DATA_MODE !== 'standard' || authorized <= 0 || authorized > 5 || resolve(process.env.APP_STATE_DIR || '') !== dir || existsSync(path) || !existsSync(join(dir, 'teammate.sqlite'))) throw new Error('Fixed access/state/attempt gate failed');
  assert.equal(git(['status', '--porcelain']), '');
  const questions = JSON.parse(readFileSync('evals/unavailable-status-v1/cases.json', 'utf8')); assert.equal(questions.length, 3);
  const lockPath = join(dir, 'service.lock'); const lock = openSync(lockPath, 'wx'); writeFileSync(lock, String(process.pid)); let store; let record; let owned = false; let attempts = 0;
  try {
    store = new Store(join(dir, 'teammate.sqlite')); const before = store.budgetUsed(); const cap = Math.min(authorized, before + 0.1); assert.ok(cap - before >= 0.05);
    const files = ['src/core.ts', 'src/store.ts', 'src/memory.ts', 'src/meta.ts', 'prompts/response.md', 'scripts/unavailable-status-live.mjs', 'scripts/vault-child.mjs', 'scripts/vault-lib.mjs', 'evals/unavailable-status-v1/cases.json', 'evals/unavailable-status-v1/README.md', 'dist/core.js', 'dist/memory.js'];
    record = { at: new Date().toISOString(), candidate: git(['rev-parse', 'HEAD']), status: 'STARTED', kind: 'Three fresh synthetic unavailable-status responses after observed long-run citation failures; not a rerun', files: files.map(path => ({ path, sha256: hash(readFileSync(path)) })), budgetBeforeUsd: before, runCeilingUsd: cap, maximumAdditionalUsd: 0.1, maximumInferenceAttempts: 3, chargeRowsBefore: Number(store.db.prepare('SELECT count(*) AS n FROM charges').get().n), privateCalls: [], results: [], ownScopePurged: false, humanRatings: 'NOT_RUN', externalPosts: 0 };
    mkdirSync('.local/evidence', { recursive: true }); writeFileSync(path, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
    assert.equal(store.config(project), undefined); owned = true;
    store.putConfig({ projectId: project, platform: 'fake', workspaceId: 'synthetic-regression', roomId: 'synthetic-regression-room', memberIds: ['synthetic-owner', 'synthetic-peer'], approverIds: ['synthetic-owner'], approverRoleIds: ['reviewer'], paused: false, selectedSnapshot: 'upload-regression-v1', revision: 1 });
    const event = { id: 'seed', version: '1', projectId: project, platform: 'fake', workspaceId: 'synthetic-regression', roomId: 'synthetic-regression-room', actor: { id: 'synthetic-owner', roleIds: ['reviewer'] }, invocation: 'mention', text: 'Explicit synthetic fixture setup', replyTo: null, replyContext: null };
    const http = async (url, init) => { if (init?.method === 'POST' && (String(url) !== 'https://api.meta.ai/v1/responses' || ++attempts > 3)) throw new Error('Fixed three-response limit'); return fetch(url, init); };
    const runtime = createMetaRuntime(process.env.META_API_KEY, store, cap, http); await runtime.provider.checkAccess();
    const provider = { mode: runtime.provider.mode, model: runtime.provider.model, generate: async input => { const item = { input, status: 'STARTED' }; record.privateCalls.push(item); writeFileSync(path, JSON.stringify(record, null, 2) + '\n'); try { const r = await runtime.provider.generate(input); item.output = r.output; item.usage = r.usage; item.status = 'RETURNED'; return r; } catch { item.status = 'FAILED'; throw new Error('Provider unavailable; no retry'); } } };
    const core = new Teammate(store, provider, cap);
    const ids = ingestBundle(store, project, { snapshot: 'upload-regression-v1', synthetic: true, files: [{ path: 'upload.ts', text: '// Synthetic selected upload fixture, never executed.\nexport function shouldRetry() { return true; }' }], logs: [] }, Date.now());
    const rule = store.propose(event, { kind: 'decision', statement: 'The approved attachment-size ceiling is eight megabytes (8 MB).', sourceIds: [] }, core.context(event), Date.now()); store.accept(event, rule.buttonId, Date.now());
    const card = store.propose(event, { kind: 'brief', objective: 'Investigate repeated upload retries.', decisionIds: [], sourceIds: ids, hypothesis: 'Retry handling may repeat a failed upload; unverified.', nextCheck: 'A developer should inspect one failed upload and its retry count.', exclusions: ['No execution, edits or deployment by this app.'] }, core.context(event), Date.now()); store.accept(event, card.buttonId, Date.now());
    store.sourceState(project, ids[0], 'deleted');
    for (let i = 0; i < questions.length; i++) {
      const e = { ...event, id: `regression-question-${i + 1}`, actor: { id: 'synthetic-peer', roleIds: [] }, text: questions[i] }; const adapter = new FakeAdapter(); const started = Date.now();
      await core.handle(e, adapter); const trace = store.traces().at(-1); record.results.push({ id: `R${i + 1}`, outcome: trace?.outcome, delivery: trace?.result, usage: trace?.usage ?? null, providerDiagnostics: trace?.providerDiagnostics ?? null, latencyMs: Date.now() - started });
      writeFileSync(path, JSON.stringify(record, null, 2) + '\n'); console.log(JSON.stringify(record.results.at(-1)));
    }
    record.status = record.results.every(r => r.outcome === 'response' && r.delivery === 'delivered') ? 'COMPLETED_DELIVERY_CHECKS_QUALITY_UNRATED' : 'COMPLETED_WITH_FAILURES_QUALITY_UNRATED';
  } catch { if (record) { record.status = 'FAIL'; record.failure = 'Preserved first regression attempt; no automatic retry'; } process.exitCode = 1; }
  finally {
    if (store && record) {
      try { const before = store.budgetUsed(); if (owned) { store.purgeProject(project); assert.equal(store.budgetUsed(), before); assert.equal(store.sources(project).length + store.memoryDecisions(project).length + store.memoryBriefs(project).length, 0); record.ownScopePurged = true; }
        record.budgetAfterUsd = store.budgetUsed(); record.incrementUsd = Number((record.budgetAfterUsd - record.budgetBeforeUsd).toFixed(6)); record.chargeRowsAfter = Number(store.db.prepare('SELECT count(*) AS n FROM charges').get().n); assert.ok(record.budgetAfterUsd <= record.runCeilingUsd);
        const unknown = store.db.prepare("SELECT count(*) AS n,coalesce(sum(micros),0) AS micros FROM charges WHERE state='uncertain'").get(); record.uncertain = { rows: Number(unknown.n), usd: Number(unknown.micros) / 1e6 };
      } catch { record.cleanup = 'BLOCKED'; record.status = 'FAIL'; process.exitCode = 1; }
    }
    store?.close(); closeSync(lock); unlinkSync(lockPath);
    if (record) { record.actualInferenceAttempts = attempts; record.finishedAt = new Date().toISOString(); writeFileSync(path, JSON.stringify(record, null, 2) + '\n'); const { privateCalls: _private, ...projection } = record; writeFileSync('evidence/unavailable-status-live-v1.json', JSON.stringify({ ...projection, privateArtifactSha256: hash(readFileSync(path)), rawAnswersOrInputsExported: false }, null, 2) + '\n'); console.log(JSON.stringify({ status: record.status, attempts, incrementUsd: record.incrementUsd, totalUsd: record.budgetAfterUsd })); }
  }
}
run().catch(() => { console.error('BLOCKED: fixed unavailable-status access/state gate; no secret or provider body displayed.'); process.exitCode = 1; });
