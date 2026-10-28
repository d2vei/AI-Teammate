import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { ProjectConfigSchema, digest, type ProjectConfig, type RequestEvent, type Usage } from './domain.js';

export type Trace = { eventKey: string; at: number; result: string; model: string; mode: string; prompt: string; config: string; sources: string[]; requestId?: string | null; usage?: Usage | null };
export class Store {
  readonly db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path); this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000;
      CREATE TABLE IF NOT EXISTS configs (id TEXT PRIMARY KEY, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS charges (id TEXT PRIMARY KEY, micros INTEGER NOT NULL, state TEXT NOT NULL, usage TEXT);
      CREATE TABLE IF NOT EXISTS traces (id INTEGER PRIMARY KEY, json TEXT NOT NULL);
      PRAGMA user_version=1;`);
  }
  close() { this.db.close(); }
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const value = fn(); this.db.exec('COMMIT'); return value; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  putConfig(input: ProjectConfig) {
    const c = ProjectConfigSchema.parse(input);
    if (c.approverIds.some(x => !c.memberIds.includes(x))) throw new Error('Approvers must be project members');
    const previous = this.config(c.projectId);
    c.revision = previous ? previous.revision + 1 : 1;
    this.db.prepare('INSERT INTO configs VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET json=excluded.json').run(c.projectId, JSON.stringify(c));
  }
  config(id: string): ProjectConfig | undefined {
    const row = this.db.prepare('SELECT json FROM configs WHERE id=?').get(id);
    return row ? ProjectConfigSchema.parse(JSON.parse(row.json as string)) : undefined;
  }
  eventKey(e: RequestEvent) { return digest([e.platform, e.workspaceId, e.roomId, e.id]); }
  claim(e: RequestEvent, now: number): boolean { return this.db.prepare('INSERT OR IGNORE INTO events VALUES (?, ?)').run(this.eventKey(e), now).changes === 1; }
  budgetUsed(): number { return Number(this.db.prepare('SELECT COALESCE(SUM(micros),0) AS n FROM charges').get()!.n) / 1e6; }
  reserve(capUsd: number, micros: number): string | null {
    return this.transaction(() => {
      if (!Number.isFinite(capUsd) || capUsd <= 0 || capUsd > 120 || this.budgetUsed() + micros / 1e6 > capUsd) return null;
      const id = randomUUID(); this.db.prepare('INSERT INTO charges VALUES (?, ?, ?, NULL)').run(id, micros, 'uncertain'); return id;
    });
  }
  settle(id: string, usage: Usage | null) {
    if (!usage || !Number.isSafeInteger(usage.inputTokens) || !Number.isSafeInteger(usage.outputTokens) || usage.inputTokens < 0 || usage.outputTokens < 0) return;
    const micros = Math.ceil(usage.inputTokens * 1.25 + usage.outputTokens * 4.25);
    this.db.prepare('UPDATE charges SET micros=?, state=?, usage=? WHERE id=?').run(micros, 'reported', JSON.stringify(usage), id);
  }
  trace(trace: Trace) { this.db.prepare('INSERT INTO traces(json) VALUES (?)').run(JSON.stringify(trace)); }
  traces(): Trace[] { return this.db.prepare('SELECT json FROM traces ORDER BY id').all().map(row => JSON.parse(row.json as string) as Trace); }
}
