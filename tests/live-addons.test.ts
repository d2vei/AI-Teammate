import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, truncateSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { Store } from '../src/store.js';
import { LiveConversation, type LiveServices } from '../src/live-conversation.js';
import { LocalMediaInbox } from '../src/local-media-inbox.js';
import { ErrorWatch, ErrorWatchLedger } from '../src/error-watch.js';
import { SavedSyntheticReplay } from '../src/live-watch.js';
import { MetaProvider } from '../src/meta.js';
import { MetaMediaProvider } from '../src/media-meta.js';
import type { ModelInput } from '../src/domain.js';
import type { HarnessOutput } from '../src/local-harness.js';
import type { MediaPayload } from '../src/media.js';

const cleanup: (() => void | Promise<void>)[] = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); vi.useRealTimers(); });
function inbox() {
  mkdirSync('.local/test-inboxes', { recursive: true }); const root = mkdtempSync(resolve('.local/test-inboxes/addons-')); const owned = realpathSync(root);
  cleanup.push(() => { const r = relative(realpathSync('.local/test-inboxes'), realpathSync(root)); if (!r || r.startsWith('..') || realpathSync(root) !== owned) throw new Error('Cleanup scope changed'); rmSync(root, { recursive: true }); });
  return { root, inbox: new LocalMediaInbox(root) };
}
function envelope(output: unknown) { return new Response(JSON.stringify({ id: 'synthetic-response', status: 'completed', model: 'muse-spark-1.3', usage: { input_tokens: 20, output_tokens: 40 }, output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(output) }] }] })); }
function fixture(services: LiveServices = {}, responder?: (input: ModelInput) => Promise<Response>) {
  const store = new Store(':memory:'); const ledger = new ErrorWatchLedger(':memory:'); const inputs: ModelInput[] = []; const emissions: HarnessOutput[] = [];
  const http: typeof fetch = async (_url, init) => {
    const input = JSON.parse(JSON.parse(init!.body as string).input) as ModelInput; inputs.push(input);
    return responder ? responder(input) : envelope({ answer: 'HTTP-MOCK diagnosis: a possible cause, not reproduced. Next check the supplied error path.', citations: input.context.filter(c => c.kind !== 'missing_evidence').map(c => c.id) });
  };
  const harness = new LiveConversation(store, new MetaProvider('SYNTHETIC_NOT_REAL', http), 5, Date.now, { watch: new ErrorWatch(store, ledger), feed: new SavedSyntheticReplay(), emit: r => emissions.push(r), ...services });
  cleanup.push(async () => { await harness.close(); ledger.close(); store.close(); }); return { store, ledger, harness, inputs, emissions };
}
it('reads one bounded inbox snapshot, detects edits, zeroes its copy and preserves the original', () => {
  const x = inbox(); const path = join(x.root, 'synthetic.png'); const original = Buffer.from('synthetic bytes'); writeFileSync(path, original);
  const loaded = x.inbox.load('synthetic.png', 'image'); expect(loaded.current()).toBe(true); expect(Buffer.from(loaded.payload.bytes)).toEqual(original);
  writeFileSync(path, 'changed synthetic bytes'); expect(loaded.current()).toBe(false); loaded.dispose(); expect(loaded.payload.bytes.every(b => b === 0)).toBe(true);
  expect(readFileSync(path, 'utf8')).toBe('changed synthetic bytes'); expect(loaded.current()).toBe(false);
  for (const name of ['../synthetic.png', 'https://example.invalid/a.png', 'C:\\a.png', 'two..png']) expect(() => x.inbox.load(name, 'image')).toThrow();
  expect(() => x.inbox.load('synthetic.png', 'voice')).toThrow(); expect(() => x.inbox.load('synthetic.png', 'image', true)).toThrow();
  truncateSync(path, 2_000_001); expect(() => x.inbox.load('synthetic.png', 'image')).toThrow();
});
it('rejects a linked inbox directory without reading its target', () => {
  const x = inbox(); const target = join(x.root, 'target'); mkdirSync(target); writeFileSync(join(target, 'synthetic.png'), 'synthetic bytes');
  const linked = join(x.root, 'linked'); symlinkSync(target, linked, process.platform === 'win32' ? 'junction' : 'dir');
  try { expect(() => new LocalMediaInbox(linked).load('synthetic.png', 'image')).toThrow('outside inbox'); }
  finally { unlinkSync(linked); }
});
it('composes actual media protocol and conversation retrieval, with removal invalidating a saved brief (HTTP MOCK)', async () => {
  const files = inbox(); const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]); writeFileSync(join(files.root, 'synthetic.png'), bytes);
  const x = fixture({ inbox: files.inbox }); const mediaHttp = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ id: 'synthetic-vision', status: 'completed', model: 'muse-spark-1.3', usage: { input_tokens: 10, output_tokens: 20 }, output: [{ type: 'message', content: [{ type: 'output_text', text: 'Synthetic image says the group is available Sunday. This is unverified.' }] }] })));
  const harness = new LiveConversation(x.store, new MetaProvider('SYNTHETIC_NOT_REAL', async (_url, init) => { const input = JSON.parse(JSON.parse(init!.body as string).input) as ModelInput; x.inputs.push(input); return envelope({ answer: 'HTTP-MOCK: the attachment suggests Sunday.', citations: input.context.filter(c => c.id.startsWith('media:')).map(c => c.id) }); }), 5, Date.now, { inbox: files.inbox, media: new MetaMediaProvider('SYNTHETIC_NOT_REAL', x.store, 5, mediaHttp), normalizer: () => ({ normalize: async p => ({ ...p, mime: 'image/png', bytes: Uint8Array.from(p.bytes) }) }) });
  cleanup.push(() => harness.close());
  expect((await harness.line('/media image synthetic.png')).kind).toBe('error'); expect(mediaHttp).not.toHaveBeenCalled();
  const ingested = await harness.line('/media image synthetic.png --synthetic'); expect(ingested.kind).toBe('status'); expect(mediaHttp).toHaveBeenCalledTimes(1);
  const source = x.store.sources(harness.projectId).find(s => s.id.startsWith('media:'))!; const origin = (JSON.parse(source.text) as { originId: string }).originId;
  expect(x.store.decisions(harness.projectId)).toEqual([]); expect((await harness.line('/ask What availability does the attachment report?')).kind).toBe('response'); expect(x.inputs[0]!.context.some(c => c.id === source.id && c.text.includes('Sunday'))).toBe(true);
  const event = { id: 'synthetic-brief', version: '1', projectId: harness.projectId, platform: 'fake' as const, workspaceId: 'local-synthetic', roomId: 'conversation-room', actor: { id: 'synthetic-owner', roleIds: ['reviewer'] }, invocation: 'action' as const, text: 'Save a synthetic brief.', replyTo: null, replyContext: null };
  const card = x.store.propose(event, { kind: 'brief', objective: 'Check Sunday.', hypothesis: 'The availability note may help.', decisionIds: [], sourceIds: [source.id], nextCheck: 'Ask the group.', exclusions: ['No execution.'] }, harness.core.context(event), Date.now());
  x.store.accept(event, card.buttonId, Date.now()); expect(x.store.briefs(harness.projectId)).toHaveLength(1);
  await harness.line('/as peer'); expect((await harness.line(`/media remove ${origin}`)).text).toContain('0 attachment');
  await harness.line('/as owner'); await harness.line('/pause'); expect((await harness.line(`/media remove ${origin}`)).text).toContain('1 attachment'); await harness.line('/resume');
  expect(harness.core.context(event).find(c => c.id === `brief:${card.proposal.id}`)?.text).toBe('Brief evidence unavailable; contents withheld.'); expect((await harness.line('/reply Explain that.')).kind).toBe('error');
  expect(readFileSync(join(files.root, 'synthetic.png'))).toEqual(bytes); expect(JSON.stringify(x.store.sources(harness.projectId))).not.toContain('available Sunday');
});
it.each(['pause', 'edit'])('blocks media dispatch if %s happens during normalization', async action => {
  const files = inbox(); writeFileSync(join(files.root, 'synthetic.png'), Buffer.from('input fixture')); const derive = vi.fn(); let complete!: (value: MediaPayload) => void;
  const x = fixture({ inbox: files.inbox, media: { mode: 'meta', derive }, normalizer: () => ({ normalize: () => new Promise(r => { complete = r; }) }) });
  const pending = x.harness.line('/media image synthetic.png --synthetic'); await vi.waitFor(() => expect(complete).toBeTypeOf('function'));
  if (action === 'pause') await x.harness.line('/pause'); else writeFileSync(join(files.root, 'synthetic.png'), 'changed input');
  const prepared: MediaPayload = { kind: 'image', mime: 'image/png', synthetic: true, bytes: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]) }; complete(prepared);
  expect((await pending).kind).toBe('error'); expect(derive).not.toHaveBeenCalled(); expect(prepared.bytes.every(b => b === 0)).toBe(true);
});
it('uses real scheduler intervals, diagnoses 2 then 5 and spends nothing for unchanged 2 (HTTP MOCK)', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-29T12:00:00Z')); const x = fixture(); await x.harness.line('/watch start'); await x.harness.line('/watch auto on');
  await vi.advanceTimersByTimeAsync(0); expect(x.inputs).toHaveLength(1); expect(x.emissions[0]?.text).toContain('HTTP-MOCK diagnosis');
  const firstCharge = x.store.budgetUsed(); await vi.advanceTimersByTimeAsync(60_000); expect(x.inputs).toHaveLength(1); expect(x.store.budgetUsed()).toBe(firstCharge);
  await vi.advanceTimersByTimeAsync(60_000); expect(x.inputs).toHaveLength(2); expect(x.emissions.at(-1)?.text).toContain('count 5'); expect(x.inputs[1]!.context.some(c => c.label.includes('count 5') && c.text.includes('"count":5'))).toBe(true);
  expect(x.store.db.prepare('SELECT count(*) AS n FROM proposals').get()?.n).toBe(0); await x.harness.line('/watch stop'); await vi.advanceTimersByTimeAsync(180_000); expect(x.inputs).toHaveLength(2);
});
it.each(['stop', 'auto off', 'pause', 'source removal'])('withholds a late diagnosis after %s, retaining reported usage (HTTP MOCK)', async control => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-29T12:00:00Z')); let complete!: (value: Response) => void; const x = fixture({}, async () => new Promise(r => { complete = r; }));
  await x.harness.line('/watch start'); await x.harness.line('/watch auto on'); await vi.advanceTimersByTimeAsync(0); expect(x.inputs).toHaveLength(1);
  if (control === 'source removal') { const log = x.store.sources(x.harness.projectId).find(s => s.label.startsWith('REPLAY synthetic error'))!; x.store.sourceState(x.harness.projectId, log.id, 'deleted'); } else await x.harness.line(control === 'pause' ? '/pause' : `/watch ${control}`);
  complete(envelope({ answer: 'SYNTHETIC_LATE_DIAGNOSIS', citations: [] })); await vi.advanceTimersByTimeAsync(0); expect(x.emissions.map(r => r.text).join(' ')).not.toContain('SYNTHETIC_LATE_DIAGNOSIS'); expect(x.store.budgetUsed()).toBeGreaterThan(0);
});
it('requires the owner, shares the direct-request slot, and does not queue a skipped diagnosis (HTTP MOCK)', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-29T12:00:00Z')); let complete!: (value: Response) => void; const x = fixture({}, async () => new Promise(r => { complete = r; }));
  await x.harness.line('/as peer'); expect((await x.harness.line('/watch start')).kind).toBe('error'); await x.harness.line('/as owner'); expect((await x.harness.line('/watch start 61')).kind).toBe('error');
  const pending = x.harness.line('/ask Inspect party routing.'); await vi.advanceTimersByTimeAsync(0); await x.harness.line('/watch start'); await x.harness.line('/watch auto on'); await vi.advanceTimersByTimeAsync(0);
  expect(x.inputs).toHaveLength(1); expect(x.emissions[0]?.text).toContain('No retry or queued spending'); complete(envelope({ answer: 'Synthetic direct answer.', citations: [] })); await pending; await vi.advanceTimersByTimeAsync(60_000); expect(x.inputs).toHaveLength(1);
});
it('cannot create a proposal from an unsolicited model field in a watch diagnosis (HTTP MOCK)', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-29T12:00:00Z'));
  const x = fixture({}, async input => envelope({ answer: 'Synthetic hypothesis, next check the selected line.', citations: input.context.map(c => c.id), proposal: { kind: 'decision', statement: 'Unrequested synthetic decision.', sourceIds: input.context.map(c => c.id) } }));
  await x.harness.line('/watch start'); await x.harness.line('/watch auto on'); await vi.advanceTimersByTimeAsync(0);
  expect(x.inputs).toHaveLength(1); expect(x.emissions[0]?.kind).toBe('response'); expect(x.emissions[0]?.text).toContain('Synthetic hypothesis');
  expect(x.store.db.prepare('SELECT count(*) AS n FROM proposals').get()?.n).toBe(0); expect(x.store.decisions(x.harness.projectId)).toEqual([]);
});
