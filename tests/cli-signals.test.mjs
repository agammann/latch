import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const base = path.resolve('packages/cli/work/tests');
fs.mkdirSync(base, { recursive: true });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function within(promise, ms) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('CLI did not exit after signal')), ms); })]); }
  finally { clearTimeout(timer); }
}

test('importing the CLI does not install global signal handlers', async () => {
  const before = ['SIGINT', 'SIGTERM'].map(signal => process.listeners(signal));
  await import('../packages/cli/dist/main.js');
  assert.deepEqual(['SIGINT', 'SIGTERM'].map(signal => process.listeners(signal)), before);
});

test('signal cleanup waits for every compiler even when one cancellation fails', { timeout: 10_000 }, async () => {
  const directory = fs.mkdtempSync(path.join(base, 'cancel-all-'));
  fs.cpSync('packages/cli/dist', directory, { recursive: true });
  const moduleFile = path.join(directory, 'ts7.js');
  let source = fs.readFileSync(moduleFile, 'utf8');
  const anchor = 'const activeCompilers = new Set();';
  assert.ok(source.includes(anchor));
  source = source.replace(anchor, anchor + '\nexport function addTestCompiler(cancel) { activeCompilers.add(cancel); }');
  fs.writeFileSync(moduleFile, source);
  const { addTestCompiler, stopActiveCompilers } = await import(pathToFileURL(moduleFile).href);
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  addTestCompiler(() => { throw Error('synthetic cancellation failure'); });
  addTestCompiler(() => pending);
  let finished = false;
  const stopping = stopActiveCompilers().then(result => { finished = true; return result; });
  await delay(25);
  assert.equal(finished, false);
  release();
  assert.equal(await stopping, false);
});

test('the validation worker does not inherit caller preload flags', { timeout: 30_000 }, async () => {
  const root = fs.mkdtempSync(path.join(base, 'exec-argv-'));
  const project = path.join(root, 'project');
  fs.mkdirSync(project);
  fs.writeFileSync(path.join(project, 'tsconfig.json'), JSON.stringify({ compilerOptions: { types: [], noEmit: true }, files: ['index.ts'] }));
  fs.writeFileSync(path.join(project, 'index.ts'), 'export const value: number = 1;');
  const marker = path.join(root, 'preload-count');
  const preload = path.join(root, 'preload.cjs');
  fs.writeFileSync(preload, `require('node:fs').appendFileSync(${JSON.stringify(marker)}, 'x');`);
  const entry = path.join(root, 'entry.mjs');
  fs.writeFileSync(entry, `import { compileNative7 } from ${JSON.stringify(pathToFileURL(path.resolve('packages/cli/dist/ts7.js')).href)}; await compileNative7(${JSON.stringify(project)}, {});`);
  const child = spawn(process.execPath, ['--require', preload, entry], { stdio: ['ignore', 'ignore', 'pipe'] });
  let errors = '';
  child.stderr.on('data', chunk => { errors += String(chunk); });
  const outcome = await within(new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal }))), 20_000);
  assert.equal(outcome.code, 0, `${JSON.stringify(outcome)} ${errors}`);
  assert.equal(fs.readFileSync(marker, 'utf8'), 'x');
});

