import { afterEach, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { basename, isAbsolute, join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { codecProcessEnvironment, FfmpegNormalizer, type AttachmentPayload, type CodecRequest, type CodecRunner, type MediaNormalizer } from '../src/media-codec.js';
import { MediaPipeline, validateMedia, type MediaProvider } from '../src/media.js';
import { Store } from '../src/store.js';
import type { RequestEvent } from '../src/domain.js';
const roots: string[] = []; const stores: Store[] = [];
afterEach(() => {
  for (const s of stores.splice(0)) s.close();
  for (const root of roots.splice(0)) {
    const actual = realpathSync(root); const rel = relative(realpathSync(tmpdir()), actual);
    if (!rel || rel.startsWith('..') || isAbsolute(rel) || !basename(actual).startsWith('teammate-codec-test-')) throw new Error('Test cleanup escaped its own temporary directory');
    rmSync(actual, { recursive: true, force: false });
  }
});
const tools = { ffmpeg: 'synthetic-ffmpeg', ffprobe: 'synthetic-ffprobe', version: 'test-only' };
function root() { const dir = mkdtempSync(join(tmpdir(), 'teammate-codec-test-')); roots.push(dir); return dir; }
const voice: AttachmentPayload = { kind: 'voice', mime: 'audio/ogg', bytes: Buffer.from('OggS-synthetic-codec-input'), synthetic: true };
const audioProbe = { streams: [{ codec_type: 'audio', codec_name: 'opus' }], format: { duration: '1.0065' } };
it('normalizes supplied audio to canonical PCM WAV, keeps the original bytes, and deletes its own job input', async () => {
  const dir = root(); const requests: CodecRequest[] = []; const original = Buffer.from(voice.bytes);
  const run: CodecRunner = async request => { requests.push(request); expect(readFileSync(request.inputPath)).toEqual(original); return request.operation === 'probe' ? Buffer.from(JSON.stringify(audioProbe)) : Buffer.alloc(48000); };
  const output = await new FfmpegNormalizer(tools, run, dir).normalize(voice);
  expect(output.mime).toBe('audio/wav'); expect(validateMedia(output).durationMs).toBe(1000); expect(Buffer.from(voice.bytes)).toEqual(original);
  expect(readdirSync(dir)).toEqual([]); expect(requests).toHaveLength(2);
  for (const request of requests) { expect(request.args).toContain('fd:'); expect(request.args).not.toContain(request.inputPath); expect(request.args[request.args.indexOf('-protocol_whitelist') + 1]).toBe('fd'); }
  expect(requests[1]?.args).toContain('-nostdin'); expect(requests[1]?.maxOutputBytes).toBe(28_800_000);
});
it.each([
  { kind: 'video' as const, mime: 'video/mp4' as const, probe: { streams: [{ codec_type: 'video', width: 160, height: 90, r_frame_rate: '5/1' }], format: { duration: '31' } } },
  { kind: 'image' as const, mime: 'image/png' as const, probe: { streams: [{ codec_type: 'video', codec_name: 'png', width: 10000, height: 10000 }] } },
  { kind: 'voice' as const, mime: 'audio/ogg' as const, probe: { streams: [{ codec_type: 'audio' }], format: { duration: '601' } } },
])('rejects measured duration/dimension limits before decoding and cleans up', async value => {
  const dir = root(); let calls = 0; const run: CodecRunner = async () => { calls++; return Buffer.from(JSON.stringify(value.probe)); };
  await expect(new FfmpegNormalizer(tools, run, dir).normalize({ ...value, bytes: Buffer.from('synthetic'), synthetic: true })).rejects.toThrow(); expect(calls).toBe(1); expect(readdirSync(dir)).toEqual([]);
});
it('cleans inputs on decode failure and does not accept caller-claimed video duration', async () => {
  const dir = root(); let calls = 0; const run: CodecRunner = async request => { calls++; if (request.operation === 'decode') throw new Error('synthetic decoder failure'); return Buffer.from(JSON.stringify({ streams: [{ codec_type: 'video', width: 160, height: 90, r_frame_rate: '5/1' }], format: { duration: '1' } })); };
  await expect(new FfmpegNormalizer(tools, run, dir).normalize({ kind: 'video', mime: 'video/mp4', bytes: Buffer.from('synthetic'), synthetic: true })).rejects.toThrow(); expect(calls).toBe(2); expect(readdirSync(dir)).toEqual([]);
});
it('rejects cancellation or size/type before any codec job starts', async () => {
  const dir = root(); let calls = 0; const run: CodecRunner = async () => { calls++; return Buffer.alloc(0); }; const codec = new FfmpegNormalizer(tools, run, dir);
  await expect(codec.normalize(voice, AbortSignal.abort())).rejects.toThrow();
  await expect(codec.normalize({ ...voice, kind: 'image' })).rejects.toThrow();
  await expect(codec.normalize({ ...voice, kind: 'image', mime: 'image/png', bytes: Buffer.alloc(2_000_001) })).rejects.toThrow(); expect(calls).toBe(0); expect(readdirSync(dir)).toEqual([]);
});
function pipeline() {
  const store = new Store(':memory:'); stores.push(store); store.putConfig({ projectId: 'p', platform: 'fake', workspaceId: 'w', roomId: 'r', memberIds: ['owner'], approverIds: ['owner'], approverRoleIds: [], paused: false, selectedSnapshot: 'codec-v1', revision: 1 });
  const event: RequestEvent = { id: 'attachment', version: '1', sourceMessageId: 'original-media', actor: { id: 'owner', roleIds: [] }, platform: 'fake', projectId: 'p', workspaceId: 'w', roomId: 'r', invocation: 'ambient', text: 'Supplied synthetic media.', replyTo: null, replyContext: null };
  let providerCalls = 0; const provider: MediaProvider = { mode: 'mock', async derive() { providerCalls++; return { mode: 'mock', model: 'codec-test-fixture', text: 'Synthetic supplied transcript.', requestId: null }; } };
  return { store, event, pipeline: new MediaPipeline(store, provider), calls: () => providerCalls };
}
it('authorizes original scope/private handling before conversion and rechecks source before paid dispatch', async () => {
  const x = pipeline(); let preparedCalls = 0; let current = true; let bytes: Uint8Array | undefined;
  const normalizer: MediaNormalizer = { async normalize() { preparedCalls++; current = false; bytes = new Uint8Array([1, 2, 3]); return { kind: 'voice', mime: 'audio/wav', synthetic: true, bytes }; } };
  await expect(x.pipeline.ingestAttachment({ ...x.event, roomId: 'other' }, voice, normalizer, () => true)).rejects.toThrow();
  await expect(x.pipeline.ingestAttachment(x.event, { ...voice, synthetic: false }, normalizer, () => true)).rejects.toThrow('Private'); expect(preparedCalls).toBe(0);
  await expect(x.pipeline.ingestAttachment(x.event, voice, normalizer, () => current)).rejects.toThrow('before provider'); expect(x.calls()).toBe(0); expect(bytes).toEqual(new Uint8Array(3)); expect(x.store.sources('p')).toEqual([]);
});
it('composes codec preparation and existing source-bound derivation without vault access', async () => {
  const x = pipeline(); const dir = root(); const run: CodecRunner = async request => request.operation === 'probe' ? Buffer.from(JSON.stringify(audioProbe)) : Buffer.alloc(48000);
  const id = await x.pipeline.ingestAttachment(x.event, voice, new FfmpegNormalizer(tools, run, dir), () => true);
  expect(x.store.sources('p')[0]?.id).toBe(id); expect(x.store.sources('p')[0]?.label).toContain('original-media'); expect(x.calls()).toBe(1); expect(readdirSync(dir)).toEqual([]); expect(existsSync(dir)).toBe(true);
});
it('never forwards app/provider credentials or preload options to native codec processes', () => {
  expect(codecProcessEnvironment({ PATH: 'synthetic-system-path', SystemRoot: 'synthetic-windows', META_API_KEY: 'synthetic-meta', DISCORD_BOT_TOKEN: 'synthetic-discord', OPENAI_API_KEY: 'synthetic-openai', JEV_API_KEY: 'synthetic-jev', INFISICAL_TOKEN: 'synthetic-vault', NODE_OPTIONS: 'synthetic-preload' })).toEqual({ PATH: 'synthetic-system-path', SystemRoot: 'synthetic-windows' });
});
it('rejects decoded clip time above the limit even when container metadata claims one second', async () => {
  const x = pipeline(); const dir = root();
  const run: CodecRunner = async request => request.operation === 'probe' ? Buffer.from(JSON.stringify({ streams: [{ codec_type: 'video', width: 160, height: 90, r_frame_rate: '5/1' }], format: { duration: '1' } })) : Buffer.from('out_time_us=31000000\nprogress=end\n');
  await expect(x.pipeline.ingestAttachment(x.event, { kind: 'video', mime: 'video/mp4', bytes: Buffer.from('synthetic'), synthetic: true }, new FfmpegNormalizer(tools, run, dir), () => true)).rejects.toThrow('duration');
  expect(x.calls()).toBe(0); expect(x.store.sources('p')).toEqual([]); expect(readdirSync(dir)).toEqual([]);
});
