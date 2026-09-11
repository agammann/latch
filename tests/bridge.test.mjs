import test from 'node:test';
import assert from 'node:assert/strict';
import { attachBridge } from '../packages/test/dist/bridge.js';
test('bridge rejects remote origins and ignores forged origins/sources', async () => {
  let listener,
    calls = 0;
  const replies = [];
  const target = {
    location: { origin: 'http://127.0.0.1:5173' },
    addEventListener: (_, l) => (listener = l),
    removeEventListener: () => {
      listener = null;
    },
    postMessage: (m) => replies.push(m),
  };
  const scope = {
    invoke: async () => {
      calls++;
      return { ok: true };
    },
  };
  assert.throws(() => attachBridge(scope, ['https://example.com'], target));
  const cleanup = attachBridge(scope, [target.location.origin], target);
  const data = { channel: 'latch:request:v1', id: 'x', tool: 'search', input: {} };
  await listener({ data, source: target, origin: 'https://attacker.example' });
  await listener({ data, source: {}, origin: target.location.origin });
  assert.equal(calls, 0);
  await listener({ data, source: target, origin: target.location.origin });
  assert.equal(calls, 1);
  assert.equal(replies[0].ok, true);
  cleanup();
  assert.equal(listener, null);
});
