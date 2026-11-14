import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const requireFromCli = createRequire(path.resolve('packages/cli/package.json'));
const packageFile = requireFromCli.resolve('typescript7/package.json');
const metadata = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
assert.equal(metadata.version, '7.0.2');
const { default: getExePath } = await import(pathToFileURL(path.join(path.dirname(packageFile), 'lib/getExePath.js')).href);
const executable = fs.realpathSync(getExePath());
const platformRoot = path.dirname(path.dirname(executable));
const nativePackage = JSON.parse(fs.readFileSync(path.join(platformRoot, 'package.json'), 'utf8'));
assert.equal(nativePackage.name, `@typescript/typescript-${process.platform}-${process.arch}`);
assert.equal(nativePackage.version, '7.0.2');
assert.equal(nativePackage.license, 'Apache-2.0');
const normalize = text => text.replaceAll('\r\n', '\n').replace(/[ \t]+(?=\n)/g, '').trim();
const included = normalize(fs.readFileSync('THIRD_PARTY_NOTICES.md', 'utf8'));
for (const file of ['LICENSE', 'NOTICE.txt'])
  assert.ok(included.includes(normalize(fs.readFileSync(path.join(platformRoot, file), 'utf8'))), `${file} missing from third-party notices`);
console.log(`TypeScript ${nativePackage.version} native ${process.platform}-${process.arch} binary and notices verified.`);
