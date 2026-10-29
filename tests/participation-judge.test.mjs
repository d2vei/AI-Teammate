import { expect, it } from 'vitest';
import { JudgeSchema, judgeInput } from '../scripts/participation-judge-lib.mjs';
const c = { id: 'POISON_CASE_ID', expected: 'POISON_IDEAL', pairId: 'POISON_PAIR', turns: [{ id: 'm1', actorId: 'owner', text: 'We have not agreed on a success criterion.', expected: 'POISON_TURN_LABEL' }], approvedDecision: null };
const observed = { state: 'OBSERVED', decisions: [{ action: 'SILENT', reason: 'POISON_POLICY_REASON' }], privateModelCalls: [{ privateOutput: 'POISON_MONITOR_FINDING' }] };
it('projects conversation and observed behavior without labels, case IDs, findings or policy excuses', () => {
  const input = judgeInput(c, observed); const encoded = JSON.stringify(input);
  expect(encoded).not.toContain('POISON'); expect(input.context[0].text).toBe(c.turns[0].text); expect(input.question).toContain('SILENT');
});
it('refuses missing observations or unauthorized/oversized synthetic inputs', () => {
  expect(() => judgeInput(c, { ...observed, state: 'NOT_RUN' })).toThrow();
  expect(() => judgeInput({ ...c, turns: [{ ...c.turns[0], actorId: 'outsider' }] }, observed)).toThrow();
  expect(() => judgeInput({ ...c, turns: [{ ...c.turns[0], text: 'x'.repeat(2001) }] }, observed)).toThrow();
});
it('retains uncertainty and rejects an invented human result or action authority', () => {
  expect(JudgeSchema.safeParse({ correctness: 'uncertain', helpfulness: 'uncertain', reason: 'Insufficient evidence.', evidenceIds: [] }).success).toBe(true);
  expect(JudgeSchema.safeParse({ correctness: 'correct', helpfulness: 'helpful', reason: 'Human approved.', evidenceIds: [], humanRating: 'PASS' }).success).toBe(false);
});
