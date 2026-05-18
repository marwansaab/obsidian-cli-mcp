# Implementation Plan: Find and Replace

**Branch**: `038-find-replace` | **Date**: 2026-05-18 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/038-find-replace/spec.md`

## Summary

Ship a typed `find_and_replace` MCP tool that scans every eligible `.md` note in a vault (or under a named subfolder) for a literal-string-or-regex pattern, presents a per-occurrence preview by default, and applies the rewrite on disk only when the caller passes an explicit commit opt-in. The tool is direct-FS (read AND write) per ADR-009 — no eval round-trip — and reuses three established kernel modules wholesale: `src/path-safety/{schema, canonical}.ts` for two-layer path safety (FR-009), `src/vault-registry/registry.ts` for the lazy `resolveVaultPath` cache (FR-013), and `src/queue.ts` for per-note write serialization (FR-024). The write step inherits write_note's `${absPath}.${randomUUID()}.tmp` + `fs.rename` pattern verbatim (FR-015). The response envelope is a single Zod `z.discriminatedUnion("mode", […])` keyed on `"preview"` / `"commit"` — the project's first preview-then-commit shape (FR-025). Twelve distinct `(top-level code, details.code, details.reason)` failure triples are surfaced, all REUSING existing top-level error codes (`VALIDATION_ERROR`, `PATH_ESCAPES_VAULT`, `CLI_REPORTED_ERROR`, `FS_WRITE_FAILED`) per Constitution Principle IV — the eleven-tool zero-new-top-level-codes streak carries into the twelfth typed tool.

The feature unblocks bulk vault refactors — ADR-rename, wikilink-retarget after a heading change, frontmatter-key migration — that today require either hand-rewriting each note (no preview, no scope cap) or dropping down to out-of-band scripting against the vault filesystem (no Obsidian metadata-cache invalidation, no atomicity).

## Technical Context

**Language/Version**: TypeScript 5.6.x, strict mode, `tsc --noEmit` clean (constitution §Technical Standards).
**Primary Dependencies**: `zod` 3.23.x (boundary validation, Principle III; discriminated union output schema per FR-025), `@modelcontextprotocol/sdk` 1.0.x (tool registration), `zod-to-json-schema` 3.23.x (inputSchema publication). No new runtime deps — `randomUUID` from `node:crypto`, `fs.realpath` / `fs.writeFile` / `fs.rename` / `fs.readFile` / `fs.readdir` from `node:fs/promises`, `node:path` for path manipulation are all standard-library.
**Storage**: Direct filesystem against the resolved vault root. No wrapper-side persistence. The lazy vault registry (BI-011's `src/vault-registry/registry.ts`) is the only cached state and is shared with the existing write surface.
**Testing**: `vitest` 4.x + `@vitest/coverage-v8`. Co-located `*.test.ts` per Principle II. In-process unit tests mock `fs`, `realpath`, `randomUUID`, `Queue.run`, and `resolveVaultPath` via the existing `ExecuteDeps` shape. Live-FS characterisation happens at T0 against the authorised test vault per [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md).
**Target Platform**: Node.js ≥ 22.11 (latest 22.x LTS minor; constitution §Technical Standards). Cross-platform: Windows + macOS + Linux. Line-ending preservation (FR-015) and same-volume rename atomicity (POSIX inode swap; Windows `MoveFileEx`) are the cross-platform-correctness invariants under test.
**Project Type**: library + CLI bridge (single-project layout under `src/`).
**Performance Goals**: Single in-process scan per invocation — no per-file CLI round-trip (the direct-FS path lets us read every eligible note inline). For preview against a 1000-file vault, expect dominant cost from `fs.readFile` × N (typically tens of ms for vaults under ~10k files; same floor as sibling `pattern_search` BI-037, except wrapper-side instead of Obsidian-side). For commit, dominant cost adds `fs.writeFile` + `fs.rename` × M (M = notes changed) per the FR-024 per-note Queue acquisition pattern — serialized through `createQueue()` so concurrent commits never overlap on a single note. The 10-second CLI-adapter bound (ADR-007) does not apply — find_and_replace bypasses the CLI entirely.
**Constraints**: ECMAScript regex semantics locked at spec Clarifications Q (BI-037 parity). 500-UTF-16-code-unit line cap with `…` U+2026 (FR-004 / BI-033 FR-024 parity). Zero-length regex matches skipped (FR-017 / BI-037 FR-016 parity). Line-scoped only — no cross-line patterns (FR-016 / BI-037 FR-012 parity). Default safe upper bound 500 occurrences across scope, env-var override via `OBSIDIAN_FIND_REPLACE_MAX_OCCURRENCES` (FR-011). Byte-for-byte preservation of unmatched content per BI-016 FR-004 (FR-015). Zero new top-level error codes (Constitution Principle IV streak). Zero new `details.code` values for failures that map to an existing sub-state — new `details.code` values (`INVALID_PATTERN`, `INVALID_REPLACEMENT`, `INVALID_SUBFOLDER`, `OCCURRENCE_COUNT_DRIFT`) are introduced under existing top-level codes per ADR-015's sub-discriminator pattern.
**Scale/Scope**: Vaults under ~10k markdown notes are the dominant cohort. Vault-wide refactors that match more than 500 occurrences (default upper bound) refuse with the bound-exceeded error — operator either narrows scope or raises `OBSIDIAN_FIND_REPLACE_MAX_OCCURRENCES`. Per-occurrence preview payload is bounded at `500 × (line_cap_500 + match + replacement + locator + line_number) ≈ ~1 MB worst case`; under the project's typical 50-char patterns the realistic payload sits well under 100 KB.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The plan is evaluated against each principle and ADR in the Constitution Compliance checklist (constitution v1.5.0, ratified 2026-05-03, last amended 2026-05-15):

| Gate | Status | Evidence |
|---|---|---|
| Principle I (Modular Code Organization) | Y | New surface lives at `src/tools/find_and_replace/{schema, handler, index, fence-scan, region-scan, replace}.ts` + co-located tests. Imports flow one-directional: `index.ts → _register.ts`, `index.ts → handler.ts`, `handler.ts → schema.ts`, `handler.ts → fence-scan.ts`, `handler.ts → region-scan.ts`, `handler.ts → replace.ts`, `handler.ts → ../../path-safety/{schema, canonical}.ts`, `handler.ts → ../../vault-registry/registry.ts`, `handler.ts → ../../queue.ts`, `handler.ts → ../../errors.ts`. No upward or cyclic dependencies. The two new pure-utility modules (`fence-scan.ts` for paired-fence detection per FR-006, `region-scan.ts` for HTML-comment detection per FR-007) are isolated from I/O — they take a string and emit `Region[]` so unit tests are file-less. The `replace.ts` module owns the per-occurrence rewrite (line-scoped, region-aware) and is similarly pure. The handler composes the pure utilities, the FS deps, and the registry/queue/path-safety deps. |
| Principle II (Public Surface Test Coverage) | Y | `src/tools/find_and_replace/schema.test.ts` covers happy-path validation + every input-boundary case (empty pattern → `INVALID_PATTERN/empty`, over-cap pattern → `INVALID_PATTERN/too-long`, invalid regex → `INVALID_PATTERN/regex-syntax`, over-cap replacement → `INVALID_REPLACEMENT`, path-traversal subfolder → `INVALID_SUBFOLDER/path-traversal`, unknown field rejection). `src/tools/find_and_replace/handler.test.ts` covers happy-path preview + happy-path commit (with mocked fs/realpath/randomUUID/Queue.run/resolveVaultPath), zero-match success, bound-exceeded preview, bound-exceeded commit, drift-detected commit, code-block-skip default, HTML-comment-skip default, code-block opt-in, HTML-comment opt-in, hidden-folder skip (`.obsidian/`), non-`.md` exclusion, line-ending preservation (CRLF / LF / mixed), trailing-newline preservation, BOM preservation, partial-commit on FS_WRITE_FAILED (ENOSPC / EACCES / EROFS), canonical-level vault escape, unknown-vault, closed-but-registered vault, concurrent-commit interleave via Queue. `src/tools/find_and_replace/fence-scan.test.ts` covers paired-fence detection + the unclosed-fence-EOF edge case. `src/tools/find_and_replace/region-scan.test.ts` covers paired HTML-comment detection + nested-comment behaviour. `src/tools/find_and_replace/replace.test.ts` covers line-scoped literal + regex replacement with `$1`/`$&`/`$$` semantics + zero-width-match skip + region-aware skipping. `src/tools/find_and_replace/index.test.ts` covers descriptor shape, registration, tool name. All co-located in the same change. |
| Principle III (Boundary Input Validation with Zod) | Y | `findAndReplaceInputSchema` is the single source of truth; `z.infer` types flow downstream. Strict object: `pattern` is `z.string().min(1).max(1000)`, `replacement` is `z.string().max(1000)`, `mode` is `z.enum(["literal","regex"]).default("literal")`, `case_insensitive` is `z.boolean().optional().default(false)`, `subfolder` is `z.string().optional()` with a `superRefine` running `isStructurallySafePath`, `include_code_blocks` is `z.boolean().optional().default(false)`, `include_html_comments` is `z.boolean().optional().default(false)`, `commit` is `z.boolean().optional().default(false)`, `vault` is `z.string().optional()`. `regex`-mode pattern syntax is validated at zod boundary via `superRefine` running `new RegExp(input.pattern, ...)` in try/catch (parity with BI-037 R7). `findAndReplaceOutputSchema` is a `z.discriminatedUnion("mode", […])` per FR-025 with strict branches; validates response shape at the response boundary. No hand-rolled `typeof` chains at the boundary. |
| Principle IV (Explicit Upstream Error Propagation) | Y | Every failure surfaces through `UpstreamError`. Reused top-level codes — zero new top-level codes added. Twelve `(top-level code, details.code, details.reason)` triples per SC-006, all REUSING existing top-level codes: `VALIDATION_ERROR` carries seven triples (`INVALID_PATTERN/empty`, `INVALID_PATTERN/too-long`, `INVALID_PATTERN/regex-syntax`, `INVALID_REPLACEMENT/—`, `INVALID_SUBFOLDER/—` (unknown), `INVALID_SUBFOLDER/path-traversal`, `OCCURRENCE_COUNT_DRIFT/—`, plus the bound-exceeded sub-state); `CLI_REPORTED_ERROR.details.code = "VAULT_NOT_FOUND"` carries two reasons (`unknown` / `not-open`, parity with BI-037 handler.ts:74); `PATH_ESCAPES_VAULT` reused from ADR-009 — no `details.code` discriminator (single-state); `FS_WRITE_FAILED` reused from ADR-009 §7 with `details.errno` carrying the Node errno string. The `pathEscapeAttempt` logger event (FR-009 / ADR-009 §2) is emitted on canonical-level escape per the project's security-audit-trail convention. No `catch` blocks return empty results, default values, or `null`. The partial-commit case (FR-021) carries the failing-note locator alongside the `FS_WRITE_FAILED` envelope — caller sees both what succeeded AND what failed per the constitutional partial-success rule. |
| Principle V (Attribution & Layered Composition) | Y | All new source files (`schema.ts`, `handler.ts`, `index.ts`, `fence-scan.ts`, `region-scan.ts`, `replace.ts`, and tests) carry an `// Original — no upstream. <one-line intent>.` header. The reused kernel modules (`path-safety/{schema, canonical}.ts`, `vault-registry/registry.ts`, `queue.ts`) are unchanged and retain their existing headers. No upstream code is lifted. |
| ADR-010 (Typed Tool Names Mirror Upstream CLI Subcommand) | N/A | The Obsidian CLI exposes no native `find-replace` / `replace` / `sed`-equivalent subcommand to mirror. ADR-010 N/A is locked by spec Clarifications session-4 Q1: the tool is direct-FS per ADR-009, not a CLI-bridge tool. The canonical name `find_and_replace` is a synthesised concept name (snake_case with explicit conjunction) parallel to sibling concept-named tools (`context_search`, `find_by_property`, `pattern_search`). |
| ADR-013 (Plugin-Namespace Tool Naming Convention) | N/A | Not plugin-backed. The tool reads vault content directly via `fs.readFile` and writes via `fs.writeFile` + `fs.rename` — Node standard library, not a plugin-exposed API. ADR-013's prefixed-naming convention applies only to plugin-API wrappers (e.g., `smart_connections_similar`). |
| ADR-014 (Plugin-Backed Typed Tools Runtime-Dependency Pattern) | N/A | Not plugin-backed (per ADR-013 N/A). No plugin-lifecycle states (`<PLUGIN>_NOT_INSTALLED` / `<PLUGIN>_NOT_READY` / `SOURCE_NOT_INDEXED`) apply. |
| ADR-015 (Sub-Discriminators via `details.reason` for Multi-State Error Codes) | Y | The plan introduces TWO new multi-sub-state `(top-level-code, details.code)` pairs: (a) `VALIDATION_ERROR` + `details.code: "INVALID_PATTERN"` carries three sub-states `details.reason: "empty" | "too-long" | "regex-syntax"` per FR-022 + FR-010; (b) `VALIDATION_ERROR` + `details.code: "INVALID_SUBFOLDER"` carries two sub-states — `details.reason: "path-traversal"` for the schema-layer rejection per FR-009 and the absent/`"unknown"` default for the unknown-subfolder unknown-existence rejection. The pre-existing `CLI_REPORTED_ERROR` + `details.code: "VAULT_NOT_FOUND"` pair (BI-026 v0.5.4) is reused without new sub-states (`unknown` and `not-open` already enumerated). All `details.reason` values are kebab-case literals per ADR-015 §Format; each `(code, reason)` pair is enumerated in `contracts/errors.md` (Phase 1 output). |

