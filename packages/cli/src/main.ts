#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate, check, apply, rollback } from './generate.js';
import { inspect } from './inspect.js';
import { safe, write } from './files.js';
import { serve, testProject } from './service.js';
import { formatReport } from '@latch-local/test';
const help = `Latch 0.1.0 — Connect your site. Verify every action.
Usage: latch <command> [--root <local project>] [--port 4545]
  init       Create versioned configuration without overwriting work
  inspect    Suggest AST candidates with evidence (never executes source)
  generate   Generate wrappers, types, test plan and installation diff
  check      Validate configuration, bindings and generated TypeScript
  apply      Apply the reviewed React installation change
  rollback   Restore owned files, refusing later edits
  test       Run configured Handler tests, UI checks and native tests
  dev        Start the loopback-only local console
  doctor     Report Node, environment and native target requirements
  migrate --to 1  Validate v1 or report unsupported migration
  --help / --version
`;
export async function main(args = process.argv.slice(2)) {
  const command = args[0] ?? '--help';
  if (command === '--help' || command === 'help') {
    console.log(help);
    return;
  }
  if (command === '--version') {
    console.log('0.1.0');
    return;
  }
  const flags = new Map<string, string>();
  for (let i = 1; i < args.length; i += 2) {
    if (!['--root', '--port', '--to'].includes(args[i]) || !args[i + 1])
      throw Error('Unknown option or missing value; use latch --help');
    flags.set(args[i], args[i + 1]);
  }
  const root = fs.realpathSync(path.resolve(flags.get('--root') ?? process.cwd()));
  let result: unknown;
  if (command === 'init') {
    const file = safe(root, 'latch.config.json');
    if (fs.existsSync(file)) throw Error('latch.config.json already exists; nothing overwritten');
    write(
      root,
      'latch.config.json',
      JSON.stringify(
        {
          version: 1,
          project: path.basename(root),
          baseUrl: 'http://127.0.0.1:5173',
          browser: { channel: 'chrome', native: false },
          installation: { file: 'src/App.tsx' },
          tools: [],
          tests: [],
        },
        null,
        2,
      ) + '\n',
    );
    result =
      'Created latch.config.json. Add an explicit handler mapping, contract and test; add // @latch:mount inside its owning component. See docs/integration.md. Empty mappings intentionally fail check.';
  } else if (command === 'inspect') result = inspect(root);
  else if (command === 'generate') result = generate(root);
  else if (command === 'check') result = check(root);
  else if (command === 'apply') result = apply(root);
  else if (command === 'rollback') result = rollback(root);
  else if (command === 'test') {
    const report = await testProject(root);
    console.log(formatReport(report));
    if (report.failed || report.blocked) process.exitCode = 1;
    return;
  } else if (command === 'dev') {
    const { url } = await serve(root, Number(flags.get('--port') ?? 4545));
    console.log(`Latch console: ${url}\nLocal only. Ctrl+C to stop.`);
    return;
  } else if (command === 'doctor')
    result = {
      version: '0.1.0',
      node: process.version,
      platform: process.platform,
      root,
      configuration: fs.existsSync(safe(root, 'latch.config.json')) ? 'present' : 'missing',
      nativeTarget: 'Chrome 153 document.modelContext',
      requiredFlag: 'chrome://flags/#enable-webmcp-testing',
      featureDetection: 'not run (requires website)',
      nativeRegistration: 'not run',
      nativeInvocation: 'not run',
      telemetry: 'off; no telemetry code or service',
    };
  else if (command === 'migrate') {
    if (flags.get('--to') !== '1')
      throw Error('Only configuration v1 is supported; no incompatible migration exists yet');
    result = check(root);
  } else throw Error(`Unknown command ${command}; use latch --help`);
  console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 2));
}
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((e) => {
    console.error(`Latch: ${e instanceof Error ? e.message : 'Operation failed'}`);
    process.exitCode = 1;
  });
