# Handler Contract — list_files

The handler's runtime invariants: deps shape, per-mode `invokeCli` call shape (always ONE), the filter pipeline, the sort algorithm, failure propagation, and the test-seam pattern.

## Handler signature

```ts
import { invokeCli, type SpawnLike } from "../../cli-adapter/cli-adapter.js";
import type { ListFilesInput, ListFilesOutput } from "./schema.js";
import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";

export interface ExecuteDeps {
  logger: Logger;
  queue: Queue;
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
}

export async function executeListFiles(
  input: ListFilesInput,
  deps: ExecuteDeps,
): Promise<ListFilesOutput>;
```

The `deps` shape matches the convention established by the post-011 typed tools. `spawnFn` is the test seam; absent in production. `env` is the test seam for environment-dependent paths.

## Per-mode invokeCli call shape — ALWAYS ONE spawn (R13)

The handler emits exactly ONE `invokeCli` call per request regardless of `target_mode` or input parameters. Argv assembly:

```ts
const parameters: Record<string, string> = {};
if (input.folder !== undefined) parameters.folder = input.folder;
if (input.ext !== undefined) parameters.ext = input.ext;

const result = await invokeCli(
  {
    command: "files",
    vault: input.vault,           // undefined in active mode → cli-adapter omits from argv
    parameters,                   // folder / ext if present; else empty
    flags: [],                    // CLI's `total` flag intentionally NOT included (R7)
    target_mode: input.target_mode,
  },
  deps
);
```

The cli-adapter performs:
1. `target_mode: "active"` path → `stripTargetLocators(parameters)` defence-in-depth strip of any leaked `vault` / `file` / `path` keys (no-op for `list_files` because schema rejects those keys at validation).
2. argv prefix assembly: `[<binary>, "vault=<v>", "files"]` (specific) or `[<binary>, "files"]` (active).
3. argv parameter appends: `["folder=<f>", "ext=<e>"]` for whichever of `folder` / `ext` are present.
4. Queue-wrapped child_process.spawn with 10 s timeout, 10 MiB stdout cap.
5. Stdout / stderr capture; non-zero exit → `UpstreamError(CLI_NON_ZERO_EXIT)`; stdout `Vault not found.` → re-classified to `UpstreamError(CLI_REPORTED_ERROR)`; stdout `Error: …` → `UpstreamError(CLI_REPORTED_ERROR)`.

## Stdout parsing (R16)

```ts
function parseStdout(stdout: string): string[] {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
```

Handles:
- Trailing newline (every CLI response per F3): final empty element dropped.
- Carriage returns (`\r`): trim eats them if a future CLI version emits CRLF.
- Empty stdout (missing folder, empty folder, folder-names-a-file per FR-010 conflation): parses to `[]`.
- Multiple consecutive newlines: empty lines dropped.

## Filter pipeline (R9)

After parsing stdout, apply four wrapper-side filters and one sort in sequence:

```ts
function processResults(
  rawPaths: string[],
  folder: string | undefined,
): string[] {
  const folderComponentCount = folder
    ? folder.split("/").filter(Boolean).length
    : 0;
  const expectedComponents = folderComponentCount + 1;

  return rawPaths
    .filter((p) => !isFolderEntry(p))                                  // FR-026 defence-in-depth
    .filter((p) => !hasDotPrefixedComponent(p))                        // FR-028 dotfile filter
    .filter((p) => p.split("/").filter(Boolean).length === expectedComponents)   // R6 non-recursive
    .sort((a, b) => Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8")));  // R8 / FR-027
}
```

### Filter predicates

```ts
function isFolderEntry(path: string): boolean {
  return path.endsWith("/") || path.endsWith("\\");
}

function hasDotPrefixedComponent(path: string): boolean {
  return path.split("/").some((segment) => segment.startsWith("."));
}
```

### Filter ordering

The three filters commute (R9). Order chosen for engine-friendliness:

1. **Sub-folder filter** (FR-026 — F19 says CLI never emits these; defence-in-depth).
2. **Dotfile filter** (FR-028 — F18 says CLI already filters dotfiles; defence-in-depth).
3. **Non-recursive filter** (R6 — load-bearing because F2 confirmed CLI is recursive).

Tests assert each filter independently by synthesising stdout that the live CLI doesn't currently emit (e.g. paths ending in `/` for FR-026; paths starting with `.` for FR-028).

## Response composition (R7)

```ts
const filtered = processResults(parseStdout(result.stdout), input.folder);
const count = filtered.length;
const paths = input.total === true ? [] : filtered;
return { count, paths };
```

