import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { Store } from '../dist/store.js';
import { defaultParticipation, GenerationSchema, MonitorSchema, RepairSchema, ParticipationLedger, ParticipationPolicy } from '../dist/participation.js';
import { createMetaRuntime } from '../dist/meta-runtime.js';
import { spendCap } from '../dist/runtime-config.js';
import { pilotTurn, scoreParticipation } from './participation-pilot-lib.mjs';
const directory = 'evals/participation/live-v1'; const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function run() {
  const cap = spendCap(process.env); if (!process.env.META_API_KEY || cap <= 0 || cap > 5 || process.env.META_DATA_MODE !== 'standard') throw new Error('Access/budget unavailable');
  const freeze = JSON.parse(readFileSync(`${directory}/runtime-freeze.json`));
  for (const f of freeze.runtime) assert.equal(hash(readFileSync(f.path)), f.sha256, 'Frozen participation runtime changed');
  const corpus = JSON.parse(readFileSync(`${directory}/corpus.json`));
  assert.equal(hash(readFileSync(`${directory}/cases.jsonl`)), corpus.casesSha256); assert.equal(hash(readFileSync(`${directory}/labels.json`)), corpus.labelsSha256);
  const cases = readFileSync(`${directory}/cases.jsonl`, 'utf8').trim().split(/\r?\n/).map(s => JSON.parse(s));
  assert.equal(cases.length, 40); assert.equal(cases.reduce((n, c) => n + c.turns.length, 0), 180); assert.equal(new Set(cases.map(c => c.id)).size, 40);
  const state = resolve('.local/state'); const evidence = resolve('.local/evidence'); mkdirSync(state, { recursive: true }); mkdirSync(evidence, { recursive: true });
  const file = join(evidence, 'participation-pilot-v1.json'); if (existsSync(file)) throw new Error('Preserved first participation attempt');
  const lockPath = join(state, 'service.lock'); const lock = openSync(lockPath, 'wx'); writeFileSync(lock, String(process.pid));
  let budget; let report; let hardStop = null; let httpCalls = 0; const pending = new Set();
  const save = () => writeFileSync(file, JSON.stringify(report, null, 2) + '\n');
  try {
    budget = new Store(join(state, 'teammate.sqlite'));
    const http = async (url, init) => { if (init?.method === 'POST' && String(url) === 'https://api.meta.ai/v1/responses') { if (httpCalls >= 440) throw new Error('Fixed pilot request count exceeded'); httpCalls++; } try { const response = await fetch(url, init); if (!response.ok) hardStop = 'provider_http_failure_no_retry'; return response; } catch { hardStop = 'provider_transport_failure_no_retry'; throw new Error('Provider transport unavailable'); } };
    const runtime = createMetaRuntime(process.env.META_API_KEY, budget, cap, http); await runtime.provider.checkAccess();
    const env = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP'].filter(k => process.env[k] !== undefined).map(k => [k, process.env[k]]));
    const commit = execFileSync('git', ['-c', `safe.directory=${resolve('.').replaceAll('\\', '/')}`, 'rev-parse', 'HEAD'], { env, encoding: 'utf8' }).trim();
    const paths = ['scripts/participation-live.mjs', 'scripts/participation-pilot-lib.mjs', 'scripts/build-participation-live.mjs'];
    report = { at: new Date().toISOString(), status: 'RUNNING', kind: 'real Meta shadow policy on self-authored synthetic replay; simulated participants/invitations and no delivery transport', commit, runtimeFreezeSha256: hash(readFileSync(`${directory}/runtime-freeze.json`)), corpusIdentity: corpus, harness: paths.map(path => ({ path, sha256: hash(readFileSync(path)) })), configuration: freeze, model: runtime.provider.model, promptIdentity: runtime.participation.promptIdentity, localUsdCap: cap, budgetBeforeUsd: budget.budgetUsed(), budgetAfterUsd: budget.budgetUsed(), modelHttpCalls: 0, humanJudgments: 'NOT_RUN', semanticEvidenceSupport: 'NOT_RATED', externalPosts: 0, cases: cases.map(c => ({ id: c.id, state: 'NOT_RUN', decisions: [], privateModelCalls: [], invalidModelCalls: 0, cleanup: 'NOT_RUN' })) };
    writeFileSync(file, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    for (let index = 0; index < cases.length && !hardStop; index++) {
      const c = cases[index]; const result = report.cases[index]; const content = new Store(':memory:'); const ledger = new ParticipationLedger(':memory:'); const projectId = `synthetic-participation-${randomUUID()}`; const epoch = Date.now(); let now = epoch; const messages = []; let offer = null;
      const schemas = { monitor: MonitorSchema, selfRepair: RepairSchema, generate: GenerationSchema };
      const observedReasoner = { mode: 'meta', model: runtime.participation.model };
      for (const kind of Object.keys(schemas)) observedReasoner[kind] = input => {
        const started = performance.now(); const call = { kind, inputIdentity: hash(JSON.stringify(input)), state: 'RUNNING' }; result.privateModelCalls.push(call);
        const promise = runtime.participation[kind](input).then(value => { const parsed = schemas[kind].safeParse(value); call.state = parsed.success ? 'VALID_JSON_SCHEMA' : 'INVALID_OUTPUT'; call.privateOutput = parsed.success ? parsed.data : null; if (!parsed.success) { result.invalidModelCalls++; call.schemaIssueCodes = parsed.error.issues.map(i => i.code); } return value; }, error => { call.state = 'UNAVAILABLE'; if (error instanceof Error && error.message === 'Authorized budget unavailable') hardStop = 'authorized_budget_exhausted'; else hardStop ??= 'provider_request_failure_no_retry'; throw new Error('Participation observation unavailable'); }).finally(() => { call.wallMsIncludingQueue = performance.now() - started; });
        pending.add(promise); promise.then(() => pending.delete(promise), () => pending.delete(promise)); return promise;
      };
      const drain = () => Promise.allSettled([...pending]);
      const policy = new ParticipationPolicy(content, ledger, observedReasoner, () => now); const owner = { ...pilotTurn({ id: 'm0', actorId: 'owner', text: 'Configure a synthetic shadow replay only.', offsetMs: 0 }, projectId, epoch).event, invocation: 'action' };
      const beforeCharge = Number(budget.db.prepare('SELECT COALESCE(MAX(rowid),0) AS n FROM charges').get().n); const started = performance.now();
      try {
        content.putConfig({ projectId, platform: 'fake', workspaceId: owner.workspaceId, roomId: owner.roomId, memberIds: ['owner', 'peer'], approverIds: ['owner'], approverRoleIds: ['reviewer'], paused: false, selectedSnapshot: null, revision: 1 });
        if (c.approvedDecision) { assert.equal(typeof c.approvedDecision, 'string'); assert.ok(c.approvedDecision.length <= 300); const card = content.propose(owner, { kind: 'decision', statement: c.approvedDecision, sourceIds: [] }, [], now); const seeded = content.accept(owner, card.buttonId, now); result.seededDecisionId = `decision:${seeded.id}`; result.seededApproval = 'simulated fixture owner, not live human approval'; }
        policy.configure(owner, { ...defaultParticipation, mode: 'shadow' }); result.state = 'RUNNING';
        for (const turn of c.turns) {
          if (hardStop) break; const projected = pilotTurn(turn, projectId, epoch); now = projected.message.at; messages.push(projected.message); const turnStarted = performance.now();
          const decision = await policy.observe(projected.event, () => messages); await drain();
          const { offerToken, text, ...metadata } = decision;
          const allowed = new Set([...messages.map(m => `message:${m.id}`), ...(result.seededDecisionId ? [result.seededDecisionId] : [])]);
          result.decisions.push({ ...metadata, syntheticOffsetMs: turn.offsetMs, wallMs: performance.now() - turnStarted, citedIdsResolve: decision.evidenceIds.every(id => allowed.has(id)) });
          if (offerToken) offer = { token: offerToken, original: projected.event };
          report.modelHttpCalls = httpCalls; report.budgetAfterUsd = budget.budgetUsed(); save();
          console.log(JSON.stringify({ phase: 'shadow_observe', case: index + 1, cases: 40, turn: turn.id, action: decision.action, reason: decision.reason, httpCalls, usedOrReservedUsd: budget.budgetUsed() }));
        }
        if (!hardStop && offer) {
          now += 500; const invitation = { ...owner, id: 'invitation', invocation: 'reply', actor: { id: 'peer', roleIds: [] }, replyTo: offer.original.id, text: 'Please share that point.' };
          const generated = await policy.invite(offer.original, invitation, offer.token, () => messages); await drain(); const { offerToken: _token, ...metadata } = generated;
          result.privateInvitedShadowResult = metadata;
        }
        result.state = hardStop ? 'BLOCKED' : 'OBSERVED';
      } finally {
        await drain(); const charged = budget.budgetUsed(); policy.purge(owner); content.purgeProject(projectId); assert.equal(budget.budgetUsed(), charged);
        for (const table of ['claims', 'seen', 'offers', 'reasons', 'settings']) assert.equal(Number(ledger.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n), 0);
        assert.equal(content.sources(projectId).length + content.decisions(projectId).length + content.briefs(projectId).length + content.pending(projectId).length, 0);
        result.cleanup = 'OWN_SYNTHETIC_CONTENT_PURGED_CHARGES_PRESERVED'; result.wallMs = performance.now() - started;
        result.charges = budget.db.prepare('SELECT micros,state,usage FROM charges WHERE rowid > ? ORDER BY rowid').all(beforeCharge).map(row => ({ micros: Number(row.micros), state: row.state, usage: row.usage ? JSON.parse(row.usage) : null }));
        ledger.close(); content.close(); report.modelHttpCalls = httpCalls; report.budgetAfterUsd = budget.budgetUsed(); save();
      }
    }
    // Grader data is parsed only after all model work has completed/stopped.
    const labels = JSON.parse(readFileSync(`${directory}/labels.json`));
    report.actionMetrics = scoreParticipation(report.cases, labels); report.status = hardStop ? 'BLOCKED_PARTIAL_PILOT' : 'COMPLETED_MODEL_SHADOW_PILOT'; report.blocker = hardStop; save();
    console.log(JSON.stringify({ status: report.status, target: report.actionMetrics.status, caught: report.actionMetrics.caught, shouldSpeak: 15, falseInterruptions: report.actionMetrics.falseInterruptions, staySilent: 25, moves: report.actionMetrics.moves, modelHttpCalls: httpCalls, usedOrReservedUsd: budget.budgetUsed(), humanJudgments: 'NOT_RUN', externalPosts: 0, artifact: '.local/evidence/participation-pilot-v1.json' }));
  } catch { if (report) { report.status = 'FAIL_DRIVER_OR_PREREQUISITE'; report.modelHttpCalls = httpCalls; save(); } throw new Error('Pilot failed without retry'); }
  finally { await Promise.allSettled([...pending]); budget?.close(); closeSync(lock); unlinkSync(lockPath); }
}
run().catch(() => { console.error('BLOCKED: participation pilot prerequisite/driver, state lock, budget or preserved-attempt gate failed. No credentials/provider body displayed.'); process.exitCode = 1; });
