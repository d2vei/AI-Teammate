import { expect, it } from 'vitest';
import { aggregateManualRatings, jsonForHtml, reviewOrder } from '../scripts/review-pack-lib.mjs';
it('keeps untrusted model text inside JSON rather than executable HTML', () => {
  const payload = { answer: '</script><script>BAD_SYNTHETIC_SCRIPT()</script>\u2028next' };
  const encoded = jsonForHtml(payload); expect(encoded).not.toContain('</script>'); expect(encoded).not.toContain('<script>'); expect(JSON.parse(encoded)).toEqual(payload);
});
it('selects review identities independently of file order and observed outcomes', () => {
  const ids = Array.from({ length: 40 }, (_, i) => `case-${i}`);
  expect(reviewOrder(ids).slice(0, 20)).toEqual(reviewOrder([...ids].reverse()).slice(0, 20)); expect(new Set(reviewOrder(ids).slice(0, 20)).size).toBe(20); expect(ids[0]).toBe('case-0');
});

// These are synthetic validator inputs, never stored as real human ratings.
function fixture() {
  const pack = { reviewIdentity: 'synthetic-review', sourceHashes: { paired: 'synthetic-pair', participation: 'synthetic-pilot' }, moments: Array.from({ length: 20 }, (_, i) => ({ id: `m${i}` })), pairs: Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, privateSideMap: { A: 'baseline', B: 'candidate' } })) };
  const ratings = { reviewIdentity: pack.reviewIdentity, sourceHashes: pack.sourceHashes, status: 'COMPLETE_MANUAL_ENTRY', manualEntryDeclared: true, reviewerRole: 'owner_self_evaluation', moments: Object.fromEntries(pack.moments.map(m => [m.id, { correctness: 'Unsure', helpfulness: 'Unsure', evidence: 'No generated contribution' }])), pairs: Object.fromEntries(pack.pairs.map(p => [p.id, Object.fromEntries(['relevance', 'brevity', 'questions', 'tone', 'usefulness'].map(d => [d, 'A']))])) };
  return { pack, ratings };
}
it('rejects draft, undeclared, incomplete and stale ratings instead of inferring completion', () => {
  for (const mutate of [r => r.status = 'DRAFT', r => r.manualEntryDeclared = false, r => delete r.moments.m0, r => delete r.pairs.p0.tone, r => r.reviewIdentity = 'stale', r => r.sourceHashes = { paired: 'other' }]) {
    const { pack, ratings } = fixture(); mutate(ratings); expect(() => aggregateManualRatings(pack, ratings)).toThrow();
  }
});
it('uses preserved side assignments and retains uncertainty and absent contributions', () => {
  const { pack, ratings } = fixture(); ratings.privateSideMaps = { p0: { A: 'candidate' } };
  const result = aggregateManualRatings(pack, ratings);
  expect(result.preferences.usefulness).toEqual({ candidate: 0, baseline: 8, tie: 0, bothPoor: 0 });
  expect(result.decisionCorrectness.Unsure).toBe(20); expect(result.evidenceSupport['No generated contribution']).toBe(20);
});
