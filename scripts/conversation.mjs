import { createInterface } from 'node:readline';
import { closeSync, mkdirSync, openSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Store } from '../dist/store.js';
import { LocalHarness, ScriptedLocalProvider } from '../dist/local-harness.js';
const dir = resolve('.local/conversation-offline'); mkdirSync(dir, { recursive: true }); const lockPath = join(dir, 'service.lock');
let lock; let store;
try {
  lock = openSync(lockPath, 'wx'); store = new Store(join(dir, 'teammate.sqlite'));
  const harness = new LocalHarness(store, new ScriptedLocalProvider(), 0);
  console.log('OFFLINE SCRIPTED MOCK · synthetic actors/evidence · no vault, model, Discord or execution.');
  console.log('Commands: /decision TEXT, /brief TEXT, /ask TEXT, /accept EXACT-TOKEN, /as owner|peer, /status, /pause, /resume, /withdraw ID, /ambient TEXT, /quit');
  const reader = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of reader) { if (line.trim() === '/quit') { reader.close(); break; } const result = await harness.line(line); console.log(`[${result.kind}] ${result.text}`); }
} catch { console.error('BLOCKED: local conversation state is locked or unavailable. No credentials or model calls used.'); process.exitCode = 1; }
finally { store?.close(); if (lock !== undefined) { closeSync(lock); unlinkSync(lockPath); } }