**Gate result**: PASS pre-Phase-0. No N entries; no Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/038-find-replace/
├── plan.md              # This file
├── research.md          # Phase 0 output — execution-path decision, region-scan algorithm, region/match interaction, drift-check semantics, upper-bound env-var parsing, T0 probe plan
├── data-model.md        # Phase 1 output — input / preview-branch / commit-branch entity shapes + the `Region` and `Occurrence` internal entities
├── quickstart.md        # Phase 1 output — manual quickstart scenarios against the test vault
├── contracts/
│   ├── input.md         # MCP-tool-input contract for the request shape
│   ├── output.md        # Discriminated-union response shape (preview branch + commit branch)
│   └── errors.md        # Twelve-discriminator error envelope cohort
├── checklists/
│   └── requirements.md  # /speckit-specify quality gate (already complete on first pass)
└── tasks.md             # /speckit-tasks output — NOT created by /speckit-plan
```

### Source Code (repository root)

```text
src/
├── tools/
│   └── find_and_replace/                # NEW — twelfth typed-tool wrap
│       ├── index.ts                     # createFindAndReplaceTool factory + descriptor + description
│       ├── index.test.ts                # descriptor shape, registration, name
│       ├── schema.ts                    # zod input + output schemas (single source of truth)
│       ├── schema.test.ts               # validation cohort + regex / path-traversal / cap refinements
│       ├── handler.ts                   # executeFindAndReplace — vault resolve, path-safety, scan, drift-check, bound-check, region-aware replace, atomic write
│       ├── handler.test.ts              # mocked-fs unit cohort (preview + commit + every error sub-discriminator)
│       ├── fence-scan.ts                # pure: text → Region[] for paired fenced code blocks (FR-006)
│       ├── fence-scan.test.ts           # fenced / unclosed / no-fence / mixed-fence-type cohort
│       ├── region-scan.ts               # pure: text → Region[] for paired HTML comments (FR-007)
│       ├── region-scan.test.ts          # paired / unclosed / nested-comment cohort
│       ├── replace.ts                   # pure: per-occurrence line-scoped literal+regex match-and-replace with region awareness, zero-width skip
│       └── replace.test.ts              # literal / regex / `$1` `$&` `$$` / zero-width skip / region skip cohort
├── tools/_register.ts                   # UNCHANGED — registration factory (kernel)
├── path-safety/schema.ts                # UNCHANGED — `isStructurallySafePath` Layer-1 helper (ADR-009)
├── path-safety/canonical.ts             # UNCHANGED — `checkCanonicalPath` Layer-2 helper (ADR-009)
├── vault-registry/registry.ts           # UNCHANGED — `resolveVaultPath` lazy cache (ADR-009)
├── queue.ts                             # UNCHANGED — `createQueue` FIFO single-flight (FR-023 of BI-016)
├── errors.ts                            # UNCHANGED — UpstreamError class (kernel)
├── server.ts                            # MODIFIED — wires createFindAndReplaceTool into the boot spine
└── tools/_register-baseline.json        # MODIFIED — registry-stability baseline gains find_and_replace entry

