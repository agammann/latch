import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { runTests, formatReport } from '../packages/test/dist/index.js';
const children = [];
fs.mkdirSync('reports', { recursive: true });
try {
  for (const [example, port] of [
    ['catalog', 5173],
    ['docs', 5174],
  ]) {
    const c = JSON.parse(fs.readFileSync(`examples/${example}/latch.config.json`));
    const nativeCases = c.tests
      .filter((t) => t.mode === 'native')
      .map((t) => ({ name: t.name, status: 'not run in handler-only CI lane' }));
    c.browser = { channel: 'chromium', native: false };
    c.tests = c.tests.filter((t) => t.mode === 'handler');
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
      { stdio: 'pipe' },
    );
    children.push(child);
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try {
        await fetch(c.baseUrl);
        ready = true;
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    if (!ready) throw Error(`Failed to start ${example}`);
    const report = await runTests(c);
    fs.writeFileSync(
      `reports/ci-${example}.json`,
      JSON.stringify({ ...report, nativeCases }, null, 2),
    );
    console.log(formatReport(report));
    if (report.failed || report.blocked) process.exitCode = 1;
  }
} finally {
  children.forEach((c) => c.kill());
}
