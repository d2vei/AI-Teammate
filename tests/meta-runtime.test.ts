import { expect, it } from 'vitest';
import { Store } from '../src/store.js';
import { createMetaRuntime, serializedMetaTransport } from '../src/meta-runtime.js';
import { Teammate } from '../src/core.js';
import { FakeAdapter } from '../src/fakes.js';
import type { RequestEvent } from '../src/domain.js';

it.each(['direct', 'monitor'] as const)('reserves the full 4096-token allowance before %s dispatch', async kind => {
  const store = new Store(':memory:'); let calls = 0;
  // This can pay for 4096 output tokens alone, but not their input. It must block.
  const cap = 0.017408;
  const runtime = createMetaRuntime('SYNTHETIC-HTTP-ONLY', store, cap, async () => { calls++; throw new Error('Unexpected dispatch'); });
  try {
    if (kind === 'direct') {
      store.putConfig({ projectId: 'p', platform: 'fake', workspaceId: 'w', roomId: 'r', memberIds: ['owner'], approverIds: ['owner'], approverRoleIds: [], selectedSnapshot: null, paused: false, revision: 1 });
      const e: RequestEvent = { id: 'direct-cap', platform: 'fake', workspaceId: 'w', projectId: 'p', roomId: 'r', actor: { id: 'owner', roleIds: [] }, invocation: 'mention', text: 'Synthetic question.', replyTo: null, replyContext: null, version: '1' };
      await new Teammate(store, runtime.provider, cap).handle(e, new FakeAdapter());
      expect(store.traces().at(-1)?.outcome).toBe('budget_blocked');
    } else await expect(runtime.participation.monitor({ messages: [], evidence: [], openClaims: [] })).rejects.toThrow('budget unavailable');
    expect(calls).toBe(0); expect(store.budgetUsed()).toBe(0);
  } finally { store.close(); }
});

it('holds the shared slot through a streamed body and advances after a failed body without retry', async () => {
  let calls = 0; let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const http: typeof fetch = async () => { calls++; return new Response(new ReadableStream({ async start(controller) { await gate; controller.error(new Error('synthetic stream failure')); } })); };
  const transport = serializedMetaTransport(http);
  const first = transport('https://api.meta.ai/v1/responses').catch(() => 'failed');
  const second = transport('https://api.meta.ai/v1/responses').catch(() => 'failed');
  await Promise.resolve(); await Promise.resolve(); expect(calls).toBe(1);
  release(); expect(await first).toBe('failed'); expect(await second).toBe('failed'); expect(calls).toBe(2);
});

it('serializes simultaneous direct, monitor and visual requests against the same budget', async () => {
  const store = new Store(':memory:'); let active = 0; let maximum = 0; let calls = 0;
  const http: typeof fetch = async (_url, init) => {
    calls++; active++; maximum = Math.max(maximum, active);
    const body = JSON.parse(init!.body as string); const prompt = body.instructions as string;
    const output = prompt.startsWith('Describe relevant') ? 'A synthetic image description.' : prompt.startsWith('You inspect') ? JSON.stringify({ status: 'on_track', claim: '', evidenceIds: [], confidence: 1 }) : JSON.stringify({ answer: 'Synthetic direct answer.', citations: [] });
    const data = JSON.stringify({ id: 'mock-response', status: 'completed', model: 'muse-spark-1.3', output: [{ type: 'message', content: [{ type: 'output_text', text: output }] }], usage: { input_tokens: 10, output_tokens: 10 } });
    return new Response(new ReadableStream({ async start(controller) { await Promise.resolve(); controller.enqueue(new TextEncoder().encode(data)); active--; controller.close(); } }));
  };
  try {
    store.putConfig({ projectId: 'p', platform: 'fake', workspaceId: 'w', roomId: 'r', memberIds: ['owner'], approverIds: ['owner'], approverRoleIds: [], selectedSnapshot: null, paused: false, revision: 1 });
    const runtime = createMetaRuntime('SYNTHETIC-HTTP-ONLY', store, 5, http);
    const e: RequestEvent = { id: 'direct', platform: 'fake', workspaceId: 'w', projectId: 'p', roomId: 'r', actor: { id: 'owner', roleIds: [] }, invocation: 'mention', text: 'Synthetic request.', replyTo: null, replyContext: null, version: '1' };
    const adapter = new FakeAdapter();
    await Promise.all([
      new Teammate(store, runtime.provider, 5).handle(e, adapter),
      runtime.participation.monitor({ messages: [], evidence: [], openClaims: [] }),
      runtime.media.derive({ kind: 'image', mime: 'image/png', synthetic: true, bytes: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]) }),
    ]);
    expect(calls).toBe(3); expect(maximum).toBe(1); expect(adapter.deliveries).toHaveLength(1); expect(store.budgetUsed()).toBe(0.000165);
  } finally { store.close(); }
});
