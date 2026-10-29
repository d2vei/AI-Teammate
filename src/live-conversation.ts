import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { approver, digest, eligible, type Provider } from './domain.js';
import { FakeAdapter } from './fakes.js';
import { LocalHarness, type HarnessOutput } from './local-harness.js';
import { BundleSchema, ingestBundle } from './sources.js';
import type { Store } from './store.js';

// The local operator can role-play both participants. This is not platform
// authentication, a group study, or a connection to a messaging service.
export class LiveConversation extends LocalHarness {
  private previous: { id: string; text: string; version: string; question: string; binding: string } | null = null;
  constructor(store: Store, provider: Provider, capUsd: number, now = () => Date.now()) {
    if (provider.mode !== 'meta' || !Number.isFinite(capUsd) || capUsd <= 0 || capUsd > 5) throw new Error('Live conversation requires Meta and the shared authorized cap');
    super(store, provider, capUsd, now); this.checkScope();
  }
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
        const c = this.owner(); this.previous = null; this.store.purgeProject(this.projectId);
        if (input.startsWith('/forget')) return { kind: 'status', text: 'This local project content was deleted and paused. Shared spending charges remain. Use /reset-demo CONFIRM for a new synthetic fixture.' };
        const bundle = BundleSchema.parse(JSON.parse(readFileSync(new URL('../examples/party-queue.json', import.meta.url), 'utf8')));
        bundle.snapshot = `live-demo-${randomUUID()}`; bundle.logs = bundle.logs.map(l => ({ ...l, at: new Date(this.now()).toISOString() }));
        this.store.putConfig({ ...c, paused: false, selectedSnapshot: bundle.snapshot }); ingestBundle(this.store, this.projectId, bundle, this.now());
        return { kind: 'status', text: 'New synthetic fixture selected; zero approved decisions/briefs. Shared spending charges retained. Synthetic log times were rebased for this explicit demo reset.' };
      }
      if (input === '/sources') return { kind: 'status', text: JSON.stringify(this.core.context(this.event('Inspect local evidence')).map(({ id, kind, label, text }) => ({ id, kind, label, text })), null, 2) };
      if (/^\/(?:as |accept |withdraw )/.test(input) || ['/status', '/pause', '/resume'].includes(input) || input.startsWith('/ambient ')) return await super.line(input);
      if (!input || input === '/help') return { kind: 'status', text: 'Use /ask TEXT, /reply TEXT, /decision TEXT, /brief TEXT, /accept EXACT-TOKEN, /as owner|peer, /status, /sources, /pause, /resume, /withdraw ID, /ambient TEXT, /forget-local-data CONFIRM, /reset-demo CONFIRM or /quit. Real requests consume the shared allowance. No participation/media/watch route is enabled here.' };
      if (input.startsWith('/') && !/^\/(?:ask|reply|decision|brief) .+/.test(input)) throw new Error('Unsupported local command; use /help. No provider call made');
      const reply = input.startsWith('/reply ');
      if (reply && (!this.previous || this.previous.binding !== this.binding(this.previous.question))) { this.previous = null; throw new Error('Prior answer or evidence is unavailable/changed. Ask a fresh explicit question'); }
      const question = input.startsWith('/decision ') ? `Draft a decision: ${input.slice(10)}` : input.startsWith('/brief ') ? `Draft a brief: ${input.slice(7)}` : input.startsWith('/ask ') ? input.slice(5) : reply ? input.slice(7) : input;
      const event = this.event(question, reply ? 'reply' : 'mention');
      if (reply && this.previous) { const { id, text, version } = this.previous; event.replyTo = id; event.replyContext = { id, text, version }; }
      this.previous = null; const adapter = new FakeAdapter(); await this.core.handle(event, adapter);
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
}
