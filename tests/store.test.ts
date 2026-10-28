import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { Store } from '../src/store.js';
it('persists configuration and uncertain budget reservations across restart', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ai-teammate-store-')); const path = join(dir, 'state.sqlite');
  try {
    let store = new Store(path);
    store.putConfig({ projectId: 'p', platform: 'fake', workspaceId: 'w', roomId: 'r', memberIds: ['u'], approverIds: ['u'], approverRoleIds: [], paused: true, selectedSnapshot: null, revision: 1 });
    expect(store.reserve(1, 100000)).toBeTruthy(); store.close(); store = new Store(path);
    expect(store.config('p')?.paused).toBe(true); expect(store.budgetUsed()).toBe(0.1); expect(store.reserve(0.1, 1)).toBeNull(); store.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
