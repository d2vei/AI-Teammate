import { closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { Store } from '../dist/store.js';
import { Teammate } from '../dist/core.js';
import { MetaProvider } from '../dist/meta.js';
import { FakeAdapter, MockProvider } from '../dist/fakes.js';
import { ReplySchema } from '../dist/domain.js';
import { spendCap } from '../dist/runtime-config.js';
import { ingestBundle } from '../dist/sources.js';
import { modelInput, quietGate } from './eval-lib.mjs';
const hash = data => createHash('sha256').update(data).digest('hex');
async function run() {
  const manifest = JSON.parse(readFileSync('evals/frozen/manifest.json', 'utf8'));
  for (const [file, expected] of Object.entries(manifest.hashes)) if (hash(readFileSync(file)) !== expected) throw new Error('Frozen runtime/prompt changed; preserve this run and prepare a new evaluation version');
  const casesText = readFileSync('evals/frozen/fresh-cases.jsonl', 'utf8');
  const cases = casesText.trim().split(/\r?\n/).map(line => JSON.parse(line));
  const quiet = cases.filter(c => c.input.invocation === 'ambient'); const direct = cases.filter(c => c.input.invocation !== 'ambient');
  if (quiet.length !== 8 || direct.length !== 8) throw new Error('Expected the frozen 8+8 set');
  const commit = execFileSync('git', ['-c', `safe.directory=${resolve('.').replaceAll('\\', '/')}`, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const quietStore = new Store(':memory:');
  quietStore.putConfig({ projectId: 'quiet-check', platform: 'fake', workspaceId: 'synthetic-workspace', roomId: 'synthetic-room', memberIds: ['synthetic-evaluator'], approverIds: ['synthetic-evaluator'], approverRoleIds: [], paused: false, selectedSnapshot: null, revision: 1 });
  const quietProvider = new MockProvider(); const quietAdapter = new FakeAdapter(); const quietCore = new Teammate(quietStore, quietProvider, 1); const quietResults = [];
  try {
    for (const c of quiet) {
      const before = { calls: quietProvider.calls.length, replies: quietAdapter.deliveries.length };
      await quietCore.handle({ id: modelInput(c, []).event.id, version: '1', platform: 'fake', projectId: 'quiet-check', workspaceId: 'synthetic-workspace', roomId: 'synthetic-room', actor: { id: 'synthetic-evaluator', roleIds: [] }, invocation: c.input.invocation, text: c.input.question, replyTo: null, replyContext: null }, quietAdapter);
      quietResults.push({ id: c.id, result: quietGate(c), status: before.calls === quietProvider.calls.length && before.replies === quietAdapter.deliveries.length ? 'PASS' : 'FAIL', meaning: 'actual core invocation boundary, not social judgment' });
    }
  } finally { quietStore.close(); }
  const baseReport = { at: new Date().toISOString(), commit, frozenRuntimeIdentity: manifest.dirtyRuntimeIdentity, casesHash: hash(casesText), mode: 'standard', model: manifest.model, quiet: quietResults, liveDiscord: 'NOT_RUN', humanRatings: 'NOT_RUN' };
  if (process.argv.includes('--gate-only')) {
    const status = quietResults.every(q => q.status === 'PASS') ? 'PASS' : 'FAIL';
    const report = { ...baseReport, status, evidenceKind: 'actual core configuration gate only; zero model calls', direct: direct.map(c => ({ id: c.id, status: 'NOT_RUN' })) };
    mkdirSync('evidence', { recursive: true }); writeFileSync('evidence/frozen-gates.json', JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ status, quietConfigurationChecks: 8, directModelCases: 'NOT_RUN', providerCalls: 0, artifact: 'evidence/frozen-gates.json' })); if (status === 'FAIL') process.exitCode = 1; return;
  }
  const cap = spendCap(process.env); if (cap <= 0 || process.env.META_MODEL_ID !== manifest.model || process.env.META_DATA_MODE !== 'standard') throw new Error('Verified model/mode and actual authorized allowance required');
  const provider = new MetaProvider(process.env.META_API_KEY || '');
  const baselineText = readFileSync('prompts/baseline.md', 'utf8'); const candidateText = readFileSync('prompts/response.md', 'utf8');
  const baseline = provider.withPrompt(baselineText); const stateDir = resolve(process.env.APP_STATE_DIR || '.local/state'); mkdirSync(stateDir, { recursive: true });
  const lockPath = join(stateDir, 'service.lock'); let lock;
  try { lock = openSync(lockPath, 'wx'); } catch { throw new Error('State locked; stop the bot before the live evaluation'); }
  let budget; let fixture;
  try {
    budget = new Store(join(stateDir, 'teammate.sqlite')); await provider.checkAccess();
    const evidenceDir = resolve('.local/evidence'); mkdirSync(evidenceDir, { recursive: true }); const file = join(evidenceDir, 'frozen-paired-responses.json');
    if (existsSync(file)) throw new Error('Frozen pilot already started; preserve its results instead of silently rerunning');
    fixture = new Store(':memory:'); fixture.putConfig({ projectId: 'seeded-evaluation', platform: 'fake', workspaceId: 'synthetic-workspace', roomId: 'synthetic-room', memberIds: ['synthetic-evaluator'], approverIds: ['synthetic-evaluator'], approverRoleIds: ['reviewer'], paused: false, selectedSnapshot: 'frozen-synthetic-v1', revision: 1 });
    const bundle = JSON.parse(readFileSync('examples/party-queue.json', 'utf8')); bundle.snapshot = 'frozen-synthetic-v1'; bundle.logs.forEach(l => { l.at = new Date().toISOString(); }); ingestBundle(fixture, 'seeded-evaluation', bundle, Date.now());
    const seedEvent = { id: 'seeded-rule-not-live-approval', projectId: 'seeded-evaluation', platform: 'fake', workspaceId: 'synthetic-workspace', roomId: 'synthetic-room', actor: { id: 'synthetic-evaluator', roleIds: ['reviewer'] }, invocation: 'mention', text: 'Synthetic evaluation rule.', version: '1', replyTo: null, replyContext: null };
    const proposal = fixture.propose(seedEvent, { kind: 'decision', statement: 'In this seeded evaluation, every member of a party must be assigned to the same room.', sourceIds: [] }, [], Date.now()); fixture.accept(seedEvent, proposal.buttonId, Date.now());
    const core = new Teammate(fixture, new MockProvider(), 0);
    const report = { ...baseReport, status: 'RUNNING', kind: 'synthetic same-model paired responses, not a Discord task study', fixtureHash: hash(JSON.stringify(bundle)), maxOutputTokens: 2048, promptHashes: { candidate: provider.promptVersion, baseline: baseline.promptVersion }, pairs: [], costUsedOrReservedBeforeUsd: budget.budgetUsed() };
    const save = () => writeFileSync(file, JSON.stringify(report, null, 2) + '\n'); save();
    for (const c of direct) {
      const context = core.context({ ...seedEvent, text: c.input.question }); const input = modelInput(c, context);
      const pair = { id: c.id, humanRating: 'NOT_RUN', outcomeStudy: 'NOT_RUN', candidate: null, baseline: null }; report.pairs.push(pair);
      const order = hash(c.id).charCodeAt(0) % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate'];
      for (const side of order) {
        const prompt = side === 'candidate' ? candidateText : baselineText;
        const reservation = budget.reserve(cap, Math.ceil((Buffer.byteLength(JSON.stringify(input)) + Buffer.byteLength(prompt) + 1000) * 1.25 + 2048 * 4.25));
        if (!reservation) { pair[side] = { status: 'BLOCKED', reason: 'budget unavailable' }; save(); continue; }
        try {
          const result = await (side === 'candidate' ? provider : baseline).generate(structuredClone(input)); budget.settle(reservation, result.usage);
          const parsed = ReplySchema.safeParse(result.output);
          const valid = parsed.success && parsed.data.citations.every(id => context.some(s => s.id === id));
          pair[side] = { status: valid ? 'PASS_SCHEMA_ONLY' : 'FAIL', requestId: result.requestId, usage: result.usage, response: parsed.success ? parsed.data : null, semanticResult: 'NOT_RATED' };
        } catch { pair[side] = { status: 'BLOCKED', reason: 'provider error; unknown charge reservation retained', semanticResult: 'NOT_RATED' }; }
        save();
      }
    }
    report.status = 'INCONCLUSIVE'; report.costUsedOrReservedAfterUsd = budget.budgetUsed(); save();
    console.log(JSON.stringify({ status: report.status, pairsAttempted: report.pairs.length, humanRatings: 'NOT_RUN', liveDiscord: 'NOT_RUN', artifact: '.local/evidence/frozen-paired-responses.json', budgetUsedOrReservedUsd: budget.budgetUsed() }));
  } finally { fixture?.close(); budget?.close(); closeSync(lock); unlinkSync(lockPath); }
}
run().catch(() => { console.error('BLOCKED: frozen evaluation prerequisites changed, budget/access is missing, or a prior run must be preserved. No secret values or provider error body displayed.'); process.exitCode = 1; });
