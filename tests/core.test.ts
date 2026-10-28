import { afterEach, describe, expect, it, vi } from 'vitest';
import { Store } from '../src/store.js';
import { Teammate } from '../src/core.js';
import { FakeAdapter, MockProvider } from '../src/fakes.js';
import type { ProjectConfig, RequestEvent } from '../src/domain.js';

export const config: ProjectConfig = { projectId: 'test', platform: 'fake', workspaceId: 'guild', roomId: 'room', memberIds: ['owner', 'peer'], approverIds: ['owner'], approverRoleIds: ['maintainer'], paused: false, selectedSnapshot: null, revision: 1 };
export const event: RequestEvent = { id: 'e1', platform: 'fake', workspaceId: 'guild', projectId: 'test', roomId: 'room', actor: { id: 'owner', roleIds: ['maintainer'] }, invocation: 'mention', text: 'What is the next step?', version: 'v1', replyTo: null, replyContext: null };
const stores: Store[] = [];
export function setup(provider = new MockProvider()) {
  const store = new Store(':memory:'); stores.push(store); store.putConfig(config);
  const adapter = new FakeAdapter(); const core = new Teammate(store, provider, 1, () => Date.now());
  return { store, adapter, provider, core };
}
afterEach(() => { for (const s of stores.splice(0)) s.close(); vi.useRealTimers(); });

describe('explicit scoped exchange', () => {
  it.each(['ambient', 'bot'] as const)('does not infer invocation from %s', async invocation => {
    const x = setup(); await x.core.handle({ ...event, invocation }, x.adapter);
    expect(x.provider.calls).toHaveLength(0); expect(x.adapter.deliveries).toHaveLength(0);
  });
  it.each([{ roomId: 'elsewhere' }, { projectId: 'other' }, { workspaceId: 'other' }, { actor: { id: 'outsider', roleIds: ['maintainer'] } }])('denies unconfigured scope %j', async patch => {
    const x = setup(); await x.core.handle({ ...event, ...patch }, x.adapter); expect(x.provider.calls).toHaveLength(0);
  });
  it.each(['mention', 'reply', 'action'] as const)('answers explicit %s once', async invocation => {
    const x = setup(); await x.core.handle({ ...event, invocation }, x.adapter); await x.core.handle({ ...event, invocation }, x.adapter);
    expect(x.provider.calls).toHaveLength(1); expect(x.adapter.deliveries).toHaveLength(1);
    expect(x.adapter.deliveries[0]?.text).toContain('MOCK');
  });
  it('rechecks pause before delivery', async () => {
    const x = setup(); x.provider.beforeReturn = () => x.store.putConfig({ ...config, paused: true, revision: 2 });
    await x.core.handle(event, x.adapter); expect(x.adapter.deliveries).toHaveLength(0);
  });
  it('rechecks output audience before delivery', async () => {
    const x = setup(); x.provider.beforeReturn = () => { x.adapter.allowed = false; };
    await x.core.handle(event, x.adapter); expect(x.adapter.deliveries).toHaveLength(0);
  });
  it('keeps uncertain charges reserved after a timeout and never retries', async () => {
    const x = setup(); x.provider.failure = true; await x.core.handle(event, x.adapter);
    expect(x.store.budgetUsed()).toBeGreaterThan(0); expect(x.provider.calls).toHaveLength(1);
    expect(x.adapter.deliveries[0]?.text).toContain('uncertain');
  });
  it('blocks with no authorized budget', async () => {
    const x = setup(); const core = new Teammate(x.store, x.provider, 0);
    await core.handle(event, x.adapter); expect(x.provider.calls).toHaveLength(0); expect(x.adapter.deliveries[0]?.text).toContain('budget');
  });
  it('does not retry an uncertain external send', async () => {
    const x = setup(); x.adapter.failSend = true; await x.core.handle(event, x.adapter); await x.core.handle(event, x.adapter);
    expect(x.adapter.attempts).toBe(1); expect(x.store.traces().at(-1)?.result).toBe('delivery_uncertain');
  });
  it('rejects a model execution status and unknown citation', async () => {
    const x = setup(); x.provider.output = { answer: 'I ran the tests.', citations: [], execution: 'done' };
    await x.core.handle(event, x.adapter); expect(x.adapter.deliveries[0]?.text).toContain('invalid');
    x.provider.output = { answer: 'Supported.', citations: ['invented'] };
    await x.core.handle({ ...event, id: 'e2' }, x.adapter); expect(x.adapter.deliveries[1]?.text).toContain('invalid');
  });
});
