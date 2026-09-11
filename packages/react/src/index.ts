import { useEffect, useLayoutEffect, useRef } from 'react';
import { createScope, type Binding, type Scope, type ScopeStatus } from '@latch-local/runtime';
export type ScopeObserver = (scope: Scope) => void | (() => void);
export function useLatch(
  bindings: Binding[],
  options: { scopeKey: string; onScope?: ScopeObserver; onStatus?: (status: ScopeStatus) => void },
) {
  const latest = useRef(bindings);
  const callbacks = useRef(options);
  const instance = useRef<Scope | null>(null);
  const effect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
  effect(() => {
    latest.current = bindings;
    callbacks.current = options;
    instance.current?.update(bindings);
  });
  effect(() => {
    const scope = createScope(latest.current, { onStatus: (s) => callbacks.current.onStatus?.(s) });
    instance.current = scope;
    const cleanup = callbacks.current.onScope?.(scope);
    return () => {
      cleanup?.();
      scope.dispose();
      if (instance.current === scope) instance.current = null;
    };
  }, [options.scopeKey]);
}
