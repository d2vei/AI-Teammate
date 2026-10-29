import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { FfmpegNormalizer, localCodecTools } from '../dist/media-codec.js';
import { MediaPipeline, validateMedia } from '../dist/media.js';
import { Store } from '../dist/store.js';
const root = resolve('.'); const localRoot = join(root, '.local'); mkdirSync(localRoot, { recursive: true });
let tools;
try { tools = localCodecTools(); } catch { console.error('BLOCKED: verified optional FFmpeg 9.0.2 toolchain missing. Core offline tests need no codec installation.'); process.exitCode = 1; }
if (!tools) process.exit(1);
const dir = mkdtempSync(join(localRoot, 'codec-check-')); const jobs = join(dir, 'jobs');
const env = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'ComSpec', 'PATHEXT'].filter(k => process.env[k] !== undefined).map(k => [k, process.env[k]]));
const make = (name, args) => { const path = join(dir, name); const run = spawnSync(tools.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-filter_threads', '1', ...args, path], { timeout: 30000, encoding: 'utf8', windowsHide: true, env, maxBuffer: 16384 }); if (run.status !== 0) throw new Error('Synthetic codec fixture creation failed'); return readFileSync(path); };
const results = []; let report; const store = new Store(':memory:');
store.putConfig({ projectId: 'codec-check', platform: 'fake', workspaceId: 'synthetic', roomId: 'synthetic-room', memberIds: ['synthetic-owner'], approverIds: ['synthetic-owner'], approverRoleIds: [], paused: false, selectedSnapshot: 'codec-v1', revision: 1 });
const provider = { mode: 'mock', calls: 0, async derive(payload) { this.calls++; return { text: `Supplied MOCK ${payload.kind} fixture description; semantic content not evaluated.`, model: 'supplied-codec-fixture', mode: 'mock', requestId: null }; } };
const pipeline = new MediaPipeline(store, provider); const codec = new FfmpegNormalizer(tools, undefined, jobs);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
try {
  const fixtures = [
    { name: 'ogg-opus', kind: 'voice', mime: 'audio/ogg', bytes: make('tone.ogg', ['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=1', '-ac', '2', '-c:a', 'libopus', '-metadata', 'title=SYNTHETIC_METADATA_DO_NOT_KEEP']) },
    { name: 'png', kind: 'image', mime: 'image/png', bytes: make('red.png', ['-f', 'lavfi', '-i', 'color=c=red:s=64x64:d=1', '-frames:v', '1', '-threads', '1']) },
    { name: 'jpeg', kind: 'image', mime: 'image/jpeg', bytes: make('blue.jpg', ['-f', 'lavfi', '-i', 'color=c=blue:s=64x64:d=1', '-frames:v', '1', '-threads', '1']) },
    { name: 'mp4-with-audio', kind: 'video', mime: 'video/mp4', audioMatters: true, bytes: make('clip.mp4', ['-f', 'lavfi', '-i', 'color=c=blue:s=160x90:d=1:r=5', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest']) },
  ];
  for (const f of fixtures) {
    const before = hash(f.bytes); const prepared = await codec.normalize({ ...f, synthetic: true }); const validation = validateMedia(prepared);
    const audioMetadataMarkerRemoved = f.kind === 'voice' ? !Buffer.from(prepared.bytes).includes(Buffer.from('SYNTHETIC_METADATA_DO_NOT_KEEP')) : null;
    if (f.kind === 'voice' && (validation.durationMs !== 1000 || !audioMetadataMarkerRemoved)) throw new Error('Actual audio conversion or metadata stripping failed');
    if (f.kind === 'video' && (!prepared.durationMs || prepared.durationMs > 1100)) throw new Error('Actual clip duration unverified');
    const e = { id: f.name, version: 'synthetic-v1', platform: 'fake', projectId: 'codec-check', workspaceId: 'synthetic', roomId: 'synthetic-room', actor: { id: 'synthetic-owner', roleIds: [] }, invocation: 'ambient', text: 'Own generated synthetic codec fixture.', sourceMessageId: f.name, replyTo: null, replyContext: null };
    const sourceId = await pipeline.ingestAttachment(e, { ...f, synthetic: true }, codec, () => true);
    if (hash(f.bytes) !== before || readdirSync(jobs).length) throw new Error('Caller bytes changed or raw codec job retained');
    results.push({ case: f.name, status: 'PASS_CODEC_ONLY', inputBytes: f.bytes.length, inputSha256: before, normalizedBytes: prepared.bytes.length, normalizedMime: prepared.mime, durationMs: validation.durationMs, audioMetadataMarkerRemoved, sourceId, originalBytesUnchanged: true, jobFilesDeleted: true, semanticResult: 'NOT_RUN' }); prepared.bytes.fill(0);
  }
  const long = make('long.mp4', ['-f', 'lavfi', '-i', 'color=c=red:s=160x90:d=31:r=1', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p']);
  let rejected = 0;
  for (const input of [{ kind: 'video', mime: 'video/mp4', bytes: long, synthetic: true }, { kind: 'image', mime: 'image/png', bytes: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]), synthetic: true }]) { try { await codec.normalize(input); } catch { rejected++; } }
  if (rejected !== 2 || readdirSync(jobs).length || provider.calls !== 4) throw new Error('Actual invalid input rejection/cleanup failed');
  const fileIdentity = ['src/media-codec.ts', 'src/media.ts', 'scripts/check-codec.mjs', 'dist/media-codec.js', 'dist/media.js', 'package-lock.json'].map(path => ({ path, sha256: hash(readFileSync(path)) }));
  const manifest = JSON.parse(readFileSync('.local/tools/ffmpeg-9.0.2/toolchain.json', 'utf8').replace(/^\uFEFF/, ''));
  report = { at: new Date().toISOString(), status: 'PASS_CODEC_SOFTWARE_ONLY', kind: 'actual verified FFmpeg/ffprobe over generated synthetic fixtures plus MOCK derivation', toolchain: manifest, files: fileIdentity, candidateBase: execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, 'rev-parse', 'HEAD'], { encoding: 'utf8', env }).trim(), workingTreeDirty: true, cases: results, invalidInputsRejected: rejected, suppliedDerivations: provider.calls, modelRequests: 0, externalPosts: 0, actualMediaUnderstanding: 'NOT_RUN', costUsd: 0, rawTemporaryFixturesDeleted: false };
} catch {
  report = { at: new Date().toISOString(), status: 'FAIL', kind: 'codec software check did not complete', cases: results, modelRequests: 0, actualMediaUnderstanding: 'NOT_RUN', rawTemporaryFixturesDeleted: false }; process.exitCode = 1;
} finally {
  store.close();
  try { const actual = realpathSync(dir); const rel = relative(realpathSync(localRoot), actual); if (!rel || rel.startsWith('..') || isAbsolute(rel) || !basename(actual).startsWith('codec-check-')) throw new Error('Fixture cleanup escaped its own directory'); rmSync(actual, { recursive: true, force: false }); }
  catch { report.status = 'FAIL'; report.cleanup = 'BLOCKED'; process.exitCode = 1; }
}
report.rawTemporaryFixturesDeleted = !existsSync(dir); if (!report.rawTemporaryFixturesDeleted) { report.status = 'FAIL'; process.exitCode = 1; }
mkdirSync('evidence', { recursive: true }); writeFileSync('evidence/media-codec-v1.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, realCodecCases: results.length, invalidInputsRejected: report.invalidInputsRejected ?? 'NOT_COMPLETED', rawTemporaryFixturesDeleted: report.rawTemporaryFixturesDeleted, modelRequests: 0, mediaUnderstanding: 'NOT_RUN', artifact: 'evidence/media-codec-v1.json' }));
