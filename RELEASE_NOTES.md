# Latch 0.1.0 local developer release

Latch generates typed WebMCP integrations around real React callbacks and exported functions, verifies their contracts and visible effects, and preserves a reviewable installation and removal workflow. This release includes six installable local packages, an optional console, and two original synthetic example applications.

## Measured release evidence

- Runtime, generator, bridge and local service tests: **23 passed, 0 failed**, including four manifest regression tests. See [unit report](reports/unit-tests.json).
- Catalog browser regression: **11 passed, 0 failed, 0 blocked**. Documentation browser regression: **7 passed, 0 failed, 0 blocked**. These include 16 Handler tests and two native cases. See [catalog](reports/catalog.json) and [documentation](reports/docs.json).
- Native feature detection, registration, discovery, invocation and AbortSignal cleanup passed in **Chrome 153.0.8010.37** with `--enable-features=WebMCPTesting`. An unflagged required native case was correctly **blocked**, not passed. See the [dated compatibility record](docs/compatibility-2026-09-08.md), [native probe](reports/native-probe.json) and [unavailable-native report](reports/native-unavailable.json).
- The [intentional regression](reports/intentional-regression.json) records a passing contract, an actual handler returning the wrong result type, the detected `RESULT_CONTRACT` failure, and a corrected explicit mapping that passes. The script restores the example afterward.
- The [external consumer report](reports/clean-consumer.json) records installation of the six actual tarballs in a new directory outside the development checkout, the installed `latch` command, generation and application for both examples, production builds, DEV-bridge exclusion and all 18 browser cases. It records exact package SHA-256 hashes.
- The [artifact audit](reports/artifact-audit.json) checks package entry points, exports, declarations, dependency metadata and included files. The [browser QA report](reports/browser-qa.json) records console navigation, contract selection, human search controls, desktop/mobile overflow and page errors.

Recorded local environment: Windows, Node 24.19.0, pnpm 11.19.0, TypeScript 5.9.3, React 19.2.4, Vite 7.3.1 and Playwright 1.58.2. Tests describe these concrete runs; they are not guarantees for every consumer application or browser.

After the security correction, the fresh external consumer installation and all 18 browser cases were repeated successfully on September 10, 2026. The intentional regression demonstration was also repeated with the corrected generator.

The first [GitHub Linux CI run](https://github.com/agammann/latch/actions/runs/34552048479) passed for source commit `84e1c68f490e99a01d7510d906419c22d283d141`: installation, build, all 23 unit/integration tests and the handler browser lane. This is separate from native verification on Windows.

## Installation and operation

The [security review correction](docs/security-review.md) records the original scan finding and the ownership controls added before the public push. The sealed original audit and later regression evidence remain distinct.

Build the checkout with `pnpm install --frozen-lockfile --ignore-scripts` and `pnpm build`, then run `pnpm pack:local`. Follow [installation](docs/installation.md) to configure local tarball overrides before adding dependencies to a React/Vite project. Use `latch init`, explicit mappings, `latch inspect`, `latch generate`, `latch check`, and `latch apply`; start the application before `latch test` or `latch dev`.

The generated manifest records ownership and complete original/proposed component source. Review the diff and retain the manifest for safe rollback. See [integration](docs/integration.md), [runtime semantics](docs/runtime.md), [upgrade/removal](docs/maintenance.md) and [troubleshooting](docs/troubleshooting.md).

## Compatibility and release boundaries

- Native support is experimental and pinned to the measured Chrome implementation. Chrome's string-argument invocation differs from the current specification draft; the compatibility document explains that difference. Other browser versions require a new native run.
- Vite/React/TypeScript, explicit mappings and a bounded schema subset are the supported integration path. Automatic inspection supplies evidence and unresolved questions; it cannot infer authorization or business semantics.
- CLI-generated integrations support route/mount preconditions. Custom runtime predicates require direct runtime integration; the generator rejects unsupported predicates rather than silently ignoring them.
- Asynchronous handlers must check `assertActive` before committing. Cancellation does not undo effects already committed. Human/agent coordination must use application-owned shared state, as the examples demonstrate.
- Direct source inspection is contained within the selected project. Type checking uses normal TypeScript dependency resolution; browser tests execute the configured local application. Neither is a sandbox for hostile project code.
- Node 22 passed Linux CI; the recorded local run used Node 24 and React 19. React 18 is a declared peer compatibility target without a separate execution record. macOS remains unverified.
- No hosted account, telemetry service, paid resource, deployment or package publication was created. The public GitHub repository is source distribution. Local package identifiers are not claimed to be available on a registry.
- No open-source license was selected. `UNLICENSED` leaves the licensing decision with the owner. Third-party terms are preserved in [notices](THIRD_PARTY_NOTICES.md).

The scoped local release is usable with the supplied artifacts and documented environment. General-browser support, registry publication, other frameworks, remote imports, extensions, hosted accounts, billing and consequential actions remain deferred.
