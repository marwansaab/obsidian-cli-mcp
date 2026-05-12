# Data Model — List Files

Schema shapes, per-mode argv mapping, filter pipeline, per-tool invariants ↔ FR mapping, module layout, test inventory.

## Input schema (zod, single source of truth per Constitution III)

```ts
// Reuses targetModeBaseSchema + applyTargetModeRefinement from src/target-mode/.
// list_files is folder-scoped: the file-scoped locator fields (`file` / `path`)
// MUST be forbidden in both target modes — this differs from every prior typed
// tool which used the file-XOR-path locator rule. Implementation detail at R15
// in research.md.

const listFilesInputSchema = applyTargetModeRefinementForFolderScoped(
  z.object({
    target_mode: z.enum(["specific", "active"]),
    vault: z.string().min(1).optional(),
    folder: z.string().min(1).optional(),     // R15 — empty string rejected
    ext: z.string().min(1).optional(),        // R15 — empty string rejected
    total: z.boolean().optional(),            // FR-007 default false in handler
  }).strict()                                 // FR-008 — additionalProperties:false
);
```

The folder-scoped refinement (introduced by this feature; planning-phase decision per the spec's Assumptions) layers on top of the existing `targetModeBaseSchema` from `src/target-mode/`. The refinement:

- In `target_mode: "specific"`: requires `vault`; forbids `file` and `path` (the folder-scoped surface has no file locator).
- In `target_mode: "active"`: forbids `vault`, `file`, and `path` (consistent with prior typed tools).

The implementation MAY:
1. Add a new helper `applyTargetModeRefinementForFolderScoped` in `src/target-mode/` that parallels `applyTargetModeRefinement` but enforces the no-file-no-path rule in both modes.
2. OR inline the refinement via a local `superRefine` in `src/tools/list_files/schema.ts` if the precedent feature pattern strongly favours per-tool local refinement.

The pick is a /speckit-tasks decision (T-task to be enumerated); both implementations satisfy Constitution III. The recommended pick is (1) because the folder-scoped target-mode pattern may recur and a shared helper is more reusable; the deferred decision is a Tier-1 task at implementation time.

## Output schema

```ts
const listFilesOutputSchema = z.object({
  count: z.number().int().nonnegative(),
  paths: z.array(z.string()),
}).strict();

type ListFilesOutput = z.infer<typeof listFilesOutputSchema>;
```

Two fields, strict. The two branches of `total` produce different `paths` payloads but the same SHAPE:

- `total: false` (or omitted) → `{ count: N, paths: [<N vault-relative path strings>] }`
- `total: true` → `{ count: N, paths: [] }`

The `count` value is identical across both branches (R7 / FR-007).

## Per-mode CLI argv mapping

| `target_mode` | `vault` | `folder` | `ext` | invokeCli input |
|---|---|---|---|---|
| `"specific"` | `"V"` | `"F"` | `"E"` | `{ command: "files", vault: "V", parameters: { folder: "F", ext: "E" }, flags: [], target_mode: "specific" }` |
| `"specific"` | `"V"` | `"F"` | undefined | `{ command: "files", vault: "V", parameters: { folder: "F" }, flags: [], target_mode: "specific" }` |
| `"specific"` | `"V"` | undefined | undefined | `{ command: "files", vault: "V", parameters: {}, flags: [], target_mode: "specific" }` |
| `"active"` | undefined | `"F"` | `"E"` | `{ command: "files", parameters: { folder: "F", ext: "E" }, flags: [], target_mode: "active" }` |
| `"active"` | undefined | undefined | undefined | `{ command: "files", parameters: {}, flags: [], target_mode: "active" }` |

The cli-adapter assembles argv as `[<binary>, "vault=V", "files", "folder=F", "ext=E"]` (specific) or `[<binary>, "files", "folder=F", "ext=E"]` (active, after `stripTargetLocators` removes any leaked locator). The CLI's `total` flag is NOT included (R7).

## Filter pipeline (handler-side, post-CLI-fetch)

The handler applies four filters and one sort in sequence (R9 — order is observably commutative; the sequence below is implementation-chosen for engine-friendliness):

```
CLI raw stdout
  → split lines + trim + filter empty   (R16 — parseStdout)
  → filter sub-folder entries           (FR-026; predicate: path ends with "/")
  → filter dotfile entries              (FR-028; predicate: any "/" segment starts with ".")
  → filter non-recursive                (R6; predicate: component count check)
  → lexical sort                        (R8 / FR-027; UTF-8 byte compare via Buffer.compare)
  → maybe-discard-paths                 (R7; on total: true, omit paths from response)
  → set count = filtered.length         (R7 / FR-009)
```

### Non-recursive filter predicate (R6)

```ts
function isDirectChildOfFolder(path: string, folder: string | undefined): boolean {
  const expectedComponentCount = folder
    ? folder.split("/").filter(Boolean).length + 1
    : 1;
  const actualComponentCount = path.split("/").filter(Boolean).length;
  return actualComponentCount === expectedComponentCount;
}
```

`.filter(Boolean)` collapses any accidental empty segments (handles a hypothetical `folder=A//B` shape from a confused caller).

### Sub-folder filter predicate (FR-026)

```ts
function isFolderEntry(path: string): boolean {
  return path.endsWith("/") || path.endsWith("\\");
}
```

Defence-in-depth (Plan-amendment-2). F19 confirms the live CLI never emits sub-folder entries; the filter is structurally fast and protects against CLI version drift.

### Dotfile filter predicate (FR-028)

```ts
function hasDotPrefixedComponent(path: string): boolean {
  return path.split("/").some((segment) => segment.startsWith("."));
}
```

The rule is uniform across every path segment, NOT special-cased for the caller's `folder` input. Direct consequence per the spec's Q5 clarification: `folder: ".obsidian"` returns `{ count: 0, paths: [] }` because every result path's first segment is `.obsidian` (starts with `.`).

### Sort (R8 / FR-027)

```ts
function lexicalSortPaths(paths: string[]): string[] {
  return paths.slice().sort((a, b) =>
    Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"))
  );
}
```

Returns a NEW array. UTF-8 byte-compare semantics; differs from JavaScript's default `<`/`>` string compare for non-BMP characters.

## Per-tool invariants ↔ FR mapping

| Invariant | FRs |
|---|---|
| Output shape is `{ count, paths }` strict | FR-009 / FR-011 |
| `count === paths.length` on `total: false`; `count === filtered.length` AND `paths === []` on `total: true` | FR-007 / FR-009 |
| Vault-root listing when `folder` omitted | FR-005 |
| Missing folder / empty folder / folder-names-a-file all return `{ count: 0, paths: [] }` | FR-010 |
| Non-recursive (direct children only) | FR-012 / R6 |
| Sub-folder entries dropped from `paths` | FR-026 / R9 (defence-in-depth — F19) |
| Dotfile entries dropped from `paths` (any component begins with `.`) | FR-028 / R9 (defence-in-depth — F18) |
| Lexical UTF-8 byte-compare sort | FR-027 / R8 |
| Validation rejects: missing `vault` in specific; `vault`/`file`/`path` in active; `file`/`path` in any mode; unknown top-level keys; bad `total` type; empty-string `folder` or `ext` | FR-003 / FR-004 / FR-008 / FR-014 / R15 |
| All validation failures rejected BEFORE any CLI invocation | FR-014 / R13 |
| `folder` / `ext` passed as discrete argv parameters | FR-015 |
| `folder` with trailing slash equivalent to without | FR-013 (CLI-normalised per F4) |
| Path-traversal returns empty / contained at CLI | FR-016 (CLI-confined per F15 / F16 / F17) |
| Unknown vault → `CLI_REPORTED_ERROR` | FR-017 (011-R5 inheritance) |
| Active-mode no-focused-vault → structured error | FR-018 |
| Output-cap → structured error (BOTH modes — Plan-amendment-1) | FR-019 |
| Zero new error codes | FR-020 / Constitution IV |
| Registered via existing `registerTool` factory | FR-021 |
| All public-surface behaviour locked by ≥1 regression test | FR-022 / SC-015 |
| 15-case live-CLI characterisation: 18 verified live + 3 deferred to T0 | FR-023 (per the characterisation roster in research.md) |
| Zero changes to existing typed-tool public surface | FR-024 / SC-013 |
| `Original — no upstream.` header on every new source file | FR-025 / Constitution V |

## Module layout (LOC budget)

```
src/tools/list_files/
├── schema.ts            ~60 LOC   listFilesInputSchema + listFilesOutputSchema + types
├── schema.test.ts       ~250 LOC  ~18 cases (target-mode + folder/ext + total + unknown-key)
├── handler.ts           ~120 LOC  executeListFiles + parseStdout + filter predicates + sort
├── handler.test.ts      ~520 LOC  ~28 cases (per-mode happy + per-filter rejection + total flag + error propagation + argv shape + sort ordering)
├── index.ts             ~25 LOC   createListFilesTool factory via registerTool
└── index.test.ts        ~150 LOC  5 registration cases
```

Plus:
- `src/target-mode/target-mode.ts` — possibly extended with `applyTargetModeRefinementForFolderScoped` (small helper, ~30 LOC if the design pick at /speckit-tasks lands on the shared-helper approach). Includes co-located test additions if so.
- `src/server.ts` — +2 lines (import + `createListFilesTool({ logger, queue })` entry in the alphabetised `tools` array, between `createHelpTool` and `createObsidianExecTool`).
- `docs/tools/list_files.md` — new ~250-line doc per FR-021.
- `docs/tools/index.md` — +1 line entry per existing convention.
- `package.json` — description string updated.
- `CHANGELOG.md` — +1 entry.
- `CLAUDE.md` — plan-pointer updated (Phase 1 step 3).

**Net new source LOC**: ~205 across three source files (schema / handler / index).
**Net new test LOC**: ~920 across three co-located test files.
**Net new docs**: ~250 lines.

## Test inventory — 51 cases total (SC-015 floor is 30)

### Schema tests (`schema.test.ts`) — 18 cases

| # | Case |
|---|---|
| 1 | Specific mode + vault + folder + ext → parses |
| 2 | Specific mode + vault, no folder, no ext → parses (vault-root listing) |
| 3 | Active mode, no vault → parses |
| 4 | Active mode + folder + ext + total → parses |
| 5 | Specific mode without vault → validation error |
| 6 | Active mode with vault → validation error |
| 7 | Any mode with `file` → validation error |
| 8 | Any mode with `path` → validation error |
| 9 | Active mode with `path` → validation error |
| 10 | Active mode with `file` → validation error |
| 11 | Unknown top-level key (`foo: "bar"`) → validation error |
| 12 | `target_mode` outside enum (`"nope"`) → validation error |
| 13 | `total: "true"` (string, not boolean) → validation error |
| 14 | `total: 1` (number) → validation error |
| 15 | `folder: ""` → validation error (R15) |
| 16 | `ext: ""` → validation error (R15) |
| 17 | `folder` is non-string (e.g. array) → validation error |
| 18 | `ext` is non-string → validation error |

### Handler tests (`handler.test.ts`) — 28 cases

| # | Case | Spawns |
|---|---|---|
| 1 | Specific + folder + ext: argv shape correct (`vault=V files folder=F ext=E`) | 1 |
| 2 | Specific + folder, no ext: argv shape (`vault=V files folder=F`) | 1 |
| 3 | Specific, no folder: argv shape (`vault=V files`) | 1 |
| 4 | Active + folder: argv shape (`files folder=F`, no vault) | 1 |
| 5 | Active, no folder, no ext: argv shape (`files`) | 1 |
| 6 | Stdout of 3 paths → response `{ count: 3, paths: [3 lex-sorted] }` | 1 |
| 7 | Stdout of unsorted paths → response is lex-sorted (UTF-8 byte compare) | 1 |
| 8 | Stdout containing non-BMP character → sort uses UTF-8 byte order (differs from UTF-16 default) | 1 |
| 9 | Stdout empty → response `{ count: 0, paths: [] }` (missing folder) | 1 |
| 10 | Stdout single trailing newline → parses as empty (R16) | 1 |
| 11 | Stdout with empty lines mixed → parses with empties dropped (R16) | 1 |
| 12 | Recursive stdout (CLI returned both direct + sub-folder paths) → non-recursive filter drops sub-folder paths | 1 |
| 13 | Sub-folder entry in stdout (path ending `/`) → dropped by FR-026 filter | 1 |
| 14 | Dotfile entry in stdout (filename starting `.`) → dropped by FR-028 filter | 1 |
| 15 | Path with dot-prefixed sub-component → dropped by FR-028 filter (any segment) | 1 |
| 16 | `folder: ".obsidian"` + mocked stdout of result paths → response `{ count: 0, paths: [] }` (every result has dot-prefixed first segment) | 1 |
| 17 | `total: true` + stdout of 5 paths → response `{ count: 5, paths: [] }` | 1 |
| 18 | `total: false` + same fixture → response `{ count: 5, paths: [5 paths] }` (count matches `total: true`) | 1 |
| 19 | `total: true` + ext filter + stdout filtered → response `{ count: <filtered>, paths: [] }` | 1 |
| 20 | Vault-root listing (no folder): non-recursive filter computes threshold from "1" | 1 |
| 21 | CLI returns `Vault not found.` (R5 inheritance) → `UpstreamError(CLI_REPORTED_ERROR)` | 1 |
| 22 | CLI returns generic `Error: …` → `UpstreamError(CLI_REPORTED_ERROR)` | 1 |
| 23 | CLI binary not found → `UpstreamError(CLI_BINARY_NOT_FOUND)` | 1 |
| 24 | CLI non-zero exit → `UpstreamError(CLI_NON_ZERO_EXIT)` | 1 |
| 25 | Active mode, no focused vault → `UpstreamError(ERR_NO_ACTIVE_FILE)` (or CLI-classifier equivalent) | 1 |
| 26 | Trailing slash on `folder` passed through verbatim (CLI normalises per F4) | 1 |
| 27 | Path-traversal `folder=../../etc` passed through verbatim (CLI confines per F15) | 1 |
| 28 | Output-cap exceeded → `UpstreamError(CLI_NON_ZERO_EXIT)` (inherits cli-adapter's cap-exceeded mapping) | 1 |

### Registration tests (`index.test.ts`) — 5 cases

| # | Case |
|---|---|
| 1 | `createListFilesTool({ logger, queue })` returns descriptor with `name: "list_files"` |
| 2 | Descriptor's `inputSchema` is the stripped (description-free) JSON Schema per ADR-005 |
| 3 | The help tool's tool-list output includes `list_files` |
| 4 | `docs/tools/list_files.md` exists (covered by the `assertToolDocsExist` aggregator at server boot — registration test asserts the file is present) |
| 5 | Registered tool participates in the `_register.test.ts` drift-detector's parameterised registry walk |

**Total**: 18 + 28 + 5 = **51 tests** (SC-015 floor: 30 — comfortably exceeded).

## Test seam pattern

Per the cli-adapter convention, handler tests inject a fake `spawnFn` via `deps.spawnFn`. Each list_files request emits exactly ONE spawn (R13). Test pattern:

```ts
const spawnFn = vi.fn().mockReturnValue(makeFakeChild({ stdout: "Inbox/a.md\nInbox/b.md\n", exit: 0 }));
const result = await executeListFiles(
  { target_mode: "specific", vault: "Demo", folder: "Inbox" },
  { logger, queue, spawnFn }
);
expect(spawnFn).toHaveBeenCalledTimes(1);
expect(spawnFn).toHaveBeenCalledWith(/* binary */, expect.arrayContaining(["vault=Demo", "files", "folder=Inbox"]), /* opts */);
expect(result).toEqual({ count: 2, paths: ["Inbox/a.md", "Inbox/b.md"] });
```

The `spawnFn` mock allows the test suite to:
- Synthesise CLI stdout with shapes the live CLI doesn't currently emit (sub-folder entries, dotfile paths) — exercising FR-026 / FR-028's defence-in-depth filters.
- Synthesise output-cap failures without authoring a real ~200K-file fixture (Plan-amendment-1 SC-012 verification).
- Synthesise non-BMP character paths for the sort test (#8).

The live CLI characterisation (FR-023) is exercised separately in T0 of `/speckit-implement` — not in the unit-test suite per the project's test-scope memory (`feedback_test_scope.md`).
