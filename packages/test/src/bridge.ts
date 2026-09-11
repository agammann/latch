import type { Scope } from '@latch-local/runtime';
/** Opt-in development entry point. Import only behind Vite's import.meta.env.DEV guard. */
export function attachBridge(scope: Scope, origins: string[], target: Window = window): () => void {
  const local = (s: string) => {
    try {
      const u = new URL(s);
      return (
        ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname) &&
        u.origin === s &&
        u.protocol === 'http:'
      );
    } catch {
      return false;
    }
  };
  if (!origins.length || !origins.every(local) || !origins.includes(target.location.origin))
    throw Error('Latch bridge requires an explicitly allowed local origin');
  const origin = target.location.origin;
  const listener = async (event: MessageEvent) => {
    if (event.source !== target || event.origin !== origin) return;
    const d = event.data;
    if (
      !d ||
      d.channel !== 'latch:request:v1' ||
      typeof d.id !== 'string' ||
      d.id.length > 100 ||
      typeof d.tool !== 'string' ||
      d.tool.length > 128
    )
      return;
    let response;
    try {
      if (JSON.stringify(d).length > 65536) throw Error('Request too large');
      response = { ok: true, result: await scope.invoke(d.tool, d.input) };
    } catch (e) {
      response = {
        ok: false,
        error: {
          code: (e as { code?: string }).code ?? 'BRIDGE',
          message: e instanceof Error ? e.message : 'Handler test failed',
        },
      };
    }
    if (!disposed)
      target.postMessage({ channel: 'latch:response:v1', id: d.id, ...response }, origin);
  };
  let disposed = false;
  target.addEventListener('message', listener);
  return () => {
    disposed = true;
    target.removeEventListener('message', listener);
  };
}
