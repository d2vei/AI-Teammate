import assert from 'node:assert/strict';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { Store } from '../dist/store.js';
import { Teammate } from '../dist/core.js';
import { createMetaRuntime } from '../dist/meta-runtime.js';
import { FakeAdapter } from '../dist/fakes.js';
import { ingestBundle } from '../dist/sources.js';
const cap = 5;
async function run() {
  if (!process.env.META_API_KEY) throw new Error('Missing credential');
  const state = resolve('.local/state'); const evidence = resolve('.local/evidence'); mkdirSync(state, { recursive: true }); mkdirSync(evidence, { recursive: true });
  const file = join(evidence, 'meta-core-flow-v1.json'); if (existsSync(file)) throw new Error('Preserved first attempt');
  const lockPath = join(state, 'service.lock'); const lock = openSync(lockPath, 'wx'); writeFileSync(lock, String(process.pid));
  let store; let record; let ownProject;
  const save = () => writeFileSync(file, JSON.stringify(record, null, 2) + '\n');
  try {
    store = new Store(join(state, 'teammate.sqlite')); const { provider } = createMetaRuntime(process.env.META_API_KEY, store, cap); await provider.checkAccess();
    const env = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP'].filter(k => process.env[k] !== undefined).map(k => [k, process.env[k]]));
    const commit = execFileSync('git', ['-c', `safe.directory=${resolve('.').replaceAll('\\', '/')}`, 'rev-parse', 'HEAD'], { env, encoding: 'utf8' }).trim();
    const files = ['scripts/core-live.mjs', 'src/core.ts', 'src/store.ts', 'src/meta.ts', 'src/meta-runtime.ts', 'prompts/response.md'].map(path => ({ path, sha256: createHash('sha256').update(readFileSync(path)).digest('hex') }));
    record = { at: new Date().toISOString(), status: 'STARTED', kind: 'real Meta generation with simulated authenticated participants and fake local delivery; not Discord/human approval', commit, files, model: provider.model, promptIdentity: provider.promptVersion, localUsdCap: cap, budgetBeforeUsd: store.budgetUsed(), inferenceAttempts: 0, stages: [], discordSends: 0, humanRatings: 'NOT_RUN', privateSyntheticDeliveries: [], ownProjectContentDeleted: false };
    writeFileSync(file, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
    ownProject = `synthetic-live-flow-${randomUUID()}`;
    const config = { projectId: ownProject, platform: 'fake', workspaceId: 'synthetic-workspace', roomId: 'synthetic-room', memberIds: ['synthetic-owner', 'synthetic-peer'], approverIds: ['synthetic-owner'], approverRoleIds: ['maintainer'], paused: false, selectedSnapshot: 'live-core-synthetic-v1', revision: 1 };
    store.putConfig(config); const bundle = JSON.parse(readFileSync('examples/party-queue.json', 'utf8')); bundle.snapshot = config.selectedSnapshot; bundle.logs.forEach(l => { l.at = new Date().toISOString(); }); ingestBundle(store, ownProject, bundle, Date.now());
    record.fixtureHash = createHash('sha256').update(JSON.stringify(bundle)).digest('hex');
    const limited = { mode: provider.mode, model: provider.model, promptVersion: provider.promptVersion, generate(input) { if (++record.inferenceAttempts > 2) throw new Error('Only two inferences allowed'); return provider.generate(input); } };
    const core = new Teammate(store, limited, cap); const adapter = new FakeAdapter();
    const owner = { id: randomUUID(), version: 'synthetic-v1', projectId: ownProject, platform: 'fake', workspaceId: config.workspaceId, roomId: config.roomId, actor: { id: 'synthetic-owner', roleIds: ['maintainer'] }, invocation: 'mention', text: 'Propose a decision for our project: party members must be assigned to the same room. Draft it for approval; do not claim approval or execution.', replyTo: null, replyContext: null };
    const ask = async (name, event) => {
      const count = adapter.deliveries.length; await core.handle(event, adapter); const trace = store.traces().at(-1);
      record.stages.push({ name, outcome: trace?.outcome ?? null, delivery: trace?.result ?? null, usage: trace?.usage ?? null }); save();
      assert.equal(trace?.outcome, 'response'); assert.equal(trace?.result, 'delivered'); assert.equal(adapter.deliveries.length, count + 1);
      const result = adapter.deliveries.at(-1); record.privateSyntheticDeliveries.push(result); return result;
    };
    const decisionCard = (await ask('draft-decision', owner)).proposal; assert.equal(decisionCard?.proposal.body.kind, 'decision'); assert.equal(store.decisions(ownProject).length, 0);
    await core.handle({ ...owner, id: randomUUID(), invocation: 'ambient', text: 'yes, sounds good' }, adapter); assert.equal(store.decisions(ownProject).length, 0); assert.equal(record.inferenceAttempts, 1); record.casualAgreementDidNotApprove = true;
    const peer = { ...owner, id: randomUUID(), actor: { id: 'synthetic-peer', roleIds: [] } };
    assert.throws(() => store.accept(peer, decisionCard.buttonId, Date.now())); record.wrongDecisionApproverRejected = true;
    const decision = store.accept(owner, decisionCard.buttonId, Date.now()); assert.equal(decision.status, 'approved');
    const investigation = { ...peer, id: randomUUID(), text: 'Compare the approved rule with the selected party-route code and party_split log. Draft a concise investigation brief referencing that approved decision and both supplied code/log IDs, with an uncertain hypothesis, one next check and no execution.' };
    const context = core.context(investigation); const codeId = context.find(c => c.kind === 'code')?.id; const logId = context.find(c => c.kind === 'log')?.id; assert.ok(codeId && logId);
    const briefCard = (await ask('draft-investigation-brief', investigation)).proposal; assert.equal(briefCard?.proposal.body.kind, 'brief');
    assert.ok(briefCard.proposal.body.decisionIds.includes(`decision:${decision.id}`)); assert.ok(briefCard.proposal.body.sourceIds.includes(codeId)); assert.ok(briefCard.proposal.body.sourceIds.includes(logId)); assert.equal(store.briefs(ownProject).length, 0);
    assert.throws(() => store.accept(peer, briefCard.buttonId, Date.now())); assert.throws(() => store.accept({ ...owner, roomId: 'other-room' }, briefCard.buttonId, Date.now())); record.wrongBriefActorAndRoomRejected = true;
    const brief = store.accept(owner, briefCard.buttonId, Date.now()); assert.equal(brief.status, 'saved'); assert.equal(store.accept(owner, briefCard.buttonId, Date.now()).id, brief.id); record.duplicateAcceptanceIdempotent = true;
    store.close(); store = new Store(join(state, 'teammate.sqlite')); assert.equal(store.decisions(ownProject).length, 1); assert.equal(store.briefs(ownProject).length, 1); assert.equal(store.briefs(ownProject)[0].status, 'saved'); record.restartVerified = true;
    const recall = new Teammate(store, limited, cap).context(owner).find(c => c.kind === 'saved_brief'); assert.ok(recall?.label.includes('saved, not executed')); record.recallContextLabelsSavedNotExecuted = true;
    record.approvedDecisions = 1; record.savedBriefs = 1; record.status = 'PASS_APPLICATION_FLOW_ONLY';
  } catch {
    if (!record) throw new Error('Prerequisite gate failed'); record.status = 'FAIL'; record.failure = 'Live flow assertion/provider failed; no automatic retry'; process.exitCode = 1;
  } finally {
    try {
      if (store && ownProject) { const charged = store.budgetUsed(); store.purgeProject(ownProject); assert.equal(store.budgetUsed(), charged); assert.equal(store.decisions(ownProject).length + store.briefs(ownProject).length + store.sources(ownProject).length + store.pending(ownProject).length, 0); record.ownProjectContentDeleted = true; record.chargeLedgerPreserved = true; }
    } catch { if (record) { record.status = 'FAIL'; record.cleanup = 'BLOCKED'; } process.exitCode = 1; }
    finally { if (record && store) { record.budgetAfterUsd = store.budgetUsed(); save(); } store?.close(); closeSync(lock); unlinkSync(lockPath); }
  }
  console.log(JSON.stringify({ status: record.status, inferenceAttempts: record.inferenceAttempts, approvedDecisions: record.approvedDecisions ?? 0, savedBriefs: record.savedBriefs ?? 0, restartVerified: record.restartVerified ?? false, ownProjectContentDeleted: record.ownProjectContentDeleted, usedOrReservedUsd: record.budgetAfterUsd, discordSends: 0, artifact: '.local/evidence/meta-core-flow-v1.json' }));
}
run().catch(() => { console.error('BLOCKED: core-flow prerequisite, budget, lock or preserved first-attempt gate failed. No secret/provider body displayed.'); process.exitCode = 1; });
