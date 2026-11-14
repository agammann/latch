import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Keep native work in a disposable process: the sync API can block its JS
// thread, so a timer in that same process cannot enforce a deadline.
export function compileNative7(root: string, overlay: Record<string, string>): void {
  const worker = fileURLToPath(new URL('./ts7-supervisor.js', import.meta.url));
  const env: NodeJS.ProcessEnv = {};
  // Do not inherit NODE_OPTIONS or other user-controlled Node loader settings.
  for (const key of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR']) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  const run = spawnSync(process.execPath, [worker], {
    input: JSON.stringify({ root, overlay }),
    encoding: 'utf8',
    env,
    timeout: 75_000,
    maxBuffer: 1024 * 1024,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'ignore'],
  });
  if ((run.error as NodeJS.ErrnoException | undefined)?.code === 'ETIMEDOUT')
    throw Error('TypeScript 7 validation timed out; no changes were applied');
  if (run.error || run.status !== 0)
    throw Error('TypeScript 7 validation could not complete; no changes were applied');
  let response: unknown;
  try { response = JSON.parse(run.stdout); } catch { throw Error('Invalid TypeScript 7 validation response'); }
  if (!response || typeof response !== 'object' || !('ok' in response))
    throw Error('Invalid TypeScript 7 validation response');
  if ((response as { ok: unknown }).ok !== true) {
    const message = (response as { error?: unknown }).error;
    throw Error(typeof message === 'string' ? message : 'TypeScript 7 validation failed');
  }
}
