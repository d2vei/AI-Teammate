import { expect, it } from 'vitest';
import { modelInput, quietGate } from '../scripts/eval-lib.mjs';
it('excludes case IDs, grader labels and expected outcomes from model input', () => {
  const c = { id: 'HIDDEN_CASE_LABEL', input: { question: 'What is known?', invocation: 'mention', reply: null }, grader: { target: 'HIDDEN_EXPECTED_ANSWER' } };
  const input = modelInput(c, [{ id: 'actual-source', text: 'Supplied evidence.' }]);
  expect(JSON.stringify(input)).not.toContain('HIDDEN_'); expect(input.question).toBe('What is known?');
  expect(quietGate(c)).toBe('DIRECT_REQUIRES_MODEL'); expect(quietGate({ input: { invocation: 'ambient' } })).toBe('SILENT_BY_CONFIGURATION');
});
