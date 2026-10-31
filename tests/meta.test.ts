import { describe, expect, it, vi } from 'vitest';
import { MetaProvider } from '../src/meta.js';
import type { ModelInput } from '../src/domain.js';
const input: ModelInput = { event: { id: 'synthetic', version: '1', actor: { id: 'a', roleIds: [] }, replyTo: null }, question: 'What evidence is missing?', reply: null, context: [] };
describe('Meta documented Responses protocol - HTTP MOCKS ONLY', () => {
  it('uses the fixed official Standard model endpoint, stateless storage and bounded output', async () => {
    const http = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ id: 'r1', model: 'muse-spark-1.3', status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ answer: 'Missing source.', citations: [] }) }] }], usage: { input_tokens: 20, output_tokens: 30 } })));
    const result = await new MetaProvider('synthetic-not-a-real-key', http).generate(input);
    expect(http.mock.calls[0]?.[0]).toBe('https://api.meta.ai/v1/responses');
    const body = JSON.parse(http.mock.calls[0]![1]!.body as string);
    expect(body).toMatchObject({ model: 'muse-spark-1.3', store: false, max_output_tokens: 4096 });
    expect(body.tools).toBeUndefined(); expect(result.usage).toEqual({ inputTokens: 20, outputTokens: 30 });
  });
  it('retains reported usage even if visible JSON is invalid', async () => {
    const http = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ id: 'r2', model: 'muse-spark-1.3', status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'invalid' }] }], usage: { input_tokens: 7, output_tokens: 9 } })));
    expect(await new MetaProvider('synthetic', http).generate(input)).toMatchObject({ output: null, usage: { inputTokens: 7, outputTokens: 9 } });
  });
  it('does not retry rate limiting or change provider/model', async () => {
    const http = vi.fn<typeof fetch>().mockResolvedValue(new Response('untrusted failure body', { status: 429 }));
    await expect(new MetaProvider('synthetic', http).generate(input)).rejects.toThrow('charge unknown'); expect(http).toHaveBeenCalledTimes(1);
  });
  it('rejects missing credentials and unentitled models', async () => {
    expect(() => new MetaProvider('')).toThrow('missing');
    const http = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ data: [{ id: 'different' }] })));
    await expect(new MetaProvider('synthetic', http).checkAccess()).rejects.toThrow('not entitled');
  });
});
