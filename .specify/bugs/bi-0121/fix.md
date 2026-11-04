# Bug Fix: Focused-vault operations no longer depend on a warm vault-name cache

- **Slug**: bi-0121
- **Fixed**: 2026-11-04
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

The vault registry's reverse lookup (folder path to display name) now probes `obsidian vaults verbose` once on a cold cache or a miss, the way the forward lookup already did (068 FR-037). The shared helper in `_active-file.ts` now fails with `CLI_REPORTED_ERROR` / `VAULT_NOT_FOUND` / `focused-unregistered` instead of falling back to the folder path. As a result, the first active-mode call of a process acts on the focused vault and reports its display name, and a focused vault that matches no listed vault fails with a clear error. A folder path is never sent as `vault=` and never reported as a vault name.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/vault-registry/registry.ts` | modified | `resolveVaultDisplayName` is now async. It checks the cache and, on a cold cache or a miss, calls the existing single-flight `probe()` once and then matches again. The interface type is widened to `string \| null \| Promise<string \| null>` and the method stays optional (the Declined-cleanups ruling stands). A private `nameForPath` helper holds the path match, and the interface and header comments are updated. |
| `src/tools/_active-file.ts` | modified | `resolveVaultDisplayName(vaultRegistry, base)` is now async and throws the classified failure when the lookup gives `null` or the method is absent. It never returns `base`. `resolveActiveLocatorWithVault` awaits it. |
| `src/tools/find_and_replace/handler.ts` | modified | `await` on the helper in `resolveSingleNoteScope`. The raw-root argument is kept (refactor-decisions item 17); its rationale comment now names the new failure instead of the removed fallback. |
| `src/vault-registry/registry.test.ts` | modified + added tests | Approved edits at `:172` and `:189` (added `await`) and `:310` (now expects probe-and-resolve), plus 5 new tests. |
| `src/tools/_active-file.test.ts` | modified + added tests | Approved edits at `:225`, `:253` and `:261` (now expect the fail-loud error) and `:245` (added `await`), plus 3 new tests. |
| `src/tools/append_note/handler.test.ts` | modified + added test | Approved flip at `:952`; new cold-cache test. |
| `src/tools/prepend/handler.test.ts` | modified + added test | Approved flip at `:792`; new cold-cache test. |
| `src/tools/patch_block/handler.test.ts` | modified + added test | Approved flip at `:799`; approved retarget at `:831`; new cold-cache test. |
| `src/tools/patch_heading/handler.test.ts` | modified + added test | Approved flip at `:747`; approved retarget at `:780`; new cold-cache test. |
| `src/tools/find_and_replace/scope.test.ts` | added tests | Cold-cache `file`-with-no-`vault` case and unregistered-base case. |
| `docs/tools/patch_heading.md` | modified | `vault` output row (the old line 202 described the folder-path fallback) plus a new `focused-unregistered` error row. |
| `docs/tools/patch_block.md` | modified | `vault` output row (line 163) plus a new error row. |
| `docs/tools/append_note.md`, `docs/tools/prepend.md`, `docs/tools/find_and_replace.md` | modified | New `focused-unregistered` error row next to `folder-missing`. |

## Diff Highlights

```ts
// registry.ts
async resolveVaultDisplayName(basePath: string): Promise<string | null> {
  const cached = cache === null ? null : nameForPath(cache, basePath);
  if (cached !== null) return cached;
  // Cold cache or a miss: probe once (BI-0121, mirroring FR-037 above), then give up.
  return nameForPath(await probe(), basePath);
},
```

```ts
// _active-file.ts
export async function resolveVaultDisplayName(vaultRegistry: VaultRegistry, base: string): Promise<string> {
  const name = await vaultRegistry.resolveVaultDisplayName?.(base);
  if (name !== undefined && name !== null) return name;
  throw new UpstreamError({
    code: "CLI_REPORTED_ERROR",
    cause: null,
    details: { code: "VAULT_NOT_FOUND", reason: "focused-unregistered" },
    message:
      "The focused vault's folder matches no vault Obsidian lists. " +
      "Call again in specific mode with `vault`, or re-open the vault in Obsidian.",
  });
}
```

