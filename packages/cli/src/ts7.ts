import fs from 'node:fs';
import path from 'node:path';
import { spawn, fork, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

type Owned = { child: ChildProcess; closed: Promise<void>; didClose: () => boolean };
const pendingCleanup = new Set<ChildProcess>();
const activeCompilers = new Set<() => Promise<void>>();
let retryCleanup: NodeJS.Timeout | undefined;
let stopping: Promise<boolean> | undefined;
let stopEpoch = 0;

// Used only by the CLI entrypoint's signal handler. Package consumers do not
// have signal handlers installed implicitly.
export function stopActiveCompilers(): Promise<boolean> {
  stopEpoch++;
  if (!stopping) {
    stopping = Promise.allSettled([...activeCompilers].map(cancel => {
      try { return cancel(); } catch (error) { return Promise.reject(error); }
    })).then(results => results.every(result => result.status === 'fulfilled') && pendingCleanup.size === 0)
      .finally(() => { stopping = undefined; });
  }
  return stopping;
}

function requestStop(child: ChildProcess): boolean {
  // Once exit is observed, a delayed stream-close must not cause another kill
  // against a PID that could already have been reused by the operating system.
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return true;
  try { child.kill('SIGKILL'); return true; } catch { return false; }
}

// Do not hang a validation forever if the OS refuses to terminate a child.
// Keep the handle for eventual close/reaping, retry while this process lives,
// and fail later TS7 validations until cleanup is complete.
async function awaitCleanup(children: Owned[]): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), 3_000); });
  const clean = await Promise.race([Promise.all(children.map(item => item.closed)).then(() => true), deadline]);
  if (timer) clearTimeout(timer);
  if (clean) return true;
  for (const item of children) {
    if (item.didClose()) continue;
    pendingCleanup.add(item.child);
    item.child.unref();
    item.child.once('close', () => { pendingCleanup.delete(item.child); });
    if (item.child.connected) { try { item.child.disconnect(); } catch { /* Already closed. */ } }
  }
  if (!retryCleanup) {
    retryCleanup = setInterval(() => {
      for (const child of pendingCleanup) requestStop(child);
      if (!pendingCleanup.size && retryCleanup) { clearInterval(retryCleanup); retryCleanup = undefined; }
    }, 1_000);
    retryCleanup.unref();
  }
  return false;
}

