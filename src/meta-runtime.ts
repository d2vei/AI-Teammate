import { MetaProvider } from './meta.js';
import { MetaParticipationReasoner } from './participation-meta.js';
import { MetaMediaProvider } from './media-meta.js';
import type { Store } from './store.js';

// One transport per host runtime. Hold the slot through the response body, not
// just headers: a provider may still be generating after fetch() resolves.
export function serializedMetaTransport(http: typeof fetch): typeof fetch {
  let tail: Promise<void> = Promise.resolve();
  return (input, init) => {
    const run = tail.then(async () => {
      const response = await http(input, init);
      if (!response.body) return response;
      const reader = response.body.getReader(); const parts: Uint8Array[] = []; let size = 0;
      try {
        while (true) { const next = await reader.read(); if (next.done) break; size += next.value.length; if (size > 131072) throw new Error('Provider response exceeds bounds'); parts.push(next.value); }
      } finally { await reader.cancel(); }
      return new Response([204, 205, 304].includes(response.status) ? null : Buffer.concat(parts), { status: response.status, statusText: response.statusText, headers: response.headers });
    });
    tail = run.then(() => undefined, () => undefined);
    return run;
  };
}

export function createMetaRuntime(key: string, budget: Store, capUsd: number, http: typeof fetch = fetch) {
  if (!Number.isFinite(capUsd) || capUsd <= 0 || capUsd > 5) throw new Error('Authorized shared cap must be positive and at most USD 5');
  const transport = serializedMetaTransport(http);
  const provider = new MetaProvider(key, transport);
  return { provider, participation: new MetaParticipationReasoner(provider, budget, capUsd), media: new MetaMediaProvider(key, budget, capUsd, transport) };
}
