import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export const longProject = 'long-conversation-live-v1';
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function configureLongConversation(store, corpus, ingestBundle, now) {
  assert.equal(store.config(longProject), undefined);
  store.putConfig({ projectId: longProject, platform: 'fake', workspaceId: 'synthetic-long-group', roomId: 'synthetic-long-room', memberIds: corpus.actors.map(a => `synthetic-${a}`), approverIds: ['synthetic-owner'], approverRoleIds: ['reviewer'], paused: false, selectedSnapshot: corpus.source.snapshot, revision: 1 });
  return ingestBundle(store, longProject, { ...corpus.source, logs: corpus.source.logs.map(l => ({ ...l, at: new Date(now()).toISOString() })) }, now());
}

// Developer-only sequential replay. Participant messages are authored fixtures,
// never generated people or real platform identities. No rubric is accepted here.
export async function runLongConversation({ state, corpus, adapterFactory, calls, now, advance, restart, recordTurn = () => {} }) {
  const results = []; const controls = []; const prior = new Map(); const saved = new Map(); let ordinal = 0;
  const event = (actor, text, invocation = 'mention') => ({ id: `long-event-${++ordinal}`, version: '1', projectId: longProject, platform: 'fake', workspaceId: 'synthetic-long-group', roomId: 'synthetic-long-room', actor: { id: `synthetic-${actor}`, roleIds: actor === 'owner' ? ['reviewer'] : [] }, invocation, text, replyTo: null, replyContext: null });
  const counts = () => [state.store.memoryDecisions(longProject).length, state.store.memoryBriefs(longProject).length];
  const binding = e => digest([state.store.config(longProject), state.core.context(e)]);
  for (const step of corpus.steps) {
    advance(); const e = event(step.actor, step.text ?? 'Explicit synthetic fixture control', step.type === 'ambient' ? 'ambient' : 'mention');
    const beforeCalls = calls(); const beforeCounts = counts();
    if (['ambient', 'ask', 'reply'].includes(step.type)) {
      const previous = step.type === 'reply' ? prior.get(step.target) : undefined;
      if (step.type === 'reply' && (!previous?.delivered || previous.binding !== binding(previous.event))) {
        const item = { id: step.id, actor: step.actor, type: step.type, status: 'NOT_RUN_REPLY_UNAVAILABLE', modelCalls: 0 };
        results.push(item); recordTurn(item); continue;
      }
      if (previous) { e.invocation = 'reply'; e.replyTo = previous.id; e.replyContext = { id: previous.id, text: previous.text, version: digest(previous.text) }; }
      const adapter = adapterFactory(); const beforeTraces = state.store.traces().length; const started = Date.now();
      await state.core.handle(e, adapter);
      const trace = state.store.traces().length > beforeTraces ? state.store.traces().at(-1) : null;
      const delivery = adapter.deliveries[0];
      const item = { id: step.id, actor: step.actor, type: step.type, status: step.type === 'ambient' ? 'SILENT' : trace?.outcome === 'response' && trace.result === 'delivered' ? 'DELIVERED' : trace?.outcome ?? 'NOT_DELIVERED', modelCalls: calls() - beforeCalls, latencyMs: Date.now() - started, proposalKind: delivery?.proposal?.proposal.body.kind ?? null, usage: trace?.usage ?? null };
      if (step.type === 'ambient') { assert.equal(item.modelCalls, 0); assert.equal(adapter.deliveries.length, 0); assert.deepEqual(counts(), beforeCounts); }
      else { assert.ok(item.modelCalls <= 1); prior.set(step.id, { event: e, id: `answer-${e.id}`, text: (delivery?.text ?? '').slice(0, 3000), delivered: item.status === 'DELIVERED', card: delivery?.proposal, binding: binding(e) }); }
      results.push(item); recordTurn(item);
    } else if (step.type === 'accept') {
      const card = prior.get(step.target)?.card;
      if (!card) { controls.push({ id: step.id, status: 'NOT_RUN_NO_CARD' }); continue; }
      assert.throws(() => state.store.accept(event('qa', 'Synthetic unauthorized confirmation', 'action'), card.buttonId, now()));
      assert.deepEqual(counts(), beforeCounts);
      try {
        const value = state.store.accept({ ...e, invocation: 'action' }, card.buttonId, now());
        assert.equal(state.store.accept({ ...e, invocation: 'action' }, card.buttonId, now()).id, value.id);
        saved.set(step.saveAs, value); controls.push({ id: step.id, status: 'SAVED_ONCE', kind: value.kind, wrongActorRejected: true });
      } catch { controls.push({ id: step.id, status: 'FAIL_CONFIRMATION' }); }
    } else if (step.type === 'withdraw') {
      const value = saved.get(step.target);
      if (!value) controls.push({ id: step.id, status: 'NOT_RUN_NO_DECISION' });
      else { state.store.withdraw(e, value.id); assert.ok(!state.store.memoryDecisions(longProject).some(d => d.id === value.id)); controls.push({ id: step.id, status: 'WITHDRAWN' }); }
    } else if (step.type === 'remove') {
      const sources = state.store.sources(longProject).filter(s => s.kind === step.target);
      assert.ok(sources.length > 0); for (const source of sources) state.store.sourceState(longProject, source.id, 'deleted');
      controls.push({ id: step.id, status: 'SOURCE_REMOVED', count: sources.length });
    } else if (step.type === 'restart') {
      const spending = state.store.budgetUsed(); await restart();
      assert.deepEqual(counts(), beforeCounts); assert.equal(state.store.budgetUsed(), spending);
      controls.push({ id: step.id, status: 'REOPENED', decisionCount: beforeCounts[0], briefCount: beforeCounts[1] });
    } else throw new Error('Unsupported fixed replay step');
    if (!['ask', 'reply'].includes(step.type)) assert.equal(calls(), beforeCalls);
  }
  for (const patch of [{ actor: { id: 'synthetic-outsider', roleIds: [] } }, { roomId: 'foreign-room' }]) {
    const before = calls(); const adapter = adapterFactory(); await state.core.handle({ ...event('qa', 'Read project decisions'), ...patch }, adapter);
    assert.equal(calls(), before); assert.equal(adapter.deliveries.length, 0);
  }
  const config = state.store.config(longProject); state.store.putConfig({ ...config, paused: true });
  const before = calls(); const adapter = adapterFactory(); await state.core.handle(event('owner', 'Read project decisions'), adapter); assert.equal(calls(), before); assert.equal(adapter.deliveries.length, 0);
  return { turns: results, controls, actorCount: corpus.actors.length, conversationalTurns: results.length, ambientTurns: results.filter(r => r.type === 'ambient').length, explicitRequests: results.filter(r => r.type !== 'ambient').length, scopeAndPauseProbes: 3, finalDecisionCount: counts()[0], finalBriefCount: counts()[1], identityKind: 'Simulated normalized actors; no platform authentication', conversationHistoryPolicy: 'Ambient chat is neither stored nor supplied; approved/saved records and selected bound reply only' };
}
