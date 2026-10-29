import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { FfmpegNormalizer, codecProcessEnvironment, localCodecTools } from '../dist/media-codec.js';
import { validateMedia } from '../dist/media.js';
const purpose = process.argv[2] ?? 'media-pilot-v1';
if (!['media-pilot-v1', 'media-pilot-v2'].includes(purpose)) throw new Error('Only fixed media pilot versions are allowed');
const root = resolve(`.local/${purpose}`);
if (existsSync(root) || existsSync(`.local/evidence/${purpose}.json`)) throw new Error('Existing fixture/pilot attempt preserved; use a separately versioned trial');
const tools = localCodecTools(); const env = codecProcessEnvironment(process.env);
// Windows speech/font services need OS profile locations, never provider keys.
for (const name of ['USERPROFILE', 'LOCALAPPDATA', 'APPDATA']) if (process.env[name] !== undefined) env[name] = process.env[name];
const run = (binary, args) => { const r = spawnSync(binary, args, { env, windowsHide: true, timeout: 60000, maxBuffer: 32768, encoding: 'utf8' }); if (r.status !== 0) throw new Error('Offline synthetic media generation failed; no model request'); };
mkdirSync(root); // New fixed workspace fixture directory only; no existing data overwritten.
run(join(process.env.SystemRoot ?? 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe'), ['-NoProfile', '-NonInteractive', '-File', resolve('scripts/generate-media-assets.ps1'), '-Purpose', purpose]);
const encode = args => run(tools.ffmpeg, ['-hide_banner', '-v', 'error', '-nostdin', '-filter_threads', '1', '-threads', '1', ...args]);
encode(['-i', join(root, 'party.wav'), '-ac', '2', '-ar', '48000', '-c:a', 'libopus', join(root, 'party.ogg')]);
encode(['-i', join(root, 'split.png'), '-frames:v', '1', '-q:v', '2', join(root, 'split.jpg')]);
encode(['-framerate', '1/2', '-start_number', '1', '-i', join(root, 'step-%d.png'), '-vf', 'fps=5', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', join(root, 'transition.mp4')]);
encode(['-loop', '1', '-i', join(root, 'review.png'), '-i', join(root, 'review.wav'), '-vf', 'fps=5', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', '-t', '12', join(root, 'review.mp4')]);
const cases = [
  { id: 'MV1-voice', file: 'party.ogg', kind: 'voice', mime: 'audio/ogg', rubric: 'Recover party members together in one room and a three-person next check.', required: ['party', 'one room', '(three|3)'] },
  { id: 'MV1-together', file: 'together.png', kind: 'image', mime: 'image/png', rubric: 'Recover Q7 and all three members assigned to Cedar; do not invent a split.', required: ['Q7', 'Cedar', '(three|3)'], forbidden: ['assigned to different rooms'] },
  { id: 'MV1-split', file: 'split.jpg', kind: 'image', mime: 'image/jpeg', rubric: 'Recover QUEUE_SPLIT, count 5 and different Cedar/Maple destinations.', required: ['QUEUE_SPLIT', '5', 'Cedar', 'Maple'] },
  { id: 'MV1-transition', file: 'transition.mp4', kind: 'video', mime: 'video/mp4', audioMatters: false, rubric: 'Recover waiting then assigned to Cedar for queue 17; do not invent speech.', required: ['17', 'waiting', 'assigned', 'Cedar'], forbidden: ['someone says', 'a speaker says'] },
  { id: 'MV1-review-audio', file: 'review.mp4', kind: 'video', mime: 'video/mp4', audioMatters: true, rubric: 'Recover the negative approval statement and brief only after confirmation, including the spoken fix qualification.', required: ['(not|no|without|hasn.t|haven.t|unapproved)', 'fix', 'brief', 'confirmation'] },
];
const normalizer = new FfmpegNormalizer(tools, undefined, join(root, 'codec-jobs'));
for (const c of cases) {
  if (purpose === 'media-pilot-v2') c.id = c.id.replace('MV1-', 'MV2-');
  const bytes = readFileSync(join(root, c.file)); const prepared = await normalizer.normalize({ kind: c.kind, mime: c.mime, bytes, synthetic: true, ...(c.audioMatters !== undefined ? { audioMatters: c.audioMatters } : {}) });
  c.sha256 = createHash('sha256').update(bytes).digest('hex'); c.bytes = bytes.length; c.durationMs = validateMedia(prepared).durationMs; prepared.bytes.fill(0);
}
writeFileSync(join(root, 'manifest.json'), JSON.stringify({ preparedAt: new Date().toISOString(), kind: `${purpose}: self-authored synthetic engineering fixtures; rubric is never model input; v2 is a same-recipe regression, not held out`, cases }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ status: 'PASS_CODEC_PREPARATION_ONLY', cases: cases.length, fixtureDirectory: `.local/${purpose}`, modelCalls: 0, mediaUnderstanding: 'NOT_RUN' }));
