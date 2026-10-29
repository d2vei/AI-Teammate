import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { approver, digest, eligible, type ProjectConfig, type RequestEvent } from './domain.js';
import { sourceContext, type Source } from './sources.js';
import type { Store } from './store.js';

const ErrorGroupSchema = z.object({ id: z.string().regex(/^[\w-]{1,64}$/), count: z.number().int().min(1).max(1_000_000_000), message: z.string().min(1).max(500), scriptPath: z.string().min(1).max(150), line: z.number().int().min(1).max(150) });
// Unknown external fields are stripped before storage. This development ingress
// intentionally accepts synthetic replay only, not an unreviewed live endpoint.
export const ErrorFrameSchema = z.object({ synthetic: z.literal(true), universeId: z.string().regex(/^\d{1,20}$/), windowStart: z.iso.datetime({ offset: true }), groups: z.array(ErrorGroupSchema).max(20) }).strict();
export type ErrorFrame = z.infer<typeof ErrorFrameSchema>;
export type WatchTask = { id: string; projectId: string; platform: ProjectConfig['platform']; workspaceId: string; roomId: string; ownerId: string; universeId: string; snapshot: string; intervalMs: number; nextPollAt: number; configIdentity: string; active: boolean };
export interface ErrorFeed { readonly mode: 'replay'; read(task: WatchTask, now: number): Promise<unknown> }
export type WatchReport = { kind: 'new' | 'increased'; errorId: string; count: number; increase: number | null; sourceIds: string[]; text: string };
export type WatchTick = { status: 'REPLAY' | 'SILENT' | 'BLOCKED'; reason: string; reports: WatchReport[]; polls: number; externalPosts: 0; modelCalls: 0 };
const scopeMatches = (c: ProjectConfig | undefined, e: RequestEvent) => c && c.platform === e.platform && c.workspaceId === e.workspaceId && c.projectId === e.projectId && c.roomId === e.roomId;
const sameTaskScope = (t: WatchTask, e: RequestEvent) => t.platform === e.platform && t.workspaceId === e.workspaceId && t.projectId === e.projectId && t.roomId === e.roomId;

