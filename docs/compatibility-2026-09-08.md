# WebMCP compatibility — verified 2026-09-08

## Recorded native target

Windows, Google Chrome **153.0.8010.37**, isolated headless profile launched by Playwright. Local HTTP loopback origin. `--enable-features=WebMCPTesting` enabled. For interactive Chrome, enable `chrome://flags/#enable-webmcp-testing` and relaunch. Without the flag, the recorded browser had no `document.modelContext`.

The [Chrome WebMCP guide](https://developer.chrome.com/docs/ai/webmcp) describes local flag configuration and an origin trial beginning in Chrome 149. Latch does not request an origin-trial token or configure production deployment.

## Adapter contract

Only `document.modelContext.registerTool(tool, {signal})` is used for native registration. Aborting that registration signal removes its tools. No `unregisterTool`, `provideContext`, navigator fallback, synthetic native API or undocumented discovery property is used.

Latch emits name, description, inputSchema and execute. Route/component, preconditions, side effects, binding locations and expected result schemas remain Latch metadata. Execution callbacks receive a separate invocation abort signal. Latch returns JSON-compatible objects; the recorded Chrome invocation returns their JSON serialization.

Chrome's [imperative API documentation](https://developer.chrome.com/docs/ai/webmcp/imperative-api), updated September 1, documents `getTools()` and `executeTool(tool, JSON.stringify(input))`. Native tests use these methods directly and independently assert registration and invocation. They also verify that leaving the route removes the catalog tools.

## Revision difference

The [September 4 draft](https://webmachinelearning.github.io/webmcp/) specifies an object argument to `executeTool`, while the installed Chrome build and its documentation use a JSON string. The adapter/test runner intentionally target the measured Chrome form. The draft is a Community Group report, not a W3C standard. The [official repository](https://github.com/webmachinelearning/webmcp) contains the evolving explainer and issue history. [Chrome implementation status](https://chromestatus.com/feature/5117755740913664) remains the vendor status reference.

## Latch schema support

Latch v1 accepts a deliberately bounded JSON Schema subset: object, array, string, number, integer, boolean, null; properties; required; additionalProperties:false; items; enum; description; minLength/maxLength; minimum/maximum; maxItems. Object inputs require properties and reject additional fields. Nested schemas are bounded. Unsupported keywords fail validation; they are never silently emitted. No refs, remote fetching, format plug-ins, regex execution, coercion, inserted defaults or arbitrary validator code. Latch's subset is narrower than the browser's possible acceptance; no full JSON Schema compliance is claimed.

## Evidence

The pre-integration probe observed API absence without the feature flag; successful feature detection, native registration, discovery, native invocation returning `{echo: "verified"}`, and abort cleanup with the flag. See [native-probe.json](../reports/native-probe.json). Integrated native results appear in [catalog.json](../reports/catalog.json) and [docs.json](../reports/docs.json).

This verifies local native interoperability for these generated integrations in the named build. It does not establish compatibility with every agent, cross-origin sharing, extensions, Safari, Firefox, older Chrome revisions, or production origin trials. Browser-specific changes belong in the adapter and must be accompanied by a new dated native run.
