import { closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../dist/store.js';
import { createMetaRuntime } from '../dist/meta-runtime.js';
import { Teammate } from '../dist/core.js';
import { FakeAdapter } from '../dist/fakes.js';
import { ingestBundle } from '../dist/sources.js';
import { digest } from '../dist/domain.js';
// Owner authorized EUR 5 total on 2026-10-29. ECB 2026-10-28: EUR 1 = USD 1.1133.
// USD 5 leaves about 10% FX headroom. This is a local dispatch ceiling, not a billing guarantee.
const capUsd = 5;
async function run() {
  if (!process.env.META_API_KEY) throw new Error('META_API_KEY is unavailable');
  const dir = resolve('.local/state'); mkdirSync(dir, { recursive: true });
  const lockPath = join(dir, 'service.lock'); let lock;
  try { lock = openSync(lockPath, 'wx'); } catch { throw new Error('State is locked; no inference sent'); }
  const store = new Store(join(dir, 'teammate.sqlite'));
  try {
    const { provider } = createMetaRuntime(process.env.META_API_KEY, store, capUsd);
    await provider.checkAccess();
    const outputDir = resolve('.local/evidence'); mkdirSync(outputDir, { recursive: true }); const file = join(outputDir, 'meta-smoke-v1.json');
    if (existsSync(file)) throw new Error('Initial smoke already attempted; preserve its result instead of retrying automatically');
    const projectId = 'synthetic-meta-smoke';
    if (!store.config(projectId)) store.putConfig({ projectId, platform: 'fake', workspaceId: 'local-synthetic', roomId: 'synthetic-room', memberIds: ['synthetic-owner'], approverIds: ['synthetic-owner'], approverRoleIds: [], paused: false, selectedSnapshot: 'smoke-synthetic-v1', revision: 1 });
    const bundle = JSON.parse(readFileSync('examples/party-queue.json', 'utf8')); bundle.snapshot = 'smoke-synthetic-v1'; bundle.logs.forEach(l => { l.at = new Date().toISOString(); });
    ingestBundle(store, projectId, bundle, Date.now());
    const event = { id: randomUUID(), platform: 'fake', projectId, workspaceId: 'local-synthetic', roomId: 'synthetic-room', actor: { id: 'synthetic-owner', roleIds: [] }, invocation: 'mention', text: 'Compare the approved party rule with the selected synthetic code and log. Briefly distinguish inspected source, observed event and a hypothesis. Cite the rule, code and event. Do not create a proposal or imply reproduction.', version: 'synthetic-v1', replyTo: null, replyContext: null };
    const p = store.propose(event, { kind: 'decision', statement: 'Seeded synthetic smoke rule: party members must be assigned to the same room.', sourceIds: [] }, [], Date.now()); store.accept(event, p.buttonId, Date.now());
    const safeEnv = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'WINDIR', 'USERPROFILE', 'TEMP', 'TMP'].filter(k => process.env[k] !== undefined).map(k => [k, process.env[k]]));
    const commit = execFileSync('git', ['-c', `safe.directory=${resolve('.').replaceAll('\\', '/')}`, 'rev-parse', 'HEAD'], { encoding: 'utf8', env: safeEnv }).trim();
    const core = new Teammate(store, provider, capUsd); const adapter = new FakeAdapter();
    const record = { at: new Date().toISOString(), status: 'STARTED', evidenceKind: 'one real Meta request; fake local adapter and seeded synthetic evidence', commit, runtimeIdentity: digest(['src/core.ts', 'src/domain.ts', 'src/meta.ts', 'src/meta-runtime.ts', 'src/participation-meta.ts', 'src/media-meta.ts', 'prompts/response.md', 'prompts/participation-monitor.md', 'prompts/participation-repair.md', 'prompts/participation-generate.md'].map(f => readFileSync(f, 'utf8'))), model: provider.model, prompt: provider.promptVersion, accountModelAccess: 'PASS', credentialPresence: 'PASS', authorizedBudget: { eur: 5, localUsdCap: capUsd, fxSource: 'ECB 2026-10-28 EURUSD 1.1133', fxSafetyMargin: true }, fixtureIdentity: digest(bundle), beforeUsedOrReservedUsd: store.budgetUsed(), inferenceAttempts: 0, discordSends: 0 };
    writeFileSync(file, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
    let calls = 0;
    const oneRequestProvider = { mode: provider.mode, model: provider.model, promptVersion: provider.promptVersion, generate: input => { if (++calls !== 1) throw new Error('Only one inference is allowed'); return provider.generate(input); } };
    await new Teammate(store, oneRequestProvider, capUsd).handle(event, adapter);
    const trace = store.traces().at(-1); const answer = adapter.deliveries[0]?.text ?? null;
    record.inferenceAttempts = calls; record.status = trace?.outcome === 'response' && trace.result === 'delivered' ? 'PASS' : 'FAIL'; record.trace = trace ?? null; record.syntheticResponse = answer; record.afterUsedOrReservedUsd = store.budgetUsed();
    writeFileSync(file, JSON.stringify(record, null, 2) + '\n');
    console.log(JSON.stringify({ status: record.status, model: record.model, inferenceAttempts: calls, usage: trace?.usage ?? null, usedOrReservedUsd: record.afterUsedOrReservedUsd, localUsdCap: capUsd, syntheticResponse: answer, discordSends: 0, artifact: '.local/evidence/meta-smoke-v1.json' }, null, 2));
    if (record.status !== 'PASS') process.exitCode = 1;
  } finally { store.close(); closeSync(lock); unlinkSync(lockPath); }
}
run().catch(() => { console.error('BLOCKED: Meta key/access, state lock, budget, or preserved first-attempt gate failed. No secret values or provider error body displayed.'); process.exitCode = 1; });
