# Integrate an existing React/Vite project

Latch v1 supports explicit functions in local TypeScript/React projects. Start with one real search function. Source inspection is optional and never executes application code.

## React callback binding

Your existing component should expose a function that accepts one input object and resolves with the committed visible state. Put a single marker after its handler declarations, at the top level of the owning component (never inside a conditional):

```tsx
function SearchPanel() {
  const { search, readVisible } = useYourExistingSearchStore();
  // @latch:mount
  return <YourExistingSearchUI />;
}
```

The configuration below describes a minimal search returning a visible count. Adapt the schema, selector and mapping to your actual application. The config is data, not JavaScript. It cannot contain arbitrary shell commands or browser evaluation strings.

```json
{
  "version": 1,
  "project": "My search",
  "baseUrl": "http://127.0.0.1:5173",
  "browser": { "channel": "chrome", "native": false },
  "installation": { "file": "src/SearchPanel.tsx" },
  "tools": [
    {
      "name": "site.search",
      "description": "Search current entries; an empty query resets the search.",
      "inputSchema": {
        "type": "object",
        "properties": { "query": { "type": "string", "maxLength": 120 } },
        "required": ["query"],
        "additionalProperties": false
      },
      "resultSchema": {
        "type": "object",
        "properties": { "count": { "type": "integer", "minimum": 0 } },
        "required": ["count"],
        "additionalProperties": false
      },
      "binding": { "kind": "react", "module": "src/SearchPanel.tsx", "reference": "search" },
      "scope": { "route": "/", "component": "SearchPanel" },
      "preconditions": [],
      "sideEffects": "ui"
    }
  ],
  "tests": [
    {
      "name": "search updates visible results",
      "route": "/",
      "fixture": "fresh-page",
      "mode": "handler",
      "timeoutMs": 15000,
      "calls": [
        {
          "tool": "site.search",
          "input": { "query": "lamp" },
          "result": [{ "path": ["count"], "equals": 1 }]
        }
      ],
      "ui": [{ "target": { "testId": "count" }, "kind": "text", "equals": "1 result" }]
    }
  ]
}
```

The configured fixture must actually contain a lamp. Latch will not invent that result. Tests use a new browser context and page for each case, so local storage, cookies and memory begin fresh. For application-specific state, use your existing deterministic fixture route and the predefined fill/select/click setup steps. No arbitrary fixture script is supported in v1.

Run `latch generate`, review `src/latch.generated/integration.ts` and `.latch/installation.diff`, then run `latch check` and `latch apply`. The installer adds a generated import and passes the in-scope callback to `useProjectTools`. TypeScript verifies the callback's argument and awaited return type. Component-local functions are never imported as module exports. The installer deliberately requires one explicit marker to avoid guessing where a hook belongs. Ordinary React Hooks rules remain authoritative.

## Exported function binding

For a module-level exported function, replace the binding with:

```json
{ "kind": "export", "module": "src/search-store.ts", "export": "searchEntries" }
```

The generator imports that function and adds a typed assignment to check input and output compatibility. Supported discovery/mapping covers named function declarations and named exported arrow/function expressions. Re-exports, default exports, class methods, overloaded inference and aliases are not inferred in v1. Add a small named adapter in your application if needed. That adapter must call the real implementation; unresolved exports fail checks.

The exported function must use the same store as the UI. The [documentation fixture](../examples/docs/src/library.ts) demonstrates exported search/read/open functions with a shared external store. The [catalog fixture](../examples/catalog/src/store.ts) demonstrates React-bound callbacks with a shared asynchronous queue.

## Contracts and scopes

`scope.route` is an exact pathname, without the query or hash. `scope.component` names the intended owner for review; the actual owner is the React component containing the marker. Mount that component only on its configured route. Generated integrations use mount and route availability as baseline preconditions. They support an empty `preconditions` list; custom application predicates use `createScope` directly with a matching `preconditions` function map. The generator rejects custom predicate names instead of silently dropping them.

Side effects are `none` (reads) or `ui` (visible state/navigation within the application). These are developer declarations, not inferred safety guarantees. This release does not expose consequential actions such as checkout, purchases or submissions. Existing application and server authorization remains required for every handler.

Use separate mounted integrations or the runtime API for independent route owners. A generated module should not be mounted twice concurrently with the same tool names. Native duplicate registration fails visibly in scope status and aborts any partial registration owned by that scope.

## Tests

Each test specifies route, fresh-page fixture, invocation mode, timeout, calls, result assertions and optional visible assertions. Before/after actions support accessible labels, named button/link/heading roles, and test IDs. Supported assertions are exact text, input value, element count and visibility. Result paths are arrays of safe object keys or array indices; comparisons are structural. Configuration strings are never evaluated as code.

`expectError` asserts a Latch error code in handler mode. Native errors are intentionally generic (`NATIVE_ERROR`) because Chrome does not expose the same application error detail. `ANY` can assert any rejection. `concurrent: true` overlaps configured calls, while the runtime FIFO policy determines processing order. `absentTools` verifies native cleanup after an `after` navigation action. Every case has a bounded timeout and closes its browser context in cleanup.

See both versioned [example configs](../examples) for valid inputs, invalid values, empty results, failure behavior, human-to-agent state reads, agent-to-human changes, concurrency and native route cleanup.
