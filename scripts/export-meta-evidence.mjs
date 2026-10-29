import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

// Explicit projection of known run metadata only. No environment/credential
// files, raw responses, request IDs, chat, or runtime database are exported.
const load = path => { const bytes = readFileSync(path); return { data: JSON.parse(bytes), sha256: createHash('sha256').update(bytes).digest('hex') }; };
const smoke = load('.local/evidence/meta-smoke-v1.json'); const s = smoke.data;
const report = {
  exportedAt: new Date().toISOString(),
  evidenceKind: 'actual Meta calls over seeded synthetic evidence with fake local delivery; not live Discord or a human study',
  credentialValuesExported: false, rawResponsesExported: false,
  authorizedBudget: { eur: 5, localUsdCap: 5 },
  smoke: { at: s.at, commit: s.commit, status: s.status, model: s.model, runtimeIdentity: s.runtimeIdentity, promptIdentity: s.prompt, fixtureIdentity: s.fixtureIdentity, accountModelAccess: s.accountModelAccess, credentialPresence: s.credentialPresence, inferenceAttempts: s.inferenceAttempts, usage: s.trace?.usage ?? null, outcome: s.trace?.outcome ?? null, delivery: s.trace?.result ?? null, budgetBeforeUsd: s.beforeUsedOrReservedUsd, budgetAfterUsd: s.afterUsedOrReservedUsd, discordSends: s.discordSends, privateArtifactSha256: smoke.sha256 },
  pairedEvaluation: { status: 'NOT_RUN', humanRatings: 'NOT_RUN' },
  currentUsedOrReservedUsd: s.afterUsedOrReservedUsd,
};
if (existsSync('.local/evidence/frozen-paired-responses.json')) {
  const run = load('.local/evidence/frozen-paired-responses.json'); const e = run.data;
  const side = value => value === null ? null : { status: value.status, usage: value.usage ?? null, semanticResult: value.semanticResult ?? 'NOT_RATED', ...(value.reason ? { reason: value.reason } : {}) };
  report.pairedEvaluation = { at: e.at, commit: e.commit, status: e.status, kind: e.kind, model: e.model, mode: e.mode, casesHash: e.casesHash, promptHashes: e.promptHashes, frozenRuntimeIdentity: e.frozenRuntimeIdentity, fixtureHash: e.fixtureHash, quiet: e.quiet.map(q => ({ id: q.id, status: q.status, meaning: q.meaning })), pairs: e.pairs.map(p => ({ id: p.id, candidate: side(p.candidate), baseline: side(p.baseline), humanRating: p.humanRating, outcomeStudy: p.outcomeStudy })), budgetBeforeUsd: e.costUsedOrReservedBeforeUsd, budgetAfterUsd: e.costUsedOrReservedAfterUsd ?? null, humanRatings: e.humanRatings, liveDiscord: e.liveDiscord, privateArtifactSha256: run.sha256 };
  report.currentUsedOrReservedUsd = e.costUsedOrReservedAfterUsd ?? null;
}
if (existsSync('.local/evidence/meta-core-flow-v1.json')) {
  const run = load('.local/evidence/meta-core-flow-v1.json'); const c = run.data;
  report.coreFlow = { at: c.at, commit: c.commit, status: c.status, kind: c.kind, files: c.files, model: c.model, promptIdentity: c.promptIdentity, fixtureHash: c.fixtureHash, inferenceAttempts: c.inferenceAttempts, stages: c.stages, approvedDecisions: c.approvedDecisions ?? 0, savedBriefs: c.savedBriefs ?? 0, casualAgreementDidNotApprove: c.casualAgreementDidNotApprove ?? false, wrongDecisionApproverRejected: c.wrongDecisionApproverRejected ?? false, wrongBriefActorAndRoomRejected: c.wrongBriefActorAndRoomRejected ?? false, duplicateAcceptanceIdempotent: c.duplicateAcceptanceIdempotent ?? false, restartVerified: c.restartVerified ?? false, recallContextLabelsSavedNotExecuted: c.recallContextLabelsSavedNotExecuted ?? false, ownProjectContentDeleted: c.ownProjectContentDeleted, chargeLedgerPreserved: c.chargeLedgerPreserved ?? false, budgetBeforeUsd: c.budgetBeforeUsd, budgetAfterUsd: c.budgetAfterUsd ?? null, discordSends: c.discordSends, humanRatings: c.humanRatings, privateArtifactSha256: run.sha256 };
  report.currentUsedOrReservedUsd = c.budgetAfterUsd ?? null;
}
if (existsSync('.local/evidence/media-pilot-v1.json')) {
  const run = load('.local/evidence/media-pilot-v1.json'); const m = run.data;
  report.mediaPilot = { at: m.at, commit: m.commit, status: m.status, kind: m.kind, files: m.files, manifestSha256: m.manifestSha256, cases: m.cases.map(c => ({ id: c.id, status: c.status, model: c.model ?? null, literalFactChecks: c.literalFactChecks, authorizedContextAvailable: c.authorizedContextAvailable ?? false, noAuthorityCreated: c.noAuthorityCreated ?? false, originRevocationVerified: c.originRevocationVerified ?? false, mediaInferenceAttempts: c.mediaInferenceAttempts ?? 0, charges: c.charges ?? [] })), mediaInferenceAttempts: m.mediaInferenceAttempts, literalFactCasesPassed: m.literalFactCasesPassed ?? 0, uploadCleanupOutstanding: m.uploadCleanupOutstanding ?? 'NOT_COMPLETED', rawFixturesDeleted: m.rawFixturesDeleted, ownProjectContentDeleted: m.ownProjectContentDeleted, chargeLedgerPreserved: m.chargeLedgerPreserved ?? false, budgetBeforeUsd: m.budgetBeforeUsd, budgetAfterUsd: m.budgetAfterUsd ?? null, humanRatings: m.humanRatings, discordSends: m.discordSends, semanticReview: 'NOT_RUN', privateArtifactSha256: run.sha256 };
  if (existsSync('evidence/media-v1-review.json')) {
    const review = JSON.parse(readFileSync('evidence/media-v1-review.json'));
    if (review.privateArtifactSha256 !== run.sha256) throw new Error('Media review does not match preserved capture');
    report.mediaPilot.semanticReview = { reviewedAt: review.reviewedAt, reviewer: review.reviewer, target: review.target, cases: review.cases, limitations: review.limitations };
  }
  report.currentUsedOrReservedUsd = m.budgetAfterUsd ?? null;
}
if (existsSync('.local/evidence/voice-diagnostic-v1.json')) {
  const run = load('.local/evidence/voice-diagnostic-v1.json'); const d = run.data;
  report.voiceDiagnostic = { at: d.at, commit: d.commit, status: d.status, kind: d.kind, files: d.files, manifestSha256: d.manifestSha256, cases: d.cases.map(c => ({ id: c.id, status: c.status, literalFactChecks: c.literalFactChecks, safeFailure: c.safeFailure ?? null, charges: c.charges ?? [], originRevocationVerified: c.originRevocationVerified ?? false })), mediaInferenceAttempts: d.mediaInferenceAttempts, rawFixturesDeleted: d.rawFixturesDeleted, ownProjectContentDeleted: d.ownProjectContentDeleted, chargeLedgerPreserved: d.chargeLedgerPreserved, budgetAfterUsd: d.budgetAfterUsd ?? null, privateArtifactSha256: run.sha256, limitations: 'Single distinct diagnostic; does not replace the failed v1 quality case.' };
  report.currentUsedOrReservedUsd = d.budgetAfterUsd ?? null;
}
if (existsSync('.local/evidence/media-pilot-v2.json')) {
  const run = load('.local/evidence/media-pilot-v2.json'); const m = run.data;
  const review = JSON.parse(readFileSync('evidence/media-v2-review.json'));
  if (review.privateArtifactSha256 !== run.sha256) throw new Error('Media v2 review does not match preserved capture');
  report.mediaRegressionV2 = { at: m.at, commit: m.commit, status: m.status, kind: m.kind, files: m.files, manifestSha256: m.manifestSha256, cases: m.cases.map(c => ({ id: c.id, status: c.status, model: c.model ?? null, literalFactChecks: c.literalFactChecks, authorizedContextAvailable: c.authorizedContextAvailable ?? false, noAuthorityCreated: c.noAuthorityCreated ?? false, originRevocationVerified: c.originRevocationVerified ?? false, mediaInferenceAttempts: c.mediaInferenceAttempts ?? 0, charges: c.charges ?? [] })), mediaInferenceAttempts: m.mediaInferenceAttempts, literalFactCasesPassed: m.literalFactCasesPassed, uploadCleanupOutstanding: m.uploadCleanupOutstanding, rawFixturesDeleted: m.rawFixturesDeleted, ownProjectContentDeleted: m.ownProjectContentDeleted, chargeLedgerPreserved: m.chargeLedgerPreserved, budgetBeforeUsd: m.budgetBeforeUsd, budgetAfterUsd: m.budgetAfterUsd, humanRatings: m.humanRatings, discordSends: m.discordSends, semanticReview: { reviewedAt: review.reviewedAt, reviewer: review.reviewer, target: review.target, cases: review.cases, limitations: review.limitations }, privateArtifactSha256: run.sha256 };
  report.currentUsedOrReservedUsd = m.budgetAfterUsd;
}
mkdirSync('evidence', { recursive: true });
writeFileSync('evidence/meta-live-v1.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ smoke: report.smoke.status, pairedEvaluation: report.pairedEvaluation.status, usedOrReservedUsd: report.currentUsedOrReservedUsd, rawResponsesExported: false, artifact: 'evidence/meta-live-v1.json' }));
