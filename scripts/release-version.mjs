import fs from 'node:fs';
export const names = ['contracts', 'browser', 'runtime', 'react', 'test', 'cli'];
export const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
if (!/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(version))
  throw Error('Release version must be stable SemVer');
for (const name of names) {
  const pkg = JSON.parse(fs.readFileSync(`packages/${name}/package.json`, 'utf8'));
  if (pkg.name !== `@latch-local/${name}` || pkg.version !== version || pkg.license !== 'MIT')
    throw Error(`Release metadata mismatch: ${name}`);
}
if (fs.readFileSync('packages/cli/src/version.ts', 'utf8').trim() !== `export const VERSION = '${version}';`)
  throw Error('CLI and package release versions differ');
