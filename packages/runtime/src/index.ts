import {
  checkContract,
  validate,
  LatchError,
  type Contract,
  type Handler,
  type ExecutionContext,
} from '@latch-local/contracts';
import { documentAdapter, type BrowserAdapter } from '@latch-local/browser';
export type { Contract, Handler, ExecutionContext } from '@latch-local/contracts';
export interface Binding {
  contract: Contract;
  handler: Handler;
  preconditions?: Record<string, () => boolean>;
}
export interface ScopeOptions {
  adapter?: BrowserAdapter;
  route?: () => string;
  onStatus?: (status: ScopeStatus) => void;
}
export interface ScopeStatus {
  featureDetected: boolean;
  registration: 'pending' | 'registered' | 'unsupported' | 'failed' | 'disposed';
  error?: string;
}
/** One FIFO queue per scope, shared across tools. Human callbacks must share their application's state coordinator. */
export function createScope(bindings: Binding[], options: ScopeOptions = {}) {
  const adapter = options.adapter ?? documentAdapter();
  let active = true;
  let queue: Promise<unknown> = Promise.resolve();
  const lifetime = new AbortController();
  let current = bindings;
  const names = new Set<string>();
  for (const b of bindings) {
    checkContract(b.contract);
    if (typeof b.handler !== 'function')
      throw new LatchError('UNRESOLVED', `${b.contract.name}: missing handler`);
    if (names.has(b.contract.name)) throw new LatchError('DUPLICATE', 'Duplicate tool in scope');
    names.add(b.contract.name);
    for (const p of b.contract.preconditions)
      if (typeof b.preconditions?.[p] !== 'function')
        throw new LatchError('PRECONDITION', `${b.contract.name}: missing precondition ${p}`);
  }
  let status: ScopeStatus = {
    featureDetected: adapter.available,
    registration: adapter.available ? 'pending' : 'unsupported',
  };
  const setStatus = (s: ScopeStatus) => {
    status = s;
    options.onStatus?.(s);
  };
  function invoke(name: string, input: unknown, external?: AbortSignal): Promise<unknown> {
    const initial = current.find((b) => b.contract.name === name);
    if (!initial)
      return Promise.reject(new LatchError('UNRESOLVED', 'Tool not bound in this scope'));
    try {
      validate(initial.contract.inputSchema, input);
    } catch (e) {
      return Promise.reject(e);
    }
    // Snapshot caller input so mutation while queued cannot bypass validation.
    const args = JSON.parse(JSON.stringify(input));
    try {
      validate(initial.contract.inputSchema, args);
    } catch (e) {
      return Promise.reject(e);
    }
    const execute = async () => {
      const b = current.find((b) => b.contract.name === name)!;
      const signal = external ? AbortSignal.any([lifetime.signal, external]) : lifetime.signal;
      const assertActive = () => {
        if (!active || signal.aborted)
          throw new LatchError(
            'CANCELLED',
            'Scope/call ended; previously committed changes are not rolled back',
          );
        if (
          (options.route?.() ??
            (typeof location === 'undefined' ? b.contract.scope.route : location.pathname)) !==
          b.contract.scope.route
        )
          throw new LatchError('SCOPE', 'Tool is not active on this route');
      };
      assertActive();
      for (const p of b.contract.preconditions)
        if (!b.preconditions?.[p]?.())
          throw new LatchError('PRECONDITION', `Precondition ${p} is not satisfied`);
      let result: unknown;
      try {
        result = await b.handler(args, { signal, assertActive });
      } catch (e) {
        if (e instanceof LatchError) throw e;
        throw new LatchError(
          'HANDLER',
          'Application handler failed; inspect application diagnostics locally',
        );
      }
      assertActive();
      try {
        validate(b.contract.resultSchema, result);
      } catch (e) {
        throw new LatchError('RESULT_CONTRACT', e instanceof Error ? e.message : 'Invalid result');
      }
      return JSON.parse(JSON.stringify(result));
    };
    const pending = queue.then(execute);
    queue = pending.catch(() => {});
    return pending;
  }
  const ready = (async () => {
    if (!adapter.available) {
      setStatus(status);
      return status;
    }
    try {
      for (const b of bindings) {
        if (!active) break;
        await adapter.register(
          {
            name: b.contract.name,
            description: b.contract.description,
            inputSchema: b.contract.inputSchema,
            execute: (input, o) => invoke(b.contract.name, input, o?.signal),
          },
          lifetime.signal,
        );
      }
      if (active) setStatus({ featureDetected: true, registration: 'registered' });
    } catch {
      lifetime.abort();
      if (active)
        setStatus({
          featureDetected: true,
          registration: 'failed',
          error:
            'Native registration failed; check duplicate names, permissions and browser target',
        });
    }
    return status;
  })();
  return {
    invoke,
    ready,
    get status() {
      return status;
    },
    update(next: Binding[]) {
      if (
        next.length !== current.length ||
        next.some(
          (b, i) =>
            JSON.stringify(b.contract) !== JSON.stringify(current[i].contract) ||
            typeof b.handler !== 'function',
        )
      )
        throw new LatchError('BINDING', 'Contracts changed: remount the scope');
      current = next;
    },
    dispose() {
      if (!active) return;
      active = false;
      lifetime.abort();
      setStatus({ featureDetected: adapter.available, registration: 'disposed' });
    },
  };
}
export type Scope = ReturnType<typeof createScope>;
