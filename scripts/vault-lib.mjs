import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
export const CLI_VERSION = '0.44.10';
export const appVariableNames = Object.freeze([
  'DISCORD_BOT_TOKEN', 'DISCORD_APPLICATION_ID', 'DISCORD_GUILD_ID', 'DISCORD_CHANNEL_ID', 'DISCORD_MEMBER_IDS', 'DISCORD_APPROVER_IDS', 'DISCORD_APPROVER_ROLE_IDS',
  'META_API_KEY', 'META_MODEL_ID', 'META_DATA_MODE', 'META_PRIVATE_DATA_VERIFIED',
  'APP_PROJECT_ID', 'APP_STATE_DIR', 'APP_PROVIDER', 'APP_MAX_SPEND_USD', 'APP_AUTHORIZED_ALLOWANCE_USD',
]);
export function childEnvironment(env) {
  const clean = {};
  for (const name of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', ...appVariableNames]) if (env[name] !== undefined) clean[name] = env[name];
  return clean;
}
export function evaluationSettings(env) {
  // Owner-authorized EUR 5 total, conservatively USD 5. Non-secret defaults
  // belong to this fixed launcher, not the vault. Preserve a stricter cap.
  if (env.APP_STATE_DIR && resolve(env.APP_STATE_DIR) !== resolve('.local/state')) throw new Error('Live evaluation must share the smoke charge ledger');
  const bounded = value => {
    const amount = Number(value ?? 5);
    if (!Number.isFinite(amount) || amount < 0) throw new Error('Invalid authorized evaluation budget');
    return String(Math.min(amount, 5));
  };
  return { META_MODEL_ID: 'muse-spark-1.3', META_DATA_MODE: 'standard', APP_STATE_DIR: '.local/state', APP_MAX_SPEND_USD: bounded(env.APP_MAX_SPEND_USD), APP_AUTHORIZED_ALLOWANCE_USD: bounded(env.APP_AUTHORIZED_ALLOWANCE_USD) };
}
export function buildRunArgs(action, root = resolve('.'), node = process.execPath) {
  if (['bot', 'init', 'seed', 'register'].includes(action)) throw new Error('Discord is deferred; use the platform-independent local harness');
  const commands = { smoke: 'meta-smoke', check: 'meta-check', eval: 'evaluate', 'core-live': 'core-live', 'media-live': 'media-live' };
  const command = commands[action]; if (!command) throw new Error('Only fixed bot/setup/live-check actions are allowed');
  return ['run', '--env=dev', '--path=/', '--include-imports=false', '--recursive=false', '--expand=false', '--secret-overriding=false', '--project-config-dir', root, '--telemetry=false', '--silent', '--profile=ai-teammate', '--domain=https://eu.infisical.com', '--', node, join(root, 'scripts/vault-child.mjs'), command];
}
export function findCli(env = process.env) {
  if (process.platform !== 'win32') throw new Error('This launcher is configured for the verified official Windows CLI');
  if (!env.LOCALAPPDATA) throw new Error('Windows local application directory is unavailable');
  const paths = [join(env.LOCALAPPDATA, 'Microsoft/WinGet/Links/infisical.exe'), join(env.LOCALAPPDATA, 'Microsoft/WinGet/Packages/infisical.infisical_Microsoft.Winget.Source_8wekyb3d8bbwe/infisical.exe')];
  const path = paths.find(existsSync); if (!path) throw new Error('Install official infisical.infisical 0.44.10 using winget'); return path;
}
export function requireNativeVault(cli, env) {
  const version = spawnSync(cli, ['--version'], { env, encoding: 'utf8', windowsHide: true });
  if (version.status !== 0 || !new RegExp(`version ${CLI_VERSION.replaceAll('.', '\\.')}(?:\\s|$)`).test(version.stdout)) throw new Error('Infisical CLI version changed; review its storage behavior before live use');
  // This command prints backend names only, verified against the pinned official source.
  const vault = spawnSync(cli, ['vault', '--telemetry=false'], { env, encoding: 'utf8', windowsHide: true });
  if (vault.status !== 0 || !/currently using \[auto\] vault/.test(vault.stdout + vault.stderr)) throw new Error('OS vault not selected or unverifiable. File fallback is blocked; no vault reset or key deletion performed');
}
export function probeNativeStore(env) {
  const target = `ai-teammate-infisical-probe-${randomUUID()}`;
  const write = spawnSync('cmdkey.exe', [`/generic:${target}`, '/user:synthetic-probe', '/pass:NOT-A-REAL-SECRET'], { env, stdio: 'ignore', windowsHide: true });
  if (write.status !== 0) throw new Error('Windows Credential Manager is unavailable; refusing file fallback');
  const remove = spawnSync('cmdkey.exe', [`/delete:${target}`], { env, stdio: 'ignore', windowsHide: true });
  if (remove.status !== 0) throw new Error('Synthetic credential probe cleanup failed; stop and inspect its unique target');
}
