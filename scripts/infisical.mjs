import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { buildRunArgs, childEnvironment, findCli, probeNativeStore, requireNativeVault } from './vault-lib.mjs';
const action = process.argv[2]; const root = resolve('.');
async function run() {
  const cli = findCli();
  // Do not launch Infisical with inherited API/provider keys or direct-login credentials.
  const env = childEnvironment(process.env); for (const key of Object.keys(env)) if (/^(META_|DISCORD_|APP_)/.test(key)) delete env[key];
  env.INFISICAL_DISABLE_TELEMETRY = '1'; env.DO_NOT_TRACK = '1';
  requireNativeVault(cli, env); probeNativeStore(env);
  if (action === 'native-check') { console.log('PASS: pinned CLI, auto vault backend and synthetic Windows credential write/delete. No account login or vault values read.'); return; }
  if (action === 'login') {
    const backup = join(env.USERPROFILE || '', '.infisical/secrets-backup');
    if (existsSync(backup) && readdirSync(backup).length) throw new Error('Existing Infisical encrypted backup found. Login can clear upstream cache keys; preserve/review this existing data manually first');
    console.log('Opening the Infisical EU browser login. Create/secure your account there; no password or token is accepted in this terminal.');
    // No --plain, password, token, direct-login environment or interactive fallback stdin.
    const status = await new Promise((resolveExit, reject) => {
      const child = spawn(cli, ['login', '--domain=https://eu.infisical.com', '--save-as=ai-teammate', '--telemetry=false', '--silent'], { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
      child.stdout.on('data', () => {}); child.stderr.on('data', () => {});
      child.on('error', reject); child.on('close', resolveExit);
    });
    requireNativeVault(cli, env);
    if (status !== 0) throw new Error('Browser login did not complete. No token exported; rerun after account setup');
    console.log('Browser login finished; backend remains auto. Run vault:status, then vault:link with the non-secret project ID.'); return;
  }
  if (action === 'link') {
    const id = process.argv[3]; if (!id || !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id)) throw new Error('Pass only the non-secret Infisical project UUID');
    if (existsSync(join(root, '.infisical.yaml')) || existsSync(join(root, '.infisical.json'))) throw new Error('Existing project link preserved; review it manually instead of overwriting');
    const result = spawnSync(cli, ['init', '--project-id', id, '--profile=ai-teammate', '--domain=https://eu.infisical.com', '--telemetry=false', '--silent'], { env, stdio: 'inherit', windowsHide: true });
    requireNativeVault(cli, env); if (result.status !== 0) throw new Error('Project linking failed'); return;
  }
  if (action === 'status') {
    const result = spawnSync(cli, ['login', 'status', '--profile=ai-teammate', '--domain=https://eu.infisical.com', '--telemetry=false'], { env, stdio: 'inherit', windowsHide: true });
    requireNativeVault(cli, env); if (result.status !== 0) throw new Error('Browser login/account access remains blocked'); return;
  }
  const args = buildRunArgs(action, root);
  if (!existsSync(join(root, '.infisical.yaml')) && !existsSync(join(root, '.infisical.json'))) throw new Error('Project link missing; run vault:link first');
  if (!existsSync(join(root, 'dist/main.js'))) throw new Error('Build the application offline before injecting live secrets');
  const child = spawn(cli, args, { env, stdio: 'inherit', windowsHide: true });
  const result = await new Promise((resolveExit, reject) => { child.on('error', reject); child.on('close', resolveExit); });
  requireNativeVault(cli, env);
  if (result !== 0) throw new Error('Vault injection or fixed bot/live check did not pass; no .env export or paid fallback attempted');
}
run().catch(error => { console.error(`BLOCKED: ${error instanceof Error ? error.message : 'Infisical operation failed'}`); process.exitCode = 1; });
