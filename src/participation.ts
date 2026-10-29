import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { approver, digest, eligible, type ContextItem, type ProjectConfig, type RequestEvent } from './domain.js';
import { sourceContext } from './sources.js';
import type { Store } from './store.js';

// Experimental, platform-independent SHADOW policy. This module has no transport,
// scheduler, shell or execution capability, and is not loaded by the bot/core.
const statuses = ['incorrect_fact', 'missing_fact', 'misattribution', 'conflict', 'uncertainty', 'underspecified_plan', 'forgotten_constraint', 'goal_drift', 'discussion_loop', 'participation_imbalance', 'risky_commitment', 'on_track', 'off_topic_social', 'unanswerable'] as const;
export const MonitorSchema = z.object({ status: z.enum(statuses), claim: z.string().max(160), evidenceIds: z.array(z.string().min(1).max(200)).max(6), confidence: z.number().min(0).max(1) }).strict();
export const RepairSchema = z.object({ resolved: z.array(z.object({ claimKey: z.string(), messageId: z.string(), quote: z.string().min(8).max(400) }).strict()).max(12) }).strict();
export const GenerationSchema = z.object({ text: z.string().min(1).max(240), evidenceIds: z.array(z.string()).min(1).max(4) }).strict();
const SettingsSchema = z.object({ mode: z.enum(['off', 'shadow']), delivery: z.enum(['hand_raise', 'direct']), persistence: z.number().int().min(2).max(8), confidence: z.number().min(0.5).max(1), cooldownMs: z.number().int().min(60_000).max(86_400_000), invitationMs: z.number().int().min(60_000).max(600_000), blockedMoves: z.array(z.enum(['constraint_reminder', 'clarification', 'loop_breaking'])).max(3) }).strict();
export type ParticipationSettings = z.infer<typeof SettingsSchema>;
export const defaultParticipation: ParticipationSettings = { mode: 'off', delivery: 'hand_raise', persistence: 3, confidence: 0.85, cooldownMs: 600_000, invitationMs: 600_000, blockedMoves: [] };
export type RecentMessage = Pick<RequestEvent, 'id' | 'platform' | 'workspaceId' | 'projectId' | 'roomId' | 'version' | 'text'> & { actorId: string; at: number };
type Claim = { key: string; claim: string; status: string; count: number; lastAt: number; resolved: boolean; said: boolean; lastInterventionAt: number | null; bindings: Record<string, string>; configIdentity: string };
type Offer = { token: string; scope: string; claimKey: string; eventId: string; eventIdentity: string; expiresAt: number; configIdentity: string; bindings: Record<string, string>; consumed: boolean };
export type ParticipationInput = { messages: RecentMessage[]; evidence: ContextItem[]; openClaims: Pick<Claim, 'key' | 'claim' | 'status'>[] };
export interface ParticipationReasoner {
  readonly mode: 'mock' | 'meta'; readonly model: string;
  monitor(input: ParticipationInput): Promise<unknown>;
  selfRepair(input: ParticipationInput): Promise<unknown>;
  generate(input: ParticipationInput & { finding: z.infer<typeof MonitorSchema> }): Promise<unknown>;
}
export type ParticipationDecision = { action: 'SILENT' | 'HAND_RAISE' | 'POST'; reason: string; eventId: string; shadow: true; evidenceIds: string[]; claimKey?: string; offerToken?: string; expiresAt?: number; text?: string };
const scopeOf = (e: Pick<RequestEvent, 'platform' | 'workspaceId' | 'projectId' | 'roomId'>) => digest([e.platform, e.workspaceId, e.projectId, e.roomId]);
const normalize = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const eventIdentity = (e: RequestEvent) => digest([e.id, e.version, e.actor.id, e.text]);
const moveFor = (status: string) => status === 'forgotten_constraint' ? 'constraint_reminder' : ['uncertainty', 'underspecified_plan'].includes(status) ? 'clarification' : status === 'discussion_loop' ? 'loop_breaking' : null;

