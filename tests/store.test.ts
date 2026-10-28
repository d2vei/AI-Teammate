import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { Store } from '../src/store.js';
import type { RequestEvent } from '../src/domain.js';
it('persists configuration and uncertain budget reservations across restart', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ai-teammate-store-')); const path = join(dir, 'state.sqlite');
  try {
    let store = new Store(path);
    store.putConfig({ projectId: 'p', platform: 'fake', workspaceId: 'w', roomId: 'r', memberIds: ['u'], approverIds: ['u'], approverRoleIds: [], paused: true, selectedSnapshot: null, revision: 1 });
    expect(store.reserve(1, 100000)).toBeTruthy(); store.close(); store = new Store(path);
    expect(store.config('p')?.paused).toBe(true); expect(store.budgetUsed()).toBe(0.1); expect(store.reserve(0.1, 1)).toBeNull(); store.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
it('persists accepted briefs across restart and serializes duplicate confirmations through two connections', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ai-teammate-acceptance-')); const path = join(dir, 'state.sqlite');
  let a: Store | undefined; let b: Store | undefined;
  const e: RequestEvent = { id: 'new-brief', platform: 'fake', workspaceId: 'w', roomId: 'r', projectId: 'p', actor: { id: 'owner', roleIds: [] }, text: 'Prepare brief.', invocation: 'action', version: '1', replyTo: null, replyContext: null };
  try {
    a = new Store(path); a.putConfig({ projectId: 'p', platform: 'fake', workspaceId: 'w', roomId: 'r', memberIds: ['owner'], approverIds: ['owner'], approverRoleIds: [], paused: false, selectedSnapshot: null, revision: 1 });
    const p = a.propose(e, { kind: 'brief', objective: 'Investigate a report.', decisionIds: [], sourceIds: [], hypothesis: 'Evidence is missing.', nextCheck: 'Select permitted evidence.', exclusions: ['No execution.'] }, [], Date.now());
    b = new Store(path); const [first, duplicate] = await Promise.all([Promise.resolve().then(() => a!.accept(e, p.buttonId, Date.now())), Promise.resolve().then(() => b!.accept(e, p.buttonId, Date.now()))]);
    expect(first.id).toBe(duplicate.id); a.close(); a = undefined; b.close(); b = new Store(path);
    expect(b.briefs('p')).toHaveLength(1); expect(b.briefs('p')[0]?.status).toBe('saved');
  } finally { a?.close(); b?.close(); rmSync(dir, { recursive: true, force: true }); }
});
