import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve('.');
const experiments = [
  { name: 'focused-source-selection', file: 'memory.ts', test: 'U01',
    before: "const matches = category === 'evidence' ? this.rank(group, query, true) : [];",
    after: 'const matches: MemoryEntry[] = [];' },
  { name: 'available-citation-required', file: 'core.ts', test: 'U06',
    before: "return !item || item.kind === 'missing_evidence' || !this.store.bindingsValid(e.projectId, { [id]: item.identity }, this.now());",
    after: 'return !item;' },
  { name: 'transitive-proposal-evidence', file: 'store.ts', test: 'U08',
    before: ' && this.bindingsValid(projectId, p.sourceBindings, now, [...visiting, id])', after: '' },
];
const results: { name: string; test: string; observedFailedTests: number }[] = [];
const base = join(root, '.local', `usefulness-mutations-${Date.now()}`);
for (const experiment of experiments) {
  const dir = join(base, experiment.name); mkdirSync(join(dir, 'tests'), { recursive: true });
  cpSync(join(root, 'src'), join(dir, 'src'), { recursive: true });
  cpSync(join(root, 'prompts'), join(dir, 'prompts'), { recursive: true });
  cpSync(join(root, 'tests/usefulness.test.ts'), join(dir, 'tests/usefulness.test.ts'));
  const file = join(dir, 'src', experiment.file); const source = readFileSync(file, 'utf8');
  if (source.split(experiment.before).length !== 2) throw new Error(`Expected one mutation site: ${experiment.name}`);
  writeFileSync(file, source.replace(experiment.before, experiment.after));
  const reportPath = join(dir, 'result.json');
  const run = spawnSync(process.execPath, [join(root, 'node_modules/vitest/vitest.mjs'), 'run', '--root', dir, '--config', join(root, 'vitest.config.ts'), 'tests/usefulness.test.ts', '-t', experiment.test, '--reporter=json', '--outputFile', reportPath], { cwd: root, encoding: 'utf8', timeout: 30_000, windowsHide: true });
  let report: { numFailedTests: number; numPassedTests: number; testResults: { assertionResults: { status: string; fullName: string }[] }[] };
  try { report = JSON.parse(readFileSync(reportPath, 'utf8')); } catch { throw new Error(`Mutation did not produce a test result: ${experiment.name}`); }
  const caught = run.status === 1 && report.numFailedTests === 1 && report.numPassedTests === 0 && report.testResults.some(s => s.assertionResults.some(t => t.status === 'failed' && t.fullName.includes(experiment.test)));
  if (!caught) throw new Error(`Expected assertion did not reject mutation: ${experiment.name}`);
  results.push({ name: experiment.name, test: experiment.test, observedFailedTests: report.numFailedTests });
}
console.log(JSON.stringify({ status: 'PASS_NEGATIVE_CONTROLS_ONLY', experiments: results, authoritativeFilesModified: false, metaRequests: 0 }));
