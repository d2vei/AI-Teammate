import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { ProjectConfigSchema, ProposalBodySchema, approver, eligible, digest, type ContextItem, type ProjectConfig, type Proposal, type ProposalBody, type ProposalCard, type RequestEvent, type SavedDecision, type SavedBrief, type SavedRecord, type Usage } from './domain.js';
import { sourceContext, type Source } from './sources.js';

export type Trace = { eventKey: string; at: number; result: string; model: string; mode: string; prompt: string; config: string; sources: string[]; requestId?: string | null; usage?: Usage | null };
export class Store {
  readonly db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    if (Number(this.db.prepare('PRAGMA user_version').get()!.user_version) > 3) { this.db.close(); throw new Error('Database version is newer than this app'); }
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000;
      CREATE TABLE IF NOT EXISTS configs (id TEXT PRIMARY KEY, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS charges (id TEXT PRIMARY KEY, micros INTEGER NOT NULL, state TEXT NOT NULL, usage TEXT);
      CREATE TABLE IF NOT EXISTS traces (id INTEGER PRIMARY KEY, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS proposals (id TEXT PRIMARY KEY, project TEXT NOT NULL, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS decisions (id TEXT PRIMARY KEY, project TEXT NOT NULL, status TEXT NOT NULL, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS briefs (id TEXT PRIMARY KEY, project TEXT NOT NULL, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sources (id TEXT NOT NULL, project TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY (id, project));
      PRAGMA user_version=3;`);
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
  proposal(id: string): Proposal | undefined { const row = this.db.prepare('SELECT json FROM proposals WHERE id=?').get(id); return row ? JSON.parse(row.json as string) as Proposal : undefined; }
  private putProposal(p: Proposal) { this.db.prepare('INSERT INTO proposals VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET json=excluded.json').run(p.id, p.projectId, JSON.stringify(p)); }
  card(p: Proposal): ProposalCard { const { state: _state, ...binding } = p; return { proposal: p, buttonId: `accept:${p.id}:${p.version}:${digest(binding).slice(0, 20)}` }; }
  propose(e: RequestEvent, body: ProposalBody, context: ContextItem[], now: number): ProposalCard {
    const config = this.config(e.projectId); if (!eligible(config, e)) throw new Error('Not authorized');
    const parsed = ProposalBodySchema.parse(body);
    if (parsed.sourceIds.some(id => !context.some(c => c.id === id))) throw new Error('Invalid proposal source');
    if (parsed.kind === 'brief' && parsed.decisionIds.some(id => !context.some(c => c.id === id && c.kind === 'approved_decision'))) throw new Error('Brief decisions must be approved');
    const ids = [...new Set([...parsed.sourceIds, ...(parsed.kind === 'brief' ? parsed.decisionIds : [])])];
    const sourceBindings = Object.fromEntries(ids.map(id => [id, context.find(c => c.id === id)!.identity]));
    const p: Proposal = { id: randomUUID(), projectId: e.projectId, platform: e.platform, workspaceId: e.workspaceId, roomId: e.roomId, proposerId: e.actor.id, approverIds: config.approverIds, origin: { id: e.id, version: e.version, messageId: e.sourceMessageId ?? null }, body: parsed, version: 1, createdAt: now, expiresAt: now + 15 * 60_000, state: 'awaiting_approval', configIdentity: digest(config), targetSnapshot: config.selectedSnapshot, sourceBindings };
    this.putProposal(p); return this.card(p);
  }
  pending(projectId: string): Proposal[] { return this.db.prepare('SELECT json FROM proposals WHERE project=?').all(projectId).map(row => JSON.parse(row.json as string) as Proposal).filter(p => p.state === 'awaiting_approval'); }
  accept(e: RequestEvent, buttonId: string, now: number): SavedRecord {
    return this.transaction(() => {
      const p = this.proposal(buttonId.split(':')[1] ?? ''); const c = this.config(e.projectId);
      // APPROVAL_AUTHORITY_GATE: negative-control test mutates this single gate in an expendable copy.
      if (!p || !eligible(c, e) || !approver(c, e.actor) || !p.approverIds.includes(e.actor.id) || p.projectId !== e.projectId || p.roomId !== e.roomId || p.workspaceId !== e.workspaceId || p.platform !== e.platform) throw new Error('Not authorized');
      if (this.card(p).buttonId !== buttonId) throw new Error('Proposal changed; request a new card');
      if (p.state === 'cancelled') throw new Error('Proposal cancelled');
      if (p.state === 'accepted') {
        const row = this.db.prepare(`SELECT json FROM ${p.body.kind === 'decision' ? 'decisions' : 'briefs'} WHERE id=?`).get(p.id);
        const existing = row ? JSON.parse(row.json as string) as SavedRecord : undefined;
        if (!existing) throw new Error('Record withdrawn or unavailable'); return existing;
      }
      if (p.expiresAt <= now) throw new Error('Proposal expired; request a new card');
      if (digest(c) !== p.configIdentity || c.selectedSnapshot !== p.targetSnapshot) throw new Error('Configuration or source target changed');
      if (!this.bindingsValid(p.projectId, p.sourceBindings, now)) throw new Error('A proposal source changed or is unavailable');
      const metadata = { id: p.id, projectId: p.projectId, proposerId: p.proposerId, approverId: e.actor.id, origin: p.origin, version: p.version, savedAt: now, snapshot: p.targetSnapshot, sourceBindings: p.sourceBindings };
      const record: SavedRecord = p.body.kind === 'decision' ? { ...p.body, ...metadata, status: 'approved' } : { ...p.body, ...metadata, status: 'saved' };
      if (record.kind === 'decision') this.db.prepare('INSERT INTO decisions VALUES (?, ?, ?, ?)').run(record.id, record.projectId, 'approved', JSON.stringify(record));
      else this.db.prepare('INSERT INTO briefs VALUES (?, ?, ?)').run(record.id, record.projectId, JSON.stringify(record));
      p.state = 'accepted'; this.putProposal(p); return record;
    });
  }
  revise(e: RequestEvent, id: string, body: ProposalBody, now: number): ProposalCard {
    const p = this.proposal(id); const c = this.config(e.projectId);
    if (!p || !eligible(c, e) || p.projectId !== e.projectId || (p.proposerId !== e.actor.id && !approver(c, e.actor)) || p.state !== 'awaiting_approval') throw new Error('Not authorized');
    if (body.sourceIds.length > 0 || (body.kind === 'brief' && body.decisionIds.length > 0)) throw new Error('Source revision requires a new proposal');
    p.body = ProposalBodySchema.parse(body); p.version++; p.expiresAt = now + 15 * 60_000; p.configIdentity = digest(c); p.targetSnapshot = c.selectedSnapshot; p.sourceBindings = {}; this.putProposal(p); return this.card(p);
  }
  cancel(e: RequestEvent, id: string) {
    const p = this.proposal(id); const c = this.config(e.projectId);
    if (!p || !eligible(c, e) || p.projectId !== e.projectId || (p.proposerId !== e.actor.id && !approver(c, e.actor)) || p.state !== 'awaiting_approval') throw new Error('Not authorized');
    p.state = 'cancelled'; this.putProposal(p);
  }
  decisions(projectId: string): SavedDecision[] { return this.db.prepare("SELECT json FROM decisions WHERE project=? AND status='approved' ORDER BY rowid DESC LIMIT 20").all(projectId).map(row => JSON.parse(row.json as string) as SavedDecision); }
  briefs(projectId: string): SavedBrief[] { return this.db.prepare('SELECT json FROM briefs WHERE project=? ORDER BY rowid DESC LIMIT 10').all(projectId).map(row => JSON.parse(row.json as string) as SavedBrief); }
  tombstones(projectId: string): { id: string; statement?: string }[] { return this.db.prepare("SELECT json FROM decisions WHERE project=? AND status='withdrawn'").all(projectId).map(row => JSON.parse(row.json as string)); }
  withdraw(e: RequestEvent, id: string) {
    const c = this.config(e.projectId); if (!eligible(c, e) || !approver(c, e.actor)) throw new Error('Not authorized');
    this.transaction(() => {
      const row = this.db.prepare('SELECT json FROM decisions WHERE id=? AND project=?').get(id, e.projectId); if (!row) throw new Error('Decision unavailable');
      const original = JSON.parse(row.json as string) as SavedDecision;
      const tombstone = { id, status: 'withdrawn', priorHash: digest(original), withdrawnBy: e.actor.id, version: original.version + 1 };
      this.db.prepare('UPDATE decisions SET status=?, json=? WHERE id=?').run('withdrawn', JSON.stringify(tombstone), id);
      // Erase duplicate retained proposal text along with the authoritative record.
      this.db.prepare('DELETE FROM proposals WHERE id=?').run(id);
    });
  }
  sources(projectId: string): Source[] { return this.db.prepare('SELECT json FROM sources WHERE project=?').all(projectId).map(row => JSON.parse(row.json as string) as Source); }
  addSource(source: Source) {
    const row = this.db.prepare('SELECT json FROM sources WHERE project=? AND id=?').get(source.projectId, source.id);
    if (row) { if ((JSON.parse(row.json as string) as Source).contentHash !== source.contentHash) throw new Error('Source ID is immutable; use a new snapshot'); return; }
    this.db.prepare('INSERT INTO sources VALUES (?, ?, ?)').run(source.id, source.projectId, JSON.stringify(source));
  }
  sourceState(projectId: string, id: string, state: 'stale' | 'deleted') {
    const source = this.sources(projectId).find(s => s.id === id); if (!source) throw new Error('Source unavailable');
    source.state = state; source.text = ''; this.db.prepare('UPDATE sources SET json=? WHERE project=? AND id=?').run(JSON.stringify(source), projectId, id);
  }
  bindingsValid(projectId: string, bindings: Record<string, string>, now: number, visiting: string[] = []): boolean {
    const config = this.config(projectId); if (!config) return false;
    return Object.entries(bindings).every(([id, identity]) => {
      if (id.startsWith('decision:')) {
        const target = id.slice('decision:'.length); if (visiting.includes(target)) return false;
        const row = this.db.prepare("SELECT json FROM decisions WHERE id=? AND project=? AND status='approved'").get(target, projectId);
        if (!row) return false; const d = JSON.parse(row.json as string) as SavedDecision;
        return digest(d) === identity && this.bindingsValid(projectId, d.sourceBindings, now, [...visiting, target]);
      }
      if (id.startsWith('proposal:')) { const p = this.proposal(id.slice('proposal:'.length)); return !!p && p.projectId === projectId && p.state === 'awaiting_approval' && p.expiresAt > now && digest(p) === identity; }
      return sourceContext(this.sources(projectId), config, '', now, 100).some(c => c.kind !== 'missing_evidence' && c.id === id && c.identity === identity);
    });
  }
}
