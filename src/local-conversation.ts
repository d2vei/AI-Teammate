import { approver, digest, eligible, type Provider, type RequestEvent } from './domain.js';
import { LocalHarness, type HarnessOutput } from './local-harness.js';
import { MediaPipeline, type MediaPayload, type MediaProvider } from './media.js';
import { ParticipationPolicy, type ParticipationDecision, type ParticipationInput, type ParticipationLedger, type ParticipationReasoner, type RecentMessage } from './participation.js';
import { SyntheticErrorFeed, type ErrorWatch, type WatchTick } from './error-watch.js';
import { WatchScheduler } from './watch-scheduler.js';
import type { Store } from './store.js';

export type ConversationOutput = HarnessOutput & { decision?: ParticipationDecision; sourceId?: string; originId?: string };

// Exact, advertised demonstration patterns only. This fixture responder does
// not evaluate arbitrary conversation or establish intelligent participation.
export class ScriptedConversationReasoner implements ParticipationReasoner {
  readonly mode = 'mock' as const; readonly model = 'scripted-local-scenes-v1';
  async monitor(input: ParticipationInput) {
    const source = input.evidence.find(c => {
      if (c.kind === 'message') return c.text === 'I cannot attend on Saturday. Sunday works for me.';
      if (!c.id.startsWith('media:')) return false;
      try { const data = JSON.parse(c.text) as { kind: string; text: string }; return data.kind === 'derived_media' && data.text === 'I cannot attend on Saturday. Sunday works for me.'; } catch { return false; }
    });
    const active = !!source && input.messages.at(-1)?.text === 'Let us book Saturday.';
    return { status: active ? 'forgotten_constraint' : 'on_track', claim: active ? 'saturday availability' : '', evidenceIds: active ? [source!.id] : [], confidence: active ? 0.95 : 1 };
  }
  async selfRepair(input: ParticipationInput) {
    const fix = input.messages.slice(-3).find(m => m.text === 'We will book Sunday instead.');
    return { resolved: fix ? input.openClaims.filter(c => c.claim === 'saturday availability').map(c => ({ claimKey: c.key, messageId: fix.id, quote: fix.text })) : [] };
  }
  async generate(input: Parameters<ParticipationReasoner['generate']>[0]) { return { text: 'Saturday conflicts with the earlier availability. Could we use Sunday?', evidenceIds: input.finding.evidenceIds }; }
}

export class SuppliedMediaFixture implements MediaProvider {
  readonly mode = 'mock' as const;
  async derive(payload: MediaPayload) {
    return { text: payload.kind === 'voice' ? 'I cannot attend on Saturday. Sunday works for me.' : 'Synthetic note: the hosting ceiling is twenty euros per month.', model: 'supplied-media-text-v1', mode: 'mock' as const, requestId: null };
  }
}

