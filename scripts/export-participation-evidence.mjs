import { createHash } from 'node:crypto';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
const file = '.local/evidence/participation-pilot-v1.json'; const raw = readFileSync(file); const r = JSON.parse(raw);
if (r.status === 'RUNNING') throw new Error('Pilot still running; no terminal result exported');
const calls = r.cases.flatMap(c => c.privateModelCalls); const charges = r.cases.flatMap(c => c.charges ?? []); const decisions = r.cases.flatMap(c => c.decisions);
const latencies = decisions.map(d => d.wallMs).sort((a, b) => a - b);
const countBy = (items, key) => Object.fromEntries([...new Set(items.map(key))].map(k => [k, items.filter(i => key(i) === k).length]));
const invalid = calls.filter(c => c.state === 'INVALID_OUTPUT');
let invalidAtOutputCap = 0; let associationsComplete = true;
for (const c of r.cases) {
  if ((c.charges ?? []).length !== c.privateModelCalls.length) { associationsComplete = false; continue; }
  c.privateModelCalls.forEach((call, i) => { if (call.state === 'INVALID_OUTPUT' && c.charges[i].usage?.outputTokens === 2048) invalidAtOutputCap++; });
}
const firstFindings = r.cases[0].privateModelCalls.filter(c => c.kind === 'monitor' && c.privateOutput?.status === 'forgotten_constraint').map(c => c.privateOutput);
const report = {
  exportedAt: new Date().toISOString(), startedAt: r.at, captureLastWriteAt: statSync(file).mtime.toISOString(), status: r.status,
  kind: r.kind, candidate: r.commit, runtimeFreezeSha256: r.runtimeFreezeSha256, corpusIdentity: r.corpusIdentity, harness: r.harness,
  model: r.model, promptIdentity: r.promptIdentity, settings: r.configuration.settings, sampling: r.configuration.sampling, maxOutputTokens: r.configuration.maxOutputTokens,
  actionMetrics: r.actionMetrics ?? null, modelHttpCalls: r.modelHttpCalls, modelCallKinds: countBy(calls, c => c.kind), modelCallOutcomes: countBy(calls, c => c.state),
  invalidModelOutputs: invalid.length, invalidByKind: countBy(invalid, c => c.kind), invalidOutputsAtOutputCap: invalidAtOutputCap, chargeCallAssociationsComplete: associationsComplete,
  interpretationOfInvalids: 'Capture omits failed raw envelopes. Full token allowance is an observation, not a confirmed truncation diagnosis. Silence on invalid output is a software fallback, not semantic accuracy.',
  observedActions: countBy(decisions, d => d.action), silenceReasons: countBy(decisions.filter(d => d.action === 'SILENT'), d => d.reason),
  messageProcessingWallMsIncludingQueue: latencies.length ? { count: latencies.length, min: latencies[0], median: latencies[Math.floor((latencies.length - 1) * 0.5)], p95: latencies[Math.floor((latencies.length - 1) * 0.95)], max: latencies.at(-1) } : null,
  firstConstraintCase: { case: r.cases[0].id, validConstraintFindings: firstFindings.length, stableClaimName: firstFindings.length > 0 && new Set(firstFindings.map(f => f.claim)).size === 1, distinctCitedIdSets: new Set(firstFindings.map(f => JSON.stringify([...f.evidenceIds].sort()))).size, finalAction: r.cases[0].decisions.at(-1)?.action ?? 'NOT_RUN', limitation: 'The policy requires unchanged evidence bindings for persistence. This case changes cited message IDs across successive findings. No claim that this is the only cause of all misses.' },
  cases: r.cases.map(c => ({ id: c.id, state: c.state, invalidModelCalls: c.invalidModelCalls, decisions: c.decisions.map(({ claimKey: _claim, evidenceIds: _ids, ...d }) => ({ ...d, citedSourceCount: _ids.length })), invitedShadowAction: c.privateInvitedShadowResult?.action ?? 'NOT_RUN', cleanup: c.cleanup, wallMs: c.wallMs ?? null, chargeMicros: (c.charges ?? []).reduce((n, q) => n + q.micros, 0) })),
  tokenUsage: { inputTokens: charges.reduce((n, c) => n + (c.usage?.inputTokens ?? 0), 0), outputTokens: charges.reduce((n, c) => n + (c.usage?.outputTokens ?? 0), 0) },
  chargeStates: countBy(charges, c => c.state), budgetBeforeUsd: r.budgetBeforeUsd, budgetAfterUsd: r.budgetAfterUsd, localUsdCap: r.localUsdCap,
  allCaseContentPurged: r.cases.every(c => c.cleanup === 'OWN_SYNTHETIC_CONTENT_PURGED_CHARGES_PRESERVED'), humanJudgments: 'NOT_RUN', semanticEvidenceSupport: 'NOT_RATED', externalPosts: r.externalPosts,
  rawObservationsExported: false, privateArtifactSha256: createHash('sha256').update(raw).digest('hex'),
  limitations: 'One self-authored synthetic frozen replay, no independent human validation of labels, no live room or timing study. Predefined action counts do not establish correctness/helpfulness, semantic source support or baseline superiority. Full product acceptance remains incomplete.'
};
writeFileSync('evidence/participation-live-v1.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, target: report.actionMetrics?.status ?? 'NOT_GRADED', caught: report.actionMetrics?.caught, falseInterruptions: report.actionMetrics?.falseInterruptions, invalidModelOutputs: invalid.length, httpCalls: r.modelHttpCalls, usedOrReservedUsd: r.budgetAfterUsd, artifact: 'evidence/participation-live-v1.json', rawObservationsExported: false }));
