import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { FfmpegNormalizer, codecProcessEnvironment, localCodecTools } from '../dist/media-codec.js';
import { MediaPipeline } from '../dist/media.js';
import { createMetaRuntime } from '../dist/meta-runtime.js';
import { Teammate } from '../dist/core.js';
import { Store } from '../dist/store.js';
import { spendCap } from '../dist/runtime-config.js';
const hash = value => createHash('sha256').update(value).digest('hex');
const expected = [
  ['MV1-voice', 'party.ogg', 'voice', 'audio/ogg'], ['MV1-together', 'together.png', 'image', 'image/png'],
  ['MV1-split', 'split.jpg', 'image', 'image/jpeg'], ['MV1-transition', 'transition.mp4', 'video', 'video/mp4'],
  ['MV1-review-audio', 'review.mp4', 'video', 'video/mp4'],
];
async function run() {
  const cap = spendCap(process.env); if (!process.env.META_API_KEY || cap <= 0 || cap > 5 || process.env.META_DATA_MODE !== 'standard') throw new Error('Access/budget unavailable');
  const workspace = realpathSync('.'); const fixtureRoot = realpathSync('.local/media-pilot-v1');
  const insideWorkspace = relative(workspace, fixtureRoot); if (!insideWorkspace || insideWorkspace.startsWith('..') || isAbsolute(insideWorkspace) || basename(fixtureRoot) !== 'media-pilot-v1') throw new Error('Fixture path escaped workspace');
  const manifestBytes = readFileSync(join(fixtureRoot, 'manifest.json')); const manifest = JSON.parse(manifestBytes);
  assert.deepEqual(manifest.cases.map(c => [c.id, c.file, c.kind, c.mime]), expected);
  for (const c of manifest.cases) { const file = realpathSync(join(fixtureRoot, c.file)); assert.equal(file, join(fixtureRoot, c.file)); assert.equal(hash(readFileSync(file)), c.sha256); }
  const state = resolve('.local/state'); const evidence = resolve('.local/evidence'); mkdirSync(state, { recursive: true }); mkdirSync(evidence, { recursive: true });
  const file = join(evidence, 'media-pilot-v1.json'); if (existsSync(file)) throw new Error('First media pilot attempt preserved');
  const lockPath = join(state, 'service.lock'); const lock = openSync(lockPath, 'wx'); writeFileSync(lock, String(process.pid));
  let store; let report; let ownProject;
  const save = () => writeFileSync(file, JSON.stringify(report, null, 2) + '\n');
  try {
    store = new Store(join(state, 'teammate.sqlite')); const tools = localCodecTools(); let mediaCalls = 0;
    const http = (url, init) => { if (init?.method === 'POST' && /\/v1\/(responses|asr\/transcribe)$/.test(String(url))) { if (++mediaCalls > 5) throw new Error('Only five media inferences allowed'); } return fetch(url, init); };
    const runtime = createMetaRuntime(process.env.META_API_KEY, store, cap, http); await runtime.provider.checkAccess();
    const env = codecProcessEnvironment(process.env); const commit = execFileSync('git', ['-c', `safe.directory=${workspace.replaceAll('\\', '/')}`, 'rev-parse', 'HEAD'], { env, encoding: 'utf8' }).trim();
    const paths = ['scripts/media-live.mjs', 'scripts/prepare-media-pilot.mjs', 'scripts/generate-media-assets.ps1', 'src/media.ts', 'src/media-codec.ts', 'src/media-meta.ts', 'src/meta-runtime.ts', 'src/store.ts', 'src/core.ts', 'dist/media.js', 'dist/media-codec.js', 'dist/media-meta.js', 'dist/meta-runtime.js'];
    report = { at: new Date().toISOString(), status: 'STARTED', kind: 'five self-authored synthetic attachments through real Meta derivation and scoped local context; no supplied transcripts', commit, files: paths.map(path => ({ path, sha256: hash(readFileSync(path)) })), manifestSha256: hash(manifestBytes), fixtureManifest: manifest, localUsdCap: cap, budgetBeforeUsd: store.budgetUsed(), cases: [], humanRatings: 'NOT_RUN', mediaInferenceAttempts: 0, discordSends: 0, rawFixturesDeleted: false, ownProjectContentDeleted: false };
    writeFileSync(file, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    ownProject = `synthetic-media-pilot-${randomUUID()}`;
    store.putConfig({ projectId: ownProject, platform: 'fake', workspaceId: 'synthetic-workspace', roomId: 'synthetic-room', memberIds: ['synthetic-owner'], approverIds: ['synthetic-owner'], approverRoleIds: [], paused: false, selectedSnapshot: 'media-pilot-v1', revision: 1 });
    const pipeline = new MediaPipeline(store, runtime.media); const codec = new FfmpegNormalizer(tools, undefined, join(fixtureRoot, 'codec-jobs')); const core = new Teammate(store, runtime.provider, cap);
    for (const c of manifest.cases) {
      const result = { id: c.id, status: 'STARTED', literalFactChecks: false }; report.cases.push(result); save();
      const bytes = readFileSync(join(fixtureRoot, c.file)); const beforeCalls = mediaCalls;
      const beforeCharge = Number(store.db.prepare('SELECT COALESCE(MAX(rowid),0) AS n FROM charges').get().n);
      const event = { id: c.id, version: 'synthetic-v1', sourceMessageId: c.id, projectId: ownProject, platform: 'fake', workspaceId: 'synthetic-workspace', roomId: 'synthetic-room', actor: { id: 'synthetic-owner', roleIds: [] }, invocation: 'ambient', text: 'Supplied synthetic attachment.', replyTo: null, replyContext: null };
      try {
        // Rubrics, required/forbidden patterns and fixture names are not provider input.
        const sourceId = await pipeline.ingestAttachment(event, { kind: c.kind, mime: c.mime, bytes, synthetic: true, ...(c.audioMatters !== undefined ? { audioMatters: c.audioMatters } : {}) }, codec, () => true);
        const source = store.sources(ownProject).find(s => s.id === sourceId); const derived = JSON.parse(source.text);
        const request = { ...event, invocation: 'mention' }; assert.ok(core.context(request).some(s => s.id === sourceId));
        assert.equal(store.decisions(ownProject).length + store.briefs(ownProject).length, 0);
        result.model = derived.model; result.privateDerivedText = derived.text;
        result.literalFactChecks = c.required.every(p => new RegExp(p, 'i').test(derived.text)) && !(c.forbidden ?? []).some(p => new RegExp(p, 'i').test(derived.text));
        result.authorizedContextAvailable = true; result.noAuthorityCreated = true;
        assert.equal(pipeline.removeOrigin(event, c.id), 1); assert.equal(store.sources(ownProject).find(s => s.id === sourceId).text, '');
        assert.ok(core.context(request).find(s => s.id === sourceId)?.kind === 'missing_evidence'); result.originRevocationVerified = true;
        result.status = 'DERIVED_REQUIRES_REVIEW';
      } catch { result.status = 'FAIL'; result.reason = 'Codec, provider, schema or source-lifecycle check failed; no retry'; }
      finally {
        bytes.fill(0); result.mediaInferenceAttempts = mediaCalls - beforeCalls; report.mediaInferenceAttempts = mediaCalls;
        result.charges = store.db.prepare('SELECT micros,state,usage FROM charges WHERE rowid > ? ORDER BY rowid').all(beforeCharge).map(c => ({ micros: Number(c.micros), state: c.state, usage: c.usage ? JSON.parse(c.usage) : null }));
        report.budgetAfterUsd = store.budgetUsed(); save();
      }
    }
    report.literalFactCasesPassed = report.cases.filter(c => c.literalFactChecks).length;
    report.uploadCleanupOutstanding = Number(store.db.prepare("SELECT COUNT(*) AS n FROM media_uploads WHERE state <> 'deleted'").get().n);
    report.status = 'COMPLETED_REQUIRES_SEMANTIC_REVIEW';
  } catch { if (!report) throw new Error('Media pilot prerequisite failed'); report.status = 'FAIL'; process.exitCode = 1; }
  finally {
    try {
      if (store && ownProject) { const charged = store.budgetUsed(); store.purgeProject(ownProject); assert.equal(store.budgetUsed(), charged); assert.equal(store.sources(ownProject).length, 0); report.ownProjectContentDeleted = true; report.chargeLedgerPreserved = true; }
      if (report) {
        const actual = realpathSync(fixtureRoot); const rel = relative(workspace, actual);
        if (!rel || rel.startsWith('..') || isAbsolute(rel) || basename(actual) !== 'media-pilot-v1') throw new Error('Cleanup escaped its owned workspace fixture directory');
        assert.equal(readdirSync(join(actual, 'codec-jobs')).length, 0); rmSync(actual, { recursive: true, force: false }); report.rawFixturesDeleted = !existsSync(actual);
      }
    } catch { if (report) { report.status = 'FAIL'; report.cleanup = 'BLOCKED'; } process.exitCode = 1; }
    finally { if (report && store) { report.budgetAfterUsd = store.budgetUsed(); save(); } store?.close(); closeSync(lock); unlinkSync(lockPath); }
  }
  console.log(JSON.stringify({ status: report.status, completedCases: report.cases.length, literalFactCasesPassed: report.literalFactCasesPassed ?? 0, mediaInferenceAttempts: report.mediaInferenceAttempts, rawFixturesDeleted: report.rawFixturesDeleted, usedOrReservedUsd: report.budgetAfterUsd, semanticReview: 'NOT_RUN', discordSends: 0, artifact: '.local/evidence/media-pilot-v1.json' }));
}
run().catch(() => { console.error('BLOCKED: media-pilot prerequisite, lock, budget or preserved first-attempt gate failed. No credentials/provider body displayed.'); process.exitCode = 1; });
