import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { z } from 'zod';
import { validateMedia, type MediaPayload } from './media.js';

export type AttachmentPayload = { kind: 'voice' | 'image' | 'video'; mime: 'audio/ogg' | 'audio/wav' | 'image/png' | 'image/jpeg' | 'video/mp4'; bytes: Uint8Array; synthetic: boolean; audioMatters?: boolean };
export interface MediaNormalizer { normalize(payload: AttachmentPayload, signal?: AbortSignal): Promise<MediaPayload> }
export type CodecTools = { ffmpeg: string; ffprobe: string; version: string };
export type CodecRequest = { operation: 'probe' | 'pcm' | 'decode'; binary: string; args: string[]; inputPath: string; maxOutputBytes: number; signal?: AbortSignal };
export type CodecRunner = (request: CodecRequest) => Promise<Buffer>;
export const codecProcessEnvironment = (input: NodeJS.ProcessEnv) => Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'ComSpec', 'PATHEXT'].filter(k => input[k] !== undefined).map(k => [k, input[k]!]));

export function localCodecTools(): CodecTools {
  const root = resolve('.local/tools/ffmpeg-9.0.2');
  const manifest = z.object({ version: z.literal('9.0.2'), verified: z.literal(true), ffmpegSha256: z.string().regex(/^[a-f0-9]{64}$/), ffprobeSha256: z.string().regex(/^[a-f0-9]{64}$/) }).parse(JSON.parse(readFileSync(join(root, 'toolchain.json'), 'utf8').replace(/^\uFEFF/, '')));
  const extension = process.platform === 'win32' ? '.exe' : '';
  const ffmpeg = join(root, `ffmpeg${extension}`); const ffprobe = join(root, `ffprobe${extension}`);
  for (const [file, expected] of [[ffmpeg, manifest.ffmpegSha256], [ffprobe, manifest.ffprobeSha256]]) if (createHash('sha256').update(readFileSync(file!)).digest('hex') !== expected) throw new Error('Codec tool identity changed');
  return { ffmpeg, ffprobe, version: manifest.version };
}

// Internal fixed codec runner. Input is one owned temporary file on descriptor
// zero; fd is the ONLY allowed input protocol. No shell, model-selected command,
// caller filename/URL, application credential, or file/network protocol is used.
const runCodec: CodecRunner = request => new Promise((resolve, reject) => {
  const input = openSync(request.inputPath, 'r'); let settled = false; let tooLarge = false; let size = 0; let errorSize = 0; const chunks: Buffer[] = [];
  const signal = AbortSignal.any([AbortSignal.timeout(30_000), ...(request.signal ? [request.signal] : [])]);
  let child;
  try { child = spawn(request.binary, request.args, { stdio: [input, 'pipe', 'pipe'], shell: false, windowsHide: true, env: codecProcessEnvironment(process.env), signal }); }
  catch { closeSync(input); reject(new Error('Codec unavailable')); return; }
  const finish = (ok: boolean) => { if (settled) return; settled = true; closeSync(input); if (ok && !tooLarge && !signal.aborted) resolve(Buffer.concat(chunks)); else reject(new Error('Media codec unavailable, invalid, cancelled or exceeded bounds')); };
  child.stdout!.on('data', (chunk: Buffer) => { size += chunk.length; if (size > request.maxOutputBytes) { tooLarge = true; child.kill(); } else chunks.push(chunk); });
  // Error bodies can contain media metadata; never print or retain them.
  child.stderr!.on('data', (chunk: Buffer) => { errorSize += chunk.length; if (errorSize > 16384) { tooLarge = true; child.kill(); } });
  child.on('error', () => { child.kill(); });
  child.on('close', code => { finish(code === 0); });
});

const ProbeSchema = z.object({ streams: z.array(z.object({ codec_type: z.string(), codec_name: z.string().optional(), width: z.number().int().optional(), height: z.number().int().optional(), r_frame_rate: z.string().optional(), channels: z.number().int().optional(), sample_rate: z.string().optional() })).max(4), format: z.object({ duration: z.string().optional() }).optional() });
const formats = { 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'image/png': 'png_pipe', 'image/jpeg': 'jpeg_pipe', 'video/mp4': 'mov' } as const;
const baseArgs = ['-v', 'error', '-max_alloc', '67108864', '-threads', '1', '-protocol_whitelist', 'fd', '-fd', '0'];

