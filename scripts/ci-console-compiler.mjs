import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { generate } from '../packages/cli/dist/generate.js';
import { serve } from '../packages/cli/dist/service.js';

const base = path.resolve('work/tests');
fs.mkdirSync(base, { recursive: true });
const root = fs.mkdtempSync(path.join(base, 'console-compiler-'));
fs.cpSync('examples/docs', root, {
  recursive: true,
  filter: (s) => !s.split(path.sep).some((p) => ['node_modules', 'dist', '.latch', 'latch.generated'].includes(p)),
});
const main = path.join(root, 'src/main.tsx');
fs.writeFileSync(main, fs.readFileSync(main, 'utf8')
  .replace(/^import \{ useProjectTools \}.*\n/, '')
  .replace(/useProjectTools\(\{\}\); \/\/ @latch:mount/, '// @latch:mount'));
fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({
  compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', jsx: 'react-jsx', strict: true, noEmit: true, skipLibCheck: true, types: ['vite/client'] },
  include: ['src'],
}));
const typescript = path.join(root, 'node_modules/typescript');
fs.mkdirSync(typescript, { recursive: true });
const manifest = path.join(typescript, 'package.json');
fs.writeFileSync(manifest, JSON.stringify({ name: 'typescript', version: '6.0.2' }));
generate(root);
const { server, url } = await serve(root, 0);
let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text());
  });
  await page.goto(url);
  assert.equal(new URL(page.url()).origin, url);
  await page.getByRole('heading', { name: 'Project overview' }).waitFor();
  const notice = page.getByRole('status').filter({ hasText: "application resolves TypeScript 6.0.2" });
  await notice.waitFor();
  assert.match(await notice.innerText(), /Latch validates with TypeScript 5\.9\.3/);
  if (process.env.LATCH_CONSOLE_QA_SCREENSHOT)
    await page.screenshot({ path: process.env.LATCH_CONSOLE_QA_SCREENSHOT });
  fs.writeFileSync(manifest, JSON.stringify({ name: 'typescript', version: '7.0.2' }));
  await page.getByRole('button', { name: 'Refresh' }).click();
  await notice.waitFor({ state: 'hidden' });
  fs.writeFileSync(manifest, JSON.stringify({ name: 'typescript' }));
  await page.getByRole('button', { name: 'Refresh' }).click();
  await page.getByRole('status').filter({ hasText: 'could not be determined' }).waitFor();
  assert.deepEqual(errors, []);
  console.log('Console compiler warning verified for differing, matching, and unknown versions.');
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
