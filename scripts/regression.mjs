import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { runTests, formatReport } from '../packages/test/dist/index.js';
import { check, generate } from '../packages/cli/dist/generate.js';
// Uses the running docs fixture. Source restoration is guaranteed even if verification throws.
const root = path.resolve('examples/docs'),
  file = path.join(root, 'src/library.ts');
const original = fs.readFileSync(file, 'utf8');
const configFile = path.join(root, 'latch.config.json'),
  originalConfig = fs.readFileSync(configFile, 'utf8');
const config = JSON.parse(originalConfig);
config.tests = [config.tests[0]];
const results = [];
try {
  check(root);
  let report = await runTests(config);
  if (report.failed || report.blocked) throw Error('Baseline must pass');
  results.push({ phase: 'passing contract', report });
  fs.writeFileSync(
    file,
    original.replace(
      /return commit\(\{\s*query,/,
      'return commit({query: 42 as unknown as string,',
    ),
  );
  report = await runTests(config);
  if (report.failed !== 1) throw Error('Intentional regression was not detected');
  results.push({ phase: 'intentional handler result break', report });
  fs.appendFileSync(
    file,
    '\nexport async function searchDocsCompatible(input: {text?:string}, context?:ExecutionContext):Promise<DocState> { const query=input.text??String(readDocs().query); const result=await searchDocs(input,context); context?.assertActive(); return commit({...result,query}); }\n',
  );
  const corrected = JSON.parse(originalConfig);
  corrected.tools[0].binding.export = 'searchDocsCompatible';
  fs.writeFileSync(configFile, JSON.stringify(corrected, null, 2) + '\n');
  generate(root);
  check(root);
  report = await runTests(config);
  if (report.failed || report.blocked) throw Error('Corrected mapping must pass');
  results.push({ phase: 'corrected mapping to searchDocsCompatible adapter', report });
} finally {
  fs.writeFileSync(file, original);
  fs.writeFileSync(configFile, originalConfig);
  generate(root);
}
fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync('reports/intentional-regression.json', JSON.stringify(results, null, 2) + '\n');
fs.writeFileSync(
  'reports/intentional-regression.txt',
  results.map((r) => r.phase + '\n' + formatReport(r.report)).join('\n\n') + '\n',
);
console.log(fs.readFileSync('reports/intentional-regression.txt', 'utf8'));