docs/
└── tools/
    └── find_and_replace.md              # NEW — progressive-disclosure docs surfaced by help() per ADR-005

tests/                                   # NOT USED — tests are co-located per Principle II
```

**Structure Decision**: Single-project layout per the existing repo convention (constitution §Modular Code Organization). The feature ships as a new per-surface module at `src/tools/find_and_replace/` matching the `{schema, handler, index}.ts` core layout Principle I prescribes, extended with three pure-utility modules (`fence-scan.ts`, `region-scan.ts`, `replace.ts`) carved out to keep the handler small and the region-detection + replacement logic file-less-testable. The only kernel touches are: (a) the one-line registration in `src/server.ts` (boot spine), (b) the one-entry append to `src/tools/_register-baseline.json` (registry-stability fixture), and (c) zero changes to `src/path-safety/`, `src/vault-registry/`, `src/queue.ts`, `src/errors.ts` — those modules are imported as-is.

## Phase 0: Outline & Research

Phase 0 output: [research.md](research.md). Resolves the technical-context items the spec deferred (execution path, region-scan algorithm, region/match interaction, drift-check semantics, upper-bound env-var parsing) and defines the T0 live-FS probe plan.

Topics researched:

- **R1 — Execution path**: direct-FS for BOTH the preview read pass AND the commit write pass. Decision: read via `fs.readdir` (recursive walk with `.`-prefix skip) + `fs.readFile` (UTF-8 string); write via `fs.writeFile(<target>.<uuid>.tmp)` + `fs.rename`. Reason: parity with ADR-009 write_note (direct-FS bypasses the upstream IPC argv ceiling AND the eval-template lifecycle); uniform path-safety check across read and write; no eval round-trip latency; cross-platform-correctness invariant (BI-017) is testable end-to-end without an Obsidian instance.

- **R2 — Region-scan algorithm**: paired-fence detection via a forward-scan over each note. A line is "inside a fence" when an opening fence has been seen and the matching closing fence has not yet been seen. Fence marker is `^```` followed by an info-string (rest of line ignored) OR `^~~~` followed by an info-string. Matching pair must use the same fence character (a `\`\`\`` open does NOT close at a `~~~`). Unclosed-fence-at-EOF (spec edge case): the open-fence-line through EOF is treated as inside-fence. Same algorithm shape for HTML-comment regions in `region-scan.ts` (paired `<!--` / `-->`, opening anywhere on a line, closing anywhere on a subsequent line; nested comments per Obsidian/CommonMark are flat — first `-->` closes). Both algorithms produce a `Region[]` keyed by `[startLine, startCol, endLine, endCol]` half-open ranges. The handler's per-occurrence pass uses `byteOffsetInsideAnyRegion(offset, regions)` to test whether to skip — region-aware skipping is a single boolean fold over the regions for each candidate match.