test('CLI signals stop and reap a stalled compiler without changing project files', { timeout: 90_000, skip: process.platform === 'win32' }, async () => {
  for (const signal of ['SIGINT', 'SIGTERM']) for (const group of [false, true]) for (const custom of [false, true]) {
    const root = fs.mkdtempSync(path.join(base, 'signal-owner-'));
    const dist = path.join(root, 'dist');
    const project = path.join(root, 'project');
    fs.cpSync('packages/cli/dist', dist, { recursive: true });
    fs.cpSync('examples/docs', project, {
      recursive: true,
      filter: s => !s.split(path.sep).some(p => ['node_modules', 'dist', '.latch', 'latch.generated'].includes(p)),
    });
    const main = path.join(project, 'src/main.tsx');
    fs.writeFileSync(main, fs.readFileSync(main, 'utf8')
      .replace(/^import \{ useProjectTools \}.*\n/, '')
      .replace(/useProjectTools\(\{\}\); \/\/ @latch:mount/, '// @latch:mount'));
    fs.mkdirSync(path.join(project, 'node_modules/typescript'), { recursive: true });
    fs.writeFileSync(path.join(project, 'node_modules/typescript/package.json'), JSON.stringify({ name: 'typescript', version: '7.0.2' }));
    const nativeFile = path.join(root, 'native-pid');
    const workerFile = path.join(root, 'worker-pid');
    const module = path.join(dist, 'ts7.js');
    let source = fs.readFileSync(module, 'utf8');
    const nativeAnchor = "const nativeClosed = new Promise(resolve => native.once('close', () => { nativeDidClose = true; resolve(); }));";
    const workerAnchor = "const workerClosed = new Promise(resolve => worker.once('close', () => { workerDidClose = true; resolve(); }));";
    assert.ok(source.includes(nativeAnchor) && source.includes(workerAnchor));
    source = source.replace(nativeAnchor, nativeAnchor + " native.once('spawn', () => { native.kill('SIGSTOP'); fs.writeFileSync(process.env.LATCH_TEST_NATIVE_PID_FILE, String(native.pid)); });");
    source = source.replace(workerAnchor, workerAnchor + " worker.once('spawn', () => fs.writeFileSync(process.env.LATCH_TEST_WORKER_PID_FILE, String(worker.pid)));");
    fs.writeFileSync(module, source);
    const customMarker = path.join(root, 'custom');
    const preload = path.join(root, 'preload.cjs');
    fs.writeFileSync(preload, "process.on(process.env.LATCH_TEST_SIGNAL, () => require('node:fs').appendFileSync(process.env.LATCH_TEST_SIGNAL_MARKER, 'x')); setInterval(() => {}, 1000);");
    const cli = spawn(process.execPath, [...(custom ? ['--require', preload] : []), path.join(dist, 'main.js'), 'generate', '--root', project], {
      detached: true, stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env,
        LATCH_TEST_SIGNAL: signal, LATCH_TEST_SIGNAL_MARKER: customMarker,
        LATCH_TEST_NATIVE_PID_FILE: nativeFile, LATCH_TEST_WORKER_PID_FILE: workerFile },
    });
    let errors = '';
    cli.stderr.on('data', chunk => { errors += String(chunk); });
    const closed = new Promise(resolve => cli.once('close', (code, received) => resolve({ code, received })));
    try {
      const deadline = Date.now() + 15_000;
      while (Date.now() < deadline && (!fs.existsSync(nativeFile) || !fs.existsSync(workerFile))) await delay(20);
      assert.ok(fs.existsSync(nativeFile) && fs.existsSync(workerFile), `children did not start: ${errors}`);
      const native = Number(fs.readFileSync(nativeFile, 'utf8'));
      const worker = Number(fs.readFileSync(workerFile, 'utf8'));
      process.kill(group ? -cli.pid : cli.pid, signal);
      const end = Date.now() + 10_000;
      const alive = pid => { try { process.kill(pid, 0); return true; } catch (error) { if (error.code === 'ESRCH') return false; throw error; } };
      while (Date.now() < end && (alive(native) || alive(worker) || (custom && !fs.existsSync(customMarker)))) await delay(20);
      assert.equal(alive(native), false, `native compiler not reaped: ${errors}`);
      assert.equal(alive(worker), false, `validation worker not reaped: ${errors}`);
      assert.equal(fs.existsSync(path.join(project, '.latch/manifest.json')), false);
      assert.equal(fs.existsSync(path.join(project, 'src/latch.generated/integration.ts')), false);
      if (custom) {
        assert.equal(fs.readFileSync(customMarker, 'utf8'), 'x');
        await delay(100);
        assert.equal(cli.exitCode, null, 'custom listener should retain control of termination');
        assert.equal(cli.signalCode, null);
        process.kill(-cli.pid, 'SIGKILL');
        await closed;
      } else {
        const outcome = await within(closed, 10_000);
        assert.equal(outcome.received, signal, `${JSON.stringify(outcome)} ${errors}`);
      }
    } finally {
      // Only the detached process group created above is signalled by this test.
      if (cli.exitCode === null && cli.signalCode === null) {
        try { process.kill(-cli.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
        await closed;
      }
    }
  }
});
