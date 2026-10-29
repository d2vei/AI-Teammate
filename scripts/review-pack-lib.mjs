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
