import { createHash } from 'node:crypto';
import { digest, eligible, approver, type RequestEvent } from './domain.js';
import type { Store } from './store.js';
export type MediaPayload = { kind: 'voice' | 'image' | 'video'; mime: 'audio/wav' | 'image/png' | 'image/jpeg' | 'video/mp4'; bytes: Uint8Array; synthetic: boolean; durationMs?: number; audioMatters?: boolean };
export type MediaResult = { text: string; model: string; mode: 'mock' | 'meta'; requestId: string | null };
export interface MediaProvider { readonly mode: 'mock' | 'meta'; derive(payload: MediaPayload): Promise<MediaResult> }

export function validateMedia(payload: MediaPayload): { durationMs: number | null } {
  const bytes = Buffer.from(payload.bytes); if (!bytes.length || bytes.length > (payload.kind === 'image' ? 2_000_000 : payload.kind === 'video' ? 8_000_000 : 29_000_000)) throw new Error('Media exceeds local bounds');
  if (payload.kind === 'voice') {
    // Deliberately bounded canonical PCM WAV. OGG/Opus conversion is a separate
    // adapter concern; no shell or arbitrary codec process is exposed here.
    if (payload.mime !== 'audio/wav' || bytes.length < 46 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.readUInt32LE(4) !== bytes.length - 8 || bytes.toString('ascii', 8, 12) !== 'WAVE' || bytes.toString('ascii', 12, 16) !== 'fmt ' || bytes.readUInt32LE(16) !== 16 || bytes.readUInt16LE(20) !== 1 || bytes.readUInt16LE(22) !== 1 || ![16000, 24000].includes(bytes.readUInt32LE(24)) || bytes.readUInt32LE(28) !== bytes.readUInt32LE(24) * 2 || bytes.readUInt16LE(32) !== 2 || bytes.readUInt16LE(34) !== 16 || bytes.toString('ascii', 36, 40) !== 'data' || bytes.readUInt32LE(40) !== bytes.length - 44 || (bytes.length - 44) % 2) throw new Error('Supply canonical mono PCM16 WAV at 16/24 kHz');
    const durationMs = (bytes.length - 44) / bytes.readUInt32LE(28) * 1000; if (durationMs > 600_000) throw new Error('Audio exceeds ten minutes'); return { durationMs };
  }
  if (payload.kind === 'image') {
    const png = payload.mime === 'image/png' && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpeg = payload.mime === 'image/jpeg' && bytes.length > 4 && bytes[0] === 255 && bytes[1] === 216 && bytes.at(-2) === 255 && bytes.at(-1) === 217;
    if (!png && !jpeg) throw new Error('Supply a PNG or JPEG image'); return { durationMs: null };
  }
  if (payload.mime !== 'video/mp4' || bytes.length < 16 || bytes.toString('ascii', 4, 8) !== 'ftyp' || !Number.isInteger(payload.durationMs) || payload.durationMs! <= 0 || payload.durationMs! > 30_000) throw new Error('Supply a bounded MP4 clip with adapter-verified duration');
  return { durationMs: payload.durationMs! };
}

export class MediaPipeline {
  private active = false;
  constructor(readonly store: Store, readonly provider: MediaProvider, readonly now = () => Date.now()) {}
  async ingest(e: RequestEvent, payload: MediaPayload, originCurrent: () => boolean, privateHandlingVerified = false): Promise<string> {
    const config = this.store.config(e.projectId);
    if (e.invocation === 'bot' || !eligible(config, { ...e, invocation: 'action' }) || !config.selectedSnapshot || !originCurrent()) throw new Error('Media scope/source unavailable');
    if (!payload.synthetic && !privateHandlingVerified) throw new Error('Private media handling must be verified first');
    validateMedia(payload); if (this.active) throw new Error('Another media request is active');
    const bytes = Uint8Array.from(payload.bytes); const owned = { ...payload, bytes }; const identity = digest(config);
    const contentIdentity = createHash('sha256').update(bytes).digest('hex');
    const id = `media:${config.selectedSnapshot}:${digest(['media-v1', this.provider.mode, payload.kind, payload.mime, !!payload.audioMatters, e.platform, e.workspaceId, e.roomId, e.id, e.version, contentIdentity]).slice(0, 32)}`;
    // Includes deleted/stale IDs: source edits must use a new version, and deleting
    // content must never silently regenerate it from the same origin.
    const existing = this.store.sources(e.projectId).find(s => s.id === id);
    if (existing) { bytes.fill(0); if (existing.state !== 'available') throw new Error('Media derivation withdrawn; attach a new source version'); return id; }
    this.active = true;
    try {
      const result = await this.provider.derive(owned);
      const current = this.store.config(e.projectId);
      if (!eligible(current, { ...e, invocation: 'action' }) || digest(current) !== identity || !originCurrent()) throw new Error('Media source/configuration changed; derived text withheld');
      if (result.mode !== this.provider.mode || !/^[\w.-]{1,80}$/.test(result.model) || !result.text.trim() || result.text.length > 1800 || /(?:api[_-]?key|password|secret|token)\s*[:=]|-----BEGIN .*PRIVATE KEY-----/i.test(result.text)) throw new Error('Derived text invalid or secret-shaped');
      this.store.addSource({ id, projectId: e.projectId, roomId: e.roomId, snapshot: config.selectedSnapshot, kind: 'log', label: `${result.mode === 'mock' ? 'MOCK supplied text, not media understanding' : 'Model-derived media, unverified'}; ${payload.kind}; original message ${e.sourceMessageId ?? e.id} v${e.version}; ${result.model}`, text: JSON.stringify({ kind: 'derived_media', originId: e.sourceMessageId ?? e.id, originVersion: e.version, authorId: e.actor.id, mediaKind: payload.kind, text: result.text, model: result.model, mode: result.mode }), contentHash: digest([contentIdentity, result.text, result.model]), synthetic: payload.synthetic, state: 'available', observedAt: null });
      return id;
    } finally { bytes.fill(0); this.active = false; }
  }
  removeOrigin(e: RequestEvent, messageId: string) {
    const c = this.store.config(e.projectId); if (!c || !eligible({ ...c, paused: false }, { ...e, invocation: 'action' })) throw new Error('Not authorized');
    let removed = 0;
    for (const source of this.store.sources(e.projectId).filter(s => s.id.startsWith('media:') && s.roomId === e.roomId && s.state === 'available')) {
      const metadata = JSON.parse(source.text) as { originId: string; authorId: string };
      if (metadata.originId === messageId && (metadata.authorId === e.actor.id || approver(c, e.actor))) { this.store.sourceState(e.projectId, source.id, 'deleted'); removed++; }
    }
    return removed;
  }
}
