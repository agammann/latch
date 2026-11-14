import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { compileNative7 } from '../packages/cli/dist/ts7.js';

const base = path.resolve('work/tests');
fs.mkdirSync(base, { recursive: true });
const fixture = () => fs.mkdtempSync(path.join(base, 'typescript7-'));
const compiler = path.resolve('packages/cli/node_modules/typescript7/bin/tsc');

test('native 7 validation rejects incompatible virtual files without writes', async () => {
  const root = fixture();
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({compilerOptions:{types:[],noEmit:true},include:['src']}));
  const source = path.join(root, 'src/main.ts');
  fs.writeFileSync(source, 'export const original = 1;');
  const before = fs.readFileSync(source, 'utf8');
  await assert.doesNotReject(() => compileNative7(root, {}));
  await assert.rejects(() => compileNative7(root, { 'src/new/integration.ts': 'export const value: number = "incorrect";' }), /not assignable/);
  assert.equal(fs.readFileSync(source, 'utf8'), before);
  assert.equal(fs.existsSync(path.join(root, 'src/new')), false);
});

test('native 7 checks the virtual source when it corrects an existing error', async () => {
  const root = fixture();
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({compilerOptions:{types:[],noEmit:true},include:['src']}));
  const source = path.join(root, 'src/index.ts');
  const invalid = 'export const value: number = "incorrect";';
  fs.writeFileSync(source, invalid);
  await assert.rejects(() => compileNative7(root, {}), /not assignable/);
  await assert.doesNotReject(() => compileNative7(root, { 'src/index.ts': 'export const value: number = 1;' }));
  assert.equal(fs.readFileSync(source, 'utf8'), invalid);
});

test('native 7 checks every configured root extension', async () => {
  for (const [file, source, options] of [
    ['bad.js', '/** @type {number} */ const value = "bad";', {allowJs:true,checkJs:true}],
    ['bad.jsx', '/** @type {number} */ const value = "bad";', {allowJs:true,checkJs:true,jsx:'preserve'}],
    ['bad.mts', 'export const value: number = "bad";', {}],
    ['bad.cts', 'export const value: number = "bad";', {}],
  ]) {
    const root = fixture();
    fs.mkdirSync(path.join(root, 'src'));
    fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({compilerOptions:{...options,types:[],noEmit:true},include:['src']}));
    fs.writeFileSync(path.join(root, 'src', file), source);
    const native = spawnSync(process.execPath, [compiler, '--project', root], {encoding:'utf8'});
    assert.match(native.stdout, /TS2322/, file);
    await assert.rejects(() => compileNative7(root, {}), /not assignable/, file);
  }
});

test('native 7 preserves original emit-layout diagnostics without writing output', async () => {
  const root = fixture();
  const reference = fixture();
  fs.mkdirSync(path.join(root, 'src'));
  fs.mkdirSync(path.join(reference, 'src'));
  const source = path.join(root, 'src/index.ts');
  fs.writeFileSync(source, 'export const value: number = 1;');
  fs.writeFileSync(path.join(reference, 'src/index.ts'), 'export const value: number = 1;');
  const config = {compilerOptions:{types:[],declaration:true,emitDeclarationOnly:true,outDir:'dist'},include:['src']};
  const configFile = path.join(root, 'tsconfig.json');
  const referenceConfig = path.join(reference, 'tsconfig.json');
  fs.writeFileSync(configFile, JSON.stringify(config));
  fs.writeFileSync(referenceConfig, JSON.stringify(config));
  const cli = spawnSync(process.execPath, [compiler, '--project', reference], {encoding:'utf8'});
  assert.notEqual(cli.status, 0);
  assert.match(cli.stdout, /TS5011/);
  await assert.rejects(() => compileNative7(root, {}), /rootDir/);
  assert.equal(fs.existsSync(path.join(root, 'dist')), false);
  assert.equal(fs.readFileSync(source, 'utf8'), 'export const value: number = 1;');

  config.compilerOptions.rootDir = 'src';
  fs.writeFileSync(configFile, JSON.stringify(config));
  fs.writeFileSync(referenceConfig, JSON.stringify(config));
  await assert.doesNotReject(() => compileNative7(root, {}));
  assert.equal(fs.existsSync(path.join(root, 'dist')), false);
  const valid = spawnSync(process.execPath, [compiler, '--project', reference], {encoding:'utf8'});
  assert.equal(valid.status, 0, valid.stdout + valid.stderr);
});

