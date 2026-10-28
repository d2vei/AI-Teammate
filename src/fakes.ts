import type { Adapter, Delivery, ModelInput, Provider, ProviderResult, RequestEvent } from './domain.js';
export class FakeAdapter implements Adapter {
  allowed = true; failSend = false; attempts = 0; deliveries: Delivery[] = [];
  async canDeliver(_e: RequestEvent) { return this.allowed; }
  async send(_e: RequestEvent, delivery: Delivery) { this.attempts++; if (this.failSend) throw new Error('synthetic send failure'); this.deliveries.push(delivery); }
}
export class MockProvider implements Provider {
  readonly mode = 'mock' as const; readonly model = 'offline-scripted-v1'; calls: ModelInput[] = [];
  output: unknown = { answer: 'No project evidence is selected. What decision or snapshot should I inspect?', citations: [] };
  failure = false; beforeReturn: (() => void | Promise<void>) | undefined;
  async generate(input: ModelInput): Promise<ProviderResult> {
    this.calls.push(input); await this.beforeReturn?.(); if (this.failure) throw new Error('synthetic timeout');
    return { output: this.output, usage: { inputTokens: 0, outputTokens: 0 }, requestId: null };
  }
}
