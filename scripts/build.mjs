import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
export function run(args, cwd = root) {
  const r = spawnSync(process.execPath, args, { cwd, stdio: 'inherit' });
  if (r.status !== 0) throw Error(`Command failed (${r.status}): ${args.join(' ')}`);
}
for (const p of ['contracts', 'browser', 'runtime', 'react', 'test', 'cli'])
  run(['node_modules/typescript/bin/tsc', '-p', `packages/${p}/tsconfig.json`]);
run([
  'node_modules/vite/bin/vite.js',
  'build',
  'packages/console',
  '--outDir',
  '../cli/dist/console',
  '--emptyOutDir',
]);
