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
import { configureLongConversation, longProject, runLongConversation } from './long-conversation-lib.mjs';

const root = resolve('.'); const dir = resolve('.local/state'); const capturePath = '.local/evidence/long-conversation-live-v1.json';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const osEnv = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP'].filter(k => process.env[k] !== undefined).map(k => [k, process.env[k]]));
const git = args => execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, ...args], { encoding: 'utf8', env: osEnv }).trim();
async function run() {
  const authorized = spendCap(process.env);
  if (!process.env.META_API_KEY || process.env.META_MODEL_ID !== 'muse-spark-1.3' || process.env.META_DATA_MODE !== 'standard' || authorized <= 0 || authorized > 5 || resolve(process.env.APP_STATE_DIR || '') !== dir || existsSync(capturePath) || !existsSync(join(dir, 'teammate.sqlite'))) throw new Error('Fixed access/state/attempt gate failed');
  assert.equal(git(['status', '--porcelain']), '', 'Commit the exact candidate before the fixed live run');
  const corpusBytes = readFileSync('evals/long-conversation-v1/conversation.json'); const corpus = JSON.parse(corpusBytes);
  assert.equal(corpus.steps.filter(s => ['ask', 'reply'].includes(s.type)).length, 18); assert.equal(corpus.steps.filter(s => s.type === 'ambient').length, 72);
  const lockPath = join(dir, 'service.lock'); const lock = openSync(lockPath, 'wx'); writeFileSync(lock, String(process.pid));
  const state = {}; let record; let owned = false; let attempts = 0; let count = 0; let clock = Date.now();
  const now = () => clock;
  const save = () => writeFileSync(capturePath, JSON.stringify(record, null, 2) + '\n');
  try {
    state.store = new Store(join(dir, 'teammate.sqlite'));
    const budgetBefore = state.store.budgetUsed(); const cap = Math.min(authorized, budgetBefore + 0.5);
    if (cap - budgetBefore < 0.1) throw new Error('Insufficient authorized headroom for the bounded test');
    const paths = ['src/core.ts', 'src/store.ts', 'src/memory.ts', 'src/domain.ts', 'src/meta.ts', 'src/meta-runtime.ts', 'src/sources.ts', 'prompts/response.md', 'scripts/long-conversation-lib.mjs', 'scripts/long-conversation-live.mjs', 'scripts/vault-child.mjs', 'scripts/vault-lib.mjs', 'evals/long-conversation-v1/conversation.json', 'evals/long-conversation-v1/rubric.json', 'dist/core.js', 'dist/store.js', 'dist/memory.js', 'dist/meta.js'];
    record = { at: new Date().toISOString(), status: 'STARTED', candidate: git(['rev-parse', 'HEAD']), files: paths.map(path => ({ path, sha256: hash(readFileSync(path)) })), corpusSha256: hash(corpusBytes), budgetBeforeUsd: budgetBefore, runCeilingUsd: cap, maximumAdditionalUsd: 0.5, maximumInferenceAttempts: 18, chargeRowsBefore: Number(state.store.db.prepare('SELECT count(*) AS n FROM charges').get().n), privateCalls: [], progress: [], ownScopePurged: false, humanRatings: 'NOT_RUN', externalPosts: 0 };
    mkdirSync('.local/evidence', { recursive: true }); writeFileSync(capturePath, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
    assert.equal(state.store.config(longProject), undefined); owned = true;
    configureLongConversation(state.store, corpus, ingestBundle, now);
    const http = async (url, init) => { if (init?.method === 'POST' && (String(url) !== 'https://api.meta.ai/v1/responses' || ++attempts > 18)) throw new Error('Fixed 18-response limit'); return fetch(url, init); };
    let runtime;
    const connect = () => {
      runtime = createMetaRuntime(process.env.META_API_KEY, state.store, cap, http);
      const provider = { mode: runtime.provider.mode, model: runtime.provider.model, generate: async input => {
        const item = { ordinal: ++count, input, startedAt: new Date().toISOString(), status: 'STARTED' }; record.privateCalls.push(item); save();
        try { const result = await runtime.provider.generate(input); item.output = result.output; item.usage = result.usage; item.status = 'RETURNED'; return result; }
        catch { item.status = 'PROVIDER_FAILED'; throw new Error('Provider failed; no automatic retry'); }
        finally { item.finishedAt = new Date().toISOString(); save(); }
      } };
      state.core = new Teammate(state.store, provider, cap, now);
    };
    connect(); await runtime.provider.checkAccess();
    record.result = await runLongConversation({ state, corpus, adapterFactory: () => new FakeAdapter(), calls: () => count, now, advance: () => { clock += 1000; }, restart: async () => { state.store.close(); state.store = new Store(join(dir, 'teammate.sqlite')); connect(); }, recordTurn: result => { record.progress.push({ ...result, callOrdinal: result.modelCalls ? count : null }); save(); console.log(JSON.stringify({ turn: result.id, status: result.status, calls: count })); } });
    record.status = record.result.turns.filter(t => t.type !== 'ambient').every(t => t.status === 'DELIVERED') && record.result.controls.every(c => !/FAIL|NOT_RUN/.test(c.status)) ? 'COMPLETED_APPLICATION_CHECKS_QUALITY_UNRATED' : 'COMPLETED_WITH_FAILURES_QUALITY_UNRATED';
  } catch { if (record) { record.status = 'FAIL'; record.failure = 'First bounded run stopped; preserved without automatic retry'; } process.exitCode = 1; }
  finally {
    if (record && state.store) {
      try {
        const before = state.store.budgetUsed(); if (owned) { state.store.purgeProject(longProject); assert.equal(state.store.budgetUsed(), before); assert.equal(state.store.sources(longProject).length + state.store.memoryDecisions(longProject).length + state.store.memoryBriefs(longProject).length + state.store.pending(longProject).length, 0); record.ownScopePurged = true; }
        record.budgetAfterUsd = state.store.budgetUsed(); record.incrementUsd = Number((record.budgetAfterUsd - record.budgetBeforeUsd).toFixed(6)); record.chargeRowsAfter = Number(state.store.db.prepare('SELECT count(*) AS n FROM charges').get().n);
        const unknown = state.store.db.prepare("SELECT count(*) AS n,coalesce(sum(micros),0) AS micros FROM charges WHERE state='uncertain'").get(); record.uncertain = { rows: Number(unknown.n), usd: Number(unknown.micros) / 1e6 };
        assert.ok(record.budgetAfterUsd <= record.runCeilingUsd);
      } catch { record.cleanup = 'BLOCKED'; record.status = 'FAIL'; process.exitCode = 1; }
    }
    state.store?.close(); closeSync(lock); unlinkSync(lockPath);
    if (record) {
      record.actualInferenceAttempts = attempts; record.finishedAt = new Date().toISOString(); save();
      const { privateCalls: _private, progress: _progress, ...projection } = record;
      writeFileSync('evidence/long-conversation-live-v1.json', JSON.stringify({ ...projection, privateArtifactSha256: hash(readFileSync(capturePath)), rawAnswersOrInputsExported: false, limitations: 'Four simulated participants, 90 authored conversational turns, sequential replay and local SQLite. Ambient messages do not enter model context. Schema/citation validity and gate checks are not answer-quality or real-human evidence. Original frozen studies/manual form unchanged.' }, null, 2) + '\n');
      console.log(JSON.stringify({ status: record.status, attempts, incrementUsd: record.incrementUsd, totalUsd: record.budgetAfterUsd, ownScopePurged: record.ownScopePurged }));
    }
  }
}
run().catch(() => { console.error('BLOCKED: fixed long-conversation access/state unavailable; no credential or provider body displayed.'); process.exitCode = 1; });
