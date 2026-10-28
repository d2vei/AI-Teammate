import { z } from 'zod';
import { digest, type ContextItem, type ProjectConfig } from './domain.js';
import type { Store } from './store.js';
export type Source = { id: string; projectId: string; roomId: string; snapshot: string; kind: 'code' | 'log'; label: string; text: string; contentHash: string; synthetic: boolean; state: 'available' | 'stale' | 'deleted'; observedAt: number | null };
const log = z.object({ id: z.string().regex(/^[\w-]{1,64}$/), at: z.iso.datetime({ offset: true }), event: z.enum(['party_split', 'assigned', 'queue_entered', 'warning']), partyId: z.string().regex(/^[\w-]{1,64}$/), destinations: z.array(z.string().regex(/^[\w-]{1,64}$/)).max(20) });
export const BundleSchema = z.object({ snapshot: z.string().regex(/^[\w.-]{1,80}$/), synthetic: z.boolean(), files: z.array(z.object({ path: z.string().min(1).max(150), text: z.string().min(1).max(6000) }).strict()).max(8), logs: z.array(log).max(50) }).strict();
export function ingestBundle(store: Store, projectId: string, raw: unknown, now: number, privateDataVerified = false): string[] {
  const bundle = BundleSchema.parse(raw); const config = store.config(projectId); if (!config) throw new Error('Project not configured');
  if (!bundle.synthetic && !privateDataVerified) throw new Error('Private data handling/account terms not verified');
  const result: Source[] = [];
  for (const file of bundle.files) {
    if (/(?:^|[\\/])\.|(?:^|[\\/])(?:credentials|secrets|node_modules)(?:[\\/]|$)|\.(?:env|key|pem|sqlite|db)$/i.test(file.path) || file.path.includes('..') || /[:\\]/.test(file.path)) throw new Error('Source path not permitted');
    if (/(?:api[_-]?key|password|secret|token)\s*[:=]\s*["'][^"']{8,}["']|-----BEGIN .*PRIVATE KEY-----/i.test(file.text)) throw new Error('Secret-shaped code field; provide a sanitized snapshot');
    const lines = file.text.split(/\r?\n/); if (lines.length > 150) throw new Error('Select at most 150 lines per file');
    result.push({ id: `code:${bundle.snapshot}:${file.path}`, projectId, roomId: config.roomId, snapshot: bundle.snapshot, kind: 'code', label: `${file.path}@${bundle.snapshot}:L1-L${lines.length} (${bundle.synthetic ? 'seeded synthetic' : 'supplied snapshot'}; inspected, not executed)`, text: lines.map((s, i) => `${i + 1}: ${s}`).join('\n'), contentHash: digest(file.text), synthetic: bundle.synthetic, state: 'available', observedAt: null });
  }
  for (const event of bundle.logs.filter(e => Date.parse(e.at) >= now - 60 * 60_000 && Date.parse(e.at) <= now).slice(-12)) {
    // The schema strips unknown fields before hashing, storing or prompting; raw log text is never accepted.
    result.push({ id: `log:${bundle.snapshot}:${event.id}`, projectId, roomId: config.roomId, snapshot: bundle.snapshot, kind: 'log', label: `event ${event.id}@${bundle.snapshot} at ${event.at} (${bundle.synthetic ? 'seeded synthetic' : 'supplied sanitized observation'})`, text: JSON.stringify(event), contentHash: digest(event), synthetic: bundle.synthetic, state: 'available', observedAt: Date.parse(event.at) });
  }
  return store.transaction(() => { for (const source of result) store.addSource(source); return result.map(s => s.id); });
}
export function sourceContext(sources: Source[], config: ProjectConfig, query: string, now: number, limit = 6): ContextItem[] {
  if (!config.selectedSnapshot) return [{ id: 'availability:none', kind: 'missing_evidence', label: 'No snapshot selected', text: 'Code and logs are unavailable. Ask for a permitted snapshot.', identity: digest(null) }];
  const selected = sources.filter(s => s.roomId === config.roomId && s.snapshot === config.selectedSnapshot);
  if (!selected.length) return [{ id: `availability:${config.selectedSnapshot}`, kind: 'missing_evidence', label: `Snapshot ${config.selectedSnapshot} unavailable`, text: 'Selected code/log evidence is unavailable; do not infer its contents.', identity: digest(config.selectedSnapshot) }];
  const words = query.toLowerCase().split(/\W+/).filter(w => w.length >= 3);
  const score = (s: Source) => words.reduce((n, w) => n + Number((s.label + s.text).toLowerCase().includes(w)), 0);
  return selected.sort((a, b) => score(b) - score(a)).slice(0, limit).map(s => {
    const available = s.state === 'available' && (s.observedAt === null || s.observedAt >= now - 60 * 60_000);
    return { id: s.id, kind: available ? s.kind : 'missing_evidence', label: available ? s.label : `Source ${s.id} unavailable (${s.state === 'available' ? 'outside log window' : s.state})`, text: available ? s.text : 'Content unavailable. No current support may be inferred.', identity: digest({ source: s, available }) };
  });
}