`prepend`, `append_note`, `patch_block` and `patch_heading` need no handler change. `prepend` still forwards `input.vault ?? vaultDisplayName` as `vault=`, and that value is now always a registered display name.

## Tests Added or Updated

Existing tests edited. There are 13 owner-approved edits, recorded on BI-0121: the Q3 ruling's seven, the "four more" ruling's four, and the two retargets ruled on during this fix.

- `registry.test.ts`: "resolveVaultDisplayName probes once and resolves when the cache has not been primed (BI-0121)" (was `:310`, "returns null when the cache has not been primed"); `:172` and `:189` now `await` the lookup, with the same expected values.
- `_active-file.test.ts`: `:225` `resolveActiveLocatorWithVault` now rejects with `focused-unregistered`; `:245` now `await`s; `:253` (registry returns `null`) and `:261` (method absent) now reject with `focused-unregistered`.
- `append_note/handler.test.ts:952`, `prepend/handler.test.ts:792`, `patch_block/handler.test.ts:799` and `patch_heading/handler.test.ts:747`: each now fails with `CLI_REPORTED_ERROR` and `details` equal to `{ code: "VAULT_NOT_FOUND", reason: "focused-unregistered" }`, with nothing written. For prepend, only the focused-file eval spawns: no `prepend` spawn and no stat.
- `patch_block/handler.test.ts:831` and `patch_heading/handler.test.ts:780` ("metadata refresh runs in the open vault: no vault= on its argv (068 FR-002 / R13)"): each now focuses the registered `VAULT_ROOT`, expects `result.vault === "TestVault"`, and drops ", never the folder path" from its title. The refresh assertions are unchanged.

New tests:

- `registry.test.ts`:
  - a warm-cache hit does not re-probe;
  - a warm-cache miss re-probes once and resolves a vault added after start-up;
  - a base that matches nothing returns `null` after a single cold probe;
  - concurrent cold reverse and forward lookups share one probe;
  - a probe failure propagates and leaves the cache cold, so a later call recovers.
- `_active-file.test.ts`:
  - an async registry stub resolves the name;
  - the failure's exact message and `details` carry no folder path;
  - a registry lookup failure propagates unchanged.
- One cold-cache test per cohort tool. Each wires the real `createVaultRegistry` with a stub `invokeProbe` and makes no prior lookup:
  - `append_note`, `patch_block` and `patch_heading` return the display name, probe once, and write;
  - `prepend` sends `vault=Knowledge`, never `vault=<folder>`, to the `prepend` spawn and returns `Knowledge`;
  - `find_and_replace` (`scope.test.ts`) with `file` and no `vault` sends `vault=V` to the `obsidian file` lookup.
- `find_and_replace/scope.test.ts`: a focused vault that matches no listed vault fails with `focused-unregistered`, with no spawn, no read and no write. The unregistered-base case for the other four tools is the flipped tests above.

## Local Verification

- Commands run:
  - `npx tsc --noEmit -p .` → clean.
  - `npm run lint` → clean. Import order in two test files was fixed with `eslint --fix`.
  - `npx vitest run` → 196 files passed (1 skipped); 4868 tests passed, 6 skipped, 0 failed, no unhandled errors.
  - `npm run build` → clean.
- FR-018 fingerprint gate: `_register.test.ts` passes without `npm run baseline:write`, so the published surface did not move, as the assessment expected.
- Before the test edits, the first run failed exactly the 11 previously approved tests plus `patch_block/handler.test.ts:831` and `patch_heading/handler.test.ts:780`. Those two were raised to the owner, who approved the retargets (option A), and nothing else failed.
- Manual or live checks: none. The live regression lock (one fresh server process per cohort tool against TestVault-Obsidian-CLI-MCP) is owner-run in `/speckit-bug-test`, per the Live confirmation ruling.

## CodeGraph structural verification

Checked with `codegraph_explore` on `resolveVaultDisplayName` (registry and helper), `nameForPath`, `resolveActiveLocatorWithVault`, `resolveSingleNoteScope` and `createVaultRegistry`.

