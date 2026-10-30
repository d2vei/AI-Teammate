import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Store } from '../dist/store.js';
import { MemoryVault } from '../dist/memory.js';
import { Teammate } from '../dist/core.js';
import { FakeAdapter } from '../dist/fakes.js';
import { ReplySchema } from '../dist/domain.js';
import { createMetaRuntime } from '../dist/meta-runtime.js';
import { spendCap } from '../dist/runtime-config.js';
import { ingestBundle } from '../dist/sources.js';
const root = resolve('.'); const dir = resolve('.local/state'); const project = 'memory-live-v1'; const path = '.local/evidence/memory-live-v1.json';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const osEnv = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP'].filter(k => process.env[k] !== undefined).map(k => [k, process.env[k]]));
async function run() {
  const cap = spendCap(process.env);
  if (!process.env.META_API_KEY || process.env.META_MODEL_ID !== 'muse-spark-1.3' || process.env.META_DATA_MODE !== 'standard' || cap <= 0 || cap > 5 || resolve(process.env.APP_STATE_DIR || '') !== dir || existsSync(path) || !existsSync(join(dir, 'teammate.sqlite'))) throw new Error('Fixed access/state/attempt gate failed');
  const lockPath = join(dir, 'service.lock'); const lock = openSync(lockPath, 'wx'); writeFileSync(lock, String(process.pid)); let store; let record; let attempts = 0; let owned = false;
  try {
    const before = new DatabaseSync(join(dir, 'teammate.sqlite'), { readOnly: true }); let schemaBefore; let chargeRowsBefore; let budgetBefore;
    try { schemaBefore = Number(before.prepare('PRAGMA user_version').get().user_version); chargeRowsBefore = Number(before.prepare('SELECT count(*) AS n FROM charges').get().n); budgetBefore = Number(before.prepare('SELECT sum(micros) AS n FROM charges').get().n) / 1e6; } finally { before.close(); }
    const files = ['src/memory.ts', 'src/core.ts', 'src/store.ts', 'src/local-harness.ts', 'src/live-conversation.ts', 'scripts/memory-live.mjs', 'scripts/vault-child.mjs', 'scripts/vault-lib.mjs', 'prompts/response.md', 'dist/memory.js', 'dist/core.js', 'dist/store.js'].map(path => ({ path, sha256: hash(readFileSync(path)) }));
    record = { at: new Date().toISOString(), status: 'STARTED', candidate: execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, 'rev-parse', 'HEAD'], { env: osEnv, encoding: 'utf8' }).trim(), files, kind: 'One actual Meta recall over 26 explicitly seeded synthetic approved decisions and topic metadata; not human approval, new Meta-authored decisions or a repeated quality pilot', schemaBefore, chargeRowsBefore, budgetBeforeUsd: budgetBefore, maximumInferenceAttempts: 1, seededDecisions: 0, ownScopePurged: false, humanRatings: 'NOT_RUN', externalPosts: 0 };
    mkdirSync('.local/evidence', { recursive: true }); writeFileSync(path, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
    store = new Store(join(dir, 'teammate.sqlite')); record.schemaAfter = Number(store.db.prepare('PRAGMA user_version').get().user_version);
    assert.equal(store.budgetUsed(), budgetBefore); assert.equal(Number(store.db.prepare('SELECT count(*) AS n FROM charges').get().n), chargeRowsBefore);
    assert.equal(store.config(project), undefined); owned = true;
    store.putConfig({ projectId: project, platform: 'fake', workspaceId: 'synthetic-memory-test', roomId: 'synthetic-memory-room', memberIds: ['synthetic-owner', 'synthetic-peer'], approverIds: ['synthetic-owner'], approverRoleIds: ['reviewer'], paused: false, selectedSnapshot: 'memory-live-v1', revision: 1 });
    const event = { id: 'memory-query', version: '1', projectId: project, platform: 'fake', workspaceId: 'synthetic-memory-test', roomId: 'synthetic-memory-room', actor: { id: 'synthetic-owner', roleIds: ['reviewer'] }, invocation: 'mention', text: 'What monthly hosting ceiling did we approve? State its approval status and cite the approved decision. Do not draft another proposal.', replyTo: null, replyContext: null };
    const sourceIds = ingestBundle(store, project, { snapshot: 'memory-live-v1', synthetic: true, files: [{ path: 'hosting-fixture.ts', text: '// Synthetic selected configuration, not production.\nexport const monthlyHostingCeilingEur = 40;' }], logs: [] }, Date.now());
    const vault = new MemoryVault(store); let oldRef;
    for (let i = 0; i < 26; i++) {
      const input = { kind: 'decision', statement: i ? `Use synthetic interface color number ${i}.` : 'The approved synthetic hosting ceiling is forty euros per month.', sourceIds: i ? [] : sourceIds };
      const e = { ...event, id: `seed-${i}`, invocation: 'action', text: 'Explicit synthetic fixture approval; not a human conversation.' }; const context = vault.context(e);
      const card = store.propose(e, input, context, Date.now()); const saved = store.accept(e, card.buttonId, Date.now()); if (!i) oldRef = `decision:${saved.id}`;
    }
    record.seededDecisions = 26; vault.tag({ ...event, invocation: 'action' }, oldRef, 'hosting costs'); assert.equal(vault.search(event, 'hosting ceiling')[0].id, oldRef);
    const http = async (url, init) => { if (init?.method === 'POST' && (String(url) !== 'https://api.meta.ai/v1/responses' || ++attempts > 1)) throw new Error('Fixed one-response limit'); return fetch(url, init); };
    const runtime = createMetaRuntime(process.env.META_API_KEY, store, cap, http); await runtime.provider.checkAccess(); let output;
    const provider = { mode: runtime.provider.mode, model: runtime.provider.model, generate: async input => { const r = await runtime.provider.generate(input); output = r.output; return r; } };
    const core = new Teammate(store, provider, cap); const context = core.context(event); record.oldDecisionRetrievedAfter25Newer = context.some(c => c.id === oldRef); record.selectedDecisionCount = context.filter(c => c.kind === 'approved_decision').length;
    assert.equal(record.oldDecisionRetrievedAfter25Newer, true); assert.equal(record.selectedDecisionCount, 8); const adapter = new FakeAdapter(); await core.handle(event, adapter);
    const trace = store.traces().at(-1); record.generation = { outcome: trace?.outcome, delivery: trace?.result, usage: trace?.usage ?? null }; record.privateModelOutput = output; const reply = ReplySchema.parse(output);
    record.factChecks = { hostingAmount: /\b40\b|forty/i.test(reply.answer), currency: /€|euro|\beur\b/i.test(reply.answer), monthlyUnit: /month|monat/i.test(reply.answer), citesApprovedMemory: reply.citations.includes(oldRef), noUnrequestedProposal: !reply.proposal };
    assert.ok(Object.values(record.factChecks).every(Boolean)); assert.equal(trace?.outcome, 'response'); assert.equal(trace?.result, 'delivered'); assert.equal(adapter.deliveries.length, 1); assert.equal(attempts, 1);
    const charged = store.budgetUsed(); record.budgetAfterUsd = charged; record.chargeRowsAfter = Number(store.db.prepare('SELECT count(*) AS n FROM charges').get().n); store.close(); store = undefined; store = new Store(join(dir, 'teammate.sqlite')); assert.equal(store.budgetUsed(), charged);
    assert.equal(new MemoryVault(store).search(event, '', { topic: 'hosting costs' })[0].id, oldRef); assert.equal(store.memoryDecisions(project).length, 26); record.restartVerified = true;
    record.status = 'PASS_SINGLE_META_MEMORY_RECALL_ONLY';
  } catch { if (record) { record.status = 'FAIL'; record.failure = 'Preserved first memory integration attempt; no automatic retry or output regrading'; } process.exitCode = 1; }
  finally {
    if (record && store) {
      try {
        const beforePurge = store.budgetUsed(); if (owned) { store.purgeProject(project); assert.equal(store.budgetUsed(), beforePurge); assert.equal(store.memoryTopics(project).length + store.memoryDecisions(project).length + store.memoryBriefs(project).length + store.sources(project).length + store.pending(project).length, 0); record.ownScopePurged = true; }
        record.budgetAfterUsd = store.budgetUsed(); record.chargeRowsAfter = Number(store.db.prepare('SELECT count(*) AS n FROM charges').get().n);
        const unknown = store.db.prepare("SELECT count(*) AS n,coalesce(sum(micros),0) AS micros FROM charges WHERE state='uncertain'").get(); record.uncertain = { rows: Number(unknown.n), usd: Number(unknown.micros) / 1e6 };
      } catch { record.cleanup = 'BLOCKED'; record.status = 'FAIL'; process.exitCode = 1; }
    }
    if (record && owned && !store) { record.cleanup = 'BLOCKED'; record.status = 'FAIL'; process.exitCode = 1; }
    store?.close(); closeSync(lock); unlinkSync(lockPath);
    if (record) {
      record.actualInferenceAttempts = attempts; record.finishedAt = new Date().toISOString(); const raw = JSON.stringify(record, null, 2) + '\n'; writeFileSync(path, raw);
      const { privateModelOutput: _private, ...projection } = record; writeFileSync('evidence/memory-live-v1.json', JSON.stringify({ ...projection, privateArtifactSha256: hash(raw), rawModelOutputExported: false, limitations: 'One actual recall with seeded synthetic approvals. Literal checks and resolved citation IDs do not establish semantic retrieval quality, human usefulness, private-source terms or real platform identity. Historical evaluations remain tied to their prior candidates.' }, null, 2) + '\n');
      console.log(JSON.stringify({ status: record.status, actualInferenceAttempts: attempts, ownScopePurged: record.ownScopePurged, usedOrReservedUsd: record.budgetAfterUsd }));
    }
  }
}
run().catch(() => { console.error('BLOCKED: fixed native memory-check configuration/state unavailable; no credential or provider body displayed.'); process.exitCode = 1; });
