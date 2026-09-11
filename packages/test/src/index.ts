import { chromium, type Page, type Browser, type Locator } from 'playwright';
import { isDeepStrictEqual } from 'node:util';
export type Selector =
  | { testId: string }
  | { label: string }
  | { role: 'button' | 'link' | 'heading'; name: string };
export type Action =
  | { kind: 'fill'; target: Selector; value: string }
  | { kind: 'select'; target: Selector; value: string }
  | { kind: 'click'; target: Selector };
export type UIAssertion = {
  target: Selector;
  kind: 'text' | 'value' | 'count' | 'visible';
  equals: string | number | boolean;
};
export type ResultAssertion = { path: string[]; equals: unknown };
export interface Call {
  tool: string;
  input: unknown;
  expectError?: string;
  result?: ResultAssertion[];
}
export interface TestCase {
  name: string;
  route: string;
  fixture: 'fresh-page';
  mode: 'handler' | 'native';
  timeoutMs: number;
  before?: Action[];
  calls: Call[];
  concurrent?: boolean;
  ui?: UIAssertion[];
  after?: Action[];
  afterUI?: UIAssertion[];
  absentTools?: string[];
}
export interface TestProject {
  baseUrl: string;
  browser: { channel: 'chrome' | 'chromium'; native: boolean };
  tests: TestCase[];
}
export interface CaseReport {
  name: string;
  mode: string;
  status: 'passed' | 'failed' | 'blocked';
  handler: string;
  ui: string;
  nativeRegistration: string;
  nativeInvocation: string;
  results: unknown[];
  error?: string;
  durationMs: number;
}
export interface Report {
  formatVersion: 1;
  startedAt: string;
  browser: string;
  target: string;
  cases: CaseReport[];
  passed: number;
  failed: number;
  blocked: number;
}
export function assertLocal(url: string) {
  const u = new URL(url);
  if (
    !['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) ||
    u.protocol !== 'http:' ||
    u.username ||
    u.password
  )
    throw Error('Tests require a local HTTP origin');
  return u;
}
function locator(page: Page, target: Selector): Locator {
  if ('testId' in target) return page.getByTestId(target.testId);
  if ('label' in target) return page.getByLabel(target.label, { exact: true });
  return page.getByRole(target.role, { name: target.name, exact: true });
}
async function action(page: Page, a: Action) {
  const el = locator(page, a.target);
  if (a.kind === 'click') await el.click();
  else if (a.kind === 'fill') await el.fill(a.value);
  else await el.selectOption(a.value);
}
async function ui(page: Page, assertions: UIAssertion[]) {
  for (const a of assertions) {
    const el = locator(page, a.target);
    let actual: unknown;
    const deadline = Date.now() + 3000;
    do {
      actual =
        a.kind === 'count'
          ? await el.count()
          : a.kind === 'visible'
            ? await el.isVisible()
            : a.kind === 'value'
              ? await el.inputValue()
              : await el.textContent();
      if (isDeepStrictEqual(actual, a.equals)) break;
      await page.waitForTimeout(25);
    } while (Date.now() < deadline);
    if (!isDeepStrictEqual(actual, a.equals))
      throw Error(
        `UI ${JSON.stringify(a.target)} ${a.kind}: expected ${JSON.stringify(a.equals)}, received ${JSON.stringify(actual)}`,
      );
  }
}
async function invoke(page: Page, call: Call, mode: string, timeout: number) {
  return page.evaluate(
    async ({ call, mode, timeout }) => {
      if (mode === 'native') {
        const mc = (document as any).modelContext;
        const tool = (await mc.getTools()).find((t: any) => t.name === call.tool);
        if (!tool) throw Error('NATIVE_TOOL_MISSING');
        try {
          const raw = await mc.executeTool(tool, JSON.stringify(call.input));
          if (raw === null) throw Error('Native invocation navigated without a result');
          return { ok: true, result: JSON.parse(raw) };
        } catch {
          return {
            ok: false,
            error: { code: 'NATIVE_ERROR', message: 'Native execution rejected' },
          };
        }
      }
      return new Promise<any>((resolve, reject) => {
        const id = crypto.randomUUID();
        const origin = location.origin;
        const timer = setTimeout(() => {
          window.removeEventListener('message', onMessage);
          reject(
            Error(
              'Handler test bridge timed out; enable the generated DEV integration on this local origin',
            ),
          );
        }, timeout);
        function onMessage(e: MessageEvent) {
          if (
            e.source !== window ||
            e.origin !== origin ||
            e.data?.channel !== 'latch:response:v1' ||
            e.data.id !== id
          )
            return;
          clearTimeout(timer);
          window.removeEventListener('message', onMessage);
          resolve(e.data);
        }
        window.addEventListener('message', onMessage);
        window.postMessage(
          { channel: 'latch:request:v1', id, tool: call.tool, input: call.input },
          origin,
        );
      });
    },
    { call, mode, timeout },
  );
}
export async function runTests(project: TestProject): Promise<Report> {
  const base = assertLocal(project.baseUrl);
  let browser: Browser | undefined;
  const report: Report = {
    formatVersion: 1,
    startedAt: new Date().toISOString(),
    browser: 'unavailable',
    target: base.origin,
    cases: [],
    passed: 0,
    failed: 0,
    blocked: 0,
  };
  try {
    browser = await chromium.launch({
      channel: project.browser.channel === 'chrome' ? 'chrome' : undefined,
      headless: true,
      args: project.browser.native ? ['--enable-features=WebMCPTesting'] : [],
    });
    report.browser = browser.version();
  } catch {
    for (const t of project.tests)
      report.cases.push({
        name: t.name,
        mode: t.mode,
        status: 'blocked',
        handler: 'not run',
        ui: 'not run',
        nativeRegistration: 'not run',
        nativeInvocation: 'not run',
        results: [],
        error: 'Browser unavailable; install Playwright Chromium or select installed Chrome',
        durationMs: 0,
      });
    report.blocked = report.cases.length;
    return report;
  }
  try {
    for (const t of project.tests) {
      const start = Date.now();
      const r: CaseReport = {
        name: t.name,
        mode: t.mode,
        status: 'passed',
        handler: 'not run',
        ui: 'not run',
        nativeRegistration: 'not run',
        nativeInvocation: 'not run',
        results: [],
        durationMs: 0,
      };
      const context = await browser.newContext();
      const page = await context.newPage();
      page.setDefaultTimeout(t.timeoutMs);
      const errors: string[] = [];
      page.on('pageerror', () => errors.push('Page JavaScript error'));
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          (async () => {
            const url = new URL(t.route, base);
            if (url.origin !== base.origin)
              throw Error('Test route must remain on configured origin');
            await page.goto(url.href);
            await page.waitForLoadState('networkidle');
            if (t.mode === 'native') {
              const supported = await page.evaluate(() => {
                const m = (document as any).modelContext;
                return (
                  !!m && typeof m.getTools === 'function' && typeof m.executeTool === 'function'
                );
              });
              if (!supported) {
                r.status = 'blocked';
                throw Error('Native document API unavailable; required native test not run');
              }
              const names = await page.evaluate(async () =>
                ((await (document as any).modelContext.getTools()) as any[]).map((t) => t.name),
              );
              if (t.calls.some((c) => !names.includes(c.tool)))
                throw Error('Native registration missing a configured tool');
              r.nativeRegistration = 'verified';
            }
            for (const a of t.before ?? []) await action(page, a);
            const one = async (call: Call) => {
              const response = await invoke(page, call, t.mode, t.timeoutMs);
              r.results.push(response);
              if (call.expectError) {
                if (
                  response.ok ||
                  !(call.expectError === 'ANY' || response.error?.code === call.expectError)
                )
                  throw Error(`Expected ${call.expectError} rejection`);
              } else {
                if (!response.ok)
                  throw Error(`${response.error?.code}: ${response.error?.message}`);
                for (const assertion of call.result ?? []) {
                  let value = response.result;
                  for (const key of assertion.path) value = value?.[key];
                  if (!isDeepStrictEqual(value, assertion.equals))
                    throw Error(
                      `Result ${assertion.path.join('.')}: expected ${JSON.stringify(assertion.equals)}, received ${JSON.stringify(value)}`,
                    );
                }
              }
            };
            if (t.concurrent) await Promise.all(t.calls.map(one));
            else for (const c of t.calls) await one(c);
            if (t.mode === 'handler') r.handler = 'tested';
            else r.nativeInvocation = 'verified';
            await ui(page, t.ui ?? []);
            for (const a of t.after ?? []) await action(page, a);
            await ui(page, t.afterUI ?? []);
            if ((t.ui?.length ?? 0) + (t.afterUI?.length ?? 0) > 0) r.ui = 'verified';
            if (t.absentTools?.length) {
              const absent = await page.evaluate(async (names) => {
                const mc = (document as any).modelContext;
                if (!mc) return null;
                const tools = await mc.getTools();
                return names.every((name) => !tools.some((t: any) => t.name === name));
              }, t.absentTools);
              if (absent === null) {
                r.status = 'blocked';
                throw Error('Native cleanup check unavailable');
              }
              if (!absent) throw Error('Tools remain registered after leaving scope');
            }
            if (errors.length) throw Error(errors[0]);
          })(),
          new Promise((_, reject) => {
            timeout = setTimeout(() => reject(Error('Case timeout')), t.timeoutMs);
          }),
        ]);
      } catch (e) {
        if (r.status !== 'blocked') r.status = 'failed';
        r.error = e instanceof Error ? e.message : 'Test failed';
      } finally {
        clearTimeout(timeout);
        await context.close();
        r.durationMs = Date.now() - start;
        report.cases.push(r);
      }
    }
  } finally {
    await browser.close();
  }
  report.passed = report.cases.filter((c) => c.status === 'passed').length;
  report.failed = report.cases.filter((c) => c.status === 'failed').length;
  report.blocked = report.cases.filter((c) => c.status === 'blocked').length;
  return report;
}
export function formatReport(report: Report) {
  return [
    `Latch regression report · ${report.browser}`,
    ...report.cases.map(
      (c) =>
        `${c.status.toUpperCase()} ${c.name} [${c.mode === 'handler' ? 'Handler test' : 'Native invocation'}]${c.error ? ` — ${c.error}` : ''}`,
    ),
    `${report.passed} passed, ${report.failed} failed, ${report.blocked} blocked`,
  ].join('\n');
}