1. **No new top-level error codes.** The new failure reuses `CLI_REPORTED_ERROR` with the existing `VAULT_NOT_FOUND` `details.code` and a new ADR-015 `reason` value, `focused-unregistered`. There is no new error class outside `src/errors.ts`. The Principle IV streak holds.
2. **DI discipline.** `server.ts` is untouched; `createLogger()` and `createQueue()` are still constructed only there. No handler imports a boot-time factory.
3. **Module placement and import direction.** `nameForPath` is a private function inside `src/vault-registry/registry.ts`. The helper stays in `src/tools/_active-file.ts`. No imports were added to production code, so the direction is still tools → `_active-file.ts` → `vault-registry` → `errors.ts`.
4. **Reachability.** `nameForPath` is called by the registry's `resolveVaultDisplayName`. That registry is built in `server.ts` (`createVaultRegistry`) and reached at runtime through `resolveActiveLocatorWithVault` (from `resolveFsTarget`, used by the four direct-fs handlers) and through `find_and_replace`'s `resolveSingleNoteScope`.

**Kernel-node claim held.** `createLogger()`, `createQueue()`, `createServer()` and the `UpstreamError` class are unmodified. As the assessment predicted, there is exactly one new `UpstreamError` construction site, in `_active-file.ts`.

## Deviations from Assessment

- **Test-edit scope grew from 11 to 13.** `patch_block/handler.test.ts:831` and `patch_heading/handler.test.ts:780` also pinned the fallback, through an unregistered focused base. The assessment's inventory missed them. They were raised as a question during the fix, and the owner approved retargeting them to the registered base (ruling recorded on BI-0121).
- **Failure message has no tool-name prefix.** The Q2 ruling gave the message "for example" as `<tool>: the focused vault's folder matches no vault Obsidian lists; …`. The helper takes no tool name, so the message is "The focused vault's folder matches no vault Obsidian lists. Call again in specific mode with `vault`, or re-open the vault in Obsidian." This matches its ADR-015 sibling `folder-missing` ("The focused vault is registered with Obsidian, but …"), which also has no prefix. It also keeps the approved `_active-file.test.ts:245` edit to an added `await`, because a third parameter would have changed that call's arguments. The message still names the state and the remedy, and carries no disk path.
- **Titles and assertions on the flipped tests.** Each flipped test also got a title that states the new behaviour, since the old titles described the removed fallback (for example `registry.test.ts:310`, "returns null when the cache has not been primed"). Each also got "nothing written" assertions: no reads, writes or renames, and for prepend no `prepend` spawn and no stat. `registry.test.ts:310` also asserts a single probe. None of these changes the inputs or the fixture wiring.
- **`find_and_replace` rationale comment reworded.** The load-bearing block above the raw-root line (item 17) said a miss "falls back to a filesystem path". It now says a miss fails with `focused-unregistered`. The raw-root argument and the reason for it are unchanged.

## Follow-ups

- `.memory/refactor-decisions.md` now has stale entries for the code review to update:
  - the write_note entry (around line 1212) says `resolveVaultDisplayName` "is sync and reads the cache only, never spawns, so `resolveActiveLocatorWithVault` costs no extra spawn". The first active-mode call of a process now probes once.
  - item 24 says `resolveActiveLocatorWithVault` "falls back to the absolute base path when the registry misses".
  - item 32(b) gives "fail loudly on a null reverse lookup" as the owner's fallback; it is now what the cohort does.
  - The `VaultRegistry.resolveVaultDisplayName is optional by design` invariant and the Declined entry still hold, but their wording ("synchronous", "degrade to the base-path literal") is stale.
- Live regression lock in `/speckit-bug-test` (owner restarts the server once per tool): each cohort tool as the first call against a note focused in TestVault-Obsidian-CLI-MCP must succeed and report `vault: "TestVault-Obsidian-CLI-MCP"`.
- `/speckit-docs-as-code` should reflect the reverse lookup's probe-on-miss and the new `focused-unregistered` reason in `.docs-as-code/`.
- Accepted residuals, not addressed:
  - the exact-string path comparison: case, separators and symlinks now fail loud rather than echo the path;
  - duplicate display names;
  - the `obsidian.exe` / `Obsidian.com` side finding (a Tool Notes item).