- **R3 — Line-scoped regex evaluation**: for each note, split into lines preserving the line-ending byte sequences ON A SEPARATE TRACK (the byte-level original is retained for byte-for-byte preservation per FR-015). For each line, run the predicate against the line content (without trailing `\r`/`\n` for the regex engine, parity with BI-037 FR-005 / BI-035 FR-012). Iterate matches via `RegExp.prototype.exec` with the `g` flag (or `String.prototype.matchAll`) and skip zero-width matches (`match.index === match.index + match[0].length`, parity with BI-037 FR-016). For each non-skipped match, check region-awareness via R2's helper. Compute `replacement_substring` via `String.prototype.replace` (regex mode honours `$1` / `$&` / `$$` ECMAScript semantics; literal mode replaces the matched substring with the raw replacement string verbatim per FR-002).

- **R4 — Drift-check semantics**: at commit time, re-run the preview scan in full (same FR-008 subfolder, same FR-006 / FR-007 region opt-ins, same FR-019 case-sensitivity, same FR-020 eligible-file filter) and count occurrences. Compare to the preview-time count carried in the commit request envelope. Decision: **the commit request schema does NOT require the caller to echo the preview-time count.** Instead, the handler runs preview-scan TWICE on the commit code path — once to compute the preview-time count under the current vault state, then writes that count alongside the actual rewrite. Drift detection compares the second-scan count against the first-scan count of the same invocation; when these differ, a write between the two reads has been observed. Trades two scans per commit for caller-shape simplicity. Spec FR-012's "preview-time vs commit-time" is reinterpreted as "two snapshots within the commit invocation" — the spec's contract is preserved (drift detection blocks silent divergence) without coupling to a stateful client.

