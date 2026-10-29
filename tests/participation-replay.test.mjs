import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { replayEvent, recentMessage, ScriptedParticipationReasoner } from '../scripts/participation-replay-lib.mjs';
it('projects only the conversation fields, excluding labels and scripted signals', () => {
  const turn = { id: 'm1', actorId: 'peer', text: 'A real input.', at: 100, expected: 'GRADER_DO_NOT_SEND', mockSignals: 'ORACLE_DO_NOT_SEND', criterion: 'SECRET_GRADER' };
  const input = JSON.stringify({ event: replayEvent(turn), message: recentMessage(turn) });
  expect(input).not.toMatch(/GRADER|ORACLE/); expect(input).toContain('A real input.');
});
it('has fifteen matched pairs and ten quiet stretches without claiming a held-out corpus', () => {
  const cases = readFileSync('evals/participation/v1/cases.jsonl', 'utf8').trim().split(/\r?\n/).map(s => JSON.parse(s));
  const labels = JSON.parse(readFileSync('evals/participation/v1/labels.json', 'utf8'));
  expect(cases).toHaveLength(40); expect(Object.values(labels).filter(l => l.expected === 'should_speak')).toHaveLength(15);
  for (let i = 1; i <= 15; i++) {
    const pair = cases.filter(c => c.pairId === `pair-${i}`); expect(pair).toHaveLength(2);
    expect(pair[0].turns.slice(0, 3)).toEqual(pair[1].turns.slice(0, 3)); expect(pair[0].turns.at(-1).text).not.toBe(pair[1].turns.at(-1).text);
  }
  for (const move of ['constraint_reminder', 'clarification', 'loop_breaking']) expect(Object.values(labels).filter(l => l.expected === 'should_speak' && l.move === move)).toHaveLength(5);
  expect(cases.filter(c => c.pairId === null).every(c => c.turns.length >= 6)).toBe(true);
});
it('labels the fixture reasoner as mock with no network or credential access', async () => {
  const provider = new ScriptedParticipationReasoner({ triggerIds: [], status: 'off_topic_social' });
  expect(provider.mode).toBe('mock'); expect((await provider.monitor({ messages: [] })).status).toBe('off_topic_social');
});
