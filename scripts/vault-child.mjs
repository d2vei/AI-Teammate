import { spawnSync } from 'node:child_process';
import { childEnvironment, conversationEnvironment, evaluationSettings, findCli, requireNativeVault } from './vault-lib.mjs';
const action = process.argv[2];
const allowed = new Set(['meta-smoke', 'meta-check', 'evaluate', 'core-live', 'media-live', 'media-live-v2', 'voice-diagnostic', 'participation-live', 'participation-judge', 'conversation-live', 'conversation-live-check']);
if (!allowed.has(action)) { console.error('BLOCKED: only fixed bot/live-check commands are allowed'); process.exit(1); }
const env = childEnvironment(process.env);
// Infisical may write its encrypted cache during run. Recheck here, before any
// injected credential reaches the app, rather than waiting for the bot to exit.
const nativeEnv = childEnvironment(process.env); for (const key of Object.keys(nativeEnv)) if (/^(META_|DISCORD_|APP_)/.test(key)) delete nativeEnv[key];
try { requireNativeVault(findCli(nativeEnv), nativeEnv); }
catch { console.error('BLOCKED: native vault backend changed or cannot be verified; injected credentials were not forwarded to the bot. No file fallback accepted.'); process.exit(1); }
if (env.APP_PROVIDER && env.APP_PROVIDER !== 'meta') { console.error('BLOCKED: live launcher only enables Meta. Jev/OpenAI are disabled.'); process.exit(1); }
env.APP_PROVIDER = 'meta';
if (action === 'meta-check') {
  const required = ['META_API_KEY'];
  const missing = required.filter(name => !env[name]);
  if (missing.length) {
    const relevantNames = Object.keys(process.env).filter(name => /^(?:META|MODEL|API)[A-Z0-9_ -]*$/i.test(name));
    console.error(`BLOCKED: missing variable NAMES: ${missing.join(', ')}. Relevant environment variable NAMES only: ${relevantNames.join(', ') || '(none)'}`); process.exit(1);
  }
  console.log(JSON.stringify({ status: 'PASS', gate: 'Vault-injected META_API_KEY presence only', allowedVariableNames: ['META_API_KEY'], valuesDisplayed: false, providerCalls: 0, discordSends: 0, Jev: 'disabled', OpenAI: 'disabled' }));
} else {
  if (['evaluate', 'media-live', 'media-live-v2', 'voice-diagnostic', 'participation-live', 'participation-judge', 'conversation-live', 'conversation-live-check'].includes(action)) Object.assign(env, evaluationSettings(env));
  const appEnv = action.startsWith('conversation-live') || action === 'participation-judge' ? conversationEnvironment(env) : env;
  // Only the application process receives the allowlisted injected values; no shell or agent.
  const args = action === 'participation-judge' ? ['scripts/participation-judge.mjs'] : action === 'conversation-live-check' ? ['scripts/check-live-conversation.mjs'] : action === 'conversation-live' ? ['scripts/conversation-live.mjs'] : action === 'participation-live' ? ['scripts/participation-live.mjs'] : action === 'voice-diagnostic' ? ['scripts/media-live.mjs', 'voice-diagnostic-v1'] : action === 'media-live-v2' ? ['scripts/media-live.mjs', 'media-pilot-v2'] : [action === 'evaluate' ? 'scripts/evaluate.mjs' : action === 'core-live' ? 'scripts/core-live.mjs' : action === 'media-live' ? 'scripts/media-live.mjs' : 'scripts/meta-smoke.mjs'];
  const result = spawnSync(process.execPath, args, { env: appEnv, stdio: 'inherit', windowsHide: true }); process.exitCode = result.status ?? 1;
}
