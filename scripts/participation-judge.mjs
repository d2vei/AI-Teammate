import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { Store } from '../dist/store.js';
import { createMetaRuntime } from '../dist/meta-runtime.js';
import { spendCap } from '../dist/runtime-config.js';
import { JudgeSchema, judgeInput } from './participation-judge-lib.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function run() {
  const cap = spendCap(process.env); if (!process.env.META_API_KEY || cap <= 0 || cap > 5 || process.env.META_DATA_MODE !== 'standard') throw new Error('Access/budget unavailable');
  const manifestPath = 'evals/participation/judge-v1/manifest.json'; const manifest = JSON.parse(readFileSync(manifestPath));
  for (const f of manifest.files) assert.equal(hash(readFileSync(f.path)), f.sha256, 'Judge freeze changed');
  const generatorBytes = readFileSync('.local/evidence/participation-pilot-v1.json'); const generator = JSON.parse(generatorBytes);
  assert.equal(generator.status, 'COMPLETED_MODEL_SHADOW_PILOT'); assert.equal(hash(generatorBytes), manifest.generatorCaptureSha256);
  const cases = readFileSync('evals/participation/live-v1/cases.jsonl', 'utf8').trim().split(/\r?\n/).map(s => JSON.parse(s)); assert.equal(cases.length, 40);
  const file = '.local/evidence/participation-judge-v1.json'; if (existsSync(file)) throw new Error('Preserved first judge attempt');
  mkdirSync('.local/evidence', { recursive: true }); const lockPath = '.local/state/service.lock'; const lock = openSync(lockPath, 'wx'); let store; let record;
  const save = () => writeFileSync(file, JSON.stringify(record, null, 2) + '\n');
  try {
    store = new Store('.local/state/teammate.sqlite'); let calls = 0;
    const http = (url, init) => { if (String(url) === 'https://api.meta.ai/v1/responses' && init?.method === 'POST' && ++calls > 40) throw new Error('Fixed judgment count exceeded'); return fetch(url, init); };
    const prompt = readFileSync('prompts/participation-judge.md', 'utf8'); const provider = createMetaRuntime(process.env.META_API_KEY, store, cap, http).provider.withPrompt(prompt); await provider.checkAccess();
    const osEnv = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP'].filter(k => process.env[k] !== undefined).map(k => [k, process.env[k]]));
    record = { at: new Date().toISOString(), status: 'RUNNING', kind: 'Meta automated correctness/helpfulness judgments, not human ratings; same-model evaluator over self-authored synthetic replay', candidate: execFileSync('git', ['-c', `safe.directory=${process.cwd().replaceAll('\\', '/')}`, 'rev-parse', 'HEAD'], { env: osEnv, encoding: 'utf8' }).trim(), manifestSha256: hash(readFileSync(manifestPath)), generatorCaptureSha256: hash(generatorBytes), model: provider.model, promptIdentity: provider.promptVersion, budgetBeforeUsd: store.budgetUsed(), budgetAfterUsd: store.budgetUsed(), modelHttpCalls: 0, humanRatings: 'NOT_RUN', externalPosts: 0, cases: cases.map(c => ({ id: c.id, state: 'NOT_RUN' })) };
    writeFileSync(file, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
    for (let i = 0; i < cases.length; i++) {
      const c = cases[i]; const row = record.cases[i]; const observed = generator.cases.find(r => r.id === c.id); const input = judgeInput(c, observed); const bytes = Buffer.byteLength(JSON.stringify(input));
      const reservation = store.reserve(cap, Math.ceil((bytes + Buffer.byteLength(prompt) + 1000) * 1.25 + 2048 * 4.25));
      if (!reservation) { record.stopReason = 'authorized_budget_unavailable'; break; }
      const started = performance.now();
      try {
        const result = await provider.generate(input); store.settle(reservation, result.usage); row.usage = result.usage; const parsed = JudgeSchema.safeParse(result.output);
        if (parsed.success && parsed.data.evidenceIds.every(id => input.context.some(c => c.id === id))) { row.state = 'MODEL_JUDGMENT'; row.privateJudgment = parsed.data; }
        else row.state = 'INVALID_OUTPUT';
      } catch { row.state = 'UNAVAILABLE'; record.stopReason = 'provider_unavailable_no_retry'; }
      row.wallMs = performance.now() - started; record.modelHttpCalls = calls; record.budgetAfterUsd = store.budgetUsed(); save();
      console.log(JSON.stringify({ phase: 'model_judgment', case: i + 1, total: 40, state: row.state, usedOrReservedUsd: record.budgetAfterUsd }));
      if (record.stopReason) break;
    }
    record.status = record.stopReason ? 'PARTIAL_MODEL_JUDGMENTS' : 'COMPLETED_MODEL_JUDGMENTS';
    if (record.stopReason) process.exitCode = 1;
  } catch {
    if (record) { record.status = 'FAILED_EVALUATOR'; record.failure = 'Evaluator failed; preserved partial attempt without retry'; process.exitCode = 1; }
    else throw new Error('Judge prerequisite unavailable');
  } finally {
    if (record && store) { record.budgetAfterUsd = store.budgetUsed(); record.finishedAt = new Date().toISOString(); save(); }
    store?.close(); closeSync(lock); unlinkSync(lockPath);
  }
  console.log(JSON.stringify({ status: record.status, validJudgments: record.cases.filter(c => c.state === 'MODEL_JUDGMENT').length, modelHttpCalls: record.modelHttpCalls, usedOrReservedUsd: record.budgetAfterUsd, humanRatings: 'NOT_RUN' }));
}
run().catch(() => { console.error('BLOCKED: fixed judge prerequisite/freeze/lock unavailable. No credential/body displayed or automatic retry.'); process.exitCode = 1; });
