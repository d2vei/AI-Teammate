import { ReplySchema, digest, eligible, type Adapter, type ContextItem, type ModelInput, type Provider, type RequestEvent } from './domain.js';
import { promptVersion, instructions } from './prompt.js';
import { Store, type Trace } from './store.js';
import { sourceContext } from './sources.js';

export class Teammate {
  private active = false;
  constructor(readonly store: Store, readonly provider: Provider, readonly capUsd: number, readonly now = () => Date.now()) {}
  context(event: RequestEvent): ContextItem[] {
    const config = this.store.config(event.projectId); if (!eligible(config, event)) return [];
    return [
      ...this.store.decisions(event.projectId).slice(0, 8).map(d => ({ id: `decision:${d.id}`, kind: this.store.bindingsValid(event.projectId, d.sourceBindings, this.now()) ? 'approved_decision' : 'missing_evidence', label: `Approved v${d.version} by ${d.approverId}; source event ${d.origin.id}; snapshot ${d.snapshot ?? 'none'}`, text: this.store.bindingsValid(event.projectId, d.sourceBindings, this.now()) ? d.statement : 'Decision evidence unavailable; statement withheld.', identity: digest(d) })),
      ...this.store.briefs(event.projectId).slice(0, 3).map(b => ({ id: `brief:${b.id}`, kind: 'saved_brief', label: `Brief saved, not executed; approved by ${b.approverId}; snapshot ${b.snapshot ?? 'none'} (may be older than selection)`, text: this.store.bindingsValid(event.projectId, b.sourceBindings, this.now()) ? JSON.stringify({ objective: b.objective, decisionIds: b.decisionIds, sourceIds: b.sourceIds, hypothesis: b.hypothesis, nextCheck: b.nextCheck, exclusions: b.exclusions }) : 'Brief evidence unavailable; contents withheld.', identity: digest(b) })),
      ...this.store.pending(event.projectId).filter(p => p.expiresAt > this.now()).slice(0, 4).map(p => ({ id: `proposal:${p.id}`, kind: `proposed_${p.body.kind}`, label: `Unapproved v${p.version}; proposer ${p.proposerId}`, text: this.store.bindingsValid(event.projectId, p.sourceBindings, this.now()) ? (p.body.kind === 'decision' ? p.body.statement : p.body.objective) : 'Proposal evidence unavailable; contents withheld.', identity: digest(p) })),
      ...sourceContext(this.store.sources(event.projectId), config, event.text, this.now()),
    ];
  }
  async handle(e: RequestEvent, adapter: Adapter): Promise<void> {
    const config = this.store.config(e.projectId);
    if (!eligible(config, e) || !await adapter.canDeliver(e) || !this.store.claim(e, this.now())) return;
    const context = this.context(e); const configIdentity = digest(config); const contextIdentity = digest(context);
    let ownProposalId: string | undefined;
    const trace: Trace = { eventKey: this.store.eventKey(e), at: this.now(), result: 'started', mode: this.provider.mode, model: this.provider.model, prompt: promptVersion, config: configIdentity, sources: context.map(x => x.id) };
    const current = async () => eligible(this.store.config(e.projectId), e) && digest(this.store.config(e.projectId)) === configIdentity && digest(this.context(e).filter(c => c.id !== ownProposalId)) === contextIdentity && await adapter.canDeliver(e);
    const send = async (text: string, proposal?: import('./domain.js').ProposalCard) => {
      if (!await current()) { trace.result = 'suppressed'; return; }
      try { await adapter.send(e, proposal ? { text, proposal } : { text }); trace.result = 'delivered'; }
      catch { trace.result = 'delivery_uncertain'; }
    };
    if (this.active) { trace.outcome = 'busy'; await send('Another request is active. Please ask again after it finishes.'); this.store.trace(trace); return; }
    const input: ModelInput = { event: { id: e.id, version: e.version, actor: e.actor, replyTo: e.replyTo }, question: e.text.slice(0, 3000), reply: e.replyContext, context };
    const bytes = Buffer.byteLength(JSON.stringify(input));
    if (bytes > 24000) { trace.outcome = 'context_too_large'; await send('Selected context is too large. Narrow the question or source selection.'); this.store.trace(trace); return; }
    const reservation = this.store.reserve(this.capUsd, Math.ceil((bytes + Buffer.byteLength(instructions) + 1000) * 1.25 + 2048 * 4.25));
    if (!reservation) { trace.outcome = 'budget_blocked'; await send('No authorized budget is available for this request.'); this.store.trace(trace); return; }
    trace.reservationId = reservation;
    this.active = true;
    try {
      const result = await this.provider.generate(input); this.store.settle(reservation, result.usage); trace.usage = result.usage; trace.requestId = result.requestId;
      const reply = ReplySchema.parse(result.output);
      trace.outcome = 'response';
      if (reply.citations.some(id => !context.some(c => c.id === id)) || /\bI (?:ran|executed|fixed|deployed|implemented|tested|pushed)\b/i.test(reply.answer)) throw new Error('invalid response');
      const citations = reply.citations.map(id => { const c = context.find(c => c.id === id)!; return `[${c.id}] ${c.label}`; }).join('\n');
      if (!await current()) { trace.result = 'suppressed'; return; }
      const card = reply.proposal ? this.store.propose(e, reply.proposal, context, this.now()) : undefined;
      ownProposalId = card ? `proposal:${card.proposal.id}` : undefined;
      await send(`${this.provider.mode === 'mock' ? '[MOCK - synthetic provider]\n' : ''}${reply.answer}${citations ? '\n\n' + citations : ''}\n\nAI analysis only; no execution or reproduction performed.`, card);
    } catch { trace.outcome = 'invalid_or_unavailable'; await send('Provider unavailable or output invalid. No answer was accepted. Unreported charges remain uncertain; no automatic retry.'); }
    finally { this.active = false; this.store.trace(trace); }
  }
}
