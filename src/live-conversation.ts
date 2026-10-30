import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { approver, digest, eligible, type Provider } from './domain.js';
import { FakeAdapter } from './fakes.js';
import { LocalHarness, type HarnessOutput } from './local-harness.js';
import { BundleSchema, ingestBundle } from './sources.js';
import type { Store } from './store.js';
import { MediaPipeline, type MediaProvider } from './media.js';
import type { MediaNormalizer } from './media-codec.js';
import { LocalMediaInbox } from './local-media-inbox.js';
import { LiveReplayWatch } from './live-watch.js';
import type { ErrorFeed, ErrorWatch } from './error-watch.js';

export type LiveServices = { media?: MediaProvider; normalizer?: () => MediaNormalizer; inbox?: LocalMediaInbox; watch?: ErrorWatch; feed?: ErrorFeed; emit?: (result: HarnessOutput) => void };

// The local operator can role-play both participants. This is not platform
// authentication, a group study, or a connection to a messaging service.
export class LiveConversation extends LocalHarness {
  private previous: { id: string; text: string; version: string; question: string; binding: string } | null = null;
  private modelActive = false; private mediaController: AbortController | undefined;
  readonly media: MediaPipeline | undefined; readonly liveWatch: LiveReplayWatch | undefined;
  private readonly inbox: LocalMediaInbox;
  constructor(store: Store, provider: Provider, capUsd: number, now = () => Date.now(), readonly services: LiveServices = {}) {
    if (provider.mode !== 'meta' || !Number.isFinite(capUsd) || capUsd <= 0 || capUsd > 5) throw new Error('Live conversation requires Meta and the shared authorized cap');
    super(store, provider, capUsd, now); this.checkScope(); this.inbox = services.inbox ?? new LocalMediaInbox();
    if (services.media && services.media.mode !== 'meta') throw new Error('Live media requires Meta, not supplied MOCK text');
    this.media = services.media ? new MediaPipeline(store, services.media, now) : undefined;
    this.liveWatch = services.watch && services.feed ? new LiveReplayWatch(services.watch, services.feed, provider, capUsd, { acquire: () => this.acquire(), release: () => { this.modelActive = false; } }, services.emit ?? (() => {})) : undefined;
  }
  private acquire() { if (this.modelActive) return false; this.modelActive = true; return true; }
  immediateControl(input: string) { return ['/pause', '/status', '/watch stop', '/watch auto off'].includes(input.trim()) || input.trim().startsWith('/media remove '); }
  private checkScope() {
    const c = this.store.config(this.projectId);
    if (!c || c.platform !== 'fake' || c.workspaceId !== 'local-synthetic' || c.roomId !== 'conversation-room' || digest(c.memberIds) !== digest(['synthetic-owner', 'synthetic-peer']) || digest(c.approverIds) !== digest(['synthetic-owner']) || digest(c.approverRoleIds) !== digest(['reviewer']) || this.store.sources(this.projectId).some(s => !s.synthetic)) throw new Error('Local synthetic scope changed; live requests blocked');
    return c;
  }
  private binding(question: string) { return digest([this.checkScope(), this.core.context(this.event(question))]); }
  private owner() {
    const c = this.checkScope(); const e = this.event('Explicit local fixture operation');
    if (!eligible({ ...c, paused: false }, e) || !approver(c, e.actor)) throw new Error('Only the simulated owner can reset or delete this local project');
    return c;
  }
  override async line(line: string): Promise<HarnessOutput> {
    try {
      this.checkScope(); const input = line.trim();
      if (input.length > 2000) throw new Error('Use at most 2000 characters per local request');
      if (input === '/forget-local-data CONFIRM' || input === '/reset-demo CONFIRM') {
        const c = this.owner(); this.previous = null; this.mediaController?.abort();
        this.store.putConfig({ ...c, paused: true }); await this.liveWatch?.purge(this.event('Delete local replay watch'));
        this.store.purgeProject(this.projectId);
        if (input.startsWith('/forget')) return { kind: 'status', text: 'This local project content was deleted and paused. Shared spending charges remain. Use /reset-demo CONFIRM for a new synthetic fixture.' };
        const bundle = BundleSchema.parse(JSON.parse(readFileSync(new URL('../examples/party-queue.json', import.meta.url), 'utf8')));
        bundle.snapshot = `live-demo-${randomUUID()}`; bundle.logs = bundle.logs.map(l => ({ ...l, at: new Date(this.now()).toISOString() }));
        this.store.putConfig({ ...c, paused: false, selectedSnapshot: bundle.snapshot }); ingestBundle(this.store, this.projectId, bundle, this.now());
        return { kind: 'status', text: 'New synthetic fixture selected; zero approved decisions/briefs. Shared spending charges retained. Synthetic log times were rebased for this explicit demo reset.' };
      }
      if (input === '/pause') {
        const result = await super.line(input); this.mediaController?.abort(); await this.liveWatch?.suspend(); return result;
      }
      if (input.startsWith('/media remove ')) {
        if (!this.media) throw new Error('Media is not configured in this session');
        const removed = this.media.removeOrigin(this.event('Remove local attachment message'), input.slice(14)); this.previous = null;
        return { kind: 'status', text: `${removed} attachment derivation(s) removed; evidence-dependent cards/briefs are rechecked. Your original inbox file was not deleted.` };
      }
      if (input.startsWith('/media ')) {
        const match = /^\/media (voice|image|video) ("(?:[^"\\]|\\.)*"|\S+)( --audio-important)? --synthetic$/.exec(input);
        if (!match || !this.media || !this.services.normalizer) throw new Error('Use /media voice|image|video FILENAME [--audio-important] --synthetic; configure the local codec first');
        const config = this.checkScope(); const event = this.event('Operator-attached synthetic media snapshot');
        if (!eligible(config, event)) throw new Error('Attachment scope is paused or unavailable');
        if (!this.acquire()) throw new Error('Another model request is active; no input queued');
        let loaded: ReturnType<LocalMediaInbox['load']> | undefined;
        try {
          let name: string;
          try { name = match[2]!.startsWith('"') ? JSON.parse(match[2]!) as string : match[2]!; } catch { throw new Error('Use a valid JSON-quoted inbox filename'); }
          loaded = this.inbox.load(name, match[1] as 'voice' | 'image' | 'video', !!match[3]); this.mediaController = new AbortController();
          event.sourceMessageId = event.id; event.version = digest([loaded.payload.kind, loaded.payload.mime, !!loaded.payload.audioMatters, createHash('sha256').update(loaded.payload.bytes).digest('hex')]);
          const source = await this.media.ingestAttachment(event, loaded.payload, this.services.normalizer(), loaded.current, false, this.mediaController.signal);
          this.previous = null;
          return { kind: 'status', text: `Meta-derived ${match[1]} snapshot stored as unverified evidence. Source ${source}; original local message ${event.id}. Your input file is unchanged.\n/media remove ${event.id}` };
        } finally { loaded?.dispose(); this.mediaController = undefined; this.modelActive = false; }
      }
      if (input.startsWith('/watch')) {
        const watch = this.liveWatch; if (!watch) throw new Error('Replay watch is not configured in this session');
        const event = this.event('Control owner-approved synthetic replay watch');
        const start = /^\/watch start(?: ([1-9]\d?))?$/.exec(input);
        if (start) { const task = watch.start(event, Number(start[1] ?? 1)); return { kind: 'status', text: `REPLAY watch ${task.id}, synthetic game 424242, ${task.intervalMs / 60000}-minute interval. /watch auto on enables paid Meta diagnosis on changes within the shared allowance; /watch poll checks only when due. Stop first to change the interval.` }; }
        if (input === '/watch auto on') { await watch.enable(event); return { kind: 'status', text: 'Automatic saved-JSON REPLAY watch on. Changed observations may request one Meta diagnosis per poll within the shared cap. Local output only; no Roblox or Discord connection.' }; }
        if (input === '/watch auto off') { await watch.disable(event); return { kind: 'status', text: 'Automatic watch off; task retained and pending diagnosis delivery cancelled.' }; }
        if (input === '/watch stop') { await watch.stop(event); return { kind: 'status', text: 'Replay watch stopped; pending diagnosis delivery cancelled.' }; }
        if (input === '/watch status') return { kind: 'status', text: `Automatic replay watch: ${watch.scheduler.enabled ? 'on' : 'off'}; active task: ${!!watch.watch.activeTask(event)}.` };
        if (input === '/watch poll') return await watch.poll(event);
        throw new Error('Use /watch start [1-60 minutes], auto on|off, status, poll or stop');
      }
      if (input === '/sources') return { kind: 'status', text: JSON.stringify(this.core.context(this.event('')).map(({ id, kind, label, text }) => ({ id, kind, label, text })), null, 2) };
      if (/^\/(?:as |accept |withdraw |memory(?: |$))/.test(input) || ['/status', '/pause', '/resume'].includes(input) || input.startsWith('/ambient ')) return await super.line(input);
      if (!input || input === '/help') return { kind: 'status', text: 'Use /ask TEXT, /reply TEXT, /decision TEXT, /brief TEXT, /accept EXACT-TOKEN, /as owner|peer, /status, /sources, /memory, /memory search QUERY, /memory topics, /memory topic NAME, /memory tag REF TOPIC, /memory untag REF TOPIC, /pause, /resume, /withdraw ID, /ambient TEXT, /forget-local-data CONFIRM, /reset-demo CONFIRM or /quit. Add-ons: /media voice|image|video FILENAME [--audio-important] --synthetic, /media remove ORIGIN, /watch start [MINUTES], /watch auto on|off, /watch status|poll|stop. Real requests consume the shared allowance. Proactive group participation stays disabled.' };
      if (input.startsWith('/') && !/^\/(?:ask|reply|decision|brief) .+/.test(input)) throw new Error('Unsupported local command; use /help. No provider call made');
      const reply = input.startsWith('/reply ');
      if (reply && (!this.previous || this.previous.binding !== this.binding(this.previous.question))) { this.previous = null; throw new Error('Prior answer or evidence is unavailable/changed. Ask a fresh explicit question'); }
      const question = input.startsWith('/decision ') ? `Draft a decision: ${input.slice(10)}` : input.startsWith('/brief ') ? `Draft a brief: ${input.slice(7)}` : input.startsWith('/ask ') ? input.slice(5) : reply ? input.slice(7) : input;
      const event = this.event(question, reply ? 'reply' : 'mention');
      if (reply && this.previous) { const { id, text, version } = this.previous; event.replyTo = id; event.replyContext = { id, text, version }; }
      if (!this.acquire()) throw new Error('Another model request is active; no input queued');
      this.previous = null; const adapter = new FakeAdapter();
      try { await this.core.handle(event, adapter); } finally { this.modelActive = false; }
      const delivery = adapter.deliveries[0];
      if (!delivery) return { kind: 'silent', text: 'No reply: invocation/pause/scope or changed-evidence boundary.' };
      const trace = this.store.traces().at(-1);
      if (trace?.outcome === 'response' && trace.result === 'delivered') { const text = delivery.text.slice(0, 3000); this.previous = { id: `local-answer-${event.id}`, text, version: digest(text), question, binding: this.binding(question) }; }
      if (delivery.proposal) return { kind: 'proposal', text: `${delivery.text}\n\nExact proposal v${delivery.proposal.proposal.version}:\n${JSON.stringify(delivery.proposal.proposal.body, null, 2)}\n\n/accept ${delivery.proposal.buttonId}`, card: delivery.proposal };
      return { kind: 'response', text: delivery.text };
    } catch (error) {
      // Only application-created messages; provider bodies are caught by core.
      return { kind: 'error', text: error instanceof Error ? error.message : 'Local request unavailable' };
    }
  }
  async close() { this.mediaController?.abort(); await this.liveWatch?.close(); }
}
