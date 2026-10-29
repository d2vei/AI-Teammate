import { closeSync, existsSync, mkdirSync, openSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Store } from '../dist/store.js';
import { LiveConversation } from '../dist/live-conversation.js';
import { runLiveTerminal } from '../dist/live-terminal.js';
import { createMetaRuntime } from '../dist/meta-runtime.js';
import { spendCap } from '../dist/runtime-config.js';
import { ErrorWatch, ErrorWatchLedger } from '../dist/error-watch.js';
import { SavedSyntheticReplay } from '../dist/live-watch.js';
import { FfmpegNormalizer, localCodecTools } from '../dist/media-codec.js';

const args = process.argv.slice(2); const freshCheck = args.length === 1 && args[0] === '--fresh-check';
const addonCheck = args.length === 1 && args[0] === '--addon-check';
async function run() {
  if (args.length && !freshCheck && !addonCheck) throw new Error('Unsupported launcher arguments');
  const cap = spendCap(process.env);
  if (!process.env.META_API_KEY || process.env.META_MODEL_ID !== 'muse-spark-1.3' || process.env.META_DATA_MODE !== 'standard' || cap <= 0 || cap > 5 || resolve(process.env.APP_STATE_DIR || '') !== resolve('.local/state')) throw new Error('Missing fixed live configuration');
  const dir = resolve('.local/state'); mkdirSync(dir, { recursive: true }); const lockPath = join(dir, 'service.lock');
  const lock = openSync(lockPath, 'wx'); writeFileSync(lock, String(process.pid)); let store; let watchLedger; let harness;
  try {
    store = new Store(join(dir, 'teammate.sqlite'));
    if (freshCheck && store.config('local-conversation')) throw new Error('Fresh check cannot change an existing local conversation');
    if (addonCheck && (store.sources('local-conversation').length || store.decisions('local-conversation').length || store.briefs('local-conversation').length || store.pending('local-conversation').length || (store.config('local-conversation') && !store.config('local-conversation').paused))) throw new Error('Add-on check requires an empty paused local scope');
    let attempts = 0;
    const http = (url, init) => {
      if (freshCheck && init?.method === 'POST' && String(url) === 'https://api.meta.ai/v1/responses' && ++attempts > 3) throw new Error('Fixed live check inference limit');
      if (addonCheck && init?.method === 'POST') {
        if (String(url) !== 'https://api.meta.ai/v1/responses' || ++attempts > 6) throw new Error('Fixed add-on check limit: six responses, no upload or ASR');
      }
      return fetch(url, init);
    };
    const runtime = createMetaRuntime(process.env.META_API_KEY, store, cap, http);
    await runtime.provider.checkAccess();
    mkdirSync('.local/media-inbox', { recursive: true }); watchLedger = new ErrorWatchLedger(join(dir, 'watch-live-replay.sqlite'));
    if (addonCheck && watchLedger.tasks('local-conversation').some(t => t.active)) throw new Error('Existing watch must be preserved');
    let normalizer;
    harness = new LiveConversation(store, runtime.provider, cap, () => Date.now(), { media: runtime.media, normalizer: () => normalizer ??= new FfmpegNormalizer(localCodecTools()), watch: new ErrorWatch(store, watchLedger), feed: new SavedSyntheticReplay(), emit: result => console.log(`[watch ${result.kind}] ${result.text}`) });
    console.log('LOCAL META CONVERSATION: real paid model, synthetic fixture/actors, mention-only. No Discord or execution. Enter synthetic test material only.');
    console.log(`Shared allowance: USD ${cap}; used/reserved USD ${store.budgetUsed().toFixed(6)}. /help lists commands. /pause and /quit stop pending delivery; an in-flight request can still be charged.`);
    if (freshCheck) console.log('NEW_SYNTHETIC_CHECK_SESSION: no prior local-conversation project existed. Maximum three model requests.');
    if (addonCheck) console.log('LIVE_ADDON_CHECK_READY: empty paused scope; maximum six response requests, no uploads or ASR.');
    await runLiveTerminal(harness, process.stdin, line => console.log(line), process);
    if (freshCheck) console.log(`CHECK_INFERENCE_ATTEMPTS: ${attempts}`);
    if (addonCheck) console.log(`ADDON_INFERENCE_ATTEMPTS: ${attempts}`);
  } finally { await harness?.close(); watchLedger?.close(); store?.close(); closeSync(lock); if (existsSync(lockPath)) unlinkSync(lockPath); }
}
run().catch(() => { console.error('BLOCKED: live conversation configuration, native state lock, synthetic scope or provider access unavailable. No credential/provider body displayed; no automatic retry.'); process.exitCode = 1; });