test('native 7 honors inherited paths and never writes trace, build info, or plugin output', async () => {
  const root = fixture();
  const project = path.join(root, 'project');
  const output = path.join(root, 'outside-output');
  const marker = path.join(root, 'plugin-ran');
  fs.mkdirSync(path.join(project, 'src'), {recursive:true});
  fs.mkdirSync(path.join(project, 'node_modules/synthetic-plugin'), {recursive:true});
  fs.writeFileSync(path.join(project, 'node_modules/synthetic-plugin/package.json'), JSON.stringify({name:'synthetic-plugin',main:'index.cjs'}));
  fs.writeFileSync(path.join(project, 'node_modules/synthetic-plugin/index.cjs'), `require('fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`);
  fs.writeFileSync(path.join(project, 'base.json'), JSON.stringify({compilerOptions:{paths:{'@internal/*':['./src/*']},types:[],strict:true,target:'es2022',module:'esnext',moduleResolution:'bundler'}}));
  const config = {extends:'./base.json',compilerOptions:{noEmit:true,composite:true,incremental:true,traceResolution:true,rootDir:'./src',outDir:path.join(output,'out'),tsBuildInfoFile:path.join(output,'state'),generateTrace:path.join(output,'trace'),plugins:[{name:'synthetic-plugin'}]},include:['src']};
  fs.writeFileSync(path.join(project, 'tsconfig.json'), JSON.stringify(config));
  fs.writeFileSync(path.join(project, 'src/helper.ts'), 'export const value: number = 7;');
  fs.writeFileSync(path.join(project, 'src/index.ts'), 'import { value } from "@internal/helper"; export const result: number = value;');
  await assert.doesNotReject(() => compileNative7(project, {}));
  assert.equal(fs.existsSync(output), false);
  assert.equal(fs.existsSync(marker), false);
  config.references = [{path:'./missing-reference'}];
  fs.writeFileSync(path.join(project, 'tsconfig.json'), JSON.stringify(config));
  await assert.rejects(() => compileNative7(project, {}));
  assert.equal(fs.existsSync(output), false);
  assert.equal(fs.existsSync(marker), false);
});

test('native 7 agrees with the CLI for built and unbuilt project references', async () => {
  const root = fixture();
  const app = path.join(root, 'app');
  const lib = path.join(root, 'lib');
  fs.mkdirSync(path.join(app, 'src'), {recursive:true});
  fs.mkdirSync(path.join(lib, 'src'), {recursive:true});
  fs.writeFileSync(path.join(app, 'tsconfig.json'), JSON.stringify({compilerOptions:{composite:true,noEmit:true,types:[]},include:['src'],references:[{path:'../lib'}]}));
  fs.writeFileSync(path.join(lib, 'tsconfig.json'), JSON.stringify({compilerOptions:{composite:true,outDir:'dist',types:[]},include:['src']}));
  fs.writeFileSync(path.join(app, 'src/index.ts'), 'import { value } from "../../lib/src/index"; export const result = value;');
  fs.writeFileSync(path.join(lib, 'src/index.ts'), 'export const value: number = 1;');
  const before = spawnSync(process.execPath, [compiler, '--project', app, '--noEmit'], {encoding:'utf8'});
  assert.notEqual(before.status, 0);
  assert.match(before.stdout, /TS6305/);
  await assert.rejects(() => compileNative7(app, {}), /has not been built/);
  const build = spawnSync(process.execPath, [compiler, '--build', lib], {encoding:'utf8'});
  assert.equal(build.status, 0, build.stdout + build.stderr);
  const after = spawnSync(process.execPath, [compiler, '--project', app, '--noEmit'], {encoding:'utf8'});
  assert.equal(after.status, 0, after.stdout + after.stderr);
  await assert.doesNotReject(() => compileNative7(app, {}));
});

