import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { Store } from '../dist/store.js';
import { defaultParticipation, ParticipationLedger, ParticipationPolicy } from '../dist/participation.js';
import { replayEvent, recentMessage, ScriptedParticipationReasoner } from './participation-replay-lib.mjs';
const directory = 'evals/participation/v1'; const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const cases = readFileSync(`${directory}/cases.jsonl`, 'utf8').trim().split(/\r?\n/).map(s => JSON.parse(s));
const labels = JSON.parse(readFileSync(`${directory}/labels.json`, 'utf8')); const signals = JSON.parse(readFileSync(`${directory}/mock-signals.json`, 'utf8'));
if (cases.length !== 40 || Object.values(labels).filter(l => l.expected === 'should_speak').length !== 15 || Object.values(labels).filter(l => l.expected === 'stay_silent').length !== 25) throw new Error('Invalid 15+25 corpus');
const identityFiles = ['src/participation.ts', 'src/store.ts', 'src/domain.ts', 'src/sources.ts', 'scripts/participation-replay.mjs', 'scripts/participation-replay-lib.mjs', `${directory}/cases.jsonl`, `${directory}/labels.json`, `${directory}/mock-signals.json`];
const hashes = Object.fromEntries(identityFiles.map(f => [f, hash(readFileSync(f))]));
const git = args => execFileSync('git', ['-c', `safe.directory=${resolve('.').replaceAll('\\', '/')}`, ...args], { encoding: 'utf8' }).trim();
const report = { at: new Date().toISOString(), candidateCommit: git(['rev-parse', 'HEAD']), workingTreeDirty: !!git(['status', '--porcelain']), runtimeIdentity: hash(JSON.stringify(hashes)), hashes, kind: 'MOCK shadow policy mechanics on self-made synthetic development cases', status: 'RUNNING', modelPilot: 'NOT_RUN', semanticEvidenceSupport: 'NOT_RATED', humanJudgments: 'NOT_RUN', sameModelBaseline: 'NOT_RUN', mediaUnderstanding: 'NOT_RUN', metaCalls: 0, externalPosts: 0, costUsd: 0, results: [] };
for (const c of cases) {
  const store = new Store(':memory:'); const ledger = new ParticipationLedger(':memory:'); const reasoner = new ScriptedParticipationReasoner(signals[c.id]); let now = c.turns[0].at;
  store.putConfig({ projectId: 'synthetic-project', platform: 'fake', workspaceId: 'synthetic-workspace', roomId: 'synthetic-room', memberIds: ['owner', 'peer'], approverIds: ['owner'], approverRoleIds: ['reviewer'], paused: false, selectedSnapshot: null, revision: 1 });
  const policy = new ParticipationPolicy(store, ledger, reasoner, () => now); const messages = [];
  policy.configure({ ...replayEvent({ ...c.turns[0], actorId: 'owner' }), invocation: 'action' }, { ...defaultParticipation, mode: 'shadow' });
  const decisions = [];
  try {
    for (const turn of c.turns) {
      now = turn.at; messages.push(recentMessage(turn)); const started = performance.now();
      const decision = await policy.observe(replayEvent(turn), () => messages);
      const { offerToken: _token, claimKey: _claimIdentity, ...metadata } = decision; decisions.push({ ...metadata, latencyMs: performance.now() - started });
    }
    const interventions = decisions.filter(d => d.action !== 'SILENT'); const expected = labels[c.id];
    const correct = expected.expected === 'should_speak' ? interventions.length === 1 && decisions.at(-1).action === 'HAND_RAISE' : interventions.length === 0;
    report.results.push({ id: c.id, expected, status: correct ? 'PASS' : 'FAIL', decisions, scriptedCalls: reasoner.calls, interpretation: 'fixture outputs exercise code gates; no semantic inference or real hand raising' });
  } finally { ledger.close(); store.close(); }
}
const positives = report.results.filter(r => r.expected.expected === 'should_speak'); const negatives = report.results.filter(r => r.expected.expected === 'stay_silent'); const repairs = negatives.filter(r => r.expected.selfRepair);
report.mechanics = { labelledMoments: 40, turns: report.results.reduce((n, r) => n + r.decisions.length, 0), fixtureCatch: positives.filter(r => r.status === 'PASS').length, shouldSpeak: positives.length, fixtureFalseInterruptions: negatives.filter(r => r.status === 'FAIL').length, staySilent: negatives.length, fixtureSelfRepairSilence: repairs.filter(r => r.status === 'PASS').length, selfRepairPairs: repairs.length, moves: Object.fromEntries(['constraint_reminder', 'clarification', 'loop_breaking'].map(move => [move, { caught: positives.filter(r => r.expected.move === move && r.status === 'PASS').length, total: positives.filter(r => r.expected.move === move).length }])) };
report.status = report.results.every(r => r.status === 'PASS') ? 'PASS_MOCK_MECHANICS_ONLY' : 'FAIL';
mkdirSync('evidence', { recursive: true }); writeFileSync('evidence/participation-mock-v1.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, ...report.mechanics, modelPilot: report.modelPilot, metaCalls: 0, externalPosts: 0, artifact: 'evidence/participation-mock-v1.json' }));
if (report.status === 'FAIL') process.exitCode = 1;
