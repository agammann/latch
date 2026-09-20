# Documentation

[Repository home](../README.md) · [Open Latch Studio](https://latch-studio.alx21.chatgpt.site)

## Getting started

| Goal                                                    | Guide                                 |
| ------------------------------------------------------- | ------------------------------------- |
| Create contracts online and save or download your work  | [Using Latch Studio](studio.md)       |
| Run the supplied applications and verify their handlers | [Example quickstart](quickstart.md)   |
| Install packages into an existing React/Vite project    | [Installation](installation.md)       |
| Map handlers and write contracts and tests              | [Integration](integration.md)         |
| Resolve a setup or test failure                         | [Troubleshooting](troubleshooting.md) |

## Operating an integration

| Topic                                                      | Guide                                                     |
| ---------------------------------------------------------- | --------------------------------------------------------- |
| Queues, committed state, scopes, cancellation, and errors  | [Runtime semantics](runtime.md)                           |
| Regeneration, ownership, upgrades, and rollback            | [Maintenance and removal](maintenance.md)                 |
| Browser versions, native API behavior, and measured limits | [Dated compatibility record](compatibility-2026-09-08.md) |
| Automated Handler checks and separate native verification  | [CI lanes](ci.md)                                         |

## Working on Latch

See [CONTRIBUTING.md](../CONTRIBUTING.md) for the repository map, build commands, validation expectations, and package preparation.

## Release evidence

The [September 19 acceptance check](../reports/acceptance-2026-09-19.md) covers the public Studio, downloaded packages, a fresh consumer application, browser interactions, and fixes found during that run.

[Release notes](../RELEASE_NOTES.md), [changelog](../CHANGELOG.md), and [reports](../reports) describe the recorded 0.1.0 release. The [security review correction](security-review.md) and [local console visual review](visual-qa.md) retain their original scope. The [initial release checklist](../PLAN.md) is historical.
