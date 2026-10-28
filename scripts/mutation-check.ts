import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = resolve('.'); const dir = join(root, '.local', `approval-mutation-${Date.now()}`);
mkdirSync(join(dir, 'tests'), { recursive: true });
cpSync(join(root, 'src'), join(dir, 'src'), { recursive: true });
cpSync(join(root, 'prompts'), join(dir, 'prompts'), { recursive: true });
cpSync(join(root, 'tests/proposals.test.ts'), join(dir, 'tests/proposals.test.ts'));
const file = join(dir, 'src/store.ts'); const source = readFileSync(file, 'utf8');
const gate = '!approver(c, e.actor) || !p.approverIds.includes(e.actor.id)';
if (source.split(gate).length !== 2) throw new Error('Expected exactly one approval gate');
writeFileSync(file, source.replace(gate, 'false || !p.approverIds.includes(e.actor.id)'));
const reportPath = join(dir, 'mutation-result.json');
const run = spawnSync(process.execPath, [join(root, 'node_modules/vitest/vitest.mjs'), 'run', '--root', dir, '--config', join(root, 'vitest.config.ts'), 'tests/proposals.test.ts', '-t', 'rejects wrong authority', '--reporter=json', '--outputFile', reportPath], { cwd: root, encoding: 'utf8' });
let report: { numFailedTests: number; testResults: { assertionResults: { status: string; fullName: string }[] }[] };
try { report = JSON.parse(readFileSync(reportPath, 'utf8')); } catch { throw new Error('Mutation runner failed before producing test results'); }
const caught = run.status === 1 && report.numFailedTests === 1 && report.testResults.some(s => s.assertionResults.some(t => t.status === 'failed' && t.fullName.includes('"roleIds":[]')));
if (!caught) throw new Error('Negative control did not detect missing role authorization');
console.log(JSON.stringify({ status: 'PASS', experiment: 'Role-authorization gate removed in expendable copy', observedFailedTests: report.numFailedTests, authoritativeFilesModified: false }));
