import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { names, version } from './release-version.mjs';
const reports = [];
for (const name of names) {
  const file = `artifacts/latch-local-${name}-${version}.tgz`;
  const sum = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const line = `${sum}  ${path.basename(file)}\n`;
  assert.equal(fs.readFileSync(file + '.sha256', 'utf8'), line);
  assert.ok(fs.readFileSync('artifacts/SHA256SUMS', 'utf8').includes(line));
  const listing = spawnSync('tar', ['-tzf', file], { encoding: 'utf8' });
  assert.equal(listing.status, 0);
  const files = listing.stdout.trim().split(/\r?\n/);
  assert.ok(files.every((f) => f.startsWith('package/')));
  assert.ok(
    !files.some((f) => /node_modules|fixtures|examples|\.env|credential|secret|work\//i.test(f)),
  );
  for (const entry of [
    'package/package.json',
    'package/README.md',
    'package/THIRD_PARTY_NOTICES.md',
    'package/LICENSE',
  ])
    assert.ok(files.includes(entry));
  const pkg = JSON.parse(
    spawnSync('tar', ['-xOzf', file, 'package/package.json'], { encoding: 'utf8' }).stdout,
  );
  assert.ok(!JSON.stringify(pkg).includes('workspace:'));
  assert.equal(pkg.version, version);
  assert.equal(pkg.license, 'MIT');
  const entry = name === 'cli' ? 'main' : 'index';
  assert.ok(files.includes(`package/dist/${entry}.js`));
  assert.ok(files.includes(`package/dist/${entry}.d.ts`));
  if (['contracts', 'browser', 'runtime', 'react'].includes(name))
    assert.ok(!files.some((f) => /bridge|console|inspect/.test(f)));
  reports.push({ package: pkg.name, version: pkg.version, files: files.length, status: 'passed' });
}
for (const example of ['catalog', 'docs']) {
  const dir = `examples/${example}/dist/assets`;
  const source = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.js'))
    .map((f) => fs.readFileSync(path.join(dir, f), 'utf8'))
    .join('\n');
  assert.ok(
    !/latch:request:v1|latch:response:v1|attachBridge|node:fs|createSourceFile/.test(source),
  );
  reports.push({
    productionBundle: example,
    developmentBridge: 'absent',
    filesystemAndParser: 'absent',
    status: 'passed',
  });
}
fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync('reports/artifact-audit.json', JSON.stringify(reports, null, 2) + '\n');
console.log(JSON.stringify(reports, null, 2));
