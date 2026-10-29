import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { aggregateManualRatings, compareManualToJudge } from './review-pack-lib.mjs';
const file = '.local/evidence/manual-ratings-v1.json';
if (!existsSync(file)) { console.log('NOT_RUN: manual ratings file is absent; no human judgment inferred.'); process.exit(0); }
try {
  const raw = readFileSync(file); assert.ok(raw.length <= 500000);
  const r = JSON.parse(raw); const pack = JSON.parse(readFileSync('.local/review/review-data.json'));
  const { reviewIdentity, ...body } = pack; const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  assert.equal(hash(JSON.stringify(body)), reviewIdentity); assert.equal(r.reviewIdentity, reviewIdentity);
  assert.equal(hash(readFileSync('.local/evidence/frozen-paired-responses.json')), pack.sourceHashes.paired); assert.equal(hash(readFileSync('.local/evidence/participation-pilot-v1.json')), pack.sourceHashes.participation);
  const aggregates = aggregateManualRatings(pack, r);
  let automatedComparison = { status: 'NOT_RUN' };
  if (existsSync('.local/evidence/participation-judge-v1.json')) {
    const bytes = readFileSync('.local/evidence/participation-judge-v1.json');
    automatedComparison = { ...compareManualToJudge(pack, r, JSON.parse(bytes)), privateJudgeArtifactSha256: hash(bytes) };
  }
  const report = { at: new Date().toISOString(), status: 'USER_DECLARED_MANUAL_RATINGS_VALIDATED', reviewerRole: r.reviewerRole, identityIndependentlyVerified: false, sourceHashes: pack.sourceHashes, reviewIdentity, manualFileSha256: hash(raw), momentsRated: 20, pairComparisonsRated: 8, sampleMethod: pack.sampleMethod, ...aggregates, automatedComparison, rawNotesExported: false, limitations: 'Self-declared manual entry over synthetic fixtures. This does not establish an independent user study, live Discord outcomes, deployment approval or general superiority.' };
  writeFileSync('evidence/manual-ratings-v1.json', JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify({ status: report.status, moments: 20, pairs: 8, artifact: 'evidence/manual-ratings-v1.json', rawNotesExported: false }));
} catch { console.error('BLOCKED: ratings are incomplete, invalid or do not match the preserved review/capture identities. No raw values displayed or ratings inferred.'); process.exitCode = 1; }
