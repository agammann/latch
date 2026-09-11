import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
const children = [];
const root = process.cwd();
function run(args) {
  const r = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
  if (r.status) throw Error(`Verification failed: ${args.join(' ')}`);
}
try {
  run(['scripts/build.mjs']);
  for (const example of ['catalog', 'docs']) {
    run(['packages/cli/dist/main.js', 'generate', '--root', `examples/${example}`]);
    run(['packages/cli/dist/main.js', 'apply', '--root', `examples/${example}`]);
    run(['node_modules/vite/bin/vite.js', 'build', `examples/${example}`]);
  }
  run([
    '--test',
    'tests/runtime.test.mjs',
    'tests/generator.test.mjs',
    'tests/service.test.mjs',
    'tests/bridge.test.mjs',
  ]);
  for (const [example, port] of [
    ['catalog', 5173],
    ['docs', 5174],
  ]) {
    const child = spawn(
      process.execPath,
      [
        'node_modules/vite/bin/vite.js',
        `examples/${example}`,
        '--host',
        '127.0.0.1',
        '--port',
        String(port),
        '--strictPort',
      ],
      { cwd: root, stdio: 'pipe' },
    );
    children.push(child);
    let ready = false;
    for (let i = 0; i < 50; i++) {
      try {
        await fetch(`http://127.0.0.1:${port}`);
        ready = true;
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    if (!ready) throw Error(`Could not start ${example}`);
    run(['packages/cli/dist/main.js', 'test', '--root', `examples/${example}`]);
    fs.mkdirSync('reports', { recursive: true });
    for (const ext of ['json', 'txt'])
      fs.copyFileSync(`examples/${example}/.latch/report.${ext}`, `reports/${example}.${ext}`);
  }
  run(['scripts/regression.mjs']);
  run(['scripts/pack.mjs']);
  run(['scripts/audit-artifacts.mjs']);
} finally {
  for (const child of children) child.kill();
}
