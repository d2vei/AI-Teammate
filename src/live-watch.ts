import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Teammate } from './core.js';
import { ReplySchema, digest, eligible, type Adapter, type ContextItem, type Provider, type RequestEvent } from './domain.js';
import { ErrorFrameSchema, ErrorWatch, type ErrorFeed, type ErrorFrame, type WatchReport, type WatchTask, type WatchTick } from './error-watch.js';
import { WatchScheduler } from './watch-scheduler.js';
import { sourceContext } from './sources.js';
import type { HarnessOutput } from './local-harness.js';

export class SavedSyntheticReplay implements ErrorFeed {
  readonly mode = 'replay' as const; readonly frames: ErrorFrame[];
  constructor() {
    const bytes = readFileSync(new URL('../examples/error-watch-replay.json', import.meta.url)); if (bytes.length > 100000) throw new Error('Replay too large');
    const raw = JSON.parse(bytes.toString('utf8')); if (!Array.isArray(raw) || !raw.length || raw.length > 100) throw new Error('Replay invalid');
    this.frames = raw.map(r => ErrorFrameSchema.parse(r));
  }
  async read(task: WatchTask) { return structuredClone(this.frames[Math.min(Math.max((task.pollSequence ?? 1) - 1, 0), this.frames.length - 1)]!); }
}

// Scope/persistence/change detection stay in ErrorWatch. This layer adds one
// bounded Meta explanation per changed poll, only after an owner starts it.
export class LiveReplayWatch {
  readonly scheduler: WatchScheduler; private generation = 0; private jobs = new Set<Promise<unknown>>();
  constructor(readonly watch: ErrorWatch, readonly feed: ErrorFeed, readonly provider: Provider, readonly capUsd: number, readonly slot: { acquire(): boolean; release(): void }, readonly emit: (result: HarnessOutput) => void) {
    if (provider.mode !== 'meta' || !Number.isFinite(capUsd) || capUsd <= 0 || capUsd > 5) throw new Error('Live watch needs Meta and an authorized shared cap');
    this.scheduler = new WatchScheduler(watch, feed, result => {
      const event = this.autoEvent; if (!event) return; const generation = this.generation;
      const job = this.explain(event, result).then(output => { if (generation === this.generation && this.scheduler.enabled && result.reports.every(r => this.watch.canPublish(event, r))) this.emit(output); }).catch(() => { if (generation === this.generation) this.emit({ kind: 'error', text: 'Replay watch diagnosis unavailable; no automatic retry.' }); });
      this.jobs.add(job); void job.finally(() => this.jobs.delete(job));
    });
  }
  private autoEvent: RequestEvent | undefined;
  start(e: RequestEvent, minutes: number) { return this.watch.start(e, '424242', minutes * 60000); }
  async enable(e: RequestEvent) { await this.scheduler.enable(e); this.autoEvent = structuredClone(e); }
  async disable(e: RequestEvent) { await this.scheduler.disable(e); this.generation++; this.autoEvent = undefined; }
  async stop(e: RequestEvent) { this.watch.stop(e); await this.suspend(); }
  async suspend() { this.generation++; this.autoEvent = undefined; await this.scheduler.shutdown(); }
  async close() { await this.suspend(); await Promise.allSettled([...this.jobs]); }
  async purge(e: RequestEvent) { await this.suspend(); this.watch.purge(e); }
  async poll(e: RequestEvent) { if (this.scheduler.enabled) return { kind: 'error', text: 'Automatic watch is on; turn it off before a manual poll.' } as HarnessOutput; return this.explain(e, await this.watch.tick(e, this.feed)); }
  private async explain(e: RequestEvent, tick: WatchTick): Promise<HarnessOutput> {
    if (!tick.reports.length) return { kind: tick.status === 'BLOCKED' ? 'error' : 'silent', text: `REPLAY watch: ${tick.reason}. No Meta diagnosis requested.` };
    const report = tick.reports[0]!; const generation = this.generation;
    const current = () => generation === this.generation && tick.reports.every(r => this.watch.canPublish(e, r));
    if (!current()) return { kind: 'silent', text: 'Replay watch evidence/task changed; report withheld.' };
    const facts = tick.reports.map(r => r.text).join('\n\n');
    if (!this.slot.acquire()) return { kind: 'response', text: `${facts}\n\nMeta diagnosis skipped: another request is active. No retry or queued spending; ask about the observation later.` };
    try {
      const base = this.provider;
      const answersOnly: Provider = { mode: base.mode, model: base.model, ...(base.promptVersion ? { promptVersion: base.promptVersion } : {}), generate: async input => { const result = await base.generate(input); const parsed = ReplySchema.safeParse(result.output); return { ...result, output: parsed.success ? { answer: parsed.data.answer, citations: parsed.data.citations } : result.output }; } };
      const store = this.watch.store; const watch = this.watch;
      class ReportCore extends Teammate {
        override context(event: RequestEvent): ContextItem[] {
          const config = store.config(event.projectId); if (!eligible(config, event) || !watch.canPublish(event, report)) return [];
          return [...super.context(event).filter(c => c.kind === 'approved_decision'), ...sourceContext(store.sources(event.projectId).filter(s => report.sourceIds.includes(s.id)), config, event.text, watch.now(), report.sourceIds.length)];
        }
      }
      let answer = ''; const adapter: Adapter = { canDeliver: async () => current(), send: async (_event, delivery) => { if (current() && !delivery.proposal) answer = delivery.text; } };
      const event: RequestEvent = { ...structuredClone(e), id: randomUUID(), version: digest(report.sourceBindings), invocation: 'action', text: `Explain this new/increased REPLAY synthetic error ${report.errorId}, count ${report.count}. Use the supplied error observation and selected code, separate facts from a possible cause, and give one next check. If the referenced line is unavailable, say so. Do not draft a proposal or claim reproduction/execution.`, replyTo: null, replyContext: null };
      await new ReportCore(store, answersOnly, this.capUsd, this.watch.now).handle(event, adapter);
      if (!current()) return { kind: 'silent', text: 'Replay watch evidence/task changed during diagnosis; report withheld.' };
      return { kind: 'response', text: `${facts}\n\n[Meta diagnosis of REPLAY, not a real game]\n${answer || 'Diagnosis withheld; no answer accepted and no automatic retry.'}${tick.reports.length > 1 ? '\nOnly the first changed group received a Meta diagnosis in this poll.' : ''}` };
    } finally { this.slot.release(); }
  }
}
