import { existsSync, mkdirSync, openSync, closeSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { Store } from './store.js';
import { MetaProvider } from './meta.js';
import { MockProvider } from './fakes.js';
import { DiscordAdapter, registerCommands } from './discord.js';
import { projectFromEnv, spendCap } from './runtime-config.js';
import { BundleSchema, ingestBundle } from './sources.js';
import { Teammate } from './core.js';
import { FakeAdapter } from './fakes.js';
import type { RequestEvent } from './domain.js';

const command = process.argv[2] || 'start';
const env = process.env; const projectId = env.APP_PROJECT_ID || 'demo';
const stateDir = resolve(env.APP_STATE_DIR || '.local/state');
const requireValue = (key: string) => { const value = env[key]; if (!value) throw new Error(`Missing ${key}`); return value; };
function jsonFile(path: string): unknown {
  if (extname(path).toLowerCase() !== '.json' || statSync(path).size > 100000) throw new Error('Select a bounded JSON source bundle');
  return JSON.parse(readFileSync(path, 'utf8'));
}
async function run() {
  if (command === 'help') { console.log('Commands: init, seed-demo, import <bundle.json>, select <snapshot>, source-remove <source-id>, pause, resume, status, register, smoke-meta, start, purge-project <project-id>'); return; }
  if (command === 'start') {
    requireValue('DISCORD_BOT_TOKEN');
    if ((env.APP_PROVIDER || 'meta') === 'meta') {
      requireValue('META_API_KEY'); if (spendCap(env) <= 0) throw new Error('Missing authorized budget');
      if (env.META_MODEL_ID !== 'muse-spark-1.3' || env.META_DATA_MODE !== 'standard') throw new Error('Verified Standard model configuration required');
    } else if (env.APP_PROVIDER !== 'mock') throw new Error('Invalid provider');
  }
  mkdirSync(stateDir, { recursive: true });
  const lockPath = join(stateDir, 'service.lock'); let lock: number;
  try { lock = openSync(lockPath, 'wx'); writeFileSync(lock, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })); }
  catch { throw new Error('State directory is locked. Stop the running service; after a crash, verify no process uses it before removing service.lock.'); }
  let store: Store | undefined; let discord: DiscordAdapter | undefined;
  try {
    store = new Store(join(stateDir, 'teammate.sqlite'));
    if (command === 'init') { if (store.config(projectId)) throw new Error('Project already exists; edit permission config deliberately while stopped'); store.putConfig(projectFromEnv(env)); console.log('Project initialized from explicit member/approver IDs. No snapshot or decision seeded.'); return; }
    const config = store.config(projectId); if (!config) throw new Error('Project not initialized; run init after private setup');
    if (command === 'status') { console.log(JSON.stringify({ projectId, configRevision: config.revision, paused: config.paused, selectedSnapshot: config.selectedSnapshot, sources: store.sources(projectId).map(s => ({ id: s.id, label: s.label, state: s.state, synthetic: s.synthetic })), approvedDecisions: store.decisions(projectId).length, savedBriefs: store.briefs(projectId).length, budgetUsedOrReservedUsd: store.budgetUsed(), authorizedCapUsd: spendCap(env), liveServicesChecked: false }, null, 2)); return; }
    if (command === 'pause' || command === 'resume') { store.putConfig({ ...config, paused: command === 'pause' }); console.log(`Project ${command === 'pause' ? 'paused' : 'resumed'}.`); return; }
    if (command === 'seed-demo') {
      const bundle = BundleSchema.parse(jsonFile(fileURLToPath(new URL('../examples/party-queue.json', import.meta.url))));
      bundle.snapshot = `seeded-${Date.now()}`; bundle.logs = bundle.logs.map(l => ({ ...l, at: new Date().toISOString() }));
      const ids = ingestBundle(store, projectId, bundle, Date.now()); store.putConfig({ ...config, selectedSnapshot: bundle.snapshot });
      console.log(JSON.stringify({ seededSynthetic: true, snapshot: bundle.snapshot, sourceCount: ids.length, decisionsSeeded: 0 })); return;
    }
    if (command === 'import') { const raw = jsonFile(resolve(process.argv[3] || '')); const ids = ingestBundle(store, projectId, raw, Date.now(), env.META_PRIVATE_DATA_VERIFIED === 'true'); console.log(JSON.stringify({ importedSourceCount: ids.length, selected: false })); return; }
    if (command === 'select') { const snapshot = z.string().min(1).max(80).parse(process.argv[3]); if (!store.sources(projectId).some(s => s.snapshot === snapshot)) throw new Error('Snapshot unavailable'); store.putConfig({ ...config, selectedSnapshot: snapshot }); console.log('Snapshot selected; old pending cards require fresh confirmation.'); return; }
    if (command === 'source-remove') { store.sourceState(projectId, requireArgument(), 'deleted'); console.log('Source content removed; dependent confirmations are invalid.'); return; }
    if (command === 'purge-project') { if (requireArgument() !== projectId) throw new Error('Explicit project ID required'); store.purgeProject(projectId); console.log(JSON.stringify({ projectId, sourceDecisionProposalBriefContent: 'deleted', projectPaused: true, budgetLedger: 'retained', at: new Date().toISOString() })); return; }
    if (command === 'register') { await registerCommands(requireValue('DISCORD_BOT_TOKEN'), requireValue('DISCORD_APPLICATION_ID'), config.workspaceId); console.log('Project command registration completed. No conversation message sent.'); return; }
    const mock = env.APP_PROVIDER === 'mock';
    if (!mock && (env.META_MODEL_ID !== 'muse-spark-1.3' || env.META_DATA_MODE !== 'standard' || spendCap(env) <= 0)) throw new Error('Missing verified model/data mode/authorized budget');
    if (store.sources(projectId).some(s => !s.synthetic) && (mock || env.META_PRIVATE_DATA_VERIFIED !== 'true')) throw new Error('Private sources require verified Standard data handling');
    const provider = mock ? new MockProvider() : new MetaProvider(requireValue('META_API_KEY'));
    if (provider instanceof MetaProvider) await provider.checkAccess();
    if (command === 'smoke-meta') {
      if (mock) throw new Error('smoke-meta requires a real Meta provider');
      const request: RequestEvent = { id: `synthetic-smoke-${Date.now()}`, projectId, platform: config.platform, workspaceId: config.workspaceId, roomId: config.roomId, actor: { id: config.approverIds[0]!, roleIds: config.approverRoleIds }, text: 'Using the selected synthetic evidence, explain the possible mismatch. Do not create a proposal or claim reproduction.', invocation: 'action', version: 'synthetic-v1', replyTo: null, replyContext: null };
      if (store.sources(projectId).some(s => !s.synthetic)) throw new Error('Smoke only accepts synthetic fixtures');
      const adapter = new FakeAdapter(); await new Teammate(store, provider, spendCap(env)).handle(request, adapter);
      const trace = store.traces().at(-1); console.log(JSON.stringify({ gate: 'Meta synthetic smoke; no Discord send', result: trace?.result ?? 'BLOCKED', model: provider.model, trace, answer: adapter.deliveries[0]?.text ?? null }, null, 2));
      if (trace?.outcome !== 'response' || trace.result !== 'delivered') process.exitCode = 1; return;
    }
    if (command !== 'start') throw new Error('Unknown command');
    discord = new DiscordAdapter(store, provider, spendCap(env), projectId);
    await discord.start(requireValue('DISCORD_BOT_TOKEN'));
    console.log(JSON.stringify({ status: 'Discord Gateway login completed', provider: provider.mode, model: provider.model, at: new Date().toISOString(), liveProductAcceptance: 'NOT_RUN' }));
    await new Promise<void>(resolveStop => { process.once('SIGINT', resolveStop); process.once('SIGTERM', resolveStop); });
  } finally { await discord?.stop(); store?.close(); closeSync(lock); if (existsSync(lockPath)) unlinkSync(lockPath); }
}
function requireArgument() { const arg = process.argv[3]; if (!arg) throw new Error('Missing command argument'); return arg; }
run().catch(error => {
  const allowed = error instanceof Error && /^(Missing |Project |State directory |Snapshot |Source |Private |Select |Explicit |Unknown command|Verified |Invalid provider|smoke-meta)/.test(error.message);
  console.error(`BLOCKED: ${allowed ? error.message : 'Configuration or service access failed. Check docs/DEVELOPMENT.md; no credentials or provider error body are printed.'}`); process.exitCode = 1;
});
