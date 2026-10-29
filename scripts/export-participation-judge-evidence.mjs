import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
const raw = readFileSync('.local/evidence/participation-judge-v1.json'); const r = JSON.parse(raw);
assert.ok(['COMPLETED_MODEL_JUDGMENTS', 'PARTIAL_MODEL_JUDGMENTS', 'FAILED_EVALUATOR'].includes(r.status));
const pilot = JSON.parse(readFileSync('evidence/participation-live-v1.json'));
assert.equal(r.generatorCaptureSha256, pilot.privateArtifactSha256);
const valid = r.cases.filter(c => c.state === 'MODEL_JUDGMENT'); const tally = key => Object.fromEntries([...new Set(valid.map(c => c.privateJudgment[key]))].map(value => [value, valid.filter(c => c.privateJudgment[key] === value).length]));
const uncertainCaseIds = []; const labelDisagreementCaseIds = []; const labelAgreementCaseIds = [];
for (const c of valid) {
  const grade = pilot.actionMetrics.caseGrades.find(g => g.id === c.id); assert.ok(grade);
  if (c.privateJudgment.correctness === 'uncertain') uncertainCaseIds.push(c.id);
  else if ((c.privateJudgment.correctness === 'correct') === (grade.status === 'PASS_ACTION_ONLY')) labelAgreementCaseIds.push(c.id);
  else labelDisagreementCaseIds.push(c.id);
}
const report = { at: r.at, finishedAt: r.finishedAt, status: r.status, kind: r.kind, candidate: r.candidate, manifestSha256: r.manifestSha256, generatorCaptureSha256: r.generatorCaptureSha256, model: r.model, promptIdentity: r.promptIdentity, modelHttpCalls: r.modelHttpCalls, validJudgments: valid.length, invalidOutputs: r.cases.filter(c => c.state === 'INVALID_OUTPUT').length, unavailable: r.cases.filter(c => c.state === 'UNAVAILABLE').length, notRun: r.cases.filter(c => c.state === 'NOT_RUN').length, correctness: tally('correctness'), helpfulness: tally('helpfulness'), agreementWithPredefinedActionGrades: { agrees: labelAgreementCaseIds.length, disagrees: labelDisagreementCaseIds.length, uncertain: uncertainCaseIds.length, disagreementCaseIds: labelDisagreementCaseIds, limitation: 'The labels and this same-model evaluator are not independent ground truth. This does not regrade or replace the original action metric.' }, cases: r.cases.map(c => ({ id: c.id, state: c.state, correctness: c.privateJudgment?.correctness ?? null, helpfulness: c.privateJudgment?.helpfulness ?? null, citedSourceCount: c.privateJudgment?.evidenceIds.length ?? null, usage: c.usage ?? null, wallMs: c.wallMs ?? null })), tokenUsage: { inputTokens: r.cases.reduce((n, c) => n + (c.usage?.inputTokens ?? 0), 0), outputTokens: r.cases.reduce((n, c) => n + (c.usage?.outputTokens ?? 0), 0) }, budgetBeforeUsd: r.budgetBeforeUsd, budgetAfterUsd: r.budgetAfterUsd, humanRatings: 'NOT_RUN', manualDisagreements: 'NOT_RUN', externalPosts: r.externalPosts, rawJustificationsExported: false, privateArtifactSha256: createHash('sha256').update(raw).digest('hex'), unchangedOriginalActionScore: { status: pilot.actionMetrics.status, caught: pilot.actionMetrics.caught, shouldSpeak: pilot.actionMetrics.shouldSpeak, falseInterruptions: pilot.actionMetrics.falseInterruptions, staySilent: pilot.actionMetrics.staySilent }, limitations: 'One same-model automated judge per self-authored replay. No human labels entered, no generator rerun, no quality certification or baseline superiority. Existing review form remains unchanged; actual 20 manual comparisons are pending.' };
report.invalidOutputsAtReportedOutputCap = r.cases.filter(c => c.state === 'INVALID_OUTPUT' && c.usage?.outputTokens === 2048).length;
report.invalidInterpretation = 'Failed raw envelopes are not retained; reaching the output allowance does not confirm truncation.';
if (existsSync('.local/review/review-data.json')) {
  const pack = JSON.parse(readFileSync('.local/review/review-data.json')); assert.equal(pack.sourceHashes.participation, r.generatorCaptureSha256);
  const sample = new Set(pack.moments.map(m => m.id));
  report.preparedManualSample = { requested: sample.size, validModelJudgments: valid.filter(c => sample.has(c.id)).length, missingModelCaseIds: r.cases.filter(c => sample.has(c.id) && c.state !== 'MODEL_JUDGMENT').map(c => c.id), manualEntries: 'NOT_RUN' };
}
writeFileSync('evidence/participation-judge-v1.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, modelHttpCalls: report.modelHttpCalls, validJudgments: report.validJudgments, invalidOutputs: report.invalidOutputs, correctness: report.correctness, helpfulness: report.helpfulness, usedOrReservedUsd: report.budgetAfterUsd, humanRatings: 'NOT_RUN' }));
