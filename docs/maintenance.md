# Upgrades, ownership and removal

## Version policy

Packages use SemVer and are versioned together for the initial release. `latch.config.json` has a separate integer format version (`1`). Unknown versions and fields fail closed. `latch migrate --to 1` validates the supported version; there is no older incompatible Latch format to migrate yet. A future incompatible release must add a documented migration with before/after fixtures and must preserve a backup before writing. No automatic forward migration or schema downgrade is claimed.

Pin all local tarballs to one release. Rebuild artifacts for a new version, update local overrides, install, regenerate and review the diff, run `latch check`, apply and rerun regressions. A handler signature or result-shape change should require a reviewed contract/mapping update, rather than simply weakening test assertions.

## Generated ownership

`src/latch.generated/integration.ts` and `env.d.ts` are generator-owned. `.latch/manifest.json` records generator version, output hashes and the original/proposed installation file. `generate` checks all owned outputs and compiles a virtual installation before rewriting; handwritten edits or type incompatibilities cause a conflict without replacing working wrappers. Generation is deterministic for identical config. Fix incompatible mappings and regenerate. File replacement is atomic per file; generation does not promise crash-atomic multi-file transactions.

The owning component remains handwritten except for the reviewed import and marker replacement. `apply` accepts only the recorded original file or the identical already-applied file. `rollback` checks every owned output and the full component before doing any restoration. Any later component edit makes rollback refuse; it does not try to merge or discard user work. Reconcile those edits manually, or remove the small generated import/hook change by hand after review.

Every manifest consumer validates its format and limits ownership to the two fixed generated outputs. Installation targets must be application TypeScript outside hidden, dependency, generated and build directories. A stored transition must contain only the exact generated import and simple callback bindings. `check` and `apply` also require the stored proposal to match the current configured proposal. Unsupported manifest versions require manual reconciliation with the version that generated them.

Run `rollback` before changing installed React callback references. Generation refuses a binding change that would replace the stored installation while an older hook is still applied. Contract or exported mapping updates that leave the hook unchanged can be regenerated normally.

Keep `.latch/manifest.json` locally to preserve rollback provenance. The two original examples include their manifests in version control because their generated integrations ship in the repository; user projects may choose whether to commit the manifest, which includes the relevant component's source. Reports are not evidence of current correctness after source/config changes. The console fingerprints source/config and marks old reports stale.

## Remove an integration

1. Stop active calls and run `latch rollback` in the project before uninstalling packages. Review any conflict and preserve later edits.
2. Verify your application still builds and that the component no longer mounts generated tools.
3. Remove the six `@latch-local/*` packages and their local overrides from your package manifest; reinstall with your package manager to update the lockfile.
4. Remove `latch.config.json` and `.latch/` only if you no longer need contracts/reports. Rollback intentionally retains config/reports. Remove the empty generated directory if desired.

Stopping `latch dev` terminates the loopback console. There is no hosted account, service registration, extension, telemetry or recurring automation to remove.

## Compatibility policy

Browser adapters identify a tested implementation and date. Keep a native registration/invocation/cleanup lane for each claimed implementation. Do not mix proposal revisions. A new Chrome API form requires explicit adapter work and new evidence; feature detection alone is insufficient. Agent-level interoperability remains separate from browser invocation tests.
