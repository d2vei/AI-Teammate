import { createInterface } from 'node:readline';
import { closeSync, mkdirSync, openSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Store } from '../dist/store.js';
import { LocalHarness, ScriptedLocalProvider } from '../dist/local-harness.js';
import { ErrorWatch, ErrorWatchLedger } from '../dist/error-watch.js';
const dir = resolve('.local/conversation-offline'); mkdirSync(dir, { recursive: true }); const lockPath = join(dir, 'service.lock');
let lock; let store; let watchLedger; let simulatedOffset = 0;
try {
  lock = openSync(lockPath, 'wx'); store = new Store(join(dir, 'teammate.sqlite'));
  const now = () => Date.now() + simulatedOffset;
  watchLedger = new ErrorWatchLedger(join(dir, 'watch-replay.sqlite'));
  const harness = new LocalHarness(store, new ScriptedLocalProvider(), 0, now, new ErrorWatch(store, watchLedger, now));
  console.log('OFFLINE SCRIPTED MOCK · synthetic actors/evidence · no vault, model, Discord or execution.');
  console.log('Commands: /decision TEXT, /brief TEXT, /ask TEXT, /accept EXACT-TOKEN, /as owner|peer, /status, /pause, /resume, /withdraw ID, /ambient TEXT, /watch start|tick|stop, /quit');
  const reader = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of reader) { if (line.trim() === '/quit') { reader.close(); break; } if (line.trim() === '/watch tick') { simulatedOffset += 60_000; console.log('[REPLAY clock advances one minute]'); } const result = await harness.line(line); console.log(`[${result.kind}] ${result.text}`); }
} catch { console.error('BLOCKED: local conversation state is locked or unavailable. No credentials or model calls used.'); process.exitCode = 1; }
finally { watchLedger?.close(); store?.close(); if (lock !== undefined) { closeSync(lock); unlinkSync(lockPath); } }
