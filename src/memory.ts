import { approver, digest, eligible, type ContextItem, type RequestEvent } from './domain.js';
import { sourceContext } from './sources.js';
import type { Store } from './store.js';

export type MemoryCategory = 'decisions' | 'briefs' | 'proposals' | 'evidence';
export type MemoryEntry = ContextItem & { category: MemoryCategory; available: boolean; topics: string[]; recordedAt: number | null };
const normalize = (text: string) => text.normalize('NFKC').toLowerCase().trim().replace(/\s+/gu, ' ');
function topicName(text: string) {
  const value = normalize(text);
  if (!/^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,47}$/u.test(value)) throw new Error('Use a topic of 1-48 letters, numbers, spaces, dots, underscores or hyphens');
  return value;
}

// A project vault is a current authorized view of existing knowledge. Tags are
// metadata only; they never approve, summarize, or make evidence available.
export class MemoryVault {
  constructor(readonly store: Store, readonly now = () => Date.now()) {}
  private entries(event: RequestEvent): MemoryEntry[] {
    const config = this.store.config(event.projectId); if (!eligible(config, event)) return [];
    const now = this.now(); const entries: MemoryEntry[] = [];
    const bindings = new Map<string, boolean>(); const valid = (value: Record<string, string>) => { const key = digest(value); if (!bindings.has(key)) bindings.set(key, this.store.bindingsValid(event.projectId, value, now)); return bindings.get(key)!; };
    for (const d of this.store.memoryDecisions(event.projectId)) {
      const available = valid(d.sourceBindings);
      entries.push({ id: `decision:${d.id}`, kind: available ? 'approved_decision' : 'missing_evidence', label: `Approved v${d.version} by ${d.approverId}; source event ${d.origin.id}; snapshot ${d.snapshot ?? 'none'}`, text: available ? d.statement : 'Decision evidence unavailable; statement withheld.', identity: digest(d), category: 'decisions', available, recordedAt: d.savedAt, topics: [] });
    }
    for (const b of this.store.memoryBriefs(event.projectId)) {
      const available = valid(b.sourceBindings);
      entries.push({ id: `brief:${b.id}`, kind: available ? 'saved_brief' : 'missing_evidence', label: `Brief saved, not executed by this app; approved by ${b.approverId}; snapshot ${b.snapshot ?? 'none'} (may be older than selection)`, text: available ? JSON.stringify({ objective: b.objective, decisionIds: b.decisionIds, sourceIds: b.sourceIds, hypothesis: b.hypothesis, nextCheck: b.nextCheck, exclusions: b.exclusions }) : 'Brief evidence unavailable; contents withheld.', identity: digest(b), category: 'briefs', available, recordedAt: b.savedAt, topics: [] });
    }
    for (const p of this.store.pending(event.projectId).filter(p => p.expiresAt > now)) {
      const available = valid(p.sourceBindings);
      entries.push({ id: `proposal:${p.id}`, kind: available ? `proposed_${p.body.kind}` : 'missing_evidence', label: `Unapproved v${p.version}; proposer ${p.proposerId}`, text: available ? (p.body.kind === 'decision' ? p.body.statement : p.body.objective) : 'Proposal evidence unavailable; contents withheld.', identity: digest(p), category: 'proposals', available, recordedAt: p.createdAt, topics: [] });
    }
    const sources = this.store.sources(event.projectId);
    for (const c of sourceContext(sources, config, '', now, sources.length || 1)) entries.push({ ...c, category: 'evidence', available: c.kind !== 'missing_evidence', recordedAt: sources.find(s => s.id === c.id)?.observedAt ?? null, topics: [] });
    const tags = this.store.memoryTopics(event.projectId);
    for (const entry of entries) if (entry.available) entry.topics = tags.filter(t => t.ref === entry.id && t.identity === entry.identity).map(t => t.topic);
    return entries;
  }
  private rank(entries: MemoryEntry[], query: string, matchesOnly = false): MemoryEntry[] {
    if (query.length > 240) throw new Error('Use at most 240 characters for a memory search');
    const phrase = normalize(query); const words = [...new Set(phrase.split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 2))].slice(0, 16);
    const score = (e: MemoryEntry) => {
      const text = normalize(e.text); const label = normalize(e.label); const topics = e.topics.join(' ');
      return Number(phrase.length > 2 && text.includes(phrase)) * 3 + Number(phrase === normalize(e.id)) * 20 + words.reduce((n, w) => n + Number(text.includes(w)) + Number(label.includes(w)) * 2 + Number(topics.includes(w)) * 4, 0);
    };
    const scores = new Map(entries.map(e => [e.id, score(e)]));
    return entries.filter(e => !matchesOnly || !phrase || scores.get(e.id)! > 0).sort((a, b) => Number(phrase === normalize(b.id)) - Number(phrase === normalize(a.id)) || Number(b.available) - Number(a.available) || scores.get(b.id)! - scores.get(a.id)! || (b.recordedAt ?? 0) - (a.recordedAt ?? 0));
  }
  search(event: RequestEvent, query = '', options: { topic?: string; category?: MemoryCategory; limit?: number } = {}): MemoryEntry[] {
    const limit = options.limit ?? 10; if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new Error('Use a memory page size of 1-20');
    const topic = options.topic === undefined ? null : topicName(options.topic);
    return this.rank(this.entries(event).filter(e => (!topic || e.topics.includes(topic)) && (!options.category || e.category === options.category)), query, true).slice(0, limit);
  }
  context(event: RequestEvent, excludeRef?: string): ContextItem[] {
    const entries = this.entries(event).filter(e => e.id !== excludeRef); const limits: Record<MemoryCategory, number> = { decisions: 8, briefs: 3, proposals: 4, evidence: 6 };
    return (Object.keys(limits) as MemoryCategory[]).flatMap(category => {
      const group = entries.filter(e => e.category === category); const query = event.text.slice(0, 240);
      // A precise source question should not be blocked by unrelated filler.
      // Broad/no-match requests keep the normal fallback and byte-limit gate.
      const matches = category === 'evidence' ? this.rank(group, query, true) : [];
      return (matches.length ? matches : this.rank(group, query)).slice(0, limits[category]);
    }).map(({ id, kind, label, text, identity, topics }) => ({ id, kind, label: `${label}${topics.length ? `; topics: ${topics.join(', ')}` : ''}`, text, identity }));
  }
  overview(event: RequestEvent) {
    if (!eligible(this.store.config(event.projectId), event)) throw new Error('Memory vault is paused or unavailable in this scope');
    const entries = this.entries(event).filter(e => !e.id.startsWith('availability:')); return { projectId: event.projectId, entries: entries.length, unavailable: entries.filter(e => !e.available).length, categories: Object.fromEntries((['decisions', 'briefs', 'proposals', 'evidence'] as const).map(c => [c, entries.filter(e => e.category === c).length])), topics: this.topics(event), organizationChangesAuthority: false };
  }
  topics(event: RequestEvent): { topic: string; records: number }[] {
    const counts = new Map<string, number>(); for (const e of this.entries(event)) for (const t of e.topics) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([topic, records]) => ({ topic, records }));
  }
  tag(event: RequestEvent, ref: string, input: string) {
    const topic = topicName(input);
    return this.store.transaction(() => {
      const c = this.store.config(event.projectId); if (!eligible(c, event) || !approver(c, event.actor)) throw new Error('Only a current project approver may organize memory');
      const entry = this.entries(event).find(e => e.id === ref); if (!entry?.available) throw new Error('Memory reference unavailable; no topic saved');
      if (entry.topics.includes(topic)) return;
      if (entry.topics.length >= 6 || (!this.topics(event).some(t => t.topic === topic) && this.topics(event).length >= 64)) throw new Error('Memory topic limit reached');
      this.store.putMemoryTopic(event.projectId, ref, entry.identity, topic);
    });
  }
  untag(event: RequestEvent, ref: string, input: string): boolean {
    const topic = topicName(input); return this.store.transaction(() => {
      const c = this.store.config(event.projectId); if (!eligible(c, event) || !approver(c, event.actor)) throw new Error('Only a current project approver may organize memory');
      if (!this.entries(event).some(e => e.id === ref)) throw new Error('Memory reference unavailable');
      return this.store.removeMemoryTopic(event.projectId, ref, topic);
    });
  }
}
