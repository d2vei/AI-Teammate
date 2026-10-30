import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildRunArgs, childEnvironment, conversationEnvironment, appVariableNames, evaluationSettings } from '../scripts/vault-lib.mjs';
describe('Infisical launcher - no vault access', () => {
  it('injects only into the fixed bot/live-check child, with no import/expansion/recursive fetch', () => {
    const args = buildRunArgs('smoke', '/synthetic/project', '/synthetic/node');
    expect(args[0]).toBe('run'); expect(args).toContain('--include-imports=false'); expect(args).toContain('--expand=false');
    expect(args).toContain('--recursive=false'); expect(args.at(-1)).toBe('meta-smoke');
    expect(args.join(' ')).not.toContain('codex'); expect(args).not.toContain('--plain'); expect(args).not.toContain('--command');
    const core = buildRunArgs('core-live', '/synthetic/project', '/synthetic/node');
    expect(core.at(-1)).toBe('core-live'); expect(core.at(-2)).toMatch(/scripts[\\/]vault-child\.mjs$/);
    expect(buildRunArgs('media-live', '/synthetic/project', '/synthetic/node').at(-1)).toBe('media-live');
    expect(buildRunArgs('voice-diagnostic', '/synthetic/project', '/synthetic/node').at(-1)).toBe('voice-diagnostic');
    expect(buildRunArgs('media-live-v2', '/synthetic/project', '/synthetic/node').at(-1)).toBe('media-live-v2');
    expect(buildRunArgs('participation-live', '/synthetic/project', '/synthetic/node').at(-1)).toBe('participation-live');
    expect(buildRunArgs('participation-judge', '/synthetic/project', '/synthetic/node').at(-1)).toBe('participation-judge');
    expect(buildRunArgs('conversation-live', '/synthetic/project', '/synthetic/node').at(-1)).toBe('conversation-live');
    expect(buildRunArgs('conversation-live-check', '/synthetic/project', '/synthetic/node').at(-1)).toBe('conversation-live-check');
    expect(buildRunArgs('conversation-addon-check', '/synthetic/project', '/synthetic/node').at(-1)).toBe('conversation-addon-check');
    expect(buildRunArgs('memory-live', '/synthetic/project', '/synthetic/node').at(-1)).toBe('memory-live');
  });
  it.each(['codex', 'shell', 'export', 'npm test', 'jev', 'openai'])('rejects arbitrary command %s', action => { expect(() => buildRunArgs(action)).toThrow(); });
  it('does not forward unrelated provider keys, vault tokens or Node preload options', () => {
    const env = childEnvironment({ META_API_KEY: 'SYNTHETIC_META', DISCORD_BOT_TOKEN: 'SYNTHETIC_DISCORD', OPENAI_API_KEY: 'SYNTHETIC_OPENAI', JEV_API_KEY: 'SYNTHETIC_JEV', INFISICAL_TOKEN: 'SYNTHETIC_VAULT', NODE_OPTIONS: 'SYNTHETIC_PRELOAD' });
    expect(Object.keys(env)).toEqual(['DISCORD_BOT_TOKEN', 'META_API_KEY']); expect(env).not.toHaveProperty('OPENAI_API_KEY'); expect(env).not.toHaveProperty('JEV_API_KEY');
  });
  it('strips Discord and private-source controls from the Meta local terminal child', () => {
    const env = conversationEnvironment({ META_API_KEY: 'SYNTHETIC_META', META_MODEL_ID: 'muse-spark-1.3', META_PRIVATE_DATA_VERIFIED: 'true', DISCORD_BOT_TOKEN: 'SYNTHETIC_DISCORD', APP_PROJECT_ID: 'other-project', APP_MAX_SPEND_USD: '1', NODE_OPTIONS: 'SYNTHETIC_PRELOAD' });
    expect(env).toEqual({ META_API_KEY: 'SYNTHETIC_META', META_MODEL_ID: 'muse-spark-1.3', APP_MAX_SPEND_USD: '1' });
  });
  it('keeps every .env.example value blank and matches the app variable-name allowlist', () => {
    const lines = readFileSync('.env.example', 'utf8').split(/\r?\n/).filter(s => s && !s.startsWith('#'));
    for (const line of lines) expect(line).toMatch(/^[A-Z_]+=$/);
    expect(lines.map(s => s.slice(0, -1)).sort()).toEqual([...appVariableNames].sort());
  });
  it('uses fixed Standard evaluation settings and the shared smoke ledger without vault configuration', () => {
    expect(evaluationSettings({})).toEqual({ META_MODEL_ID: 'muse-spark-1.3', META_DATA_MODE: 'standard', APP_STATE_DIR: '.local/state', APP_MAX_SPEND_USD: '5', APP_AUTHORIZED_ALLOWANCE_USD: '5' });
    expect(() => evaluationSettings({ APP_STATE_DIR: '.local/other-budget' })).toThrow('share');
  });
  it('never increases a stricter budget and clamps an excessive dashboard value to the authorized cap', () => {
    expect(evaluationSettings({ APP_MAX_SPEND_USD: '0', APP_AUTHORIZED_ALLOWANCE_USD: '1' })).toMatchObject({ APP_MAX_SPEND_USD: '0', APP_AUTHORIZED_ALLOWANCE_USD: '1' });
    expect(evaluationSettings({ APP_MAX_SPEND_USD: '120', APP_AUTHORIZED_ALLOWANCE_USD: '999' })).toMatchObject({ APP_MAX_SPEND_USD: '5', APP_AUTHORIZED_ALLOWANCE_USD: '5' });
  });
  it.each(['NaN', '-1', 'Infinity'])('rejects invalid evaluation budget %s before dispatch', value => {
    expect(() => evaluationSettings({ APP_MAX_SPEND_USD: value })).toThrow('budget');
  });
});
