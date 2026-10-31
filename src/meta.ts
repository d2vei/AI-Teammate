import { z } from 'zod';
import { RESPONSE_OUTPUT_TOKEN_LIMIT, digest, ProviderDiagnosticsSchema, type ModelInput, type Provider, type ProviderDiagnostics, type ProviderResult } from './domain.js';
import { instructions } from './prompt.js';

const UsageSchema = z.object({ input_tokens: z.number().int().nonnegative().max(2_000_000), output_tokens: z.number().int().nonnegative().max(200_000) });
export class MetaProvider implements Provider {
  readonly mode = 'meta' as const; readonly model = 'muse-spark-1.3';
  constructor(private readonly key: string, private readonly http: typeof fetch = fetch, private readonly prompt = instructions) { if (!key) throw new Error('META_API_KEY is missing'); }
  get promptVersion() { return digest(this.prompt); }
  withPrompt(prompt: string): MetaProvider { return new MetaProvider(this.key, this.http, prompt); }
  async checkAccess(): Promise<void> {
    const response = await this.http('https://api.meta.ai/v1/models', { headers: { Authorization: `Bearer ${this.key}` }, signal: AbortSignal.timeout(15000), redirect: 'error' });
    if (!response.ok) throw new Error('Meta model access check failed');
    const data = z.object({ data: z.array(z.object({ id: z.string() })) }).parse(await response.json());
    if (!data.data.some(m => m.id === this.model)) throw new Error('Configured Standard model is not entitled');
  }
  async generate(input: ModelInput): Promise<ProviderResult> {
    const response = await this.http('https://api.meta.ai/v1/responses', {
      method: 'POST', headers: { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, instructions: this.prompt, input: JSON.stringify(input), store: false, max_output_tokens: RESPONSE_OUTPUT_TOKEN_LIMIT }),
      signal: AbortSignal.timeout(45000), redirect: 'error',
    });
    if (!response.ok || !response.body) throw new Error('Meta request failed; charge unknown');
    const reader = response.body.getReader(); const parts: Uint8Array[] = []; let size = 0;
    try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 131072) throw new Error('Meta response too large'); parts.push(part.value); } }
    finally { await reader.cancel(); }
    const parsed: unknown = JSON.parse(Buffer.concat(parts).toString('utf8'));
    const raw = (parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}) as Record<string, unknown>;
    const usage = UsageSchema.safeParse(raw.usage);
    const status = ProviderDiagnosticsSchema.shape.status.safeParse(raw.status);
    // Fixed labels only: never retain provider error/details, output text or reasoning here.
    const diagnostics: ProviderDiagnostics = { status: status.success ? status.data : 'unknown', parsing: 'invalid_envelope', outputTokensAtLimit: usage.success ? usage.data.output_tokens >= RESPONSE_OUTPUT_TOKEN_LIMIT : null };
    if (diagnostics.status !== 'completed' && diagnostics.status !== 'unknown') diagnostics.parsing = 'not_completed';
    const envelope = z.object({ id: z.string(), status: z.literal('completed'), model: z.literal(this.model), output: z.array(z.object({ type: z.string(), content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional() })) }).safeParse(raw);
    let output: unknown = null;
    if (envelope.success) {
      const text = envelope.data.output.filter(x => x.type === 'message').flatMap(x => x.content ?? []).filter(x => x.type === 'output_text').map(x => x.text ?? '').join('');
      if (!text.trim()) diagnostics.parsing = 'no_output_text';
      else {
        try { output = JSON.parse(text); diagnostics.parsing = 'json'; }
        catch { diagnostics.parsing = 'invalid_json'; }
      }
    }
    return { output, usage: usage.success ? { inputTokens: usage.data.input_tokens, outputTokens: usage.data.output_tokens } : null, requestId: typeof raw.id === 'string' ? raw.id : null, diagnostics };
  }
}