// Separate experimental ledger: never opens/migrates the production database.
// Only short claim names, evidence identities and decision metadata are persisted;
// chat windows, generated text and media bytes are not. purge() erases this data.
export class ParticipationLedger {
  readonly db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;
      CREATE TABLE IF NOT EXISTS settings (scope TEXT PRIMARY KEY, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS claims (scope TEXT, key TEXT, json TEXT NOT NULL, PRIMARY KEY(scope,key));
      CREATE TABLE IF NOT EXISTS seen (scope TEXT, event TEXT, PRIMARY KEY(scope,event));
      CREATE TABLE IF NOT EXISTS offers (token TEXT PRIMARY KEY, scope TEXT, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS reasons (id INTEGER PRIMARY KEY, scope TEXT, json TEXT NOT NULL);`);
  }
  close() { this.db.close(); }
  settings(scope: string): ParticipationSettings { const row = this.db.prepare('SELECT json FROM settings WHERE scope=?').get(scope); return row ? SettingsSchema.parse(JSON.parse(row.json as string)) : { ...defaultParticipation }; }
  putSettings(scope: string, settings: ParticipationSettings) { this.db.prepare('INSERT INTO settings VALUES (?,?) ON CONFLICT(scope) DO UPDATE SET json=excluded.json').run(scope, JSON.stringify(SettingsSchema.parse(settings))); }
  claim(scope: string, key: string): Claim | undefined { return this.claims(scope).find(c => c.key === key); }
  claims(scope: string): Claim[] { return this.db.prepare('SELECT json FROM claims WHERE scope=?').all(scope).map(r => JSON.parse(r.json as string)); }
  putClaim(scope: string, claim: Claim) { this.db.prepare('INSERT INTO claims VALUES (?,?,?) ON CONFLICT(scope,key) DO UPDATE SET json=excluded.json').run(scope, claim.key, JSON.stringify(claim)); }
  seen(scope: string, eventId: string): boolean { return this.db.prepare('INSERT OR IGNORE INTO seen VALUES (?,?)').run(scope, digest(eventId)).changes === 0; }
  putOffer(offer: Offer) { this.db.prepare('INSERT INTO offers VALUES (?,?,?)').run(offer.token, offer.scope, JSON.stringify(offer)); }
  offer(token: string): Offer | undefined { const r = this.db.prepare('SELECT json FROM offers WHERE token=?').get(token); return r ? JSON.parse(r.json as string) : undefined; }
  pending(scope: string, claimKey: string, now: number): boolean { return this.db.prepare('SELECT json FROM offers WHERE scope=?').all(scope).some(r => { const o = JSON.parse(r.json as string) as Offer; return o.claimKey === claimKey && !o.consumed && o.expiresAt > now; }); }
  consume(token: string): boolean {
    this.db.exec('BEGIN IMMEDIATE');
    try { const offer = this.offer(token); if (!offer || offer.consumed) { this.db.exec('COMMIT'); return false; } offer.consumed = true; this.db.prepare('UPDATE offers SET json=? WHERE token=?').run(JSON.stringify(offer), token); this.db.exec('COMMIT'); return true; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  log(scope: string, decision: ParticipationDecision, mode: string, model: string) {
    // No generated response or invitation token in the persistent explanation log.
    const { text: _text, offerToken: _token, ...metadata } = decision;
    this.db.prepare('INSERT INTO reasons(scope,json) VALUES (?,?)').run(scope, JSON.stringify({ ...metadata, mode, model })); return decision;
  }
  reasons(scope: string): ParticipationDecision[] { return this.db.prepare('SELECT json FROM reasons WHERE scope=? ORDER BY id').all(scope).map(r => JSON.parse(r.json as string)); }
  purge(scope: string) { for (const table of ['claims', 'seen', 'offers', 'reasons', 'settings']) this.db.prepare(`DELETE FROM ${table} WHERE scope=?`).run(scope); this.db.exec('PRAGMA wal_checkpoint(TRUNCATE); VACUUM; PRAGMA wal_checkpoint(TRUNCATE);'); }
}

export class ParticipationPolicy {
  private active = false;
  constructor(readonly store: Store, readonly ledger: ParticipationLedger, readonly reasoner: ParticipationReasoner, readonly now = () => Date.now()) {}
  configure(e: RequestEvent, settings: ParticipationSettings) {
    const c = this.store.config(e.projectId); if (!eligible(c, e) || !approver(c, e.actor)) throw new Error('Only a configured approver can change participation settings');
    this.ledger.putSettings(scopeOf(e), settings);
  }
  private member(e: RequestEvent): ProjectConfig | undefined {
    const c = this.store.config(e.projectId);
    return c && !c.paused && c.projectId === e.projectId && c.platform === e.platform && c.workspaceId === e.workspaceId && c.roomId === e.roomId && c.memberIds.includes(e.actor.id) ? c : undefined;
  }
  private context(e: RequestEvent, recent: RecentMessage[]): ParticipationInput {
    const c = this.member(e); if (!c) return { messages: [], evidence: [], openClaims: [] };
    const messages = recent.filter(m => scopeOf(m) === scopeOf(e) && c.memberIds.includes(m.actorId) && m.at <= this.now() && m.at >= this.now() - 3_600_000).slice(-12).map(m => ({ ...m, text: m.text.slice(0, 2000) }));
    const evidence: ContextItem[] = [
      ...messages.map(m => ({ id: `message:${m.id}`, kind: 'message', label: `message ${m.id} v${m.version}`, text: m.text, identity: digest(m) })),
      ...sourceContext(this.store.sources(e.projectId), c, e.text, this.now()).filter(s => s.kind !== 'missing_evidence'),
      ...this.store.decisions(e.projectId).filter(d => this.store.bindingsValid(e.projectId, d.sourceBindings, this.now())).slice(0, 8).map(d => ({ id: `decision:${d.id}`, kind: 'approved_decision', label: `Approved decision v${d.version}; source ${d.origin.id}`, text: d.statement, identity: digest(d) })),
    ];
    return { messages, evidence, openClaims: this.ledger.claims(scopeOf(e)).filter(c => !c.resolved && !c.said && this.now() - c.lastAt <= 600_000).slice(-12).map(({ key, claim, status }) => ({ key, claim, status })) };
  }
  private identity(e: RequestEvent) { return digest([this.store.config(e.projectId), this.ledger.settings(scopeOf(e))]); }
  private valid(e: RequestEvent, bindings: Record<string, string>, identity: string, recent: () => RecentMessage[]) {
    if (!this.member(e) || this.identity(e) !== identity) return false;
    const context = this.context(e, recent());
    return context.messages.some(m => m.id === e.id && m.version === e.version && m.actorId === e.actor.id && m.text === e.text) && Object.entries(bindings).every(([id, hash]) => context.evidence.some(c => c.id === id && c.identity === hash));
  }
  private applyRepairs(scope: string, repair: z.infer<typeof RepairSchema>, messages: RecentMessage[]) {
    for (const fix of repair.resolved) {
      const claim = this.ledger.claim(scope, fix.claimKey);
      const message = messages.slice(-3).find(m => m.id === fix.messageId && m.text.includes(fix.quote));
      if (claim && message) { claim.resolved = true; this.ledger.putClaim(scope, claim); }
    }
  }
  private record(e: RequestEvent, action: ParticipationDecision['action'], reason: string, extras: Partial<ParticipationDecision> = {}): ParticipationDecision {
    return this.ledger.log(scopeOf(e), { action, reason, eventId: e.id, shadow: true, evidenceIds: [], ...extras }, this.reasoner.mode, this.reasoner.model);
  }
  async observe(e: RequestEvent, recent: () => RecentMessage[]): Promise<ParticipationDecision> {
    if (!this.member(e)) return { action: 'SILENT', reason: 'scope_or_pause', eventId: e.id, shadow: true, evidenceIds: [] };
    if (e.invocation !== 'ambient') return this.record(e, 'SILENT', 'separate_direct_path');
    const scope = scopeOf(e); const settings = this.ledger.settings(scope);
    if (settings.mode !== 'shadow') return this.record(e, 'SILENT', 'mentions_only');
    if (this.active) return this.record(e, 'SILENT', 'busy');
    if (this.ledger.seen(scope, e.id)) return this.record(e, 'SILENT', 'duplicate_event');
    const input = this.context(e, recent()); const identity = this.identity(e);
    if (!input.messages.some(m => m.id === e.id && m.version === e.version && m.actorId === e.actor.id && m.text === e.text) || Buffer.byteLength(JSON.stringify(input)) > 24000) return this.record(e, 'SILENT', 'missing_or_oversized_context');
    this.active = true;
    try {
      // Independent observations, never posting authority. A future paid provider
      // must serialize/reserve calls using the shared live budget before dispatch.
      const [rawMonitor, rawRepair] = await Promise.all([this.reasoner.monitor(structuredClone(input)), this.reasoner.selfRepair(structuredClone(input))]);
      const finding = MonitorSchema.parse(rawMonitor); const repair = RepairSchema.parse(rawRepair);
      if (!this.member(e) || this.identity(e) !== identity || digest(this.context(e, recent()).evidence) !== digest(input.evidence)) return this.record(e, 'SILENT', 'context_changed');
      this.applyRepairs(scope, repair, input.messages);
      const move = moveFor(finding.status);
      if (!move) return this.record(e, 'SILENT', ['on_track', 'off_topic_social', 'unanswerable'].includes(finding.status) ? finding.status : 'move_not_implemented');
      if (settings.blockedMoves.includes(move)) return this.record(e, 'SILENT', 'channel_steering');
      const name = normalize(finding.claim); if (name.length < 3 || finding.confidence < settings.confidence) return this.record(e, 'SILENT', 'low_confidence_or_empty_claim');
      const ids = [...new Set(finding.evidenceIds)];
      if (!ids.length || ids.some(id => !input.evidence.some(c => c.id === id))) return this.record(e, 'SILENT', 'unresolved_evidence');
      const bindings = Object.fromEntries(ids.map(id => [id, input.evidence.find(c => c.id === id)!.identity]));
      const key = digest(name); const previous = this.ledger.claim(scope, key);
      if (previous?.resolved) return this.record(e, 'SILENT', 'group_self_repaired', { claimKey: key });
      // Dedupe survives restart. Do not let changing the evidence or config clear
      // an already-said flag or an outstanding offer for the same normalized claim.
      if (previous?.said) return this.record(e, 'SILENT', 'already_said', { claimKey: key });
      if (this.ledger.pending(scope, key, this.now())) return this.record(e, 'SILENT', 'pending_invitation', { claimKey: key });
      if (previous?.lastInterventionAt !== null && previous?.lastInterventionAt !== undefined && this.now() - previous.lastInterventionAt < settings.cooldownMs) return this.record(e, 'SILENT', 'cooldown', { claimKey: key });
      const continued = previous && previous.configIdentity === identity && previous.status === finding.status && digest(previous.bindings) === digest(bindings) && this.now() >= previous.lastAt && this.now() - previous.lastAt <= 600_000;
      const claim: Claim = { key, claim: name, status: finding.status, count: continued ? previous.count + 1 : 1, lastAt: this.now(), resolved: false, said: false, lastInterventionAt: previous?.lastInterventionAt ?? null, bindings, configIdentity: identity };
      this.ledger.putClaim(scope, claim);
      if (claim.count < settings.persistence) return this.record(e, 'SILENT', 'waiting_for_self_repair', { claimKey: key, evidenceIds: ids });
      if (!this.valid(e, bindings, identity, recent)) return this.record(e, 'SILENT', 'context_changed');
      claim.lastInterventionAt = this.now(); this.ledger.putClaim(scope, claim);
      if (settings.delivery === 'hand_raise') {
        const offer: Offer = { token: randomUUID(), scope, claimKey: key, eventId: e.id, eventIdentity: eventIdentity(e), expiresAt: this.now() + settings.invitationMs, configIdentity: identity, bindings, consumed: false };
        this.ledger.putOffer(offer);
        return this.record(e, 'HAND_RAISE', 'evidenced_persistent_claim', { claimKey: key, evidenceIds: ids, offerToken: offer.token, expiresAt: offer.expiresAt });
      }
      claim.said = true; this.ledger.putClaim(scope, claim); // uncertain generation is never automatically retried
      return await this.generate(e, recent, finding, bindings, identity);
    } catch { return this.record(e, 'SILENT', 'invalid_or_unavailable'); }
    finally { this.active = false; }
  }
  async invite(original: RequestEvent, invitation: RequestEvent, token: string, recent: () => RecentMessage[]): Promise<ParticipationDecision> {
    const offer = this.ledger.offer(token); const scope = scopeOf(original);
    if (!this.member(invitation) || scopeOf(invitation) !== scope || !['reply', 'action'].includes(invitation.invocation) || invitation.replyTo !== original.id) return { action: 'SILENT', reason: 'invitation_not_bound', eventId: invitation.id, shadow: true, evidenceIds: [] };
    if (!offer || offer.scope !== scope || offer.eventId !== original.id || offer.eventIdentity !== eventIdentity(original) || offer.expiresAt <= this.now() || !this.valid(original, offer.bindings, offer.configIdentity, recent)) return this.record(invitation, 'SILENT', 'offer_expired_or_changed');
    const claim = this.ledger.claim(scope, offer.claimKey);
    if (!claim || claim.resolved || claim.said) return this.record(invitation, 'SILENT', 'offer_resolved_or_consumed');
    if (this.active) return this.record(invitation, 'SILENT', 'busy');
    if (!this.ledger.consume(token)) return this.record(invitation, 'SILENT', 'offer_resolved_or_consumed');
    this.active = true;
    try {
      const current = this.context(original, recent());
      this.applyRepairs(scope, RepairSchema.parse(await this.reasoner.selfRepair(structuredClone(current))), current.messages);
      if (this.ledger.claim(scope, claim.key)?.resolved) return this.record(invitation, 'SILENT', 'group_self_repaired');
      claim.said = true; this.ledger.putClaim(scope, claim);
      return await this.generate(original, recent, { claim: claim.claim, status: claim.status as z.infer<typeof MonitorSchema>['status'], confidence: 1, evidenceIds: Object.keys(offer.bindings) }, offer.bindings, offer.configIdentity);
    }
    catch { return this.record(invitation, 'SILENT', 'invalid_or_unavailable'); }
    finally { this.active = false; }
  }
  private async generate(e: RequestEvent, recent: () => RecentMessage[], finding: z.infer<typeof MonitorSchema>, bindings: Record<string, string>, identity: string): Promise<ParticipationDecision> {
    const input = this.context(e, recent());
    const contextIdentity = digest(input.evidence);
    const output = GenerationSchema.parse(await this.reasoner.generate({ ...input, finding }));
    const sentences = [...new Intl.Segmenter('en', { granularity: 'sentence' }).segment(output.text)].length;
    if (sentences > 2 || /https?:|@(?:everyone|here)|\b(?:I (?:ran|fixed|tested|implemented|deployed)|constraint_reminder|loop_breaking|underspecified_plan)\b/i.test(output.text) || output.evidenceIds.some(id => !(id in bindings))) return this.record(e, 'SILENT', 'invalid_generation');
    if (!this.valid(e, bindings, identity, recent) || digest(this.context(e, recent()).evidence) !== contextIdentity) return this.record(e, 'SILENT', 'context_changed');
    const citations = output.evidenceIds.map(id => { const c = input.evidence.find(c => c.id === id)!; return `[${c.id}] ${c.label}`; }).join('\n');
    return this.record(e, 'POST', 'shadow_evidenced_intervention', { evidenceIds: output.evidenceIds, text: `${output.text}\n${citations}`, claimKey: digest(normalize(finding.claim)) });
  }
  why(e: RequestEvent) { if (!this.member(e)) return []; return this.ledger.reasons(scopeOf(e)); }
  purge(e: RequestEvent) { const c = this.member(e); if (!c || !approver(c, e.actor)) throw new Error('Not authorized'); this.ledger.purge(scopeOf(e)); }
}
