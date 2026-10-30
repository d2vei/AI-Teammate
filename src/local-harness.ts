import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { approver, digest, eligible, type ModelInput, type ProposalCard, type Provider, type ProviderResult, type RequestEvent } from './domain.js';
import { Store } from './store.js';
import { Teammate } from './core.js';
import { FakeAdapter } from './fakes.js';
import { BundleSchema, ingestBundle } from './sources.js';
import { SyntheticErrorFeed, type ErrorWatch } from './error-watch.js';
import { MemoryVault } from './memory.js';
export type HarnessOutput = { kind: 'status' | 'response' | 'silent' | 'proposal' | 'confirmation' | 'error'; text: string; card?: ProposalCard };

// A deterministic fixture responder for offline mechanics. It is not model output.
export class ScriptedLocalProvider implements Provider {
  readonly mode = 'mock' as const; readonly model = 'scripted-local-fixture-v1';
  async generate(input: ModelInput): Promise<ProviderResult> {
    const decisions = input.context.filter(c => c.kind === 'approved_decision'); const evidence = input.context.filter(c => ['code', 'log'].includes(c.kind));
    let output: unknown;
    if (input.question.startsWith('Draft a decision: ')) output = { answer: 'Scripted MOCK decision draft; review the exact card before confirming.', citations: [], proposal: { kind: 'decision', statement: input.question.slice('Draft a decision: '.length), sourceIds: [] } };
    else if (input.question.startsWith('Draft a brief: ')) output = { answer: 'Scripted MOCK investigation draft. Saving will not execute the check.', citations: evidence.map(c => c.id), proposal: { kind: 'brief', objective: input.question.slice('Draft a brief: '.length).slice(0, 300), decisionIds: decisions.map(c => c.id), sourceIds: evidence.map(c => c.id), hypothesis: 'The selected synthetic per-member assignment may split a party.', nextCheck: 'A developer can separately reproduce assignment for two members against the approved rule.', exclusions: ['No execution, editing, Git writes or deployment by this app.'] } };
    else {
      const saved = input.context.filter(c => c.kind === 'saved_brief');
      output = { answer: `Scripted MOCK fixture status: ${decisions.length} approved decision(s), ${saved.length} saved brief(s), ${evidence.length} available source/log item(s). Saved means recorded, never executed.`, citations: [...decisions, ...saved, ...evidence].map(c => c.id) };
    }
    return { output, usage: { inputTokens: 0, outputTokens: 0 }, requestId: null };
  }
}

