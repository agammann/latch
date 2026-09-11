import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
fs.mkdirSync('reports/screenshots', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:4545');
  await page.getByRole('heading', { name: 'Catalog fixture', exact: true }).waitFor();
  assert.equal(await page.title(), 'Latch · Local console');
  await page.screenshot({ path: 'reports/screenshots/console-desktop.png', fullPage: true });
  for (const name of ['Contracts', 'Source evidence', 'Generated changes', 'Regression reports']) {
    await page.getByRole('button', { name, exact: true }).click();
    await page.getByRole('heading', { name, exact: true }).waitFor();
    assert.ok((await page.locator('main').innerText()).length > 100);
    results.push({ control: name, status: 'passed' });
  }
  await page.getByRole('button', { name: 'Contracts', exact: true }).click();
  await page.getByLabel('Tool', { exact: true }).selectOption('catalog.details');
  await page.getByRole('heading', { name: 'catalog.details', exact: true }).waitFor();
  results.push({ control: 'Contract selector', status: 'passed' });
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'reports/screenshots/console-mobile.png', fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  results.push({ control: 'Mobile layout has no horizontal overflow', status: 'passed' });
  for (const [name, url, label, value] of [
    ['catalog', 'http://127.0.0.1:5173', 'Search catalog', 'lamp'],
    ['docs', 'http://127.0.0.1:5174', 'Search documentation', 'React'],
  ]) {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(url);
    await page.getByLabel(label, { exact: true }).fill(value);
    await page.getByTestId('count').filter({ hasText: '1 ' }).waitFor();
    await page.screenshot({ path: `reports/screenshots/${name}-desktop.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `reports/screenshots/${name}-mobile.png`, fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    results.push({ control: `${name} human search and mobile layout`, status: 'passed' });
  }
  assert.deepEqual(errors, []);
  results.push({ control: 'Page JavaScript errors', status: 'passed', errors });
  fs.writeFileSync(
    'reports/browser-qa.json',
    JSON.stringify(
      {
        browser: browser.version(),
        method:
          'Codex in-app browser used for initial console inspection and Run regression tests; Playwright used for reproducible control checks and screenshots',
        results,
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  await browser.close();
}
console.log(JSON.stringify(results, null, 2));
