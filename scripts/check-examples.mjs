import { spawnSync } from 'node:child_process';

for (const example of ['catalog', 'docs']) {
  const result = spawnSync(
    process.execPath,
    ['packages/cli/dist/main.js', 'check', '--root', `examples/${example}`],
    { stdio: 'inherit' },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
