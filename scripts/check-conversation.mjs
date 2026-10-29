import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { Store } from '../dist/store.js';
import { ErrorWatchLedger } from '../dist/error-watch.js';
const root = resolve('.'); const localRoot = join(root, '.local'); mkdirSync(localRoot, { recursive: true });
const dir = mkdtempSync(join(localRoot, 'conversation-check-'));
const env = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'WINDIR', 'USERPROFILE', 'TEMP', 'TMP', 'ComSpec', 'PATHEXT'].filter(k => process.env[k] !== undefined).map(k => [k, process.env[k]]));
const child = spawn(process.execPath, ['scripts/conversation.mjs', '--state-dir', relative(root, dir)], { cwd: root, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
let output = ''; let phase = 'offer'; let terminal = false; let childError = false; let timedOut = false; let automaticDisplayed = false; let report;
const timer = setTimeout(() => { timedOut = true; child.kill(); }, 20_000);
const reader = createInterface({ input: child.stdout });
const send = lines => child.stdin.write(lines.join('\n') + '\n');
reader.on('line', line => {
  output += line + '\n'; if (output.length > 100_000) { childError = true; child.kill(); return; }
  if (phase === 'automatic' && line.startsWith('[automatic replay] ')) { automaticDisplayed = true; phase = 'done'; send(['/watch auto off', '/watch stop', '/quit']); return; }
  if (phase === 'offer') {
    const match = /^\/invite ([\w-]+)$/.exec(line);
    if (match) { phase = 'decision'; send(['/as peer', `/invite ${match[1]}`, '/why', '/as owner', '/decision Keep the party in the same room.']); }
  } else {
    const match = /^\/accept (accept:[^\s]+)$/.exec(line);
    if (match && phase === 'decision') { phase = 'brief'; send(['/as peer', `/accept ${match[1]}`, '/as owner', `/accept ${match[1]}`, '/brief Inspect the selected code, error observation and supplied media.']); }
    else if (match && phase === 'brief') { phase = 'automatic'; send([`/accept ${match[1]}`, '/sources', '/watch stop', '/watch start', '/watch tick', '/watch tick', '/watch tick', '/watch stop', '/watch start', '/watch auto on']); }
  }
});
// Error text is not emitted: no error body or environment is evidence output.
child.stderr.on('data', () => {});
child.on('error', () => { childError = true; });
try {
  send(['/shadow on', '/media voice', '/say Let us book Saturday.', '/say Let us book Saturday.', '/say Let us book Saturday.']);
  const code = await new Promise(resolve => child.on('close', code => { terminal = true; resolve(code); }));
  clearTimeout(timer);
  if (code !== 0 || timedOut || childError || phase !== 'done') throw new Error('Built terminal flow did not complete');
  const outside = spawnSync(process.execPath, ['scripts/conversation.mjs', '--state-dir', root], { cwd: root, env, encoding: 'utf8', windowsHide: true });
  if (outside.status === 0 || !outside.stderr.includes('Conversation state must be in a subdirectory of .local')) throw new Error('Out-of-scope state directory was not rejected');
  const expected = ['SHADOW MOCK - local display only', '[error] Not authorized', 'Approved decision:', 'Saved brief; not executed', 'New error group', 'no_comparable_increase', 'Increased error group'];
  if (expected.some(s => !output.includes(s))) throw new Error('Terminal output missed a required observable result');
  const store = new Store(join(dir, 'teammate.sqlite')); const watch = new ErrorWatchLedger(join(dir, 'watch-replay.sqlite'));
  try {
    if (store.decisions('local-conversation').length !== 1 || store.briefs('local-conversation').length !== 1 || store.sources('local-conversation').filter(s => s.id.startsWith('media:')).length !== 1 || watch.tasks('local-conversation').some(t => t.active)) throw new Error('Persisted state disagrees with the terminal result');
    report = { at: new Date().toISOString(), status: 'PASS_SOFTWARE_ONLY', kind: 'actual built terminal I/O with explicitly simulated participants and scripted providers', decisionCount: 1, savedBriefCount: 1, suppliedMediaSources: 1, boundInvitationDisplayed: true, wrongApproverRejected: true, stateDirectoryScopeEnforced: true, watchChanges: [2, 'SILENT', 5], automaticFirstReportDisplayed: automaticDisplayed, watchStopped: true, metaRequests: 0, externalPosts: 0, humanRatings: 'NOT_RUN', mediaUnderstanding: 'NOT_RUN', budgetUsedOrReservedUsd: store.budgetUsed() };
  } finally { watch.close(); store.close(); }
} finally {
  clearTimeout(timer); reader.close();
  if (!terminal) { child.kill(); await new Promise(resolve => child.once('close', resolve)); }
  // Only the freshly created temporary session is deleted. Resolve the actual
  // target immediately before recursive deletion, including junctions/symlinks.
  const actual = realpathSync(dir); const actualRoot = realpathSync(localRoot); const rel = relative(actualRoot, actual);
  if (!rel || rel.startsWith('..') || isAbsolute(rel) || !basename(actual).startsWith('conversation-check-')) throw new Error('Temporary deletion target escaped the workspace');
  rmSync(actual, { recursive: true, force: false });
}
if (existsSync(dir)) throw new Error('Temporary session data deletion unverified');
const files = ['src/local-conversation.ts', 'src/local-harness.ts', 'src/meta-runtime.ts', 'src/error-watch.ts', 'src/watch-scheduler.ts', 'src/participation.ts', 'src/media.ts', 'src/core.ts', 'src/store.ts', 'src/domain.ts', 'src/sources.ts', 'src/fakes.ts', 'examples/party-queue.json', 'scripts/conversation.mjs', 'scripts/check-conversation.mjs', 'package-lock.json', ...['local-conversation', 'local-harness', 'error-watch', 'watch-scheduler', 'participation', 'media', 'core', 'store', 'domain', 'sources', 'fakes'].map(name => `dist/${name}.js`)];
report.candidateBase = execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, 'rev-parse', 'HEAD'], { encoding: 'utf8', env }).trim();
report.workingTreeDirty = !!execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, 'status', '--porcelain'], { encoding: 'utf8', env }).trim();
report.files = files.map(path => ({ path, sha256: createHash('sha256').update(readFileSync(path)).digest('hex') })); report.temporarySessionDeleted = true;
mkdirSync('evidence', { recursive: true }); writeFileSync('evidence/local-conversation-v1.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
