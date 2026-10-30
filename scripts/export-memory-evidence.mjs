import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { closeSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
const raw = readFileSync('.local/evidence/memory-live-v1.json'); const r = JSON.parse(raw); const hash = b => createHash('sha256').update(b).digest('hex');
assert.equal(r.status, 'PASS_SINGLE_META_MEMORY_RECALL_ONLY'); assert.equal(r.actualInferenceAttempts, 1); assert.equal(r.ownScopePurged, true);
for (const f of r.files) assert.equal(hash(readFileSync(f.path)), f.sha256, `Tested file changed: ${f.path}`);
const lockPath = '.local/state/service.lock'; const lock = openSync(lockPath, 'wx'); let db; let reconciliation;
try {
  db = new DatabaseSync('.local/state/teammate.sqlite', { readOnly: true });
  const charge = db.prepare('SELECT micros,state,usage FROM charges ORDER BY rowid LIMIT -1 OFFSET ?').all(r.chargeRowsBefore); assert.equal(charge.length, 1); assert.equal(charge[0].state, 'reported');
  assert.deepEqual(JSON.parse(charge[0].usage), r.generation.usage); assert.equal(Number(charge[0].micros), Math.round((r.budgetAfterUsd - r.budgetBeforeUsd) * 1e6));
  const key = hash(JSON.stringify(['fake', 'synthetic-memory-test', 'synthetic-memory-room', 'memory-query']));
  const traces = db.prepare('SELECT json FROM traces').all().map(x => JSON.parse(x.json)).filter(t => t.eventKey === key); assert.equal(traces.length, 1);
  assert.equal(traces[0].model, 'muse-spark-1.3'); assert.equal(traces[0].mode, 'meta'); assert.deepEqual(traces[0].usage, r.generation.usage);
  reconciliation = { traceEventMatched: true, model: traces[0].model, provider: traces[0].mode, configuredDataMode: 'standard', chargeMicros: Number(charge[0].micros), usage: r.generation.usage, reported: true };
} finally { db?.close(); closeSync(lock); unlinkSync(lockPath); }
const { privateModelOutput: _private, ...projection } = r;
writeFileSync('evidence/memory-live-v1.json', JSON.stringify({ ...projection, model: reconciliation.model, configuredDataMode: reconciliation.configuredDataMode, reconciliation, privateArtifactSha256: hash(raw), rawModelOutputExported: false, limitations: 'One actual recall with seeded synthetic approvals. Literal facts, an approved citation and restart do not establish general semantic retrieval quality, human usefulness, private-source terms or real platform identity. Historical evaluations remain tied to their prior candidates.' }, null, 2) + '\n');
console.log(JSON.stringify({ status: r.status, reconciledRequests: 1, chargeMicros: reconciliation.chargeMicros, rawModelOutputExported: false }));
