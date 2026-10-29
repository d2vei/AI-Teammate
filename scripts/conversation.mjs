import { createInterface } from 'node:readline';
import { closeSync, mkdirSync, openSync, unlinkSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { Store } from '../dist/store.js';
import { ScriptedLocalProvider } from '../dist/local-harness.js';
import { OfflineConversation, ScriptedConversationReasoner, SuppliedMediaFixture } from '../dist/local-conversation.js';
import { ErrorWatch, ErrorWatchLedger } from '../dist/error-watch.js';
import { ParticipationLedger } from '../dist/participation.js';
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--state-dir')) throw new Error('Use only --state-dir PATH for a separate local session.');
const localRoot = resolve('.local'); const dir = resolve(args[1] || '.local/conversation-offline'); const localRelative = relative(localRoot, dir);
if (!localRelative || localRelative.startsWith('..') || isAbsolute(localRelative)) throw new Error('Conversation state must be in a subdirectory of .local.');
mkdirSync(dir, { recursive: true }); const lockPath = join(dir, 'service.lock');
let lock; let store; let watchLedger; let participationLedger; let harness; let simulatedOffset = 0;
try {
  lock = openSync(lockPath, 'wx'); store = new Store(join(dir, 'teammate.sqlite'));
  const now = () => Date.now() + simulatedOffset;
  watchLedger = new ErrorWatchLedger(join(dir, 'watch-replay.sqlite'));
  participationLedger = new ParticipationLedger(join(dir, 'participation-shadow.sqlite'));
  harness = new OfflineConversation(store, new ScriptedLocalProvider(), now, { ledger: participationLedger, watch: new ErrorWatch(store, watchLedger, now), reasoner: new ScriptedConversationReasoner(), media: new SuppliedMediaFixture(), onWatchTick: result => { for (const report of result.reports) console.log(`[automatic replay] ${report.text}`); if (result.status === 'BLOCKED') console.log(`[watch stopped] ${result.reason}`); } });
  console.log('OFFLINE SCRIPTED MOCK · synthetic actors/evidence · no vault, model, Discord or execution.');
  console.log('Commands: /decision TEXT, /brief TEXT, /ask TEXT, /accept EXACT-TOKEN, /as owner|peer, /status, /pause, /resume, /withdraw ID, /ambient TEXT, /watch start|tick|stop, /quit');
  console.log('Add-ons: /say TEXT, /shadow on|off, /invite EXACT-TOKEN, /why, /sources, /media voice|image, /media remove ORIGIN-ID. Shadow and media use advertised fixtures only.');
  console.log('Standing watch: /watch start, /watch auto on|off|status. Automatic mode uses real minute intervals; /watch stop, /pause and /quit stop it.');
  const reader = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of reader) { if (line.trim() === '/quit') { reader.close(); break; } if (line.trim() === '/watch tick' && !harness.scheduler.enabled) { simulatedOffset += 60_000; console.log('[REPLAY clock advances one minute]'); } const result = await harness.line(line); console.log(`[${result.kind}] ${result.text}`); }
} catch { console.error('BLOCKED: local conversation state is locked or unavailable. No credentials or model calls used.'); process.exitCode = 1; }
finally { await harness?.close(); participationLedger?.close(); watchLedger?.close(); store?.close(); if (lock !== undefined) { closeSync(lock); unlinkSync(lockPath); } }
