import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = resolve('.'); const dir = mkdtempSync(join(tmpdir(), 'ai-teammate-cli-'));
const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP, APP_STATE_DIR: dir, APP_PROJECT_ID: 'synthetic-cli', DISCORD_GUILD_ID: '10000000000000001', DISCORD_CHANNEL_ID: '10000000000000002', DISCORD_MEMBER_IDS: '10000000000000003', DISCORD_APPROVER_IDS: '10000000000000003', APP_MAX_SPEND_USD: '0', APP_AUTHORIZED_ALLOWANCE_USD: '0' };
const call = (...args) => spawnSync(process.execPath, [join(root, 'dist/main.js'), ...args], { env, cwd: root, encoding: 'utf8' });
const success = (...args) => { const r = call(...args); assert.equal(r.status, 0, r.stderr); return r.stdout; };
try {
  assert.equal(call('start').status, 1); assert.match(call('start').stderr, /Missing DISCORD_BOT_TOKEN/);
  success('init'); assert.equal(JSON.parse(success('status')).approvedDecisions, 0);
  const seeded = JSON.parse(success('seed-demo')); assert.equal(seeded.seededSynthetic, true); assert.equal(seeded.decisionsSeeded, 0);
  const status = JSON.parse(success('status')); assert.equal(status.selectedSnapshot, seeded.snapshot);
  success('pause'); assert.equal(JSON.parse(success('status')).paused, true); success('resume');
  success('source-remove', status.sources.find(s => s.id.startsWith('code:')).id);
  assert.equal(JSON.parse(success('status')).sources.find(s => s.id.startsWith('code:')).state, 'deleted');
  writeFileSync(join(dir, 'service.lock'), 'synthetic lock'); assert.equal(call('status').status, 1);
  const { unlinkSync } = await import('node:fs'); unlinkSync(join(dir, 'service.lock'));
  const deletion = JSON.parse(success('purge-project', 'synthetic-cli')); assert.equal(deletion.sourceDecisionProposalBriefContent, 'deleted');
  const purged = JSON.parse(success('status')); assert.equal(purged.sources.length, 0); assert.equal(purged.paused, true);
  console.log(JSON.stringify({ status: 'PASS', gate: 'Built operator CLI using synthetic IDs and temporary SQLite', liveServices: false, missingCredentialsBlocked: true, lockEnforced: true, fixtureImportAndSourceRemoval: true, deletionPerformed: true, at: new Date().toISOString() }));
} finally {
  const target = resolve(dir); if (!target.startsWith(resolve(tmpdir()) + sep) || !basename(target).startsWith('ai-teammate-cli-')) throw new Error('Unexpected cleanup target');
  rmSync(target, { recursive: true, force: true });
}