export class FfmpegNormalizer implements MediaNormalizer {
  private active = false;
  constructor(readonly tools: CodecTools, private readonly run: CodecRunner = runCodec, readonly stateRoot = resolve('.local/media-jobs')) {}
  async normalize(payload: AttachmentPayload, signal?: AbortSignal): Promise<MediaPayload> {
    if (this.active) throw new Error('Another codec job is active');
    if (signal?.aborted) throw new Error('Media preparation cancelled');
    if (!['voice', 'image', 'video'].includes(payload.kind) || !(payload.bytes instanceof Uint8Array)) throw new Error('Invalid attachment');
    const allowed = payload.kind === 'voice' ? ['audio/ogg', 'audio/wav'] : payload.kind === 'image' ? ['image/png', 'image/jpeg'] : ['video/mp4'];
    const maximum = payload.kind === 'image' ? 2_000_000 : payload.kind === 'video' ? 8_000_000 : 29_000_000;
    if (!allowed.includes(payload.mime) || !payload.bytes.length || payload.bytes.length > maximum) throw new Error('Unsupported attachment type or size');
    this.active = true; let directory: string | undefined; const owned = Buffer.from(payload.bytes);
    try {
      mkdirSync(this.stateRoot, { recursive: true }); directory = mkdtempSync(join(this.stateRoot, 'job-'));
      const inputPath = join(directory, 'input.bin'); writeFileSync(inputPath, owned, { flag: 'wx', mode: 0o600 });
      const args = [...baseArgs, '-f', formats[payload.mime], '-i', 'fd:'];
      const raw = await this.run({ operation: 'probe', binary: this.tools.ffprobe, args: [...args, '-show_entries', 'format=duration:stream=codec_type,codec_name,width,height,r_frame_rate,channels,sample_rate', '-of', 'json'], inputPath, maxOutputBytes: 16384, ...(signal ? { signal } : {}) });
      const probe = ProbeSchema.parse(JSON.parse(raw.toString('utf8')));
      const audio = probe.streams.filter(s => s.codec_type === 'audio'); const video = probe.streams.filter(s => s.codec_type === 'video');
      if (payload.kind === 'voice') {
        const duration = Number(probe.format?.duration);
        if (audio.length !== 1 || video.length || !Number.isFinite(duration) || duration <= 0 || duration > 600.1) throw new Error('Audio stream/duration outside limits');
        const pcm = await this.run({ operation: 'pcm', binary: this.tools.ffmpeg, args: ['-nostdin', '-filter_threads', '1', '-filter_complex_threads', '1', ...args, '-xerror', '-map', '0:a:0', '-vn', '-sn', '-dn', '-ac', '1', '-ar', '24000', '-c:a', 'pcm_s16le', '-map_metadata', '-1', '-t', '600.001', '-f', 's16le', 'pipe:1'], inputPath, maxOutputBytes: 28_800_000, ...(signal ? { signal } : {}) });
        if (!pcm.length || pcm.length % 2) throw new Error('Decoded audio invalid');
        const wav = Buffer.alloc(44 + pcm.length); wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(24000, 24); wav.writeUInt32LE(48000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(pcm.length, 40); pcm.copy(wav, 44); pcm.fill(0);
        const result: MediaPayload = { kind: 'voice', mime: 'audio/wav', bytes: wav, synthetic: payload.synthetic }; validateMedia(result); return result;
      }
      const picture = video[0];
      if (video.length !== 1 || !picture?.width || !picture.height || picture.width <= 0 || picture.height <= 0 || picture.width > 4096 || picture.height > 4096 || picture.width * picture.height > 8_294_400) throw new Error('Visual stream/dimensions outside limits');
      if (payload.kind === 'image' && (audio.length || !['png', 'mjpeg'].includes(picture.codec_name ?? ''))) throw new Error('Unsupported still image');
      const duration = payload.kind === 'video' ? Number(probe.format?.duration) : null;
      if (payload.kind === 'video' && (!Number.isFinite(duration) || duration! <= 0 || duration! > 30 || audio.length > 1 || probe.streams.some(s => !['audio', 'video'].includes(s.codec_type)))) throw new Error('Clip stream/duration outside limits');
      if (payload.kind === 'video') { const rate = (picture.r_frame_rate ?? '').split('/').map(Number); const fps = rate[0]! / rate[1]!; if (!Number.isFinite(fps) || fps <= 0 || fps > 60) throw new Error('Clip frame rate outside limits'); }
      if (payload.kind === 'video' && audio.some(a => !a.channels || a.channels > 8 || !Number.isFinite(Number(a.sample_rate)) || Number(a.sample_rate) <= 0 || Number(a.sample_rate) > 192000)) throw new Error('Clip audio configuration outside limits');
      const decoded = await this.run({ operation: 'decode', binary: this.tools.ffmpeg, args: ['-nostdin', '-filter_threads', '1', '-filter_complex_threads', '1', ...args, '-xerror', '-map', '0:v:0', ...(payload.kind === 'image' ? ['-an', '-frames:v', '1'] : ['-map', '0:a:0?', '-t', '30.001', '-progress', 'pipe:1', '-stats_period', '60']), '-sn', '-dn', '-f', 'null', 'pipe:1'], inputPath, maxOutputBytes: 16384, ...(signal ? { signal } : {}) });
      let durationMs = duration !== null ? Math.ceil(duration * 1000) : null;
      if (payload.kind === 'video') {
        const progress = decoded.toString('utf8'); const times = [...progress.matchAll(/^out_time_us=(\d+)\r?$/gm)].map(m => Number(m[1]));
        if (!progress.includes('progress=end') || !times.length || Math.max(...times) > 30_000_000) throw new Error('Decoded clip exceeds duration or cannot be verified');
        durationMs = Math.max(durationMs!, Math.ceil(Math.max(...times) / 1000));
      }
      const result: MediaPayload = { kind: payload.kind, mime: payload.mime as 'image/png' | 'image/jpeg' | 'video/mp4', bytes: Uint8Array.from(owned), synthetic: payload.synthetic, ...(durationMs !== null ? { durationMs } : {}), ...(payload.audioMatters !== undefined ? { audioMatters: payload.audioMatters } : {}) }; validateMedia(result); return result;
    } finally {
      owned.fill(0); this.active = false;
      if (directory && existsSync(directory)) {
        const actualRoot = realpathSync(this.stateRoot); const actual = realpathSync(directory); const path = relative(actualRoot, actual);
        if (!path || path.startsWith('..') || isAbsolute(path) || !basename(actual).startsWith('job-')) throw new Error('Codec cleanup target escaped its own job directory');
        rmSync(actual, { recursive: true, force: false });
      }
    }
  }
}