// The CLI process directly owns both children. Unlike a disposable supervisor,
// it can reap them itself if the validation worker fails or times out.
export async function compileNative7(root: string, overlay: Record<string, string>): Promise<unknown> {
  if (stopping) throw Error('TypeScript validation is stopping');
  const epoch = stopEpoch;
  if (pendingCleanup.size) throw Error('A previous TypeScript compiler is still shutting down; try again later');
  const require = createRequire(import.meta.url);
  const packageFile = require.resolve('typescript7/package.json');
  const info = JSON.parse(fs.readFileSync(packageFile, 'utf8')) as { version?: string };
  if (info.version !== '7.0.2') throw Error('Unsupported TypeScript 7 API version');
  const getExePath = (await import(pathToFileURL(path.join(path.dirname(packageFile), 'lib/getExePath.js')).href) as { default: () => string }).default;
  if (epoch !== stopEpoch) throw Error('TypeScript validation interrupted; no changes were applied');
  const env: NodeJS.ProcessEnv = {};
  for (const key of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR']) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  const native = spawn(getExePath(), [
    '--api', '--async', '--cwd', root,
    '--callbacks=readFile,fileExists,directoryExists,getAccessibleEntries,realpath',
  ], { stdio: ['pipe', 'pipe', 'ignore'], env, windowsHide: true });
  // Attach ownership and an error listener immediately, before forking the
  // second child: setup failure must not leave the native process untracked.
  let nativeDidClose = false;
  const nativeClosed = new Promise<void>(resolve => native.once('close', () => { nativeDidClose = true; resolve(); }));
  const nativeOwned: Owned = { child: native, closed: nativeClosed, didClose: () => nativeDidClose };
  native.on('error', () => {});
  const starting: Owned[] = [nativeOwned];
  let startupCleanup: Promise<void> | undefined;
  const cancelStarting = () => startupCleanup ??= (async () => {
    let cleanupFailed = false;
    for (const item of starting) {
      if (!requestStop(item.child)) cleanupFailed = true;
      for (const stream of item.child.stdio) {
        try { stream?.destroy(); } catch { cleanupFailed = true; }
      }
    }
    try { if (!await awaitCleanup(starting)) cleanupFailed = true; }
    catch { cleanupFailed = true; }
    if (cleanupFailed) throw Error('Could not stop TypeScript startup processes');
  })();
  activeCompilers.add(cancelStarting);
  let worker: ReturnType<typeof fork>;
  try {
    worker = fork(fileURLToPath(new URL('./ts7-pipe-worker.js', import.meta.url)), [], {
      stdio: ['pipe', 'pipe', 'ignore', 'ipc'], env, execArgv: [],
    });
  } catch {
    try { await cancelStarting(); } finally { activeCompilers.delete(cancelStarting); }
    throw Error('Could not start TypeScript validation worker');
  }
  let workerDidClose = false;
  const workerClosed = new Promise<void>(resolve => worker.once('close', () => { workerDidClose = true; resolve(); }));
  const workerOwned: Owned = { child: worker, closed: workerClosed, didClose: () => workerDidClose };
  starting.push(workerOwned);
  worker.on('error', () => {});
  if (!worker.stdin || !worker.stdout) {
    try { await cancelStarting(); } finally { activeCompilers.delete(cancelStarting); }
    throw Error('Could not open TypeScript validation worker pipes');
  }
  try {
    native.stdout.pipe(worker.stdin);
    worker.stdout.pipe(native.stdin);
  } catch {
    try { await cancelStarting(); } finally { activeCompilers.delete(cancelStarting); }
    throw Error('Could not connect TypeScript validation worker pipes');
  }
  native.stdin.on('error', () => {});
  worker.stdin.on('error', () => {});
  native.stdout.on('error', () => {});
  worker.stdout.on('error', () => {});
  activeCompilers.delete(cancelStarting);
  const result = await new Promise<unknown>((resolve) => {
    let interrupted = false;
    let finishing: Promise<void> | undefined;
    const timer = setTimeout(() => void finish({ ok: false, error: 'TypeScript 7 validation timed out; no changes were applied' }), 60_000);
    const cancel = () => {
      interrupted = true;
      return finish({ ok: false, error: 'TypeScript validation interrupted; no changes were applied' });
    };
    function finish(value: unknown): Promise<void> {
      if (!finishing) finishing = (async () => {
        clearTimeout(timer);
        let cleanupFailed = false;
        if (!requestStop(native)) cleanupFailed = true;
        if (!requestStop(worker)) cleanupFailed = true;
        for (const closePipe of [
          () => native.stdout.unpipe(worker.stdin!),
          () => worker.stdout!.unpipe(native.stdin),
          () => native.stdout.destroy(), () => native.stdin.destroy(),
          () => worker.stdin!.destroy(), () => worker.stdout!.destroy(),
        ]) {
          try { closePipe(); } catch { cleanupFailed = true; }
        }
        try { if (!await awaitCleanup([nativeOwned, workerOwned])) cleanupFailed = true; }
        catch { cleanupFailed = true; }
        activeCompilers.delete(cancel);
        resolve(cleanupFailed ? { ok: false, error: 'TypeScript validation cleanup failed; no changes were applied' }
          : interrupted ? { ok: false, error: 'TypeScript validation interrupted; no changes were applied' } : value);
      })();
      return finishing;
    }
    activeCompilers.add(cancel);
    worker.on('message', value => void finish(value));
    worker.on('error', () => void finish({ ok: false, error: 'TypeScript 7 validation worker failed' }));
    worker.on('exit', () => void finish({ ok: false, error: 'TypeScript 7 validation worker exited unexpectedly' }));
    native.on('error', () => void finish({ ok: false, error: 'TypeScript 7 native compiler failed to start' }));
    native.on('exit', () => void finish({ ok: false, error: 'TypeScript 7 native compiler exited unexpectedly' }));
    try { worker.send({ root, overlay }); }
    catch { void finish({ ok: false, error: 'TypeScript validation worker communication failed' }); }
  });
  if (!result || typeof result !== 'object' || !('ok' in result))
    throw Error('Invalid TypeScript 7 validation response');
  if ((result as { ok: unknown }).ok !== true) {
    const message = (result as { error?: unknown }).error;
    throw Error(typeof message === 'string' ? message : 'TypeScript 7 validation failed');
  }
  return (result as { observations?: unknown }).observations;
}
