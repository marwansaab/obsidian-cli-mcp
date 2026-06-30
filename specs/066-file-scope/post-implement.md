# Post-Implement Report: File Scope (066-file-scope)

**Date**: 2026-06-30 · **Branch**: `066-file-scope` · **Plan**: [plan.md](plan.md) · **Tasks**: [tasks.md](tasks.md)

The single-note scope for `find_and_replace` (named `path`/`file` + `active_note`) is implemented and verified. All tasks T001–T022 complete; the package version is bumped per the implement-time request.

## Quality gates (T020)

| Gate | Result |
|---|---|
| `npm run typecheck` (`tsc --noEmit`) | ✅ clean |
| `npm run lint` (`eslint .`) | ✅ zero warnings |
| `npm run build` (`tsc -p tsconfig.build.json`) | ✅ clean |
| Windows-safe coverage (`mkdir -p coverage/.tmp` then `npx vitest run --coverage --pool=forks --no-file-parallelism`) | ✅ **2824 passed, 6 skipped, 0 failed** |
| FR-018 registry-stability baseline (`_register.test.ts`) | ✅ green with the regenerated `find_and_replace` fingerprints |

`find_and_replace` module coverage: `handler.ts` 93.3 % stmts / 95.63 % lines; `index.ts` 100 % stmts; `schema.ts`/`fence-scan`/`region-scan`/`replace` 100 %. Module branch coverage 91.91 %.

**Note on `format:check`**: `npm run format:check` fails repo-wide (938 files, including untouched `tsconfig.json` / `vitest.config.ts`) — pre-existing prettier drift, not introduced by this change and not part of the enforced gate set (the project enforces `lint`, which passes). New code matches the surrounding file style.

## T0 live-CLI probes (T001 / T002)

Both resolution-channel gates confirmed on plan-of-record (evidence recorded in [contracts/t0-probe-plan.md](contracts/t0-probe-plan.md)):

- **P1** — `obsidian file file=<bare-name>` (focused vault, no `vault=` arg) returns a first-line `path\t<relPath>` TSV resolving the bare name — exactly what `resolveFileByTsv` parses. The focused-mode-without-`vault=` form works (the simpler D6 variant). Probed against the *focused* vault; the authorised TestVault could not be targeted via `vault=` because the `file` subcommand resolves against the **open/focused** vault's metadata cache (the documented non-focused cold-cache signature), and the user's live editor was on their real vault — not switched.
- **P2** — `obsidian eval` of `FOCUSED_FILE_TEMPLATE` returns `=> {"path":"<relPath>.md","base":"<absVaultRoot>"}` with a `.md` note active (sub-probe a). The template's `?? null` makes nothing-open → `path:null` → `ERR_NO_ACTIVE_FILE` a code-level certainty (sub-probe c); a non-`.md` active view surfaces `INVALID_NOTE`/`not-eligible` or `ERR_NO_ACTIVE_FILE` per the documented branch (sub-probe b).

## Structural verification (T022)

The AST graph auto-rebuilds on commit via the `post-commit` hook; the semantic `/graphify --update` is batched at the phase boundary (run on the implement commit). The four load-bearing invariants were verified directly against the source at HEAD:

1. **No new top-level error code (Constitution Principle IV).** The handler's top-level `UpstreamError.code` values remain `VALIDATION_ERROR` / `CLI_REPORTED_ERROR` / `FS_WRITE_FAILED` (+ `ERR_NO_ACTIVE_FILE` / `PATH_ESCAPES_VAULT` via the reused `_active-file.ts` guards). The new states (`SCOPE_CONFLICT`, `INVALID_NOTE`/`not-found`|`not-eligible`|`path-traversal`) are `details.code` sub-discriminators only — `src/errors.ts` is untouched, so no new error-class node. ✅
2. **ADR-032 non-edge holds + kernel-node isolation.** `find_and_replace/schema.ts` does NOT import `src/target-mode/target-mode.ts` (grep-confirmed). `handler.ts` imports no kernel DI factory (`createLogger`/`createQueue`/`createServer`) and no sibling tool module — its import set is `_active-file.ts`, `_note-io.ts`, `cli-adapter`, `errors`, and its own module files. The new resolver calls (`resolveActiveFocusedFile` / `resolveFileByTsv` / `resolveVaultDisplayName`) are new function-call uses within the pre-existing `handler.ts → _active-file.ts` edge, not a new module dependency. ✅
3. **New symbols land in the `find_and_replace` community.** `resolveScope`, `resolveSingleNoteScope`, `assertEligible`, `assertExists`, `toVaultRelative`, and the `ResolvedScope` type are module-private to `handler.ts` — inherently in the `find_and_replace` community, no surprise placement. ✅
4. **Only `find_and_replace` baseline fingerprints moved.** The `_register-baseline.json` diff touches exactly the `find_and_replace` entry (both `descriptionFingerprint` and `schemaFingerprint`); no other tool's fingerprints changed. ✅

Production files stay structurally connected; test files are weakly connected by design.

## Quickstart manual scenarios (T021)

Per the repo convention (this repo's binding gate is the vitest unit suite; manual TC scenarios live in the user's external tracker) and the focused-vault constraint surfaced by the T0 probes (the `file`/eval channels resolve against the **open** vault, and the user's live editor is on their real vault, not the authorised TestVault), the 18 quickstart scenarios in [quickstart.md](quickstart.md) are **not executed live here** to avoid switching the user's live Obsidian session. Every quickstart scenario has a direct in-process unit analogue that is green:

| Quickstart | Unit coverage |
|---|---|
| 1–2 named-path preview/commit + SC-001 | `handler.test.ts` "named single-note scope by path" preview + commit (siblings byte-unchanged) |
| 3 bare-name resolution | `handler.test.ts` "named-file resolves via the obsidian-file TSV channel" |
| 4 `[[…]]` rejected | `schema.test.ts` + `index.test.ts` `[[…]]` standard-channel reject |
| 5 zero-match success | `handler.test.ts` "zero-match named scope returns an empty success" |
| 6–7 open-note preview/commit | `handler.test.ts` "active_note scope" preview + commit |
| 8 no note open | `handler.test.ts` "no note open → ERR_NO_ACTIVE_FILE" |
| 9–12 scope conflicts | `schema.test.ts` + `index.test.ts` SCOPE_CONFLICT matrix (all 5 reasons) |
| 13 missing note | `handler.test.ts` "missing named note → INVALID_NOTE/not-found" |
| 14 ineligible target | `handler.test.ts` "ineligible named target (non-.md / dot-dir)" |
| 15–16 backward compatibility | `handler.test.ts` "unscoped vault-wide byte-identical" + existing subfolder tests |
| 17–18 guards under single-note | `handler.test.ts` "OCCURRENCE_COUNT_EXCEEDED / DRIFT under single-note scope" |

If a live walkthrough is wanted, it requires focusing the authorised TestVault in the Obsidian app first (replacing the currently-focused real vault) — flag this and it can be run as a separate, explicitly-authorised step.
