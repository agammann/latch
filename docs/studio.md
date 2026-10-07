# Using Latch Studio

[Documentation index](README.md) · [Open Latch Studio](https://latch-studio.alx21.chatgpt.site)

Studio lets you define contracts and download integration files without installing Latch first. You still need an existing React/Vite application and a real handler to complete the integration.

## 1. Describe a real tool

Set a project name. Select the starter tool or choose **Add a tool**. Replace its name and description with the action your application supports.

In **Contract**, choose a binding pattern:

| Pattern                        | What to enter                                                                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Exported function              | Its project relative source module and named export, such as `src/catalog.ts` and `searchCatalog`.                                         |
| React callback or store action | The owning component module and the callback variable in its scope. The module must match the installation component in **Project setup**. |

Enter the exact active pathname and owning component. Define bounded input and result schemas. Objects must declare their properties and use `additionalProperties: false`. The [integration guide](integration.md) covers the supported contract format and binding constraints.

The starter values are examples. They do not establish that your handler exists or returns those results.

## 2. Check samples and project settings

In **Test samples**, supply a representative input and the result your real handler should return. Select **Check sample values**. A successful check means the values match the schemas; it does not execute the handler.

In **Project setup**, set the application's loopback development URL and installation component. Studio exports Handler tests. Native invocation must be configured and verified separately using the [current compatibility record](compatibility-2026-10-06.md).

## 3. Save and download

Use **Save draft** to keep an editable JSON copy, including unfinished fields. Reopen it with **Open config**. Current work lives only in the tab, so save before reloading or closing it.

Once every contract and sample is valid, select **Download integration**. Its ZIP contains:

| File                                         | Purpose                                                           |
| -------------------------------------------- | ----------------------------------------------------------------- |
| `latch.config.json`                          | Contracts, bindings, project settings, and expected result tests. |
| `preview/src/latch.generated/integration.ts` | A typed wrapper preview for review.                               |
| `preview/src/latch.generated/env.d.ts`       | Vite type reference for the preview.                              |
| `INSTALL.md`                                 | Instructions for this configuration.                              |
| `PACKAGE_INSTALL.md`                         | Package setup instructions.                                       |
| `studio-draft.json`                          | An editable copy of the Studio draft.                             |

Obtain v1.0.0 runtime packages from the [installation guide](installation.md). Studio's separately maintained **Download runtime packages** ZIP has not been established as the matching v1 package set. Keep the six matching v1 tarballs available while installing and maintaining the integration.

Continue with [Installation](installation.md). Copy the configuration into your application, keep `preview/` outside application source, and let the CLI generate and own the installed files.

## Opening an existing configuration

**Open config** accepts Studio drafts and Latch v1 configurations. Studio creates one Handler test per tool from its sample values. Other imported test steps, UI assertions, and native browser settings are not retained; the editor shows a notice. Keep your original configuration if you need those tests. Configurations with custom preconditions cannot be edited in Studio.

For an advanced test suite, edit `latch.config.json` in your project and use the CLI directly.

## Production Studio check — October 3, 2026 (UTC)

Studio version 4 passed 40 browser and asset checks in Chrome **154.0.8037.98**, including validation failures, both binding patterns, sample checks with the handler-not-executed notice, draft recovery, keyboard navigation, and actual integration and runtime downloads. The three editor tabs had no page-level horizontal overflow at 1440, 390, and 320 px.

The downloads passed 31 checks covering the six integration files, ZIP integrity, all six runtime package checksums, and agreement with the current package artifacts and compiled source. All **57 package files** also matched the installed final consumer whose earlier October 2 runs passed 11 catalog and 7 documentation cases. Those consumer tests were not rerun for this download check.

An older Studio consumer archive did not match the current bundle: its test runner predates the concurrent-call fix. That mismatch remains part of the historical record; current package parity was established against the later final consumer installation.

This follow-up verified the public editor and downloads. It did not execute visitor handlers or make new native WebMCP calls. The separate [October 2 verification](../reports/verification-2026-10-02.json) records the earlier native execution and consumer checks. Packages remain local tarballs, and these results do not establish compatibility with arbitrary applications or browsers.
