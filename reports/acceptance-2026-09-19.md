# Studio to application acceptance check — 2026-09-19

The public [Latch Studio](https://latch-studio.alx21.chatgpt.site) was tested through an actual browser download and installation into a new React/Vite application outside the Latch development workspace. This is controlled acceptance testing with synthetic catalog data, not feedback from independent users.

## Environment

- Windows, Node 24.19.0, pnpm 11.19.0.
- React 19.2.4, TypeScript 5.9.3, Vite 7.3.1.
- Installed Chrome 153.0.8010.53; native cases enabled `WebMCPTesting` through Latch's runner.
- Repository Handler lane used Playwright Chromium 145.0.7632.6.
- Studio version 2, source `971972b599924490fa34b4837e2a207e29fbdb5c`.

The application server used the local-only test origin `http://127.0.0.1:5279`. It is not a public application URL.

## Verified paths

| Check | Result |
| --- | --- |
| Repository build and unit/integration suite | Build succeeded; 23 tests passed. |
| Repository browser Handler tests | Catalog 10 and documentation 6 passed; zero failures or blocked cases. |
| Studio generator and archive checks | 25 checks passed; browser wrappers matched the CLI renderer; independent ZIP extraction and CRC checks passed. |
| Public editor validation | Malformed schemas and duplicate names blocked export; valid samples passed; both binding types configured. |
| Browser download | Two-tool integration ZIP downloaded, extracted, and used without changing its initial configuration. |
| Hosted runtime bundle | HTTP 200; ZIP integrity and all six package SHA-256 values verified. |
| Fresh consumer installation | Relative local overrides and prebuilt tarballs installed; CLI reported 0.1.0. |
| Generation and installation | Inspect, generate, check, review, and apply completed; production build succeeded. |
| Initial downloaded tests | Both original expected-result cases passed in installed Chrome. |
| Extended application tests | Six Handler/UI cases and two native invocation/UI cases passed. |
| Visible interactions | Human search and both WebMCP tools changed the same catalog results in the Codex browser. |
| Negative control | A deliberately incorrect expected result failed with a nonzero exit; restored expectations passed. |
| Rollback | Original component restored byte for byte; regeneration, reapplication, and all eight cases passed again. |
| Production bundle | No development bridge channel strings, `node:fs`, or `createSourceFile` markers found. |
| Draft recovery and narrow layout | Saved draft reopened with both tools; 320 px and 390 px layouts had no horizontal page overflow. |
| Keyboard navigation | Arrow-key tab selection worked. |

Extended tests exercised exported and React callback bindings, invalid input, unexpected properties, empty-query reset, no-match results, and native invocation for both bindings. The [machine-readable report](acceptance-2026-09-19.json) records the final eight-case run. Native scope cleanup remains covered by the earlier release evidence; this fresh consumer run did not add a scope-unmount case.

## Fixes from this check

1. Studio previously retained a successful sample-check message when selecting another tool with invalid samples. Selection/import now clears that feedback. The reproducer was checked before and after the fix in the browser.
2. pnpm 11 could stop installation on an unapproved dependency build script. The prebuilt Latch installation commands now use `--ignore-scripts`, and the guide separates existing application build requirements from Latch installation.
3. Downloaded directions now include copyable relative package paths, the CLI version check, Vite target requirements, and an explicit Chromium alternative when Google Chrome is unavailable.

The GitHub documentation now separates Studio use, example setup, consumer installation, and contributor workflows. Original release and security reports retain their historical scope.

## Limits

This does not establish Safari, Firefox, macOS, mobile-device native WebMCP, or compatibility with every application. Narrow desktop browser viewports do not substitute for physical-device testing. Native support remains tied to the measured browser and feature configuration. No outside users were recruited, and no production customer data or third-party business systems were used.
