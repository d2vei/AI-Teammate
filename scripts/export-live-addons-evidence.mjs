import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { closeSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { Store } from '../dist/store.js';
const raw = readFileSync('.local/evidence/live-addons-v1.json'); const r = JSON.parse(raw);
assert.ok(['PASS_LOCAL_META_MEDIA_REPLAY_FLOW_ONLY', 'FAIL'].includes(r.status)); assert.ok(r.finishedAt);
assert.equal(r.ownContentPurged, true); assert.equal(r.fixturePurged, true);
const lockPath = '.local/state/service.lock'; const lock = openSync(lockPath, 'wx'); let store; let charges; let unknown;
try {
  store = new Store('.local/state/teammate.sqlite'); assert.equal(store.budgetUsed(), r.budgetAfterUsd);
  assert.equal(Number(store.db.prepare('SELECT count(*) AS n FROM charges').get().n), r.chargeRowsAfter);
  charges = store.db.prepare('SELECT micros,state,usage FROM charges ORDER BY rowid LIMIT -1 OFFSET ?').all(r.chargeRowsBefore).map(c => ({ reservedOrUsedMicros: Number(c.micros), state: c.state, usage: c.usage ? JSON.parse(c.usage) : null }));
  assert.equal(charges.reduce((n, c) => n + c.reservedOrUsedMicros, 0), Math.round((r.budgetAfterUsd - r.budgetBeforeUsd) * 1e6));
  unknown = store.db.prepare("SELECT count(*) AS n,coalesce(sum(micros),0) AS micros FROM charges WHERE state='uncertain'").get();
} finally { store?.close(); closeSync(lock); unlinkSync(lockPath); }
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
for (const f of r.files) assert.equal(hash(readFileSync(f.path)), f.sha256, `Candidate changed: ${f.path}`);
const counted = /^ADDON_INFERENCE_ATTEMPTS: (\d+)$/.exec(r.privateTerminalLines.find(l => /^ADDON_INFERENCE_ATTEMPTS:/.test(l)) || '');
const report = { at: r.at, finishedAt: r.finishedAt, status: r.status, failure: r.failure ?? null, kind: r.kind, candidate: r.candidate, files: r.files, fixture: r.fixture, model: r.model, maximumResponseAttempts: r.maximumResponseAttempts, actualResponseAttempts: r.actualResponseAttempts ?? (counted ? Number(counted[1]) : null), observedSteps: r.steps, imageFactsRecognized: r.imageFactsRecognized ?? false, briefSourceKinds: r.briefSourceKinds ?? [], generations: r.generations ?? [], newStatePersisted: r.newStatePersisted ?? false, restartVerified: r.restartVerified ?? false, ownContentPurged: r.ownContentPurged, fixturePurged: r.fixturePurged, budgetBeforeUsd: r.budgetBeforeUsd, budgetAfterUsd: r.budgetAfterUsd, chargeRowsBefore: r.chargeRowsBefore, chargeRowsAfter: r.chargeRowsAfter, newCharges: charges, totalUncertainReservations: { rows: Number(unknown.n), usd: Number(unknown.micros) / 1e6 }, privateArtifactSha256: hash(raw), rawTerminalLinesExported: false, humanRatings: 'NOT_RUN', externalPosts: 0, liveRoblox: 'NOT_RUN', liveDiscord: 'NOT_RUN', limitations: 'Actual Meta and native stdin/stdout over synthetic actors, image bytes, selected code/logs and saved-JSON replay. Structural/source-ID checks and literal image facts do not establish broad semantic accuracy, human usefulness or platform authentication. This new composition check does not replace the earlier failed direct-only terminal trial or participation pilot. No execution occurred.' };
writeFileSync('evidence/live-addons-v1.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, actualResponseAttempts: report.actualResponseAttempts, budgetAfterUsd: report.budgetAfterUsd, newCharges: charges.length, rawTerminalLinesExported: false }));
