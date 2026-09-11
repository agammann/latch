# Execution and lifecycle semantics

The production browser graph consists of contracts, browser adapter, runtime and React integration. Contract validation uses no external dependency. React is a peer dependency; the test runner, AST parser and filesystem utilities are outside this graph.

## Shared state and asynchronous work

Every tool's input is validated, snapshotted and validated again before entering the scope's FIFO queue. The wrapper resolves only after the handler resolves and the returned value passes the result schema. Failed calls do not poison the queue. Result objects are JSON snapshots, not live store references.

One queue serializes all agent calls in a scope. This makes overlapping searches deterministic in arrival order and keeps read/details calls behind pending searches. It cannot automatically serialize a separate human callback. Your application's own coordinator must serialize human and agent mutations together, and readers must await pending human actions. The catalog demonstrates this requirement; its regression test caught a stale read until the reader awaited the shared queue.

For React state, calling `setState` does not by itself prove the visible DOM has committed. Use a store snapshot and an explicit completion contract, or an application adapter that resolves after the relevant render. The examples use `useSyncExternalStore`; browser assertions confirm the committed UI. Latch does not claim to infer arbitrary application's render completion.

## Omitted values and reset

There is no coercion or implicit default insertion. Optional fields arrive omitted. The catalog preserves omitted query/category/sort, while explicit empty query, `all` category and `name` sort reset those fields. The docs example preserves omitted text and resets on empty text. Invalid or hidden detail IDs reject without changing selected state. These are application semantics documented in tool descriptions and enforced by regression cases.

## Scope lifetime

React bindings update handler references after each committed render. This avoids registering a render that React abandons and prevents stale callbacks. The mount effect creates a new scope; cleanup detaches the development bridge, aborts native registrations and marks the runtime disposed. StrictMode's setup/cleanup/setup cycle is exercised by both examples. Contracts remain stable through a scope's lifetime; a changed contract requires a remount.

The registration API's abort signal and each execution's signal have separate purposes. Latch combines execution cancellation with its own scope lifetime for handler work. An asynchronous handler should pass `context.signal` to cancellable work and call `context.assertActive()` immediately before committing. Disposed calls and wrong-route calls fail; queued work never begins after disposal. This is cooperative cancellation, not a transaction rollback. Latch rejects a late result even if a non-cooperative handler has already changed state, and its error explicitly says earlier changes are not rolled back.

Native registration failure aborts every registration made by that scope. Browser absence produces an `unsupported` status and ordinary UI continues to work. No native API is injected. The `createScope` result exposes `ready` and `status`; direct `useLatch` supports `onStatus`. Latch does not convert handler harness success into native verification.

## Development bridge

The generated integration dynamically imports `@latch-local/test/bridge` inside a Vite `import.meta.env.DEV` branch. Top-level await ensures the development harness is attached in time for the first scope mount. Production Vite builds remove this branch and the bridge chunk. The production build audits check that neither bridge channel nor developer filesystem/parser code appears in emitted JavaScript.

The bridge is same-window `postMessage`, not an HTTP handler executor. It requires an explicitly configured loopback HTTP origin, verifies both `event.origin` and `event.source`, bounds requests, and dispatches only to the scope's configured tool names. It never exposes cookies, generic DOM evaluation, shell commands or arbitrary function names. It provides no security boundary against already-running same-origin application JavaScript. Do not load a development server on an untrusted origin or distribute a development bundle as production.
