import { describe, expect, it, vi } from 'vitest';
import { MetaProvider } from '../src/meta.js';
import { Teammate } from '../src/core.js';
import { Store } from '../src/store.js';
import { FakeAdapter } from '../src/fakes.js';
import type { ModelInput, RequestEvent } from '../src/domain.js';

const input: ModelInput = { event: { id: 'diagnostic', version: '1', actor: { id: 'owner', roleIds: [] }, replyTo: null }, question: 'Compare the selected source and log.', reply: null, context: [] };
const answer = { answer: 'Synthetic partial answer that must not be delivered.', citations: [] };
const envelope = { id: 'synthetic-response', model: 'muse-spark-1.3', status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(answer) }] }], usage: { input_tokens: 40, output_tokens: 4096 } };
const transport = (raw: unknown) => vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(raw)));

describe('content-free Meta diagnostics - HTTP MOCKS ONLY', () => {
  it.each([
    { name: 'incomplete even with parseable partial text', patch: { status: 'incomplete' }, status: 'incomplete', parsing: 'not_completed' },
    { name: 'invalid JSON at the cap is not proof of incompletion', patch: { output: [{ type: 'message', content: [{ type: 'output_text', text: 'private malformed answer' }] }] }, status: 'completed', parsing: 'invalid_json' },
    { name: 'no visible answer', patch: { output: [{ type: 'reasoning', content: [] }] }, status: 'completed', parsing: 'no_output_text' },
    { name: 'wrong model envelope', patch: { model: 'different-model' }, status: 'completed', parsing: 'invalid_envelope' },
    { name: 'failed response', patch: { status: 'failed' }, status: 'failed', parsing: 'not_completed' },
    { name: 'unknown status is not copied', patch: { status: 'private unexpected status' }, status: 'unknown', parsing: 'invalid_envelope' },
  ])('$name', async ({ patch, status, parsing }) => {
    const http = transport({ ...envelope, ...patch, error: { message: 'private error text' }, incomplete_details: { reason: 'private provider detail' } });
    const result = await new MetaProvider('synthetic', http).generate(input);
    expect(result.output).toBeNull();
    expect(result.usage).toEqual({ inputTokens: 40, outputTokens: 4096 });
    expect(result).toHaveProperty('diagnostics', { status, parsing, outputTokensAtLimit: true });
    expect(JSON.stringify(result)).not.toContain('private');
    expect(http).toHaveBeenCalledTimes(1);
  });

  it('distinguishes valid JSON from application validity without retaining answer text in diagnostics', async () => {
    const raw = { ...envelope, usage: { input_tokens: 40, output_tokens: 20 } };
    const result = await new MetaProvider('synthetic', transport(raw)).generate(input);
    expect(result.output).toEqual(answer);
    expect(result).toHaveProperty('diagnostics', { status: 'completed', parsing: 'json', outputTokensAtLimit: false });
  });

  it('persists the diagnostic for a rejected partial response, settles usage and never delivers or retries its text', async () => {
    const store = new Store(':memory:');
    try {
      store.putConfig({ projectId: 'diagnostic', platform: 'fake', workspaceId: 'local', roomId: 'room', memberIds: ['owner'], approverIds: ['owner'], approverRoleIds: [], paused: false, selectedSnapshot: null, revision: 1 });
      const http = transport({ ...envelope, status: 'incomplete', incomplete_details: { reason: 'private provider detail' } });
      const provider = new MetaProvider('synthetic', http); const core = new Teammate(store, provider, 1); const adapter = new FakeAdapter();
      const event: RequestEvent = { ...input.event, platform: 'fake', workspaceId: 'local', projectId: 'diagnostic', roomId: 'room', invocation: 'mention', text: input.question, replyContext: null };
      await core.handle(event, adapter); await core.handle(event, adapter);
      expect(http).toHaveBeenCalledTimes(1); expect(adapter.deliveries).toHaveLength(1);
      expect(adapter.deliveries[0]?.text).toContain('No answer was accepted');
      expect(adapter.deliveries[0]?.text).not.toContain(answer.answer);
      const trace = store.traces().at(-1);
      expect(trace).toMatchObject({ outcome: 'invalid_or_unavailable', providerDiagnostics: { status: 'incomplete', parsing: 'not_completed', outputTokensAtLimit: true } });
      expect(JSON.stringify(trace)).not.toContain('private');
      expect(JSON.stringify(trace)).not.toContain(answer.answer);
      expect(store.db.prepare('SELECT state,micros FROM charges').get()).toEqual({ state: 'reported', micros: 17458 });
    } finally { store.close(); }
  });
});
