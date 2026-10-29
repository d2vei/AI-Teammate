import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { pilotTurn, scoreParticipation } from '../scripts/participation-pilot-lib.mjs';
it('projects only authenticated synthetic turn fields and excludes poisoned grader/case metadata', () => {
  const source = { id: 'm0', actorId: 'owner', text: 'A supplied group message.', offsetMs: 1000, expected: 'SYNTHETIC_GRADER_DO_NOT_SEND', projectId: 'other', roleIds: ['admin'], grader: { secret: 'SYNTHETIC_GRADER_DO_NOT_SEND' } };
  const result = pilotTurn(source, 'test-project', 5000);
  expect(result.event.actor).toEqual({ id: 'owner', roleIds: ['reviewer'] }); expect(result.message.at).toBe(6000); expect(result.event.projectId).toBe('test-project'); expect(JSON.stringify(result)).not.toContain('SYNTHETIC_GRADER'); expect(result.event).not.toHaveProperty('offsetMs');
});
it('rejects an unknown participant or unbounded turn before runtime/model projection', () => {
  expect(() => pilotTurn({ id: 'm0', actorId: 'outsider', text: 'data', offsetMs: 0 }, 'p', 1)).toThrow();
  expect(() => pilotTurn({ id: 'm0', actorId: 'owner', text: 'x'.repeat(2001), offsetMs: 0 }, 'p', 1)).toThrow();
});
it('does not turn missing runs into correct silence or a completed pilot', () => {
  const labels = JSON.parse(readFileSync('evals/participation/live-v1/labels.json'));
  const score = scoreParticipation(Object.keys(labels).map(id => ({ id, state: 'NOT_RUN', decisions: [] })), labels);
  expect(score.status).toBe('INCOMPLETE'); expect(score.observedSilent).toBe(0); expect(score.completeCases).toBe(0); expect(score.caseGrades.every(c => c.status === 'NOT_RUN_OR_BLOCKED')).toBe(true);
});
it('keeps an early offer distinct from the labelled final decision moment and counts a repaired-twin interruption', () => {
  const labels = { open: { expected: 'should_speak', move: 'clarification', targetTurnId: 'm3', selfRepair: false }, repair: { expected: 'stay_silent', move: 'clarification', targetTurnId: 'm3', selfRepair: true } };
  const decisions = [{ action: 'HAND_RAISE', eventId: 'm2' }, { action: 'SILENT', eventId: 'm3' }];
  const score = scoreParticipation([{ id: 'open', state: 'OBSERVED', decisions }, { id: 'repair', state: 'OBSERVED', decisions }], labels);
  expect(score.caught).toBe(0); expect(score.falseInterruptions).toBe(1); expect(score.selfRepairSilent).toBe(0); expect(score.status).toBe('FAIL');
});
