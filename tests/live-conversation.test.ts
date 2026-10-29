import { afterEach, expect, it, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';
import { once } from 'node:events';
import { Store } from '../src/store.js';
import { LiveConversation } from '../src/live-conversation.js';
import { runLiveTerminal } from '../src/live-terminal.js';
import { MetaProvider } from '../src/meta.js';
import type { ModelInput } from '../src/domain.js';
const stores: Store[] = []; afterEach(() => { for (const s of stores.splice(0)) s.close(); });
const database = () => { const s = new Store(':memory:'); stores.push(s); return s; };
const envelope = (output: unknown) => new Response(JSON.stringify({ id: 'synthetic-response', model: 'muse-spark-1.3', status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(output) }] }], usage: { input_tokens: 30, output_tokens: 40 } }));
function fixture() {
  const store = database(); const inputs: ModelInput[] = [];
  const http = vi.fn<typeof fetch>(async (_url, init) => {
    const body = JSON.parse(init!.body as string); const input = JSON.parse(body.input) as ModelInput; inputs.push(input);
    const evidence = input.context.filter(c => ['code', 'log'].includes(c.kind)); const decisions = input.context.filter(c => c.kind === 'approved_decision');
    return envelope(input.question.startsWith('Draft a decision:') ? { answer: 'Unapproved synthetic draft.', citations: [], proposal: { kind: 'decision', statement: 'Keep every party in one room.', sourceIds: [] } } : input.question.startsWith('Draft a brief:') ? { answer: 'Synthetic investigation draft, no execution.', citations: evidence.map(c => c.id), proposal: { kind: 'brief', objective: 'Investigate party routing.', decisionIds: decisions.map(c => c.id), sourceIds: evidence.map(c => c.id), hypothesis: 'Per-member assignment may split a party.', nextCheck: 'A developer can reproduce with two party members.', exclusions: ['No execution or edits by the app.'] } } : { answer: 'Synthetic HTTP-MOCK answer, not actual Meta quality.', citations: evidence.slice(0, 1).map(c => c.id) });
  });
  const provider = new MetaProvider('SYNTHETIC_NOT_REAL', http); const harness = new LiveConversation(store, provider, 5);
  return { store, inputs, http, provider, harness };
}
it('routes generated decision and brief through bound approvals while ordinary agreement stays powerless (HTTP MOCK)', async () => {
  const { store, inputs, harness } = fixture(); const decision = await harness.line('/decision Keep every party together.');
  expect(decision.kind).toBe('proposal'); expect(store.decisions(harness.projectId)).toHaveLength(0);
  await harness.line('/ambient yes'); expect(inputs).toHaveLength(1); expect(store.decisions(harness.projectId)).toHaveLength(0);
  await harness.line('/as peer'); expect((await harness.line(`/accept ${decision.card!.buttonId}`)).kind).toBe('error');
  await harness.line('/as owner'); await harness.line(`/accept ${decision.card!.buttonId}`); await harness.line(`/accept ${decision.card!.buttonId}`); expect(store.decisions(harness.projectId)).toHaveLength(1);
  const brief = await harness.line('/brief Investigate party routing.'); expect(brief.kind).toBe('proposal'); expect(brief.card!.proposal.body.kind).toBe('brief');
  await harness.line(`/accept ${brief.card!.buttonId}`); expect(store.briefs(harness.projectId)[0]?.status).toBe('saved'); expect(inputs).toHaveLength(2);
  expect(inputs[1]!.context.some(c => c.kind === 'approved_decision')).toBe(true); expect(store.budgetUsed()).toBeGreaterThan(0);
});
it('binds a follow-up to the actual prior answer and rejects it after source removal (HTTP MOCK)', async () => {
  const { store, harness, inputs } = fixture(); expect((await harness.line('/reply Explain that.')).kind).toBe('error'); expect(inputs).toHaveLength(0);
  await harness.line('/ask Inspect party routing.'); await harness.line('/reply What is uncertain?');
  expect(inputs[1]!.reply?.text).toContain('HTTP-MOCK answer'); expect(inputs[1]!.event.replyTo).toBe(inputs[1]!.reply!.id);
  const code = store.sources(harness.projectId).find(s => s.kind === 'code')!; store.sourceState(harness.projectId, code.id, 'deleted');
  expect((await harness.line('/reply Explain that again.')).kind).toBe('error'); expect(inputs).toHaveLength(2);
});
it('keeps a prior reply unavailable after approval or a configuration change (HTTP MOCK)', async () => {
  const { harness, inputs } = fixture(); const card = await harness.line('/decision Keep groups together.');
  await harness.line(`/accept ${card.card!.buttonId}`); expect((await harness.line('/reply Explain that.')).kind).toBe('error');
  await harness.line('/ask Inspect party routing.'); await harness.line('/pause'); await harness.line('/resume');
  expect((await harness.line('/reply Explain that.')).kind).toBe('error'); expect(inputs).toHaveLength(2);
});
it('rejects unsupported commands, oversized input and changed synthetic scope without dispatch (HTTP MOCK)', async () => {
  const { store, harness, inputs } = fixture();
  for (const line of ['/shadow on', '/media voice', '/watch start', '/shell anything', 'x'.repeat(2001)]) expect((await harness.line(line)).kind).toBe('error');
  store.putConfig({ ...store.config(harness.projectId)!, roomId: 'other-room' });
  expect((await harness.line('/ask hello')).kind).toBe('error'); expect(inputs).toHaveLength(0);
});
it('retains shared charges and other projects across local deletion/reset; only owner can perform it (HTTP MOCK)', async () => {
  const { store, harness, inputs } = fixture(); const source = store.sources(harness.projectId)[0]!; store.addSource({ ...source, id: 'other-synthetic-source', projectId: 'other-project' });
  const reservation = store.reserve(5, 4999999); expect(reservation).not.toBeNull();
  await harness.line('/as peer'); expect((await harness.line('/forget-local-data CONFIRM')).kind).toBe('error');
  await harness.line('/as owner'); await harness.line('/forget-local-data CONFIRM'); expect(store.sources(harness.projectId)).toHaveLength(0); expect(store.config(harness.projectId)!.paused).toBe(true);
  await harness.line('/reset-demo CONFIRM'); expect(store.sources(harness.projectId).length).toBeGreaterThan(0); expect(store.sources('other-project')).toHaveLength(1); expect(store.budgetUsed()).toBe(4.999999);
  const blocked = await harness.line('/ask hello'); expect(blocked.text).toContain('No authorized budget'); expect(inputs).toHaveLength(0);
});
it('processes pause during inference, refuses a queued paid request and withholds the late answer (HTTP MOCK)', async () => {
  const store = database(); let complete!: (value: Response) => void;
  const http = vi.fn<typeof fetch>(() => new Promise<Response>(resolve => { complete = resolve; }));
  const harness = new LiveConversation(store, new MetaProvider('SYNTHETIC_NOT_REAL', http), 5); const input = new PassThrough(); const lines: string[] = [];
  const run = runLiveTerminal(harness, input, line => lines.push(line)); input.write('/ask Inspect party routing.\n'); await vi.waitFor(() => expect(http).toHaveBeenCalledTimes(1));
  input.write('/pause\n/ask Should not queue.\n'); await vi.waitFor(() => expect(store.config(harness.projectId)!.paused).toBe(true));
  complete(envelope({ answer: 'SYNTHETIC_LATE_ANSWER', citations: [] })); await vi.waitFor(() => expect(lines.some(l => l.startsWith('[silent]'))).toBe(true));
  input.write('/quit\n'); await run; input.destroy();
  expect(lines.join('\n')).not.toContain('SYNTHETIC_LATE_ANSWER'); expect(lines.join('\n')).toContain('not queued'); expect(http).toHaveBeenCalledTimes(1); expect(store.traces().at(-1)?.result).toBe('suppressed');
});
it('drains an in-flight charged request on EOF/signal without printing a late response (HTTP MOCK)', async () => {
  for (const end of ['eof', 'signal']) {
    const store = database(); let complete!: (value: Response) => void;
    const http = vi.fn<typeof fetch>(() => new Promise<Response>(resolve => { complete = resolve; }));
    const harness = new LiveConversation(store, new MetaProvider('SYNTHETIC_NOT_REAL', http), 5); const input = new PassThrough(); const signals = new EventEmitter(); const lines: string[] = [];
    const run = runLiveTerminal(harness, input, line => lines.push(line), signals); input.write('/ask Inspect party routing.\n'); await vi.waitFor(() => expect(http).toHaveBeenCalledTimes(1));
    if (end === 'eof') { const ended = once(input, 'end'); input.end(); await ended; } else signals.emit('SIGTERM');
    complete(envelope({ answer: 'SYNTHETIC_AFTER_EXIT', citations: [] })); await run; input.destroy();
    expect(lines.join('\n')).not.toContain('SYNTHETIC_AFTER_EXIT'); expect(store.budgetUsed()).toBe(0.000208); expect(signals.listenerCount('SIGTERM')).toBe(0);
  }
});
