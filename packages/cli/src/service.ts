import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { inspect } from './inspect.js';
import { check } from './generate.js';
import { hash, json, read, safe, write, sources } from './files.js';
import { runTests, formatReport } from '@latch-local/test';
export function fingerprint(root: string) {
  return hash(
    ['latch.config.json', ...sources(root), 'src/latch.generated/integration.ts']
      .map((f) => f + '\n' + (fs.existsSync(safe(root, f)) ? read(root, f) : 'MISSING'))
      .join('\n'),
  );
}
export async function testProject(root: string) {
  check(root);
  const c = loadConfig(root);
  const sourceHash = fingerprint(root);
  const report = await runTests(c);
  const extended = { ...report, sourceHash };
  write(root, '.latch/report.json', JSON.stringify(extended, null, 2) + '\n');
  write(root, '.latch/report.txt', formatReport(report) + '\n');
  return extended;
}
export async function serve(root: string, port = 4545) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw Error('Invalid port');
  const token = randomBytes(32).toString('hex');
  let busy = false;
  let actualPort = port;
  const server = http.createServer(async (req, res) => {
    const origin = `http://127.0.0.1:${actualPort}`;
    const validHost = req.headers.host === `127.0.0.1:${actualPort}`;
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'",
    );
    const send = (status: number, data: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };
    if (
      !validHost ||
      (req.headers.origin && req.headers.origin !== origin) ||
      req.headers['sec-fetch-site'] === 'cross-site'
    ) {
      send(403, { error: 'Host or Origin rejected' });
      return;
    }
    if (
      req.method === 'POST' &&
      (req.headers.origin !== origin ||
        req.headers['x-latch-token'] !== token ||
        req.headers['content-type'] !== 'application/json')
    ) {
      send(403, { error: 'Local action requires same-origin token' });
      return;
    }
    try {
      if (req.method === 'GET' && req.url === '/api/project') {
        const c = loadConfig(root);
        let checked: any;
        try {
          checked = check(root);
        } catch (e) {
          checked = { error: e instanceof Error ? e.message : 'Validation failed' };
        }
        const report = fs.existsSync(safe(root, '.latch/report.json'))
          ? json(root, '.latch/report.json')
          : null;
        send(200, {
          token,
          project: c.project,
          config: c,
          checked,
          evidence: inspect(root),
          changes: fs.existsSync(safe(root, '.latch/installation.diff'))
            ? read(root, '.latch/installation.diff')
            : 'Run latch generate to prepare changes',
          report,
          reportStale: report?.sourceHash !== fingerprint(root),
          compatibility: {
            target: 'Chrome 153 · Document API',
            configuration: 'WebMCPTesting flag',
            native: 'Run configured native tests to verify this project',
          },
          busy,
        });
        return;
      }
      if (req.method === 'POST' && req.url === '/api/test') {
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 1024) {
            send(413, { error: 'Request too large' });
            return;
          }
        }
        if (busy) {
          send(409, { error: 'A regression run is already active' });
          return;
        }
        busy = true;
        try {
          send(200, await testProject(root));
        } finally {
          busy = false;
        }
        return;
      }
      if (req.method !== 'GET') {
        send(405, { error: 'Method not allowed' });
        return;
      }
      const url = new URL(req.url ?? '/', origin);
      const asset = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
      const staticRoot = fileURLToPath(new URL('./console/', import.meta.url));
      const file = safe(staticRoot, asset);
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
        send(404, { error: 'Not found' });
        return;
      }
      const mime =
        path.extname(file) === '.js'
          ? 'text/javascript'
          : path.extname(file) === '.css'
            ? 'text/css'
            : 'text/html';
      res.writeHead(200, { 'Content-Type': mime });
      fs.createReadStream(file).pipe(res);
    } catch (e) {
      send(400, { error: e instanceof Error ? e.message : 'Local operation failed' });
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve());
  });
  actualPort = (server.address() as { port: number }).port;
  return { server, url: `http://127.0.0.1:${actualPort}` };
}