function sample(kind: 'voice' | 'image'): MediaPayload {
  if (kind === 'image') return { kind, mime: 'image/png', synthetic: true, bytes: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aVXcAAAAASUVORK5CYII=', 'base64') };
  // A second of silence. The separately supplied MOCK transcript is explicitly
  // not derived from this audio; it exercises source/confirmation plumbing only.
  const bytes = Buffer.alloc(44 + 32000); bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(16000, 24); bytes.writeUInt32LE(32000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(bytes.length - 44, 40);
  return { kind, mime: 'audio/wav', synthetic: true, bytes };
}

export class OfflineConversation extends LocalHarness {
  readonly participation: ParticipationPolicy; readonly media: MediaPipeline; readonly scheduler: WatchScheduler;
  private messages: RecentMessage[] = [];
  private offers = new Map<string, { original: RequestEvent; expiresAt: number }>();
  constructor(store: Store, provider: Provider, now: () => number, readonly services: { ledger: ParticipationLedger; watch: ErrorWatch; reasoner: ParticipationReasoner; media: MediaProvider; onWatchTick?: (result: WatchTick) => void }) {
    if ([provider.mode, services.reasoner.mode, services.media.mode].some(mode => mode !== 'mock')) throw new Error('Offline conversation accepts MOCK providers only');
    super(store, provider, 0, now, services.watch);
    this.participation = new ParticipationPolicy(store, services.ledger, services.reasoner, now); this.media = new MediaPipeline(store, services.media, now);
    this.scheduler = new WatchScheduler(services.watch, new SyntheticErrorFeed(), services.onWatchTick ?? (() => {}));
  }
  private scope(e: RequestEvent) { return digest([e.platform, e.workspaceId, e.projectId, e.roomId]); }
  private remember(e: RequestEvent) {
    this.messages.push({ id: e.id, version: e.version, text: e.text, platform: e.platform, workspaceId: e.workspaceId, projectId: e.projectId, roomId: e.roomId, actorId: e.actor.id, at: this.now() });
    this.messages = this.messages.slice(-12);
    for (const [token, offer] of this.offers) if (offer.expiresAt <= this.now() || !this.messages.some(m => m.id === offer.original.id)) this.offers.delete(token);
  }
  private display(original: RequestEvent, decision: ParticipationDecision): ConversationOutput {
    if (decision.action === 'HAND_RAISE' && decision.offerToken && decision.expiresAt) {
      this.offers.set(decision.offerToken, { original, expiresAt: decision.expiresAt });
      return { kind: 'status', decision, text: `SHADOW MOCK: would raise a hand for ${original.id}; expires in ${Math.ceil((decision.expiresAt - this.now()) / 1000)} seconds. No external post.\n/invite ${decision.offerToken}` };
    }
    return { kind: decision.action === 'POST' ? 'response' : 'silent', decision, text: decision.action === 'POST' ? `SHADOW MOCK - local display only\n${decision.text}` : `Shadow: ${decision.reason}.` };
  }
  override async line(line: string): Promise<ConversationOutput> {
    const input = line.trim();
    try {
      if (input === '/watch auto on') { await this.scheduler.enable(this.event('Enable automatic local replay watch')); return { kind: 'status', text: 'Automatic REPLAY watch on: real one-minute intervals, local display only. No Roblox, Meta or external post.' }; }
      if (input === '/watch auto off') { await this.scheduler.disable(this.event('Disable automatic local replay watch')); return { kind: 'status', text: 'Automatic replay watch off; manual task retained.' }; }
      if (input === '/watch auto status') return { kind: 'status', text: `Automatic local replay watch: ${this.scheduler.enabled ? 'on' : 'off'}.` };
      if (input === '/watch tick' && this.scheduler.enabled) throw new Error('Disable automatic watch before advancing the simulated clock manually.');
      if (input === '/watch stop' || input === '/pause') {
        const result = await super.line(line); if (result.kind !== 'error') await this.scheduler.shutdown(); return result;
      }
      if (input.startsWith('/shadow ') || input.startsWith('/steer ')) {
        const e = this.event('Set local shadow participation'); const settings = this.services.ledger.settings(this.scope(e));
        if (input === '/shadow on') settings.mode = 'shadow';
        else if (input === '/shadow off' || input === '/steer only speak when tagged') settings.mode = 'off';
        else if (input === '/steer do not break discussion loops') settings.blockedMoves = [...new Set([...settings.blockedMoves, 'loop_breaking' as const])];
        else throw new Error('Use /shadow on|off or /steer only speak when tagged or /steer do not break discussion loops.');
        this.participation.configure(e, settings); return { kind: 'status', text: `Local participation: ${settings.mode}; hand raising is shadow only. Settings require the simulated approver.` };
      }
      if (input.startsWith('/say ') || input.startsWith('/ambient ')) {
        const text = input.slice(input.startsWith('/say ') ? 5 : 9); if (!text || text.length > 2000) throw new Error('Supply 1-2000 characters.');
        const e = this.event(text, 'ambient'); this.remember(e); return this.display(e, await this.participation.observe(e, () => this.messages));
      }
      if (input.startsWith('/invite ')) {
        const token = input.slice(8); const offer = this.offers.get(token); if (!offer) throw new Error('No bound offer in this session; request a fresh intervention.');
        const invitation = { ...this.event('Invite one local shadow intervention', 'reply'), replyTo: offer.original.id };
        return this.display(offer.original, await this.participation.invite(offer.original, invitation, token, () => this.messages));
      }
      if (input === '/why') {
        const last = this.participation.why(this.event('Read scoped explanation')).at(-1);
        return { kind: 'status', text: last ? JSON.stringify(last) : 'No available scoped shadow explanation.' };
      }
      if (input === '/sources') {
        const context = this.core.context(this.event('Inspect selected local source context'));
        return { kind: 'status', text: JSON.stringify(context.map(c => ({ id: c.id, kind: c.kind, label: c.label, text: c.text })), null, 2) };
      }
      if (input === '/media voice' || input === '/media image') {
        const kind = input.endsWith('voice') ? 'voice' : 'image';
        const e = this.event(`Attached MOCK ${kind} fixture; supplied text is not model understanding.`, 'ambient'); e.sourceMessageId = e.id;
        this.remember(e); const sourceId = await this.media.ingest(e, sample(kind), () => this.messages.some(m => m.id === e.id && m.version === e.version));
        return { kind: 'status', sourceId, originId: e.id, text: `MOCK supplied ${kind === 'voice' ? 'transcript (the WAV contains silence)' : 'description (the image is one pixel)'}. No model understanding or API request.\nSource ${sourceId}; original message ${e.id}. Use /sources to inspect.\n/media remove ${e.id}` };
      }
      if (input.startsWith('/media remove ')) {
        const id = input.slice(14); const removed = this.media.removeOrigin(this.event('Remove own/permitted local media source'), id);
        if (removed) this.messages = this.messages.filter(m => m.id !== id);
        return { kind: 'status', text: `${removed} local media derivation(s) removed; saved evidence is rechecked.` };
      }
      if (input === '/forget-local-data CONFIRM') {
        const e = this.event('Explicit local data deletion'); const c = this.store.config(this.projectId);
        if (!c || !eligible({ ...c, paused: false }, e) || !approver(c, e.actor)) throw new Error('Only the configured simulated approver can delete local project data.');
        await this.scheduler.shutdown(); const current = this.store.config(this.projectId);
        if (!current || !eligible({ ...current, paused: false }, e) || !approver(current, e.actor)) throw new Error('Local deletion authority changed.');
        this.store.putConfig({ ...current, paused: true }); this.messages = []; this.offers.clear();
        this.services.watch.purge(e); this.services.ledger.purge(this.scope(e)); this.store.purgeProject(this.projectId);
        return { kind: 'status', text: 'Local project content, watch state and participation state deleted. Project paused; spending ledger retained. Deleted sources are not automatically restored.' };
      }
      return await super.line(line);
    } catch (error) { return { kind: 'error', text: error instanceof Error ? error.message : 'Local conversation action failed.' }; }
  }
  async close() { await this.scheduler.shutdown(); }
}
