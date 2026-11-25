# Native compatibility — 2026-11-24

On Windows and Linux, Playwright 1.65.1's bundled headless Chromium **159.0.8154.6** passed all 18 cases in the native CI lane on local loopback origins. This covered 11 catalog cases, including native search and cleanup, and seven documentation cases, including native search with an exported test. Both runs reported zero blocked cases.

On Windows, `--enable-features=WebMCPTesting` alone left `document.modelContext` unavailable in that Chromium build. With `--enable-features=WebMCP,WebMCPTesting`, an isolated synthetic probe registered a tool, invoked it once with object input, confirmed that JSON-string input was rejected before another callback, and verified that aborting the registration removed the tool. The same probe passed on Windows with Playwright 1.64.1's Chromium **156.0.8078.4** and both features enabled.

The runner uses object input for this exact Chromium 159 build. Earlier input forms are documented in the [November 13 record](compatibility-2026-11-13.md). The [October 6 record](compatibility-2026-10-06.md) describes the installed Chrome 155 target used by the shipped example configurations. Other unmeasured targets still block pending verification, and the runner never retries a rejected mutation with another input form.

The Chromium 159 measurements cover bundled headless runs on Windows and Linux. Agent-host interoperability, production origin trials, and other browser builds are outside this scope.
