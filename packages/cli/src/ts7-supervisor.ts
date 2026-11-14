import fs from 'node:fs';
import path from 'node:path';
import { spawn, fork } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

type Input = { root: string; overlay: Record<string, string> };
const input = JSON.parse(fs.readFileSync(0, 'utf8')) as Input;
const require = createRequire(import.meta.url);
const packageFile = require.resolve('typescript7/package.json');
const info = JSON.parse(fs.readFileSync(packageFile, 'utf8')) as { version?: string };
if (info.version !== '7.0.2') throw Error('Unsupported TypeScript 7 API version');
const getExePath = (await import(pathToFileURL(path.join(path.dirname(packageFile), 'lib/getExePath.js')).href) as { default: () => string }).default;
const native = spawn(getExePath(), [
  '--api', '--async', '--cwd', input.root,
  '--callbacks=readFile,fileExists,directoryExists,getAccessibleEntries,realpath',
], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
const worker = fork(fileURLToPath(new URL('./ts7-pipe-worker.js', import.meta.url)), [], {
  stdio: ['pipe', 'pipe', 'ignore', 'ipc'], env: process.env,
});
if (!worker.stdin || !worker.stdout) throw Error('Could not open TypeScript validation worker pipes');
const nativeClosed = new Promise<void>(resolve => native.once('close', () => resolve()));
const workerClosed = new Promise<void>(resolve => worker.once('close', () => resolve()));
native.stdout.pipe(worker.stdin);
worker.stdout.pipe(native.stdin);
native.stdin.on('error', () => {});
worker.stdin.on('error', () => {});
native.stdout.on('error', () => {});
worker.stdout.on('error', () => {});
let finishing = false;
const timer = setTimeout(() => void finish({ ok: false, error: 'TypeScript 7 validation timed out; no changes were applied' }), 60_000);
async function finish(result: unknown) {
  if (finishing) return;
  finishing = true;
  clearTimeout(timer);
  native.kill('SIGKILL');
  worker.kill('SIGKILL');
  // A worker blocked on a filesystem callback may stop reading compiler output.
  // Break both forwarding paths before waiting for process-close events.
  native.stdout.unpipe(worker.stdin!);
  worker.stdout!.unpipe(native.stdin);
  native.stdout.destroy();
  native.stdin.destroy();
  worker.stdin!.destroy();
  worker.stdout!.destroy();
  await Promise.all([nativeClosed, workerClosed]);
  process.stdout.write(JSON.stringify(result));
}
worker.on('message', value => void finish(value));
worker.on('error', () => void finish({ ok: false, error: 'TypeScript 7 validation worker failed' }));
worker.on('exit', () => void finish({ ok: false, error: 'TypeScript 7 validation worker exited unexpectedly' }));
native.on('error', () => void finish({ ok: false, error: 'TypeScript 7 native compiler failed to start' }));
native.on('exit', () => void finish({ ok: false, error: 'TypeScript 7 native compiler exited unexpectedly' }));
worker.send(input);