**Invariants**:
- `count` is the filtered count in BOTH modes (FR-007 / SC-005 — identical regardless of `total`).
- `paths` is empty on `total: true` (FR-007), populated on `total: false` (or omitted).
- `count === paths.length` on the `total: false` branch (FR-009).

## Failure propagation chain

```
                       ┌─────────────────────────────────┐
                       │  executeListFiles(input, deps)  │
                       └────────────────┬────────────────┘
                                        │
                       ┌────────────────▼────────────────┐
                       │  invokeCli({ command: "files",  │
                       │  vault, parameters, flags: [],  │
                       │  target_mode }, deps)           │
                       └────────────────┬────────────────┘
                                        │
                       ┌────────────────▼────────────────┐
                       │  dispatchCli — argv assembly,   │
                       │  spawn, 10s/10MiB bounds,       │
                       │  four-priority error classifier │
                       └────────────────┬────────────────┘
                                        │
                ┌──────────────┬────────┴────────┬──────────────┐
                │              │                 │              │
       ┌────────▼─────┐ ┌──────▼─────┐ ┌─────────▼────────┐ ┌───▼──────────┐
       │ Success path │ │ Vault not  │ │ Non-zero exit /  │ │ Binary not   │
       │ raw stdout   │ │ found at   │ │ output cap /     │ │ found        │
       │              │ │ stdout     │ │ timeout          │ │              │
       └────┬─────────┘ └──────┬─────┘ └────────┬─────────┘ └───┬──────────┘
            │                  │                │               │
            │           ┌──────▼─────────────┐  │               │
            │           │ 011-R5 inspection  │  │               │
            │           │ → CLI_REPORTED_ERR │  │               │
            │           └──────┬─────────────┘  │               │
            │                  │                │               │
            │                  │       ┌────────▼─────────┐ ┌───▼──────────┐
            │                  │       │ CLI_NON_ZERO_EXIT│ │ CLI_BINARY_  │
            │                  │       │ (or specific     │ │ NOT_FOUND    │
            │                  │       │ subtype)         │ │              │
            │                  │       └────────┬─────────┘ └───┬──────────┘
            │                  │                │               │
            ▼                  ▼                ▼               ▼
   ┌──────────────────────────────────────────────────────┐
   │ parseStdout → filter pipeline → sort → compose       │
   │ response { count, paths }; OR re-throw UpstreamError │
   │ unmodified up the call stack via the registerTool    │
   │ factory's catch-and-serialise wrapper                │
   └──────────────────────────────────────────────────────┘
```

### Per-failure-class invariants

- **Validation errors (`VALIDATION_ERROR`)**: produced by `registerTool`'s wrapping `schema.parse` BEFORE `executeListFiles` runs. The handler never sees invalid input.
- **CLI failures (`CLI_*`, `ERR_*`)**: produced by the cli-adapter; the handler propagates by re-throwing whatever `invokeCli` throws.
- **The handler itself never throws a non-UpstreamError**: there are no parsing failures that can throw — `parseStdout` is total over any string; filter predicates are total over any string array; sort is total. The only way to escape `executeListFiles` non-success is via an `UpstreamError` thrown by `invokeCli`.

## Argv shape — exhaustive table

| Input | Argv after cli-adapter assembly |
|---|---|
| `{ target_mode: "specific", vault: "V" }` | `[obsidian, "vault=V", "files"]` |
| `{ target_mode: "specific", vault: "V", folder: "F" }` | `[obsidian, "vault=V", "files", "folder=F"]` |
| `{ target_mode: "specific", vault: "V", folder: "F", ext: "E" }` | `[obsidian, "vault=V", "files", "folder=F", "ext=E"]` |
| `{ target_mode: "specific", vault: "V", ext: "E" }` | `[obsidian, "vault=V", "files", "ext=E"]` |
| `{ target_mode: "specific", vault: "V", folder: "F", total: true }` | `[obsidian, "vault=V", "files", "folder=F"]` (NO total flag — R7) |
| `{ target_mode: "active" }` | `[obsidian, "files"]` |
| `{ target_mode: "active", folder: "F" }` | `[obsidian, "files", "folder=F"]` |
| `{ target_mode: "active", folder: "F", ext: "E", total: true }` | `[obsidian, "files", "folder=F", "ext=E"]` (NO total flag) |

Note: the parameter order in argv is determined by the cli-adapter's argv assembly logic (insertion order from `parameters` keys). Tests assert presence and value, not strict positional order, to remain robust against cli-adapter changes.

## Helper function contracts

### `parseStdout(stdout: string): string[]`

