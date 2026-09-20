# Latch

**Connect your site. Verify every action.**

**[Open Latch Studio](https://latch-studio.alx21.chatgpt.site)** · [Documentation](docs/README.md) · [Try the examples](docs/quickstart.md)

Latch turns selected functions in an existing React/Vite application into typed WebMCP tools. You define a contract, connect a real handler, and verify its results and visible behavior as your application changes.

## Choose your starting point

| I want to…                                                 | Start here                                 |
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
4. Select **Download integration**. In **Project setup**, also select **Download runtime packages**.
5. Follow the [installation guide](docs/installation.md) to generate, review, apply, and test the integration in your own project.

No account or API key is required. Editing and generation happen in the browser. Use **Save draft** before closing the tab; drafts are not saved automatically. The downloaded `preview/` files are for review. The CLI generates the files and ownership record used for an actual installation.

## What is verified

| Check                             | What it establishes                                                                                                    |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Studio contract and sample checks | Schemas and example values are valid. Your handler has not run.                                                        |
| CLI `generate` and `check`        | Explicit mappings resolve and the generated integration passes TypeScript checks in your application.                  |
| Handler and UI tests              | The validated wrapper returns expected results and configured UI assertions pass against your running development app. |
| Native tests                      | A compatible browser registers, discovers, and invokes the tools, with cleanup checked where configured.               |

Native WebMCP support is experimental. The original release target was Chrome **153.0.8010.37** with `WebMCPTesting` enabled. The [September 19 acceptance check](reports/acceptance-2026-09-19.md) also verified a downloaded integration and both native binding types in Chrome **153.0.8010.53**. An absent API or blocked native case is not a passing result. See the [dated compatibility record](docs/compatibility-2026-09-08.md) and the acceptance report before claiming support for another browser or version.

## Requirements and distribution

The local CLI requires **Node 22+** and **pnpm 10.17.1+**. Integration targets an existing React, TypeScript, and Vite application. The [installation guide](docs/installation.md) lists tested versions and browser setup.

Version **0.1.0** is distributed as six package tarballs. The `@latch-local/*` names are local distribution identifiers; packages have not been published to a registry. The public Studio runs on OpenAI Sites. This repository contains the CLI, runtime, local console, examples, and release evidence; the Studio website source is maintained separately.

## Documentation and project status

[Documentation index](docs/README.md) · [Troubleshooting](docs/troubleshooting.md) · [Updates and removal](docs/maintenance.md) · [Release notes](RELEASE_NOTES.md) · [Changelog](CHANGELOG.md)

The [release reports](reports) record specific runs and browser versions. They are historical evidence, not a claim that every later revision has passed those checks. The [development guide](CONTRIBUTING.md) explains how to run current checks and keep native verification separate from ordinary Chromium tests.

## License

No open source license has been selected. Package metadata uses `UNLICENSED`. Public repository visibility does not grant reuse rights. See [third party notices](THIRD_PARTY_NOTICES.md) for bundled dependency terms.
