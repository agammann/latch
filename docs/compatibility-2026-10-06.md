# Native compatibility — 2026-10-06

The current target is Windows, installed Google Chrome **155.0.8059.39**, isolated headless profiles launched by Playwright **1.63.0**, Node **24.19.0** and pnpm **11.19.0**. Tests use local HTTP loopback origins with `--enable-features=WebMCPTesting`. Interactive Chrome requires `chrome://flags/#enable-webmcp-testing` and a relaunch.

Chrome 155 accepts `document.modelContext.executeTool(registeredTool, inputObject)`. Passing a JSON string now rejects before the handler with `TypeError: invalid input object: value is not an object`. The registered Catalog search succeeds with `{query: 'lamp'}` and updates the visible results. This matches the [Chrome imperative API guide](https://github.com/GoogleChrome/modern-web-guidance-src/blob/main/guides/webmcp/agentic-javascript-tools/guide.md) and the [Chromium implementation change](https://chromium.googlesource.com/chromium/src/third_party/+/1287ff3785d09121975fcedad729170c40833f66).

Registration still uses `document.modelContext.registerTool(tool, {signal})`; aborting the registration signal removes owned tools. Execute callbacks receive a separate invocation signal. Native results in the measured build remain serialized JSON strings. No native API is synthesized. The browser adapter's current types describe object input.

The runner selects one invocation form before executing a call: JSON-string input for browser majors 153/154, object input for 155. A rejected call is not retried, so a mutation cannot be duplicated by an API-form fallback. Other native browser versions produce blocked results until their form is verified. Browser capability detection alone is not evidence of successful execution.

The [September 8 compatibility record](compatibility-2026-09-08.md) and [October 2 report](../reports/verification-2026-10-02.json) retain measured Chrome 153/154 and Chromium 153 behavior. The current Playwright 1.63.0 bundle is Chromium **153.0.8010.12**; CI retains ordinary and native lanes for that concrete implementation.

Run `pnpm verify` with installed target Chrome, and `node scripts/ci-handler.mjs` followed by `node scripts/ci-handler.mjs --native` with bundled Chromium. Both examples contain 18 total cases: React callbacks, exported handlers, result/UI assertions, native registration/invocation, and Catalog cleanup. A failed or blocked case produces a nonzero exit. Package verification additionally installs all six tarballs in a fresh directory outside the source checkout, exercises the installed CLI and browser flows, and checks production bridge exclusion.

This records local interoperability for the named builds. Agent-level interoperability, cross-origin discovery, production origin trials, extensions, Safari, Firefox and unmeasured Chrome revisions require separate evidence. Without native support, ordinary application UI remains usable and required native cases remain blocked.
