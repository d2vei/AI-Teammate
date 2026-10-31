import { RESPONSE_OUTPUT_TOKEN_LIMIT } from './domain.js';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { digest, type ModelInput } from './domain.js';
import { MetaProvider } from './meta.js';
import type { ParticipationInput, ParticipationReasoner } from './participation.js';
import type { Store } from './store.js';

const prompts = Object.fromEntries(['monitor', 'repair', 'generate'].map(name => [name, readFileSync(new URL(`../prompts/participation-${name}.md`, import.meta.url), 'utf8')])) as Record<'monitor' | 'repair' | 'generate', string>;
// Prepared adapter only: no CLI/live activation until the initial smoke succeeds.
// Independent policy observations share ONE serialized, budgeted provider queue.
export class MetaParticipationReasoner implements ParticipationReasoner {
  readonly mode = 'meta' as const;
  readonly model: string;
  readonly promptIdentity = digest(prompts);
  private queue: Promise<void> = Promise.resolve();
  constructor(readonly provider: MetaProvider, readonly budget: Store, readonly capUsd: number) { this.model = provider.model; }
  monitor(input: ParticipationInput) { return this.request('monitor', input); }
  selfRepair(input: ParticipationInput) { return this.request('repair', input); }
  generate(input: Parameters<ParticipationReasoner['generate']>[0]) { return this.request('generate', input); }
  private request(kind: keyof typeof prompts, input: ParticipationInput | Parameters<ParticipationReasoner['generate']>[0]): Promise<unknown> {
    const payload = structuredClone(input);
    const run = this.queue.then(async () => {
      if (!Number.isFinite(this.capUsd) || this.capUsd <= 0 || this.capUsd > 5) throw new Error('Authorized cumulative Meta cap required, at most USD 5');
      const modelInput: ModelInput = { event: { id: randomUUID(), version: 'participation-shadow-v1', actor: { id: 'application-observer', roleIds: [] }, replyTo: null }, question: JSON.stringify({ messages: payload.messages, openClaims: payload.openClaims, ...('finding' in payload ? { finding: payload.finding } : {}) }), reply: null, context: payload.evidence };
      const bytes = Buffer.byteLength(JSON.stringify(modelInput)); if (bytes > 24000) throw new Error('Bounded context required');
      const prompt = prompts[kind];
      const reservation = this.budget.reserve(this.capUsd, Math.ceil((bytes + Buffer.byteLength(prompt) + 1000) * 1.25 + RESPONSE_OUTPUT_TOKEN_LIMIT * 4.25));
      if (!reservation) throw new Error('Authorized budget unavailable');
      // MetaProvider has no retry/fallback. Throws retain the uncertain reservation.
      const result = await this.provider.withPrompt(prompt).generate(modelInput);
      this.budget.settle(reservation, result.usage); return result.output;
    });
    this.queue = run.then(() => undefined, () => undefined); return run;
  }
}