export class LocalHarness {
  readonly projectId = 'local-conversation'; readonly core: Teammate;
  private actor = { id: 'synthetic-owner', roleIds: ['reviewer'] };
  private readonly errorFeed = new SyntheticErrorFeed();
  constructor(readonly store: Store, readonly provider: Provider, capUsd: number, readonly now = () => Date.now(), readonly watch?: ErrorWatch) {
    if (!store.config(this.projectId)) {
      store.putConfig({ projectId: this.projectId, platform: 'fake', workspaceId: 'local-synthetic', roomId: 'conversation-room', memberIds: ['synthetic-owner', 'synthetic-peer'], approverIds: ['synthetic-owner'], approverRoleIds: ['reviewer'], paused: false, selectedSnapshot: 'local-seeded-v1', revision: 1 });
      const bundle = BundleSchema.parse(JSON.parse(readFileSync(new URL('../examples/party-queue.json', import.meta.url), 'utf8')));
      bundle.snapshot = 'local-seeded-v1'; bundle.logs = bundle.logs.map(l => ({ ...l, at: new Date(now()).toISOString() })); ingestBundle(store, this.projectId, bundle, now());
    }
    // Exercise the same accounting path offline with a synthetic allowance;
    // the scripted provider reports zero usage and has no network capability.
    this.core = new Teammate(store, provider, provider.mode === 'mock' ? 1 : capUsd, now);
  }
  protected event(text: string, invocation: RequestEvent['invocation'] = 'action'): RequestEvent {
    return { id: randomUUID(), platform: 'fake', projectId: this.projectId, workspaceId: 'local-synthetic', roomId: 'conversation-room', actor: this.actor, text, invocation, version: digest(text), replyTo: null, replyContext: null };
  }
  async line(line: string): Promise<HarnessOutput> {
    const input = line.trim();
    try {
      if (input.startsWith('/as ')) {
        const choice = input.slice(4); if (!['owner', 'peer'].includes(choice)) throw new Error('Use /as owner or /as peer; these are simulated identities.');
        this.actor = choice === 'owner' ? { id: 'synthetic-owner', roleIds: ['reviewer'] } : { id: 'synthetic-peer', roleIds: [] };
        return { kind: 'status', text: `Simulated local actor: ${this.actor.id}. This does not establish real-platform identity.` };
      }
      if (input === '/status') return { kind: 'status', text: JSON.stringify({ provider: this.provider.mode, actor: this.actor.id, paused: this.store.config(this.projectId)?.paused, decisions: this.store.memoryDecisions(this.projectId).length, briefs: this.store.memoryBriefs(this.projectId).length, budgetUsedOrReservedUsd: this.store.budgetUsed(), execution: 'unavailable' }) };
      if (input === '/pause' || input === '/resume') {
        const c = this.store.config(this.projectId)!; if (input === '/resume' && !approver(c, this.actor)) throw new Error('Only the simulated approver may resume.');
        this.store.putConfig({ ...c, paused: input === '/pause' }); return { kind: 'status', text: input === '/pause' ? 'Paused.' : 'Resumed.' };
      }
      if (input.startsWith('/accept ')) {
        const saved = this.store.accept(this.event('Confirm exact local card'), input.slice(8), this.now());
        return { kind: 'confirmation', text: `${saved.kind === 'decision' ? 'Approved decision' : 'Saved brief; not executed'}: ${saved.id} (approver ${saved.approverId}).` };
      }
      if (input.startsWith('/withdraw ')) { this.store.withdraw(this.event('Withdraw local decision'), input.slice(10)); return { kind: 'status', text: 'Decision withdrawn; statement removed.' }; }
      if (input === '/memory' || input.startsWith('/memory ')) {
        const e = this.event('Inspect or organize this project memory vault'); if (!eligible(this.store.config(this.projectId), e)) throw new Error('Memory vault is paused or unavailable in this scope');
        const vault = new MemoryVault(this.store, this.now); let result: unknown;
        if (input === '/memory') result = vault.overview(e);
        else if (input === '/memory topics') result = vault.topics(e);
        else if (input.startsWith('/memory search ')) result = vault.search(e, input.slice(15));
        else if (input.startsWith('/memory topic ')) result = vault.search(e, '', { topic: input.slice(14) });
        else {
          const match = /^\/memory (tag|untag) (\S+) (.+)$/.exec(input); if (!match) throw new Error('Use /memory, topics, search QUERY, topic NAME, tag REF TOPIC or untag REF TOPIC');
          if (match[1] === 'tag') { vault.tag(e, match[2]!, match[3]!); result = { organized: true, authorityChanged: false }; }
          else result = { removed: vault.untag(e, match[2]!, match[3]!), authorityChanged: false };
        }
        return { kind: 'status', text: JSON.stringify(result, null, 2) };
      }
      if (input.startsWith('/watch')) {
        if (!this.watch) throw new Error('Replay watch is not connected in this harness session.');
        const event = this.event('Synthetic local error watch');
        if (input === '/watch start') { const task = this.watch.start(event, '424242'); return { kind: 'status', text: `REPLAY watch ${task.id}: synthetic game 424242, selected snapshot ${task.snapshot}. Use /watch tick for a simulated minute or /watch auto on for real one-minute intervals in the local terminal. No API request or external post.` }; }
        if (input === '/watch stop') { this.watch.stop(event); return { kind: 'status', text: 'Replay watch stopped.' }; }
        if (input === '/watch tick') { const result = await this.watch.tick(event, this.errorFeed); return { kind: result.status === 'BLOCKED' ? 'error' : result.reports.length ? 'response' : 'silent', text: result.reports.length ? result.reports.map(r => r.text).join('\n\n') : `Replay watch: ${result.reason}; no external posts or model calls.` }; }
        throw new Error('Use /watch start, /watch tick or /watch stop. The terminal advances a simulated minute for each tick.');
      }
      const question = input.startsWith('/decision ') ? `Draft a decision: ${input.slice(10)}` : input.startsWith('/brief ') ? `Draft a brief: ${input.slice(7)}` : input.startsWith('/ask ') ? input.slice(5) : input.startsWith('/ambient ') ? input.slice(9) : input;
      if (!question) return { kind: 'status', text: 'Enter /ask, /decision, /brief, /accept, /as, /status, /pause, /resume, /withdraw, /memory, /ambient or /watch.' };
      const adapter = new FakeAdapter(); await this.core.handle(this.event(question, input.startsWith('/ambient ') ? 'ambient' : 'mention'), adapter);
      const delivery = adapter.deliveries[0]; if (!delivery) return { kind: 'silent', text: 'No reply: invocation/pause/scope boundary. This is configuration, not measured social judgment.' };
      if (delivery.proposal) return { kind: 'proposal', text: `${delivery.text}\n\nExact proposal v${delivery.proposal.proposal.version}:\n${JSON.stringify(delivery.proposal.proposal.body, null, 2)}\n\n/accept ${delivery.proposal.buttonId}`, card: delivery.proposal };
      return { kind: 'response', text: delivery.text };
    } catch (error) { return { kind: 'error', text: error instanceof Error ? error.message : 'Local action failed.' }; }
  }
}
