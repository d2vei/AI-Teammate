import { spawnSync } from 'node:child_process';
import { childEnvironment, appVariableNames } from './vault-lib.mjs';
import { projectFromEnv, spendCap } from '../dist/runtime-config.js';
const action = process.argv[2];
const allowed = new Set(['start', 'smoke-meta', 'check', 'init', 'seed-demo', 'register']);
if (!allowed.has(action)) { console.error('BLOCKED: only fixed bot/live-check commands are allowed'); process.exit(1); }
const env = childEnvironment(process.env);
if (env.APP_PROVIDER && env.APP_PROVIDER !== 'meta') { console.error('BLOCKED: live launcher only enables Meta. Jev/OpenAI are disabled.'); process.exit(1); }
env.APP_PROVIDER = 'meta';
if (action === 'check') {
  const required = ['DISCORD_BOT_TOKEN', 'DISCORD_APPLICATION_ID', 'DISCORD_GUILD_ID', 'DISCORD_CHANNEL_ID', 'DISCORD_MEMBER_IDS', 'DISCORD_APPROVER_IDS', 'META_API_KEY', 'META_MODEL_ID', 'META_DATA_MODE', 'APP_MAX_SPEND_USD', 'APP_AUTHORIZED_ALLOWANCE_USD'];
  const missing = required.filter(name => !env[name]);
  if (missing.length) { console.error(`BLOCKED: missing variable NAMES: ${missing.join(', ')}`); process.exit(1); }
  try { projectFromEnv(env); if (spendCap(env) <= 0 || env.META_MODEL_ID !== 'muse-spark-1.3' || env.META_DATA_MODE !== 'standard') throw new Error(); }
  catch { console.error('BLOCKED: configured IDs, Standard model/mode or authorized allowance are invalid. No values displayed.'); process.exit(1); }
  console.log(JSON.stringify({ status: 'PASS', gate: 'Vault-injected required names and app configuration', allowedVariableNames: appVariableNames, valuesDisplayed: false, providerCalls: 0, discordSends: 0, Jev: 'disabled', OpenAI: 'disabled' }));
} else {
  // Only the application process receives the allowlisted injected values; no shell or agent.
  const result = spawnSync(process.execPath, ['dist/main.js', action], { env, stdio: 'inherit', windowsHide: true }); process.exitCode = result.status ?? 1;
}
