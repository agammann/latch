import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { serve } from '../packages/cli/dist/service.js';
test('management service rejects rebinding, cross-origin reads and unauthenticated writes', async () => {
  const { server, url } = await serve(path.resolve('examples/catalog'), 0);
  try {
    assert.equal(
      (await fetch(url + '/api/project', { headers: { Origin: 'https://attacker.example' } }))
        .status,
      403,
    );
    assert.equal(
      (
        await fetch(url + '/api/test', {
          method: 'POST',
          headers: { Origin: url, 'Content-Type': 'application/json' },
          body: '{}',
        })
      ).status,
      403,
    );
    const status = await new Promise((resolve, reject) => {
      http
        .get(url + '/api/project', { headers: { Host: 'attacker.example' } }, (r) => {
          r.resume();
          resolve(r.statusCode);
        })
        .on('error', reject);
    });
    assert.equal(status, 403);
    const r = await fetch(url + '/api/project');
    assert.equal(r.status, 200);
    const d = await r.json();
    assert.equal(d.token.length, 64);
    assert.equal(d.project, 'Catalog fixture');
    assert.equal(
      (
        await fetch(url + '/api/apply', {
          method: 'POST',
          headers: { Origin: url, 'Content-Type': 'application/json', 'X-Latch-Token': d.token },
          body: '{}',
        })
      ).status,
      405,
    );
  } finally {
    await new Promise((r) => server.close(r));
  }
});