- **Pre**: `stdout` is any string (typically CLI stdout — may be empty, may have trailing newline, may have CRLF mixed).
- **Post**: returns an array of non-empty trimmed strings, in the order they appeared in stdout.
- **Total**: never throws.

### `isFolderEntry(path: string): boolean`

- **Pre**: `path` is any string.
- **Post**: returns `true` iff `path` ends with `/` or `\`.
- **Total**: never throws.

### `hasDotPrefixedComponent(path: string): boolean`

- **Pre**: `path` is any string.
- **Post**: returns `true` iff any `/`-separated segment of `path` begins with `.`.
- **Total**: never throws.
- **Edge cases**:
  - Empty string → `[""].some(s => s.startsWith("."))` → `false`.
  - `".gitignore"` (no slashes) → `true`.
  - `"folder/.hidden.md"` → `true` (second segment).
  - `".obsidian/app.json"` → `true` (first segment).

### `isDirectChildOfFolder(path, folder)`

(Inlined in the filter pipeline; same semantics.)

- **Pre**: `path` is any non-empty string; `folder` is `string | undefined`.
- **Post**: returns `true` iff `path`'s component count (after `.filter(Boolean)`) equals `folder.split("/").filter(Boolean).length + 1` (or `1` when `folder` is undefined).
- **Total**: never throws.

### Sort comparator

```ts
(a: string, b: string) =>
  Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"))
```

- Returns negative integer if `a` sorts before `b` in UTF-8 byte order.
- Returns positive if `b` sorts before `a`.
- Returns 0 only when `a === b` byte-for-byte.
- **For BMP-only paths**: equivalent to JavaScript's default `<`/`>` string compare.
- **For non-BMP paths**: differs from JavaScript's default (which uses UTF-16 code-unit order).

## Test seam pattern

```ts
import { describe, it, expect, vi } from "vitest";
import { executeListFiles } from "./handler.js";
import { makeFakeChild } from "../../test-helpers/spawn-stub.js"; // or wherever the project keeps this

describe("executeListFiles — specific mode happy path", () => {
  it("emits one spawn with correct argv and returns sorted paths", async () => {
    const spawnFn = vi.fn().mockReturnValue(makeFakeChild({
      stdout: "Inbox/b.md\nInbox/a.md\nInbox/c.md\n",
      exit: 0,
    }));

    const result = await executeListFiles(
      { target_mode: "specific", vault: "Demo", folder: "Inbox" },
      { logger: makeLogger(), queue: makeQueue(), spawnFn }
    );

    expect(spawnFn).toHaveBeenCalledTimes(1);
    const argv = spawnFn.mock.calls[0][1];
    expect(argv).toEqual(expect.arrayContaining(["vault=Demo", "files", "folder=Inbox"]));
    expect(argv).not.toContain("total"); // R7 — wrapper never passes total to CLI

    expect(result).toEqual({
      count: 3,
      paths: ["Inbox/a.md", "Inbox/b.md", "Inbox/c.md"], // lex-sorted (input was unsorted)
    });
  });
});
```

### Synthetic stdout fixtures (for defence-in-depth filter tests)

The live CLI does NOT emit:
- Sub-folder entries (F19).
- Dot-prefixed paths (F18).

To exercise FR-026 and FR-028 in unit tests, the spawn-stub injects synthetic stdout that includes such paths:

```ts
// Synthetic stdout to verify FR-026
spawnFn.mockReturnValue(makeFakeChild({
  stdout: "Inbox/a.md\nInbox/Sub/\nInbox/b.md\n",
  exit: 0,
}));
// Assert: result.paths = ["Inbox/a.md", "Inbox/b.md"]; Inbox/Sub/ filtered.

// Synthetic stdout to verify FR-028
spawnFn.mockReturnValue(makeFakeChild({
  stdout: "Inbox/a.md\nInbox/.hidden.md\nInbox/b.md\n",
  exit: 0,
}));
// Assert: result.paths = ["Inbox/a.md", "Inbox/b.md"]; Inbox/.hidden.md filtered.
```

The unit-test suite is the contract enforcement for the defence-in-depth filters; the live CLI characterisation pass (T0 of /speckit-implement) confirms the underlying CLI does NOT cause these filters to trigger in production.

## Single-spawn invariant — verified by every handler test

Every handler test ends with:

```ts
expect(spawnFn).toHaveBeenCalledTimes(1);
```

The invariant is load-bearing for R13 / FR-014 — validation errors emit zero spawns; valid inputs emit exactly one. The cli-adapter's queue serialises across requests (010-target-mode-schema invariant), so concurrency does not affect per-request spawn count.
