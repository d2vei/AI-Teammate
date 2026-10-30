import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
const env = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP'].filter(k => process.env[k] !== undefined).map(k => [k, process.env[k]]));
const child = spawn(process.execPath, ['tests/fixtures/memory-terminal-child.mjs'], { env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
let phase = 0; let ref; let failure; let closed = false; let modelCalls; let timedOut = false;
const reader = createInterface({ input: child.stdout }); const send = text => child.stdin.write(text + '\n');
const timer = setTimeout(() => { timedOut = true; child.kill(); }, 15000);
reader.on('line', line => {
  try {
    const data = JSON.parse(line);
    if (data.ready) { ref = data.ref; send('/memory'); return; }
    if (data.closed) { closed = true; modelCalls = data.modelCalls; return; }
    const output = data.output; assert.equal(typeof output, 'string');
    if (phase === 0) { assert.equal(JSON.parse(output.slice(9)).categories.decisions, 26); send('/memory search hosting'); }
    else if (phase === 1) { const items = JSON.parse(output.slice(9)); assert.equal(items[0].id, ref); assert.match(items[0].text, /forty/); send(`/memory tag ${ref} cost planning`); }
    else if (phase === 2) { assert.equal(JSON.parse(output.slice(9)).organized, true); send('/memory topic cost planning'); }
    else if (phase === 3) { assert.equal(JSON.parse(output.slice(9))[0].id, ref); send('/as peer'); }
    else if (phase === 4) { assert.match(output, /synthetic-peer/); send(`/memory tag ${ref} altered`); }
    else if (phase === 5) { assert.match(output, /^\[error\].*approver/); send('/memory search hosting'); }
    else if (phase === 6) { assert.equal(JSON.parse(output.slice(9))[0].id, ref); send('/pause'); }
    else if (phase === 7) { assert.match(output, /Paused/); send('/memory'); }
    else if (phase === 8) { assert.match(output, /^\[error\].*paused/); send('/quit'); }
    else throw new Error('Unexpected native memory output');
    phase++;
  } catch (error) { failure = error; child.kill(); }
});
child.stderr.on('data', () => {}); child.stdin.on('error', () => {});
const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); }); clearTimeout(timer); reader.close();
if (failure) throw failure;
assert.equal(timedOut, false); assert.equal(code, 0); assert.equal(phase, 9); assert.equal(closed, true); assert.equal(modelCalls, 0);
console.log(JSON.stringify({ status: 'PASS_NATIVE_MEMORY_COMMANDS_ONLY', observedCommands: phase, retainedDecisions: 26, roleAndPauseChecks: true, modelCalls, nativeExitCode: code }));
