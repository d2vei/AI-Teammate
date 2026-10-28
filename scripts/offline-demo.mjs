import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, basename, sep } from 'node:path';
import { Store } from '../dist/store.js';
import { Teammate } from '../dist/core.js';
import { FakeAdapter, MockProvider } from '../dist/fakes.js';
import { ingestBundle } from '../dist/sources.js';
const dir = mkdtempSync(join(tmpdir(), 'ai-teammate-offline-')); const db = join(dir, 'demo.sqlite');
let store = new Store(db);
try {
  const config = { projectId: 'synthetic-demo', platform: 'fake', workspaceId: 'test-workspace', roomId: 'test-room', memberIds: ['synthetic-owner', 'synthetic-peer'], approverIds: ['synthetic-owner'], approverRoleIds: ['maintainer'], paused: false, selectedSnapshot: 'offline-seeded-v1', revision: 1 };
  store.putConfig(config); const bundle = JSON.parse(readFileSync(new URL('../examples/party-queue.json', import.meta.url), 'utf8'));
  bundle.snapshot = config.selectedSnapshot; bundle.logs.forEach(l => { l.at = new Date().toISOString(); }); ingestBundle(store, config.projectId, bundle, Date.now());
  const provider = new MockProvider(); const adapter = new FakeAdapter(); const core = new Teammate(store, provider, 1);
  const e = { id: 'new-decision-request', projectId: config.projectId, platform: 'fake', workspaceId: config.workspaceId, roomId: config.roomId, actor: { id: 'synthetic-owner', roleIds: ['maintainer'] }, invocation: 'mention', text: 'Propose a decision: party members must stay together.', version: 'v1', replyTo: null, replyContext: null };
  provider.output = { answer: 'Draft rule, awaiting your approval.', citations: [], proposal: { kind: 'decision', statement: 'Party members must stay together.', sourceIds: [] } };
  await core.handle(e, adapter); assert.equal(store.decisions(config.projectId).length, 0);
  const decision = store.accept(e, adapter.deliveries.at(-1).proposal.buttonId, Date.now());
  const context = core.context(e); const code = context.find(c => c.kind === 'code'); const log = context.find(c => c.kind === 'log');
  const refs = [`decision:${decision.id}`, code.id, log.id];
  provider.output = { answer: 'The selected loop assigns individual members to different rooms. The seeded event is consistent with a mismatch with the approved rule; this is a hypothesis, not a reproduction.', citations: refs, proposal: { kind: 'brief', objective: 'Investigate party assignment against the approved rule.', decisionIds: [refs[0]], sourceIds: [code.id, log.id], hypothesis: 'Per-member room selection may split the party.', nextCheck: 'A developer can reproduce with two members in a separately authorized session.', exclusions: ['No execution, source changes, Git writes or deployments by this app.'] } };
  const investigation = { ...e, id: 'new-investigation', actor: { id: 'synthetic-peer', roleIds: [] }, text: 'Inspect the selected party source and event; propose a brief.' };
  await core.handle(investigation, adapter); const card = adapter.deliveries.at(-1).proposal;
  assert.throws(() => store.accept(investigation, card.buttonId, Date.now()));
  const saved = store.accept(e, card.buttonId, Date.now()); assert.equal(saved.status, 'saved');
  assert.equal(store.accept(e, card.buttonId, Date.now()).id, saved.id); assert.equal(store.briefs(config.projectId).length, 1);
  store.close(); store = new Store(db); assert.equal(store.decisions(config.projectId).length, 1); assert.equal(store.briefs(config.projectId)[0].status, 'saved');
  console.log(JSON.stringify({ status: 'PASS', evidenceKind: 'scripted MOCK provider + fake adapters + real temporary SQLite', liveMetaCalls: 0, liveDiscordSends: 0, newDecisionsApproved: 1, briefsSaved: 1, duplicateRecords: 0, wrongActorRejected: true, restartVerified: true, executedWork: false, at: new Date().toISOString() }, null, 2));
} finally {
  store.close();
  const target = resolve(dir); if (!target.startsWith(resolve(tmpdir()) + sep) || !basename(target).startsWith('ai-teammate-offline-')) throw new Error('Unexpected cleanup target');
  rmSync(target, { recursive: true, force: true });
}
