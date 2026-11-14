import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { compileNative7 } from '../packages/cli/dist/ts7.js';

const base = path.resolve('work/tests');
fs.mkdirSync(base, { recursive: true });
const fixture = () => fs.mkdtempSync(path.join(base, 'typescript7-'));
const compiler = path.resolve('packages/cli/node_modules/typescript7/bin/tsc');

test('native 7 validation rejects incompatible virtual files without writes', () => {
  const root = fixture();
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({compilerOptions:{types:[],noEmit:true},include:['src']}));
  const source = path.join(root, 'src/main.ts');
  fs.writeFileSync(source, 'export const original = 1;');
  const before = fs.readFileSync(source, 'utf8');
  assert.doesNotThrow(() => compileNative7(root, {}));
  assert.throws(() => compileNative7(root, { 'src/new/integration.ts': 'export const value: number = "incorrect";' }), /not assignable/);
  assert.equal(fs.readFileSync(source, 'utf8'), before);
  assert.equal(fs.existsSync(path.join(root, 'src/new')), false);
});

test('native 7 checks every configured root extension', () => {
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
    assert.throws(() => compileNative7(root, {}), /not assignable/, file);
  }
});

test('native 7 honors inherited paths and never writes trace, build info, or plugin output', () => {
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
  assert.doesNotThrow(() => compileNative7(project, {}));
  assert.equal(fs.existsSync(output), false);
  assert.equal(fs.existsSync(marker), false);
  config.references = [{path:'./missing-reference'}];
  fs.writeFileSync(path.join(project, 'tsconfig.json'), JSON.stringify(config));
  assert.throws(() => compileNative7(project, {}));
  assert.equal(fs.existsSync(output), false);
  assert.equal(fs.existsSync(marker), false);
});

test('native 7 agrees with the CLI for built and unbuilt project references', () => {
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
  assert.throws(() => compileNative7(app, {}), /has not been built/);
  const build = spawnSync(process.execPath, [compiler, '--build', lib], {encoding:'utf8'});
  assert.equal(build.status, 0, build.stdout + build.stderr);
  const after = spawnSync(process.execPath, [compiler, '--project', app, '--noEmit'], {encoding:'utf8'});
  assert.equal(after.status, 0, after.stdout + after.stderr);
  assert.doesNotThrow(() => compileNative7(app, {}));
});

test('native supervisor fails closed and reaps children on timeout or worker death', () => {
  // Copy the compiled workers beneath the CLI so normal package resolution is
  // preserved. Only the copied timeout is shortened for this regression test.
  const base = path.resolve('packages/cli/work/tests');
  fs.mkdirSync(base, {recursive:true});
  for (const mode of ['timeout', 'worker-death']) {
    const root = fs.mkdtempSync(path.join(base, `lifecycle-${mode}-`));
    const dist = path.join(root, 'dist');
    const project = path.join(root, 'project');
    fs.mkdirSync(dist);
    fs.mkdirSync(path.join(project, 'src'), {recursive:true});
    fs.writeFileSync(path.join(project, 'tsconfig.json'), JSON.stringify({compilerOptions:{types:[]},include:['src']}));
    fs.writeFileSync(path.join(project, 'src/index.ts'), 'export const value = 1;');
    for (const name of ['files.js', 'ts7-pipe-worker.js'])
      fs.copyFileSync(path.resolve('packages/cli/dist', name), path.join(dist, name));
    const nativePidFile = path.join(root, 'native-pid');
    const workerPidFile = path.join(root, 'worker-pid');
    let source = fs.readFileSync(path.resolve('packages/cli/dist/ts7-supervisor.js'), 'utf8');
    assert.match(source, /const worker = fork\(/);
    assert.match(source, /const nativeClosed =/);
    assert.match(source, /60_000\);/);
    source = source.replace('const worker = fork(', `native.once('spawn', () => fs.writeFileSync(${JSON.stringify(nativePidFile)}, String(native.pid)));\nconst worker = fork(`);
    source = source.replace('const nativeClosed =', `worker.once('spawn', () => { fs.writeFileSync(${JSON.stringify(workerPidFile)}, String(worker.pid)); ${mode === 'worker-death' ? "worker.kill('SIGKILL');" : ''} });\nconst nativeClosed =`);
    if (mode === 'timeout') source = source.replace('60_000);', '1);');
    const supervisor = path.join(dist, 'ts7-supervisor.js');
    fs.writeFileSync(supervisor, source);
    const run = spawnSync(process.execPath, [supervisor], {input:JSON.stringify({root:project,overlay:{}}),encoding:'utf8',timeout:15000});
    assert.equal(run.status, 0, run.stderr);
    const result = JSON.parse(run.stdout);
    assert.equal(result.ok, false);
    assert.match(result.error, mode === 'timeout' ? /timed out/ : /exited unexpectedly|worker failed/);
    for (const file of [nativePidFile, workerPidFile]) {
      const pid = Number(fs.readFileSync(file, 'utf8'));
      assert.throws(() => process.kill(pid, 0), error => error.code === 'ESRCH');
      if (process.platform === 'linux') assert.equal(fs.existsSync(`/proc/${pid}`), false);
    }
    assert.deepEqual(fs.readdirSync(project).sort(), ['src', 'tsconfig.json']);
  }
});
