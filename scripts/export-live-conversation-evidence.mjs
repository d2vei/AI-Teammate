import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { Store } from '../dist/store.js';
import { budgetFromBanner } from './live-terminal-evidence-lib.mjs';
const raw = readFileSync('.local/evidence/live-conversation-v1.json'); const r = JSON.parse(raw);
assert.equal(r.status, 'FAIL'); assert.equal(r.actualInferenceAttempts, 3); assert.equal(r.ownContentPurged, true);
const before = budgetFromBanner(r.privateTerminalLines.find(l => l.startsWith('Shared allowance:'))).usedOrReservedUsd;
const lockPath = '.local/state/service.lock'; const lock = openSync(lockPath, 'wx'); let store; let traceProjection;
try {
  store = new Store('.local/state/teammate.sqlite'); const traces = store.traces().slice(-3);
  assert.equal(traces.length, 3); assert.ok(traces.every(t => t.mode === 'meta' && t.outcome === 'response' && t.result === 'delivered' && t.usage));
  const charged = traces.reduce((n, t) => n + Math.ceil(t.usage.inputTokens * 1.25 + t.usage.outputTokens * 4.25), 0);
  assert.ok(Math.abs(charged / 1e6 - (r.budgetAfterUsd - before)) < 1e-9); assert.equal(store.budgetUsed(), r.budgetAfterUsd);
  traceProjection = traces.map((t, i) => ({ stage: ['decision', 'brief', 'bound_followup'][i], outcome: t.outcome, delivery: t.result, usage: t.usage, contextItemCount: t.sources.length }));
} finally { store?.close(); closeSync(lock); unlinkSync(lockPath); }
const report = { at: r.at, finishedAt: r.finishedAt, status: r.status, failure: 'Native /quit completed application cleanup but stdin kept the child process alive; the integration driver timed out after 60 seconds. The first attempt remains failed.', candidate: r.candidate, files: r.files, kind: r.kind, model: r.model, actualInferenceAttempts: r.actualInferenceAttempts, observedSteps: r.steps, coreTracesReconciledAfterRun: traceProjection, reconciliationMethod: 'Last three durable direct-core traces matched the native terminal inference counter and exact cumulative charge delta. Subsequent lifecycle checks sent no generation command.', freshScopeVerified: r.ownedFreshProject, newDecisionAndBriefObserved: r.steps.includes('brief_saved_after_real_bound_followup'), wrongActorRejectionObserved: r.steps.includes('new_decision_confirmed_wrong_actor_rejected'), duplicateAcceptanceObserved: r.steps.includes('new_decision_confirmed_wrong_actor_rejected'), casualAgreement: 'Sent as ambient; no intermediate saved-count query was made. Authority prohibition is separately code/mock-tested.', restartOfRealGeneratedState: 'NOT_RUN', ownContentPurged: r.ownContentPurged, chargeLedgerRetained: r.chargeLedgerRetained, budgetBeforeUsd: before, originalCaptureBudgetBeforeUsd: r.budgetBeforeUsd, budgetMetadataRecovery: 'The original driver greedily consumed sentence punctuation, producing null. Recovered the exact six-decimal amount from the preserved native startup banner; original capture unchanged.', budgetAfterUsd: r.budgetAfterUsd, semanticQuality: 'NOT_RATED', humanRatings: r.humanRatings, externalPosts: r.externalPosts, rawTerminalLinesExported: false, privateArtifactSha256: createHash('sha256').update(raw).digest('hex'), correctedLifecycleEvidence: 'evidence/live-terminal-lifecycle-v1.json', limitations: 'Three real accepted model outputs over synthetic evidence and simulated local participants. Bound local approval is not platform authentication. The corrected zero-generation lifecycle check does not replace or pass this failed first attempt. No repeated paid trial.' };
assert.equal(existsSync('evidence/live-terminal-lifecycle-v1.json'), true);
writeFileSync('evidence/live-conversation-v1.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, inferenceAttempts: 3, budgetUsedOrReservedUsd: report.budgetAfterUsd, rawTerminalLinesExported: false }));
