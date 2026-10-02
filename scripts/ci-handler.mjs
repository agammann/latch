import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { runTests, formatReport } from '../packages/test/dist/index.js';
const children = [];
const native = process.argv.includes('--native');
fs.mkdirSync('reports', { recursive: true });
try {
  for (const [example, port] of [
    ['catalog', 5173],
    ['docs', 5174],
  ]) {
    const c = JSON.parse(fs.readFileSync(`examples/${example}/latch.config.json`));
    const nativeCases = native
      ? []
      : c.tests
          .filter((t) => t.mode === 'native')
          .map((t) => ({ name: t.name, status: 'not run in handler-only CI lane' }));
    c.browser = { channel: 'chromium', native };
    if (!native) c.tests = c.tests.filter((t) => t.mode === 'handler');
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
    let started = false;
    let startupError = '';
    child.stdout.on('data', (chunk) => {
      if (chunk.toString().includes(c.baseUrl)) started = true;
    });
    child.stderr.on('data', (chunk) => {
      startupError += chunk.toString();
    });
    child.on('error', (error) => {
      startupError = error.message;
    });
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null || startupError.includes('already in use'))
        throw Error(`Failed to start ${example}: ${startupError.trim()}`);
      try {
        if (!started) throw Error('Waiting for owned development server');
        const response = await fetch(c.baseUrl);
        if (!response.ok) throw Error('Development server returned an error');
        ready = true;
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    if (!ready) throw Error(`Failed to start ${example}`);
    const report = await runTests(c);
    fs.writeFileSync(
      `reports/ci-${native ? 'native-' : ''}${example}.json`,
      JSON.stringify({ ...report, nativeCases }, null, 2),
    );
    console.log(formatReport(report));
    if (report.failed || report.blocked) process.exitCode = 1;
  }
} finally {
  children.forEach((c) => c.kill());
}
