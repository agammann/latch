# Latch

**Connect your site. Verify every action.**

**[Open Latch Studio](https://latch-studio.alx21.chatgpt.site)** Â· [Documentation](docs/README.md) Â· [Try the examples](docs/quickstart.md)

Latch turns selected functions in an existing React/Vite application into typed WebMCP tools. You define a contract, connect a real handler, and verify its results and visible behavior as your application changes.

## Choose your starting point

| I want toâ€¦                                                 | Start here                                 |
| ---------------------------------------------------------- | ------------------------------------------ |
| Define contracts and download an integration in my browser | [Latch Studio guide](docs/studio.md)       |
| Try a working application before integrating my own        | [Example quickstart](docs/quickstart.md)   |
| Add Latch to an existing React/Vite application            | [Installation guide](docs/installation.md) |
| Understand bindings, schemas, and regression cases         | [Integration guide](docs/integration.md)   |
| Work on the CLI or runtime                                 | [Development guide](CONTRIBUTING.md)       |

## Start in your browser

1. Open [Latch Studio](https://latch-studio.alx21.chatgpt.site).
2. Connect an exported function or React callback that exists in your application.
3. Define input and result schemas, then check your sample values.
4. Select **Download integration** and obtain the six matching v1 packages using the [installation guide](docs/installation.md).
5. Follow the [installation guide](docs/installation.md) to generate, review, apply, and test the integration in your own project.

No account or API key is required. Editing and generation happen in the browser. Use **Save draft** before closing the tab; drafts are not saved automatically. The downloaded `preview/` files are for review. The CLI generates the files and ownership record used for an actual installation.

## What is verified

| Check                             | What it establishes                                                                                                    |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Studio contract and sample checks | Schemas and example values are valid. Your handler has not run.                                                        |
| CLI `generate` and `check`        | Explicit mappings resolve and the generated integration passes TypeScript checks in your application.                  |
| Handler and UI tests              | The validated wrapper returns expected results and configured UI assertions pass against your running development app. |
| Native tests                      | A compatible browser registers, discovers, and invokes the tools, with cleanup checked where configured.               |

Native WebMCP support is experimental. The current target is Chrome **155.0.8059.39** with `WebMCPTesting` enabled and object inputs to `document.modelContext.executeTool`. See the [October 6 compatibility record](docs/compatibility-2026-10-06.md) for the measured API forms and scope. Native absence or blocked execution produces a failing check; ordinary application UI remains available when WebMCP is unsupported.

The [September compatibility record](docs/compatibility-2026-09-08.md), [September acceptance check](reports/acceptance-2026-09-19.md), and [October 2 verification](reports/verification-2026-10-02.json) retain their original Chrome 153/154 and Chromium 153 evidence. Run the [current verification commands](docs/ci.md) for the revision you are using.

## Requirements and distribution

The local CLI requires **Node 22+** and **pnpm 10.17.1+**. Integration targets an existing React, TypeScript, and Vite application. The [installation guide](docs/installation.md) lists tested versions and browser setup.

Version **1.0.0** uses six prebuilt package tarballs with checksums in the [GitHub release](https://github.com/agammann/latch/releases/tag/v1.0.0). The `@latch-local/*` names are local distribution identifiers; packages have not been published to a registry. The public Studio runs on OpenAI Sites. This repository contains the CLI, runtime, local console, examples, and release evidence; the Studio website source is maintained separately. Studio runtime downloads have not been verified as the matching v1 package set. The [v1 stability contract](docs/stability.md) covers the CLI, typed runtime contracts and React/Vite integration.

## Documentation and project status

[Documentation index](docs/README.md) Â· [Troubleshooting](docs/troubleshooting.md) Â· [Updates and removal](docs/maintenance.md) Â· [Release notes](RELEASE_NOTES.md) Â· [Changelog](CHANGELOG.md)

The [release reports](reports) record specific runs and browser versions. They are historical evidence, not a claim that every later revision has passed those checks. The [development guide](CONTRIBUTING.md) explains how to run current checks and keep native verification separate from ordinary Chromium tests.

## License

Latch source and packages are [MIT licensed](LICENSE), copyright 2026 agammann. See [third party notices](THIRD_PARTY_NOTICES.md) for bundled dependency terms.
