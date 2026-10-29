import { approver, eligible, type RequestEvent } from './domain.js';
import { ErrorWatch, type ErrorFeed, type WatchTick } from './error-watch.js';

// Read-only watch scheduling, not a worker/agent executor. The current host is
// local console + synthetic replay only. A real adapter needs its own access-
// checked delivery seam; this callback is synchronous and does not send remotely.
export class WatchScheduler {
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private event: RequestEvent | undefined;
  private operation: { controller: AbortController; done: Promise<void> } | undefined;
  constructor(readonly watch: ErrorWatch, readonly feed: ErrorFeed, readonly onTick: (result: WatchTick) => void) {}
  get enabled() { return !!this.event; }
  private authorize(e: RequestEvent, allowPaused = false) {
    const c = this.watch.store.config(e.projectId);
    if (!c || !eligible(allowPaused ? { ...c, paused: false } : c, e) || !approver(c, e.actor)) throw new Error('Only the configured approver can control automatic watch scheduling');
  }
  async enable(e: RequestEvent) {
    this.authorize(e); await this.shutdown(); this.authorize(e);
    if (!this.watch.activeTask(e)) throw new Error('Start a fresh configured watch first');
    this.event = structuredClone(e); this.plan(0, this.generation);
  }
  async disable(e: RequestEvent) { this.authorize(e, true); await this.shutdown(); }
  private clear() {
    this.generation++; this.event = undefined;
    if (this.timer !== undefined) clearTimeout(this.timer); this.timer = undefined;
    this.operation?.controller.abort();
  }
  async shutdown() { this.clear(); await this.operation?.done; }
  private plan(delay: number, generation: number) {
    this.timer = setTimeout(() => {
      this.timer = undefined; const e = this.event; if (!e || generation !== this.generation) return;
      const controller = new AbortController();
      const done = this.poll(e, generation, controller.signal).catch(() => { this.clear(); }).finally(() => { if (this.operation?.controller === controller) this.operation = undefined; });
      this.operation = { controller, done };
    }, Math.max(0, delay));
  }
  private async poll(e: RequestEvent, generation: number, signal: AbortSignal) {
    const tick = await this.watch.tick(e, this.feed, signal);
    if (!this.event || generation !== this.generation || signal.aborted) return;
    const valid = tick.reports.every(report => this.watch.canPublish(e, report));
    this.onTick(valid ? tick : { ...tick, status: 'SILENT', reason: 'sources_or_task_changed', reports: [] });
    if (!this.event || generation !== this.generation || signal.aborted) return;
    const task = this.watch.activeTask(e);
    if (tick.status === 'BLOCKED' || !task) { this.clear(); return; }
    this.plan(Math.max(25, task.nextPollAt - this.watch.now()), generation);
  }
}