export class ErrorWatchLedger {
  readonly db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path); this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;
      CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, project TEXT, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS groups (task TEXT, id TEXT, window TEXT, count INTEGER, PRIMARY KEY(task,id));`);
  }
  close() { this.db.close(); }
  tasks(project: string): WatchTask[] { return this.db.prepare('SELECT json FROM tasks WHERE project=?').all(project).map(r => JSON.parse(r.json as string)); }
  put(task: WatchTask) { this.db.prepare('INSERT INTO tasks VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json').run(task.id, task.projectId, JSON.stringify(task)); }
  group(task: string, id: string): { window: string; count: number } | undefined { return this.db.prepare('SELECT window,count FROM groups WHERE task=? AND id=?').get(task, id) as { window: string; count: number } | undefined; }
  baseline(task: string, id: string, window: string, count: number) { this.db.prepare('INSERT INTO groups VALUES (?,?,?,?) ON CONFLICT(task,id) DO UPDATE SET window=excluded.window,count=excluded.count').run(task, id, window, count); }
  purge(project: string) { for (const t of this.tasks(project)) this.db.prepare('DELETE FROM groups WHERE task=?').run(t.id); this.db.prepare('DELETE FROM tasks WHERE project=?').run(project); this.db.exec('PRAGMA wal_checkpoint(TRUNCATE); VACUUM; PRAGMA wal_checkpoint(TRUNCATE);'); }
}

export class ErrorWatch {
  private active = false;
  constructor(readonly store: Store, readonly ledger: ErrorWatchLedger, readonly now = () => Date.now()) {}
  start(e: RequestEvent, universeId: string, intervalMs = 60_000): WatchTask {
    const c = this.store.config(e.projectId);
    if (!eligible(c, e) || !approver(c, e.actor) || !c.selectedSnapshot) throw new Error('Configured approver and selected snapshot required');
    if (!/^\d{1,20}$/.test(universeId) || !Number.isInteger(intervalMs) || intervalMs < 60_000 || intervalMs > 3_600_000) throw new Error('Invalid watch target or interval');
    const existing = this.ledger.tasks(e.projectId).find(t => t.active && sameTaskScope(t, e) && t.universeId === universeId);
    if (existing) { if (existing.configIdentity !== digest(c)) throw new Error('Stop the previous task before starting with changed settings'); return existing; }
    if (this.ledger.tasks(e.projectId).some(t => t.active)) throw new Error('Stop the existing project watch before selecting another target');
    const task: WatchTask = { id: randomUUID(), projectId: e.projectId, platform: e.platform, workspaceId: e.workspaceId, roomId: e.roomId, ownerId: e.actor.id, universeId, snapshot: c.selectedSnapshot, intervalMs, nextPollAt: this.now(), configIdentity: digest(c), active: true };
    this.ledger.put(task); return task;
  }
  stop(e: RequestEvent) {
    const c = this.store.config(e.projectId); if (!scopeMatches(c, e) || !c || !approver(c, e.actor)) throw new Error('Not authorized');
    for (const task of this.ledger.tasks(e.projectId).filter(t => sameTaskScope(t, e))) this.ledger.put({ ...task, active: false });
  }
  async tick(e: RequestEvent, feed: ErrorFeed): Promise<WatchTick> {
    const result = (status: WatchTick['status'], reason: string, reports: WatchReport[] = [], polls = 0): WatchTick => ({ status, reason, reports, polls, externalPosts: 0, modelCalls: 0 });
    const c = this.store.config(e.projectId);
    if (!eligible(c, e)) return result('BLOCKED', 'scope_or_pause');
    if (this.active) return result('SILENT', 'poll_active');
    if (feed.mode !== 'replay') return result('BLOCKED', 'live_feed_not_configured');
    const tasks = this.ledger.tasks(e.projectId).filter(t => t.active && sameTaskScope(t, e) && t.nextPollAt <= this.now());
    if (!tasks.length) return result('SILENT', 'not_due_or_stopped');
    this.active = true; const reports: WatchReport[] = []; let polls = 0;
    try {
      for (const task of tasks) {
        if (task.configIdentity !== digest(c) || task.snapshot !== c.selectedSnapshot) return result('BLOCKED', 'configuration_changed');
        // Reserve this interval before reading; failures do not create tight retry
        // loops or duplicate reports. Single process only, no external delivery.
        task.nextPollAt = this.now() + task.intervalMs; this.ledger.put(task); polls++;
        const frame = ErrorFrameSchema.parse(await feed.read({ ...task }, this.now()));
        const current = this.store.config(e.projectId);
        if (!eligible(current, e) || digest(current) !== task.configIdentity) return result('BLOCKED', 'configuration_changed', [], polls);
        if (frame.universeId !== task.universeId || Date.parse(frame.windowStart) > this.now() || new Set(frame.groups.map(g => g.id)).size !== frame.groups.length) return result('BLOCKED', 'invalid_error_window', [], polls);
        // Validate the whole frame before adding any selected source or baseline.
        if (frame.groups.some(g => g.scriptPath.includes('..') || !/^[\w./-]+$/.test(g.scriptPath) || /(?:api[_-]?key|password|secret|token)\s*[:=]|-----BEGIN .*PRIVATE KEY-----/i.test(g.message))) return result('BLOCKED', 'unsanitized_replay', [], polls);
        for (const group of frame.groups) {
          const previous = this.ledger.group(task.id, group.id);
          if (previous?.window === frame.windowStart && group.count < previous.count) return result('BLOCKED', 'nonmonotonic_same_window', [], polls);
        }
        for (const group of frame.groups) {
          const previous = this.ledger.group(task.id, group.id);
          const kind = !previous ? 'new' : previous.window === frame.windowStart && group.count > previous.count ? 'increased' : null;
          if (!kind) { this.ledger.baseline(task.id, group.id, frame.windowStart, group.count); continue; }
          const codeId = `code:${task.snapshot}:${digest(group.scriptPath).slice(0, 16)}`;
          const code = sourceContext(this.store.sources(e.projectId), current, group.scriptPath, this.now(), 100).find(s => s.id === codeId && s.kind === 'code' && s.text.split('\n').some(l => l.startsWith(`${group.line}: `)));
          const source: Source = { id: `log:${task.snapshot}:error:${digest([task.id, frame.windowStart, group.id, group.count]).slice(0, 24)}`, projectId: task.projectId, roomId: task.roomId, snapshot: task.snapshot, kind: 'log', label: `REPLAY synthetic error ${group.id}; count ${group.count}; window ${frame.windowStart}`, text: JSON.stringify({ mode: 'replay', universeId: task.universeId, windowStart: frame.windowStart, ...group }), contentHash: digest([frame.windowStart, group]), synthetic: true, state: 'available', observedAt: this.now() };
          this.store.addSource(source);
          this.ledger.baseline(task.id, group.id, frame.windowStart, group.count);
          const sourceIds = [source.id, ...(code ? [code.id] : [])];
          reports.push({ kind, errorId: group.id, count: group.count, increase: previous && previous.window === frame.windowStart ? group.count - previous.count : null, sourceIds, text: `[REPLAY - synthetic saved errors] ${kind === 'new' ? 'New error group' : 'Increased error group'} ${group.id}: count ${group.count}.\n[${source.id}] ${source.label}\n${code ? `[${code.id}] ${group.scriptPath}@${task.snapshot}:L${group.line}\nReferenced line: ${code.text.split('\n').find(l => l.startsWith(`${group.line}: `))}` : 'Referenced source/line unavailable; no cause inferred.'}\nSource correlation only; cause unverified. No reproduction, code change or external action performed.` });
        }
      }
      return result(reports.length ? 'REPLAY' : 'SILENT', reports.length ? 'new_or_increased_errors' : 'no_comparable_increase', reports, polls);
    } catch { return result('BLOCKED', 'replay_unavailable_or_invalid', [], polls); }
    finally { this.active = false; }
  }
  purge(e: RequestEvent) { const c = this.store.config(e.projectId); if (!scopeMatches(c, e) || !c || !approver(c, e.actor)) throw new Error('Not authorized'); this.ledger.purge(e.projectId); }
}

export class SyntheticErrorFeed implements ErrorFeed {
  readonly mode = 'replay' as const; private index = 0;
  async read(task: WatchTask, now: number): Promise<ErrorFrame> {
    const frame = Math.min(this.index++, 2);
    return { synthetic: true, universeId: task.universeId, windowStart: new Date(Math.floor(now / 86_400_000) * 86_400_000).toISOString(), groups: [{ id: 'synthetic-route-error', count: frame < 2 ? 2 : 5, message: 'Synthetic party-route failure observation.', scriptPath: 'party-route.ts', line: 3 }] };
  }
}
