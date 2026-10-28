import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildRunArgs, childEnvironment, appVariableNames } from '../scripts/vault-lib.mjs';
describe('Infisical launcher - no vault access', () => {
  it('injects only into the fixed bot/live-check child, with no import/expansion/recursive fetch', () => {
    const args = buildRunArgs('bot', '/synthetic/project', '/synthetic/node');
    expect(args[0]).toBe('run'); expect(args).toContain('--include-imports=false'); expect(args).toContain('--expand=false');
    expect(args).toContain('--recursive=false'); expect(args.at(-1)).toBe('start');
    expect(args.join(' ')).not.toContain('codex'); expect(args).not.toContain('--plain'); expect(args).not.toContain('--command');
  });
  it.each(['codex', 'shell', 'export', 'npm test', 'jev', 'openai'])('rejects arbitrary command %s', action => { expect(() => buildRunArgs(action)).toThrow(); });
  it('does not forward unrelated provider keys, vault tokens or Node preload options', () => {
    const env = childEnvironment({ META_API_KEY: 'SYNTHETIC_META', DISCORD_BOT_TOKEN: 'SYNTHETIC_DISCORD', OPENAI_API_KEY: 'SYNTHETIC_OPENAI', JEV_API_KEY: 'SYNTHETIC_JEV', INFISICAL_TOKEN: 'SYNTHETIC_VAULT', NODE_OPTIONS: 'SYNTHETIC_PRELOAD' });
    expect(Object.keys(env)).toEqual(['DISCORD_BOT_TOKEN', 'META_API_KEY']); expect(env).not.toHaveProperty('OPENAI_API_KEY'); expect(env).not.toHaveProperty('JEV_API_KEY');
  });
  it('keeps every .env.example value blank and matches the app variable-name allowlist', () => {
    const lines = readFileSync('.env.example', 'utf8').split(/\r?\n/).filter(s => s && !s.startsWith('#'));
    for (const line of lines) expect(line).toMatch(/^[A-Z_]+=$/);
    expect(lines.map(s => s.slice(0, -1)).sort()).toEqual([...appVariableNames].sort());
  });
});
