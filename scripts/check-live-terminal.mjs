import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
const env = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP'].filter(k => process.env[k] !== undefined).map(k => [k, process.env[k]]));
for (const exit of ['quit', 'eof']) {
  const child = spawn(process.execPath, ['tests/fixtures/live-terminal-child.mjs'], { env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  let output = ''; let timedOut = false; let sent = false; const started = Date.now();
  const timer = setTimeout(() => { timedOut = true; child.kill(); }, 5000);
  child.stdout.on('data', bytes => { output += bytes.toString(); if (output.includes('HTTP_MOCK_TERMINAL_READY') && !sent) { sent = true; if (exit === 'quit') child.stdin.write('/status\n/quit\n'); else child.stdin.end(); } });
  child.stderr.on('data', () => {}); child.stdin.on('error', () => {});
  const code = await new Promise(resolve => child.once('close', resolve)); clearTimeout(timer);
  console.log(JSON.stringify({ exit, code, timedOut, completedRunner: output.includes('HTTP_MOCK_TERMINAL_CLOSED'), durationMs: Date.now() - started, modelCalls: 0 }));
  assert.equal(timedOut, false, 'Closed terminal kept native stdin/process alive'); assert.equal(code, 0); assert.ok(output.includes('HTTP_MOCK_TERMINAL_CLOSED'));
}
