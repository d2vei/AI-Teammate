import { describe, expect, it } from 'vitest';
import { audienceAllowed, renderDiscord } from '../src/discord-view.js';
import type { ProjectConfig } from '../src/domain.js';
const config: ProjectConfig = { projectId: 'p', platform: 'discord', workspaceId: 'g', roomId: 'r', memberIds: ['owner'], approverIds: ['owner'], approverRoleIds: [], paused: false, selectedSnapshot: null, revision: 1 };
describe('Discord audience and renderer - offline only', () => {
  it('blocks a visible unconfigured identity even if an administrator or another bot', () => {
    expect(audienceAllowed(config, 'self', [{ id: 'owner', canView: true }, { id: 'self', canView: true }])).toBe(true);
    expect(audienceAllowed(config, 'self', [{ id: 'outsider', canView: true }])).toBe(false);
    expect(audienceAllowed(config, 'self', [{ id: 'outsider', canView: false }])).toBe(true);
  });
  it('disables mention parsing and rejects oversized replies', () => {
    expect(renderDiscord({ text: '@everyone synthetic' }).allowedMentions.parse).toEqual([]);
    expect(renderDiscord({ text: 'x'.repeat(2001) }).content).not.toContain('xxx');
  });
});
