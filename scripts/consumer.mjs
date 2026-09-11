import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = process.cwd(),
  destination = path.resolve(process.argv[2] ?? '../latch-clean-consumer');
if (destination === root || destination.startsWith(root + path.sep) || fs.existsSync(destination))
  throw Error('Choose a new consumer folder outside the Latch development checkout');
fs.mkdirSync(destination, { recursive: true });
const names = ['contracts', 'browser', 'runtime', 'react', 'test', 'cli'];
const local = Object.fromEntries(
  names.map((n) => [
    `@latch-local/${n}`,
    `file:${path.join(root, 'artifacts', `latch-local-${n}-0.1.0.tgz`).replaceAll('\\', '/')}`,
  ]),
);
const pkg = {
  name: 'latch-clean-consumer-verification',
  private: true,
  type: 'module',
  dependencies: { ...local, react: '19.2.4', 'react-dom': '19.2.4' },
  devDependencies: {
    typescript: '5.9.3',
    vite: '7.3.1',
    '@types/react': '19.2.14',
    '@types/react-dom': '19.2.3',
    '@types/node': '22.19.11',
  },
};
fs.writeFileSync(path.join(destination, 'package.json'), JSON.stringify(pkg, null, 2));
fs.writeFileSync(
  path.join(destination, 'pnpm-workspace.yaml'),
  'overrides:\n' +
    Object.entries(local)
      .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`)
      .join('\n') +
    '\n',
);
function run(args, cwd = destination, allowed = [0]) {
  const r = spawnSync(process.execPath, args, { cwd, encoding: 'utf8' });
  if (!allowed.includes(r.status)) throw Error(`${args.join(' ')}\n${r.stdout}\n${r.stderr}`);
  return { exitCode: r.status, output: r.stdout + r.stderr };
}
// Use pnpm's JavaScript entry when launched by pnpm; otherwise resolve the installed command once.
let pnpm = process.env.npm_execpath;
if (!pnpm || !pnpm.includes('pnpm')) {
  const command = process.platform === 'win32' ? 'where.exe' : 'which';
  const found = spawnSync(command, ['pnpm'], { encoding: 'utf8' });
  const executable = found.stdout?.trim().split(/\r?\n/)[0];
  if (!executable) throw Error('pnpm is required');
  if (process.platform === 'win32') {
    const wrapper = fs.readFileSync(executable, 'utf8');
    const match = wrapper.match(/%~dp0([^"\r\n]*pnpm\.[cm]js)/i);
    if (match) pnpm = path.resolve(path.dirname(executable), match[1]);
    else {
      const guessed = path.resolve(path.dirname(executable), '../node_modules/pnpm/bin/pnpm.cjs');
      if (fs.existsSync(guessed)) pnpm = guessed;
      else throw Error('Run through pnpm: pnpm exec node scripts/consumer.mjs <destination>');
    }
  } else pnpm = fs.realpathSync(executable);
}
const installed = run([pnpm, 'install', '--ignore-scripts', '--no-frozen-lockfile']);
const cli = path.join(destination, 'node_modules/@latch-local/cli/dist/main.js');
const results = {
  formatVersion: 1,
  platform: process.platform,
  node: process.version,
  installation: 'passed',
  installedArtifacts: names.map((n) => ({
    name: n,
    sha256: createHash('sha256')
      .update(fs.readFileSync(path.join(root, 'artifacts', `latch-local-${n}-0.1.0.tgz`)))
      .digest('hex'),
  })),
  cases: [],
};
results.cases.push({
  name: 'Installed latch bin entry point',
  ...run([pnpm, 'exec', 'latch', '--version']),
});
const children = [];
try {
  for (const [i, name] of ['catalog', 'docs'].entries()) {
    const project = path.join(destination, name);
    fs.mkdirSync(project);
    fs.cpSync(path.join(root, 'examples', name, 'src'), path.join(project, 'src'), {
      recursive: true,
      filter: (s) => !s.split(path.sep).includes('latch.generated'),
    });
    const manifest = JSON.parse(
      fs.readFileSync(path.join(root, 'examples', name, '.latch/manifest.json')),
    );
    fs.writeFileSync(path.join(project, manifest.installation.file), manifest.installation.before);
    fs.copyFileSync(
      path.join(root, 'examples', name, 'index.html'),
      path.join(project, 'index.html'),
    );
    fs.writeFileSync(
      path.join(project, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          jsx: 'react-jsx',
          strict: true,
          noEmit: true,
          skipLibCheck: true,
          types: ['vite/client'],
        },
        include: ['src'],
      }),
    );
    results.cases.push({
      name: `${name}: installed CLI init`,
      ...run([cli, 'init', '--root', project]),
    });
    const config = JSON.parse(
      fs.readFileSync(path.join(root, 'examples', name, 'latch.config.json')),
    );
    const port = 5273 + i;
    config.baseUrl = `http://127.0.0.1:${port}`;
    fs.writeFileSync(path.join(project, 'latch.config.json'), JSON.stringify(config, null, 2));
    for (const command of ['inspect', 'generate', 'check', 'apply'])
      results.cases.push({
        name: `${name}: installed CLI ${command}`,
        ...run([cli, command, '--root', project]),
      });
    results.cases.push({
      name: `${name}: production consumer build`,
      ...run([path.join(destination, 'node_modules/vite/bin/vite.js'), 'build', project]),
    });
    const assets = fs
      .readdirSync(path.join(project, 'dist/assets'))
      .filter((f) => f.endsWith('.js'))
      .map((f) => fs.readFileSync(path.join(project, 'dist/assets', f), 'utf8'))
      .join('\n');
    if (/latch:request:v1|latch:response:v1|attachBridge|node:fs|createSourceFile/.test(assets))
      throw Error('Development code leaked into production bundle');
    results.cases.push({ name: `${name}: production bridge exclusion`, exitCode: 0 });
    const child = spawn(
      process.execPath,
      [
        path.join(destination, 'node_modules/vite/bin/vite.js'),
        project,
        '--host',
        '127.0.0.1',
        '--port',
        String(port),
        '--strictPort',
      ],
      { cwd: destination, stdio: 'pipe' },
    );
    children.push(child);
    let ready = false;
    for (let n = 0; n < 100; n++) {
      try {
        await fetch(config.baseUrl);
        ready = true;
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    if (!ready) throw Error('Consumer dev server failed to start');
    results.cases.push({
      name: `${name}: installed CLI regression tests`,
      ...run([cli, 'test', '--root', project]),
    });
    const report = JSON.parse(fs.readFileSync(path.join(project, '.latch/report.json')));
    results.cases.push({
      name: `${name}: browser summary`,
      passed: report.passed,
      failed: report.failed,
      blocked: report.blocked,
      browser: report.browser,
    });
  }
} finally {
  children.forEach((c) => c.kill());
}
fs.mkdirSync(path.join(root, 'reports'), { recursive: true });
fs.writeFileSync(
  path.join(root, 'reports/clean-consumer.json'),
  JSON.stringify(results, null, 2) + '\n',
);
console.log(`Clean consumer verified at ${destination}`);
