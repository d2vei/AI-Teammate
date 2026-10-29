import { afterEach, expect, it } from 'vitest';
import { Store } from '../src/store.js';
import { MediaPipeline, validateMedia, type MediaPayload, type MediaProvider } from '../src/media.js';
import { MetaMediaProvider } from '../src/media-meta.js';
import { Teammate } from '../src/core.js';
import { MockProvider } from '../src/fakes.js';
import type { RequestEvent } from '../src/domain.js';
const stores: Store[] = []; afterEach(() => { for (const s of stores.splice(0)) s.close(); });
function store() { const s = new Store(':memory:'); stores.push(s); s.putConfig({ projectId: 'p', platform: 'fake', workspaceId: 'w', roomId: 'r', memberIds: ['owner', 'peer'], approverIds: ['owner'], approverRoleIds: [], paused: false, selectedSnapshot: 'media-v1', revision: 1 }); return s; }
const event: RequestEvent = { id: 'voice-message', sourceMessageId: 'source-message', version: '1', actor: { id: 'owner', roleIds: [] }, platform: 'fake', workspaceId: 'w', projectId: 'p', roomId: 'r', invocation: 'ambient', text: 'Supplied synthetic attachment.', replyTo: null, replyContext: null };
function wav(): MediaPayload { const b = Buffer.alloc(44 + 32000); b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(16000, 24); b.writeUInt32LE(32000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(b.length - 44, 40); return { kind: 'voice', mime: 'audio/wav', synthetic: true, bytes: b }; }
const png = (): MediaPayload => ({ kind: 'image', mime: 'image/png', synthetic: true, bytes: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]) });
const video = (): MediaPayload => ({ kind: 'video', mime: 'video/mp4', synthetic: true, durationMs: 1000, bytes: Buffer.from([0, 0, 0, 16, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0]) });
const envelope = (model: string) => ({ id: 'mock-response', status: 'completed', model, usage: { input_tokens: 10, output_tokens: 20 }, output: [{ type: 'message', content: [{ type: 'output_text', text: 'A synthetic availability note.' }] }] });
it('retains derived text with its original source, deduplicates and invalidates saved content after deletion', async () => {
  const s = store(); let calls = 0; const provider: MediaProvider = { mode: 'mock', async derive() { calls++; return { text: 'I cannot attend on Saturday.', model: 'supplied-text-fixture', mode: 'mock', requestId: null }; } };
  const pipeline = new MediaPipeline(s, provider); const payload = wav(); const originalBytes = Buffer.from(payload.bytes);
  const id = await pipeline.ingest(event, payload, () => true); expect(await pipeline.ingest(event, payload, () => true)).toBe(id); expect(calls).toBe(1); expect(Buffer.from(payload.bytes)).toEqual(originalBytes);
  const core = new Teammate(s, new MockProvider(), 1); const request = { ...event, invocation: 'action' as const }; const context = core.context(request); expect(context.find(c => c.id === id)?.label).toContain('MOCK supplied text');
  const card = s.propose(request, { kind: 'decision', statement: 'Choose a day other than Saturday.', sourceIds: [id] }, context, Date.now()); s.accept(request, card.buttonId, Date.now());
  expect(pipeline.removeOrigin({ ...request, actor: { id: 'peer', roleIds: [] } }, 'source-message')).toBe(0);
  s.putConfig({ ...s.config('p')!, paused: true }); expect(pipeline.removeOrigin(request, 'source-message')).toBe(1); s.putConfig({ ...s.config('p')!, paused: false });
  expect(core.context(request).find(c => c.kind === 'missing_evidence')?.text).toContain('withheld');
  await expect(pipeline.ingest(event, payload, () => true)).rejects.toThrow('withdrawn'); expect(JSON.stringify(s.sources('p'))).not.toContain('cannot attend');
});
it('checks access, private handling and delayed source availability before retaining a derivation', async () => {
  const s = store(); let current = true; let calls = 0; const provider: MediaProvider = { mode: 'mock', async derive() { calls++; current = false; return { text: 'Synthetic text.', model: 'mock', mode: 'mock', requestId: null }; } }; const pipeline = new MediaPipeline(s, provider);
  await expect(pipeline.ingest({ ...event, roomId: 'other' }, wav(), () => true)).rejects.toThrow();
  await expect(pipeline.ingest(event, { ...wav(), synthetic: false }, () => true)).rejects.toThrow('Private'); expect(calls).toBe(0);
  await expect(pipeline.ingest(event, wav(), () => current)).rejects.toThrow('withheld'); expect(s.sources('p')).toEqual([]);
});
it('rejects malformed/oversized media and unsupported audio instead of invoking a codec or fallback', () => {
  expect(validateMedia(wav()).durationMs).toBe(1000);
  const bad = wav(); Buffer.from(bad.bytes.buffer, bad.bytes.byteOffset, bad.bytes.byteLength).writeUInt16LE(2, 22); expect(() => validateMedia(bad)).toThrow();
  expect(() => validateMedia({ ...png(), bytes: Buffer.alloc(2_000_001) })).toThrow(); expect(() => validateMedia({ ...video(), durationMs: 30001 })).toThrow();
});
it('uses the documented recording endpoint and multipart fields, then accounts for reported audio time', async () => {
  const s = store(); let calls = 0;
  const http: typeof fetch = async (url, init) => { calls++; expect(url).toBe('https://api.meta.ai/v1/asr/transcribe'); expect(init?.redirect).toBe('error'); const form = init!.body as FormData; const request = JSON.parse(await (form.get('request') as Blob).text()); expect(request.model).toBe('muse-voice-transcribe-1.0'); expect(request.languageBias).toEqual(['German', 'English']); expect(form.get('audio')).toBeInstanceOf(Blob); return new Response(JSON.stringify({ sessionId: 'synthetic', transcript: 'Sunday is possible.', audioDurationMs: 1000, turns: [] })); };
  const result = await new MetaMediaProvider('SYNTHETIC-HTTP-ONLY', s, 5, http).derive(wav()); expect(result.text).toContain('Sunday'); expect(s.budgetUsed()).toBe(0.00005); expect(calls).toBe(1);
});
it('uses Standard vision and preserves usage on invalid visible output without retry', async () => {
  const s = store(); let calls = 0;
  const http: typeof fetch = async (_url, init) => { calls++; const body = JSON.parse(init!.body as string); expect(body.model).toBe('muse-spark-1.3'); expect(body.store).toBe(false); expect(body.input[0].content[1].image_url).toMatch(/^data:image\/png;base64,/); return new Response(JSON.stringify({ ...envelope(body.model), status: 'incomplete' })); };
  await expect(new MetaMediaProvider('SYNTHETIC-HTTP-ONLY', s, 5, http).derive(png())).rejects.toThrow(); expect(calls).toBe(1); expect(s.budgetUsed()).toBe(0.000098);
});
it('uploads only the supplied video, uses the explicit sound model and deletes that exact upload', async () => {
  const s = store(); const requests: string[] = [];
  const http: typeof fetch = async (url, init) => {
    requests.push(`${init?.method} ${url}`);
    if (url === 'https://api.meta.ai/v1/files') { expect((init!.body as FormData).get('purpose')).toBe('user_data'); return new Response(JSON.stringify({ id: 'file-12345' })); }
    if (init?.method === 'DELETE') return new Response('{}');
    const body = JSON.parse(init!.body as string); expect(body.model).toBe('muse-spark-1.2'); expect(body.input[0].content[1]).toEqual({ type: 'input_file', file_id: 'file-12345' }); return new Response(JSON.stringify(envelope(body.model)));
  };
  const result = await new MetaMediaProvider('SYNTHETIC-HTTP-ONLY', s, 5, http).derive({ ...video(), audioMatters: true }); expect(result.model).toBe('muse-spark-1.2'); expect(requests.at(-1)).toBe('DELETE https://api.meta.ai/v1/files/file-12345'); expect(s.db.prepare('SELECT state FROM media_uploads').get()?.state).toBe('deleted');
});
it('retains failed upload cleanup state, withholds its result and blocks a new upload', async () => {
  const s = store(); let uploads = 0;
  const http: typeof fetch = async (url, init) => { if (url === 'https://api.meta.ai/v1/files') { uploads++; return new Response(JSON.stringify({ id: 'file-12345' })); } if (init?.method === 'DELETE') return new Response('{}', { status: 503 }); return new Response(JSON.stringify(envelope('muse-spark-1.3'))); };
  const provider = new MetaMediaProvider('SYNTHETIC-HTTP-ONLY', s, 5, http); await expect(provider.derive(video())).rejects.toThrow('cleanup'); await expect(provider.derive(video())).rejects.toThrow('cleanup'); expect(uploads).toBe(1); expect(s.db.prepare('SELECT state FROM media_uploads').get()?.state).toBe('cleanup_required');
});
it('blocks absent budget and retains uncertain charges after a failed visual call', async () => {
  const s = store(); let calls = 0; const http: typeof fetch = async () => { calls++; throw new Error('synthetic timeout'); };
  await expect(new MetaMediaProvider('SYNTHETIC-HTTP-ONLY', s, 0, http).derive(png())).rejects.toThrow(); expect(calls).toBe(0);
  await expect(new MetaMediaProvider('SYNTHETIC-HTTP-ONLY', s, 5, http).derive(png())).rejects.toThrow(); expect(calls).toBe(1); expect(s.budgetUsed()).toBeGreaterThan(1);
});
