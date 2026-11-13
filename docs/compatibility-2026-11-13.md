# Native compatibility — 2026-11-13

On Windows with Node 24.22.1 and pnpm 10.17.1, Playwright 1.64.1's bundled headless Chromium **156.0.8078.4** was tested against local loopback origins with `--enable-features=WebMCPTesting`.

An isolated synthetic probe registered a tool, invoked it once using object input, observed that JSON-string input was rejected before the callback, and confirmed that aborting the registration removed the tool. The project native CI lane then passed all 18 catalog and documentation example cases, including native invocation, visible results, and cleanup. These tests do not establish agent-host interoperability, production origin trials, other browser builds, or arbitrary application compatibility.

The runner chooses JSON-string input for browser majors 153/154 and object input for 155/156 before a call. It never retries a rejected mutation with a different form. Unknown browser majors remain blocked until measured.

The [October 6 record](compatibility-2026-10-06.md) preserves the earlier installed Chrome 155 and bundled Chromium 153 observations. Playwright 1.65.0's Chromium 158 was also probed on the same local setup, but `document.modelContext` was unavailable with the existing flag; it is not supported by this record.
