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

In **Project setup**, set the application's loopback development URL and installation component. Studio exports Handler tests. Native invocation must be configured and verified separately using the [compatibility record](compatibility-2026-09-08.md).

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

Also select **Download runtime packages** in **Project setup**. That separate ZIP contains six package tarballs and `SHA256SUMS`. Keep the tarballs available while installing and maintaining the integration.

Continue with [Installation](installation.md). Copy the configuration into your application, keep `preview/` outside application source, and let the CLI generate and own the installed files.

## Opening an existing configuration

**Open config** accepts Studio drafts and Latch v1 configurations. Studio creates one Handler test per tool from its sample values. Other imported test steps, UI assertions, and native browser settings are not retained; the editor shows a notice. Keep your original configuration if you need those tests. Configurations with custom preconditions cannot be edited in Studio.

For an advanced test suite, edit `latch.config.json` in your project and use the CLI directly.