- **R5 — Upper-bound env-var parsing**: read `OBSIDIAN_FIND_REPLACE_MAX_OCCURRENCES` from `process.env` lazily on first handler call (NOT at server boot — keeps the lazy pattern uniform with `resolveVaultPath`'s lazy cache and avoids early-startup ordering coupling). Parse via `Number.parseInt(value, 10)`; reject any non-integer-positive value as "invalid" and fall back to default 500. Cache the resolved value in module-scope state — env-var changes after the first invocation do NOT propagate (parity with the `OBSIDIAN_BIN` env-var convention). Log the resolved value via the project logger at INFO level on first read.

- **R6 — Replacement-substring application**: in `regex` mode the handler invokes `String.prototype.replace(regex, replacement)` on the matched substring portion of the line; this gives ECMAScript replacement-string semantics for free per FR-002. In `literal` mode the handler splices the replacement string in verbatim with no metacharacter interpretation. The same path is used for both preview's `replacement_substring` field and commit's actual rewrite — single source of truth per Principle I.

- **R7 — Path-safety integration**: reuse `isStructurallySafePath` from `src/path-safety/schema.ts` at the zod `superRefine` boundary for the subfolder argument; reuse `checkCanonicalPath` from `src/path-safety/canonical.ts` at the handler entry for the resolved subfolder + at the per-note write path. The same helpers are already exercised by write_note's test suite — no new path-safety logic added.

- **R8 — Queue dep wiring**: handler signature is `executeFindAndReplace(input, deps)` where `deps: ExecuteDeps` includes `{ fs, realpath, randomUUID, env, queue, resolveVaultPath, logger }`. Production wiring at `server.ts` passes `createQueue()`, `process.env`, real `fs` from `node:fs/promises`, real `fs.realpath`, real `randomUUID` from `node:crypto`, real `resolveVaultPath`, the bound `logger`. Test wiring at handler.test.ts passes mocked equivalents — the in-memory `fs` shape used by the existing write_note test suite is reused. Per-note `queue.run(() => write...)` mirrors write_note's pattern.

- **R9 — Eligible-file filter implementation**: directory walk via `fs.readdir(path, { withFileTypes: true })` recursive walk; skip any `Dirent` whose `name` starts with `.` (a single character check), skip any non-`.md` file via `path.toLowerCase().endsWith(".md")` (case-insensitive on extension per FR-020). The subfolder constraint is applied at the walk-root level — `fs.readdir` is invoked from the resolved subfolder, NOT from the vault root, so the per-file filter is uniform.

- **R10 — T0 live-FS probe plan**: documented in research.md. Five probes against the authorised test vault: (a) preview against a known multi-note pattern, verify mtimes unchanged and per-occurrence counts match; (b) commit the same, verify on-disk contents match the preview's proposed changes; (c) commit with mixed CRLF/LF source notes, verify line endings preserved per-file (FR-015); (d) attempt subfolder argument `../escape` and verify schema-level path-traversal rejection; (e) attempt commit that exceeds the upper bound, verify refusal and no-modification invariant. T0 happens at `/speckit-implement` time per CLAUDE.md `## Test Execution`.

## Phase 1: Design & Contracts

**Prerequisites**: research.md complete (Phase 0).

Phase 1 outputs:

1. **[data-model.md](data-model.md)** — entity shapes derived from FR-001..FR-025. Eight entities: `FindAndReplaceInput` (the validated request), `FindAndReplacePreviewOutput` (the `mode: "preview"` branch), `FindAndReplaceCommitOutput` (the `mode: "commit"` branch), `FindAndReplaceOutput` (the discriminated union — FR-025), `Occurrence` (the per-occurrence shape — FR-004), `AffectedNote` (the per-note container — FR-004), `Region` (internal — the half-open `[startLine, startCol, endLine, endCol]` range emitted by `fence-scan.ts` and `region-scan.ts`), and `ResolvedScope` (internal — the post-resolution `{ vaultRoot, scanRoot }` pair after vault registry + path-safety checks). Each carries field names, types, validation rules, and the FR it traces to.

2. **[contracts/input.md](contracts/input.md)** — input schema documented as an MCP-tool-input contract: field-by-field shape, validation rules, defaults, examples. Mirrors the zod definition in `schema.ts` (the source of truth per Principle III). Includes the path-traversal refinement on `subfolder` and the regex-syntax refinement on `pattern` in regex mode.

3. **[contracts/output.md](contracts/output.md)** — output schema documented as the discriminated-union wire-shape contract callers receive. Field-by-field for the preview branch (`mode: "preview"`, `affected_notes`, `total_occurrences`) AND the commit branch (`mode: "commit"`, `changed_notes`, `total_occurrences_replaced`, `partial`). Includes the path-ascending ordering invariant (FR-004 / FR-005), the per-occurrence shape (FR-004), and the `partial: true` + `failing_note_locator` extension when an `FS_WRITE_FAILED` halts the batch mid-write.

4. **[contracts/errors.md](contracts/errors.md)** — twelve-discriminator error envelope cohort. Each row in the table is a `(top-level code, details.code, details.reason)` triple, the FR that defines it, the gate that detects it (zod schema vs path-safety helper vs vault registry vs handler precondition vs FS write), and an example envelope. All twelve discriminators REUSE existing top-level codes; the eleven-tool zero-new-top-level-codes streak (Constitution Principle IV) is preserved.

5. **[quickstart.md](quickstart.md)** — manual quickstart scenarios against the authorised test vault per CLAUDE.md `## Test Execution`. Covers six canonical journeys: (1) preview → confirm → commit for an ADR-rename refactor, (2) skip-defaults respected for embedded code samples, (3) opt-in include-code-blocks for a deliberate rename of a symbol that appears in code, (4) subfolder scope narrows the blast radius, (5) bound-exceeded refusal for a too-broad pattern, (6) drift detection refuses a stale commit.

6. **Agent context update** — rotate the active-plan reference between the `<!-- SPECKIT START -->` / `<!-- SPECKIT END -->` markers in [CLAUDE.md](../../CLAUDE.md) from `specs/037-pattern-search/plan.md` to `specs/038-find-replace/plan.md`. Single-line edit; committed separately per the project convention for narrative rotations (see commit 470ba70 precedent).

After Phase 1, re-evaluate Constitution Check.

### Re-evaluation post-Phase-1

The Phase-1 artifacts surface the same gate alignments documented above. No principle escalates from Y to N during Phase 1. ADR-015 remains Y (the new sub-states `details.reason: "empty"` and `details.reason: "too-long"` under `INVALID_PATTERN`, plus the `details.reason: "path-traversal"` under `INVALID_SUBFOLDER`, are documented in `contracts/errors.md` per the ADR-015 §Format requirement that each `(code, reason)` pair be enumerated in the per-tool docs). ADR-010 / ADR-013 / ADR-014 remain N/A under the direct-FS design.

The one design choice that could have escalated a gate — the drift-check architecture — was deliberately routed through two scans within a single commit invocation (R4) rather than asking the caller to echo a preview-time count, which would have introduced a stateful client coupling and a new schema field. Principle III is preserved (single source of truth at the input schema), Principle IV is preserved (the drift discriminator `OCCURRENCE_COUNT_DRIFT` is under the existing `VALIDATION_ERROR` top-level), and the agent's contract from spec FR-012 (drift detection blocks silent divergence) is honoured.

**Post-Phase-1 gate result**: PASS. Ready for `/speckit-tasks`.

## Complexity Tracking

No constitution-violation entries. The plan passes every gate with Y or N/A.
