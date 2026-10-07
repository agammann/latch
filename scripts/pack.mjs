import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { names, version } from './release-version.mjs';
const root = process.cwd();
fs.mkdirSync('artifacts', { recursive: true });
function resetStaging(directory) {
  const boundary = path.resolve(root, 'work', 'pack');
  const target = path.resolve(directory);
  if (!target.startsWith(boundary + path.sep)) throw Error('Staging cleanup escaped package workspace');
  if (fs.existsSync(target)) {
    if (fs.lstatSync(target).isSymbolicLink() || !fs.realpathSync(target).startsWith(fs.realpathSync(boundary) + path.sep)) throw Error('Unsafe staging link');
    fs.rmSync(target, {recursive:true});
  }
  fs.mkdirSync(target,{recursive:true});
}
for (const name of names) {
  const staging = path.join(root, 'work', 'pack', name);
  resetStaging(staging);
  const pkg = JSON.parse(fs.readFileSync(`packages/${name}/package.json`));
  for (const group of ['dependencies', 'peerDependencies'])
    for (const [key, value] of Object.entries(pkg[group] ?? {}))
      if (value === 'workspace:*') pkg[group][key] = version;
  fs.writeFileSync(path.join(staging, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  fs.cpSync(`packages/${name}/dist`, path.join(staging, 'dist'), { recursive: true });
  fs.copyFileSync(`packages/${name}/README.md`, path.join(staging, 'README.md'));
  fs.copyFileSync('THIRD_PARTY_NOTICES.md', path.join(staging, 'THIRD_PARTY_NOTICES.md'));
  fs.copyFileSync('LICENSE', path.join(staging, 'LICENSE'));
  if (name === 'cli') fs.chmodSync(path.join(staging, 'dist/main.js'), 0o755);
  const artifact = path.join(root, 'artifacts', `latch-local-${name}-${version}.tgz`);
  const container = path.join(root, 'work', 'pack', `${name}-tar`);
  resetStaging(container);
  fs.cpSync(staging, path.join(container, 'package'), { recursive: true });
  const r = spawnSync('tar', ['-czf', artifact, 'package'], { cwd: container, encoding: 'utf8' });
  if (r.status !== 0) throw Error(r.error?.message ?? r.stderr);
  console.log(artifact);
}
const checks = names.map((name) => {
  const file = `latch-local-${name}-${version}.tgz`;
  return {
    file,
    sha256: createHash('sha256')
      .update(fs.readFileSync(path.join('artifacts', file)))
      .digest('hex'),
  };
}).sort((a, b) => a.file.localeCompare(b.file, 'en'));
for (const c of checks)
  fs.writeFileSync(path.join('artifacts', c.file + '.sha256'), `${c.sha256}  ${c.file}\n`);
fs.writeFileSync(
  'artifacts/SHA256SUMS',
  checks.map((c) => `${c.sha256}  ${c.file}`).join('\n') + '\n',
);
if (process.env.GITHUB_OUTPUT)
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`);
