import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { Store } from '../dist/store.js';
import { Teammate } from '../dist/core.js';
import { FakeAdapter, MockProvider } from '../dist/fakes.js';
// Current software regression only. The original frozen evaluator still
// rejects runtime drift; neither its manifest nor its paid capture is changed.
const bytes = readFileSync('evals/frozen/fresh-cases.jsonl'); const cases = bytes.toString('utf8').trim().split(/\r?\n/).map(s => JSON.parse(s));
const quiet = cases.filter(c => c.input.invocation === 'ambient'); assert.equal(quiet.length, 8);
const hash = bytes => createHash('sha256').update(bytes).digest('hex'); const store = new Store(':memory:'); const provider = new MockProvider(); const adapter = new FakeAdapter();
const checks = [];
try {
  store.putConfig({ projectId: 'current-quiet', platform: 'fake', workspaceId: 'synthetic-workspace', roomId: 'synthetic-room', memberIds: ['synthetic-evaluator'], approverIds: ['synthetic-evaluator'], approverRoleIds: [], paused: false, selectedSnapshot: null, revision: 1 });
  const core = new Teammate(store, provider, 1);
  for (const c of quiet) {
    const e = { id: `current-${c.id}`, version: '1', platform: 'fake', projectId: 'current-quiet', workspaceId: 'synthetic-workspace', roomId: 'synthetic-room', actor: { id: 'synthetic-evaluator', roleIds: [] }, invocation: c.input.invocation, text: c.input.question, replyTo: null, replyContext: null };
    await core.handle(e, adapter); assert.equal(core.context(e).length, 0); assert.equal(provider.calls.length, 0); assert.equal(adapter.deliveries.length, 0); assert.equal(store.budgetUsed(), 0); assert.equal(store.pending('current-quiet').length, 0);
    checks.push({ id: c.id, status: 'PASS', meaning: 'Actual ambient invocation/access gate; no model, delivery, memory context, proposal or charge' });
  }
} finally { store.close(); }
const files = ['src/core.ts', 'src/memory.ts', 'src/store.ts', 'src/domain.ts', 'scripts/check-invocation-current.mjs'].map(path => ({ path, sha256: hash(readFileSync(path)) }));
const candidate = execFileSync('git', ['-c', `safe.directory=${process.cwd().replaceAll('\\', '/')}`, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const workingTreeDirty = !!execFileSync('git', ['-c', `safe.directory=${process.cwd().replaceAll('\\', '/')}`, 'status', '--porcelain'], { encoding: 'utf8' }).trim();
writeFileSync('evidence/invocation-current-v2.json', JSON.stringify({ at: new Date().toISOString(), status: 'PASS_CURRENT_SOFTWARE_GATE_ONLY', candidate, workingTreeDirty, files, casesSha256: hash(bytes), casesSource: 'Original eight quiet fixture inputs reused as software regressions, not new held-out evaluation', checks, modelCalls: 0, humanRatings: 'NOT_RUN', livePlatform: 'NOT_RUN', limitations: 'Current configuration/access behavior only. Does not update the original frozen runtime, paid answer pairs, human ratings or participation quality.' }, null, 2) + '\n');
console.log(JSON.stringify({ status: 'PASS_CURRENT_SOFTWARE_GATE_ONLY', checks: checks.length, modelCalls: 0, artifact: 'evidence/invocation-current-v2.json' }));
