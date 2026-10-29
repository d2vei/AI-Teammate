import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
export const reviewOrder = ids => [...ids].sort((a, b) => createHash('sha256').update(`review-v1:${a}`).digest('hex').localeCompare(createHash('sha256').update(`review-v1:${b}`).digest('hex')));
export const jsonForHtml = value => JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');

// Structural validation cannot certify who entered a rating. It prevents draft,
// stale or incomplete entries from becoming a completed aggregate report.
export function aggregateManualRatings(pack, r) {
  assert.equal(r.reviewIdentity, pack.reviewIdentity); assert.deepEqual(r.sourceHashes, pack.sourceHashes);
  assert.equal(r.status, 'COMPLETE_MANUAL_ENTRY'); assert.equal(r.manualEntryDeclared, true);
  assert.ok(['owner_self_evaluation', 'consenting_friend'].includes(r.reviewerRole));
  assert.equal(pack.moments.length, 20); assert.equal(pack.pairs.length, 8);
  assert.deepEqual(Object.keys(r.moments).sort(), pack.moments.map(m => m.id).sort());
  assert.deepEqual(Object.keys(r.pairs).sort(), pack.pairs.map(p => p.id).sort());
  const decisionCorrectness = { Correct: 0, Incorrect: 0, Unsure: 0 };
  const helpfulness = { Helpful: 0, Unhelpful: 0, Unsure: 0 };
  const evidenceSupport = { Supported: 0, Unsupported: 0, 'No generated contribution': 0, Unsure: 0 };
  for (const m of pack.moments) {
    const a = r.moments[m.id];
    assert.ok(Object.hasOwn(decisionCorrectness, a.correctness)); assert.ok(Object.hasOwn(helpfulness, a.helpfulness)); assert.ok(Object.hasOwn(evidenceSupport, a.evidence));
    decisionCorrectness[a.correctness]++; helpfulness[a.helpfulness]++; evidenceSupport[a.evidence]++;
  }
  const preferences = Object.fromEntries(['relevance', 'brevity', 'questions', 'tone', 'usefulness'].map(d => [d, { candidate: 0, baseline: 0, tie: 0, bothPoor: 0 }]));
  for (const p of pack.pairs) for (const dimension of Object.keys(preferences)) {
    const choice = r.pairs[p.id][dimension]; assert.ok(['A', 'B', 'Tie', 'Both poor'].includes(choice));
    const bucket = choice === 'Tie' ? 'tie' : choice === 'Both poor' ? 'bothPoor' : p.privateSideMap[choice];
    assert.ok(Object.hasOwn(preferences[dimension], bucket)); preferences[dimension][bucket]++;
  }
  return { decisionCorrectness, helpfulness, evidenceSupport, preferences };
}

export function compareManualToJudge(pack, ratings, judge) {
  assert.equal(judge.generatorCaptureSha256, pack.sourceHashes.participation);
  assert.ok(['COMPLETED_MODEL_JUDGMENTS', 'PARTIAL_MODEL_JUDGMENTS', 'FAILED_EVALUATOR'].includes(judge.status));
  assert.equal(new Set(judge.cases.map(c => c.id)).size, judge.cases.length);
  const rows = new Map(judge.cases.map(c => [c.id, c])); const missingModelCaseIds = [];
  const dimensions = { correctness: { mapping: { Correct: 'correct', Incorrect: 'incorrect', Unsure: 'uncertain' }, agreements: 0, disagreements: 0, disagreementCaseIds: [] }, helpfulness: { mapping: { Helpful: 'helpful', Unhelpful: 'unhelpful', Unsure: 'uncertain' }, agreements: 0, disagreements: 0, disagreementCaseIds: [] } };
  let compared = 0;
  for (const m of pack.moments) {
    const row = rows.get(m.id); const human = ratings.moments[m.id];
    if (!row || row.state !== 'MODEL_JUDGMENT' || !row.privateJudgment) { missingModelCaseIds.push(m.id); continue; }
    for (const [key, result] of Object.entries(dimensions)) {
      assert.ok(Object.hasOwn(result.mapping, human[key])); assert.ok(Object.values(result.mapping).includes(row.privateJudgment[key]));
      if (result.mapping[human[key]] === row.privateJudgment[key]) result.agreements++;
      else { result.disagreements++; result.disagreementCaseIds.push(m.id); }
    }
    compared++;
  }
  return { status: missingModelCaseIds.length ? 'COMPARISON_WITH_MISSING_MODEL_OUTPUTS' : 'COMPLETE_MODEL_HUMAN_COMPARISON', compared, requested: pack.moments.length, missingModelCaseIds, dimensions: Object.fromEntries(Object.entries(dimensions).map(([key, { mapping: _mapping, ...result }]) => [key, result])), limitation: 'Agreement is not proof of correctness; human entry is self-declared and model judgment is not independent ground truth.' };
}