test('direct owner fails closed and reaps children on timeout or worker death', { timeout: 30_000 }, async () => {
  const base = path.resolve('packages/cli/work/tests');
  fs.mkdirSync(base, { recursive: true });
  for (const mode of ['timeout', 'worker-death']) {
    const root = fs.mkdtempSync(path.join(base, `owner-${mode}-`));
    const dist = path.join(root, 'dist');
    const project = path.join(root, 'project');
    fs.mkdirSync(dist);
    fs.mkdirSync(path.join(project, 'src'), { recursive: true });
    fs.writeFileSync(path.join(project, 'tsconfig.json'), JSON.stringify({ compilerOptions: { types: [] }, include: ['src'] }));
    fs.writeFileSync(path.join(project, 'src/index.ts'), 'export const value = 1;');
    for (const name of ['files.js', 'fs-observations.js', 'ts7-pipe-worker.js'])
      fs.copyFileSync(path.resolve('packages/cli/dist', name), path.join(dist, name));
    const nativePidFile = path.join(root, 'native-pid');
    const workerPidFile = path.join(root, 'worker-pid');
    let source = fs.readFileSync(path.resolve('packages/cli/dist/ts7.js'), 'utf8');
    assert.match(source, /const nativeClosed =/);
    assert.match(source, /const workerClosed =/);
    assert.match(source, /60_000\);/);
    assert.match(source, /worker\.send\(\{ root, overlay \}\);/);
    globalThis.__latchChildProbe = { nativePidFile, workerPidFile, mode };
    source = source.replace('const nativeClosed =', "native.once('spawn', () => fs.writeFileSync(globalThis.__latchChildProbe.nativePidFile, String(native.pid)));\nconst nativeClosed =");
    source = source.replace('const workerClosed =', "worker.once('spawn', () => { fs.writeFileSync(globalThis.__latchChildProbe.workerPidFile, String(worker.pid)); if (globalThis.__latchChildProbe.mode === 'worker-death') worker.kill('SIGKILL'); });\nconst workerClosed =");
    if (mode === 'timeout') {
      source = source.replace('60_000);', '1_000);');
      source = source.replace('worker.send({ root, overlay });', ';');
    }
    fs.writeFileSync(path.join(dist, 'ts7.js'), source);
    const { compileNative7: testCompile } = await import(pathToFileURL(path.join(dist, 'ts7.js')).href);
    await assert.rejects(() => testCompile(project, {}), mode === 'timeout' ? /timed out/ : /exited unexpectedly|worker failed/);
    for (const file of [nativePidFile, workerPidFile]) {
      const pid = Number(fs.readFileSync(file, 'utf8'));
      assert.throws(() => process.kill(pid, 0), error => error.code === 'ESRCH');
      if (process.platform === 'linux') assert.equal(fs.existsSync(`/proc/${pid}`), false);
    }
    assert.deepEqual(fs.readdirSync(project).sort(), ['src', 'tsconfig.json']);
    delete globalThis.__latchChildProbe;
  }
});

test('a refused child termination is bounded and blocks further validation until reaped', { timeout: 30_000, skip: process.platform === 'win32' }, async () => {
  const base = path.resolve('packages/cli/work/tests');
  fs.mkdirSync(base, { recursive: true });
  const root = fs.mkdtempSync(path.join(base, 'owner-refusal-'));
  const dist = path.join(root, 'dist');
  const project = path.join(root, 'project');
  fs.mkdirSync(dist);
  fs.mkdirSync(project);
  fs.writeFileSync(path.join(project, 'tsconfig.json'), JSON.stringify({ compilerOptions: { types: [], noEmit: true }, files: ['index.ts'] }));
  fs.writeFileSync(path.join(project, 'index.ts'), 'export const value: number = 1;');
  for (const name of ['files.js', 'fs-observations.js', 'ts7-pipe-worker.js'])
    fs.copyFileSync(path.resolve('packages/cli/dist', name), path.join(dist, name));
  let source = fs.readFileSync(path.resolve('packages/cli/dist/ts7.js'), 'utf8');
  const anchor = "const nativeClosed = new Promise(resolve => native.once('close', () => { nativeDidClose = true; resolve(); }));";
  assert.ok(source.includes(anchor) && source.includes('60_000'));
  source = source.replace(anchor, anchor + `
    if (!globalThis.__latchRefusalChild) {
      native.once('spawn', () => {
        const originalKill = native.kill.bind(native);
        originalKill('SIGSTOP');
        globalThis.__latchRefusalChild = { child: native, stop: () => originalKill('SIGKILL') };
        native.kill = () => { const error = Error('synthetic permission refusal'); error.code = 'EPERM'; throw error; };
      });
    }`);
  // Only the deliberately stopped first compiler needs a shortened timeout;
  // the recovery validation must retain its normal budget on slower runners.
  source = source.replace('60_000', '(globalThis.__latchRefusalChild ? 60_000 : 1500)');
  fs.writeFileSync(path.join(dist, 'ts7.js'), source);
  const { compileNative7: testCompile } = await import(pathToFileURL(path.join(dist, 'ts7.js')).href);
  try {
    const start = Date.now();
    await assert.rejects(() => testCompile(project, {}), /cleanup failed/);
    assert.ok(Date.now() - start < 10_000, 'cleanup must finish within its bounded grace period');
    const owned = globalThis.__latchRefusalChild;
    assert.ok(owned?.child.pid);
    await assert.rejects(() => testCompile(project, {}), /previous TypeScript compiler is still shutting down/);
    assert.deepEqual(fs.readdirSync(project).sort(), ['index.ts', 'tsconfig.json']);
    const closed = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('owned compiler did not close')), 5_000);
      owned.child.once('close', () => { clearTimeout(timer); resolve(); });
    });
    owned.stop();
    await closed;
    await assert.doesNotReject(() => testCompile(project, {}));
    assert.deepEqual(fs.readdirSync(project).sort(), ['index.ts', 'tsconfig.json']);
  } finally {
    const owned = globalThis.__latchRefusalChild;
    if (owned && owned.child.exitCode === null && owned.child.signalCode === null) owned.stop();
    delete globalThis.__latchRefusalChild;
  }
});
