# Contract — `delete_note` Handler

**Feature**: [012-delete-note](../spec.md)
**Date**: 2026-05-08

This document is the public contract for `executeDeleteNote(input, deps)` — the handler function that powers the `delete_note` MCP tool. It captures the dependency shape, the `invokeCli` call invariants, the argv-mapping rules, the success-response parsing, the structural `toTrash` derivation, and the failure propagation chain.

---

## Signature

```ts
// src/tools/delete_note/handler.ts
import { invokeCli, type SpawnLike } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../../errors.js";
import type { DeleteNoteInput, DeleteNoteOutput } from "./schema.js";
import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";

export interface ExecuteDeps {
  logger: Logger;
  queue: Queue;
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
}

export async function executeDeleteNote(
  input: DeleteNoteInput,
  deps: ExecuteDeps,
): Promise<DeleteNoteOutput>;
```

The deps shape mirrors `executeReadNote` / `executeWriteNote` exactly. `spawnFn` and `env` are test seams (per [research.md R7](../research.md)); `logger` and `queue` are the production wiring (passed by `src/server.ts` from the shared `createServer` setup).

---

## Invariants

### Pre-condition: input is parsed and validated

The handler trusts its `input` parameter. It MUST NOT re-parse against the schema, MUST NOT defensively check for missing required fields, and MUST NOT inspect raw user input. The `registerTool` factory parses input via `deleteNoteInputSchema.parse(args)` and only invokes the handler with a successfully-parsed `DeleteNoteInput`. Per Constitution Principle III: "validated values MUST be passed to inner functions as already-typed objects, not re-validated downstream."

Specifically, the handler relies on these post-parse guarantees:
- `input.target_mode === "specific" || input.target_mode === "active"`
- If `input.target_mode === "specific"`: `input.vault` is a non-empty string; exactly one of `input.file` / `input.path` is defined.
- If `input.target_mode === "active"`: `input.vault === undefined`, `input.file === undefined`, `input.path === undefined`.
- `input.permanent` is `boolean` (post-`.default(false)` coercion — never `undefined`).
- No unknown top-level keys (post-strict-mode).

Note vs `write_note`: `delete_note` has NO active-mode-specific schema rules beyond what the target-mode primitive enforces. `permanent` is permitted in both modes, so the handler must handle both `permanent: true` and `permanent: false` in both `target_mode` branches uniformly.

### Argv assembly invariants

1. **Subcommand**: always `"delete"` (per [research.md R3](../research.md) — verified live via `obsidian help`).
2. **Vault hoisting**: `vault` is passed as a top-level field to `invokeCli`; the cli-adapter's `dispatchCli` hoists it to the `vault=<value>` argv-prefix slot. The handler does NOT include `vault` inside `parameters`.
3. **No file rename** (departure from `write_note`'s PSR-5): `input.file` (user-facing wikilink-form locator) maps DIRECTLY to `parameters.file` (the CLI's `delete` argv key — verified live, matches schema field). The handler does NOT rename to `name=` (which is the `create` subcommand's convention only).
4. **Locator XOR**: at most one of `parameters.file` / `parameters.path` is present per call. Schema's `superRefine` (target-mode primitive) guarantees the input had at most one; handler propagates.
5. **No content / template / open / newtab**: this BI does NOT support those flags (the `delete` subcommand doesn't accept them per `obsidian help delete`). The `parameters` record contains only the locator key (specific mode) or is empty (active mode).
6. **Permanent flag**: append `"permanent"` to `flags` only when `input.permanent === true`. Default-false (whether default-coerced or explicit) MUST NOT emit any `permanent`-shaped token in argv (Story 1 AC#2 + Story 3 AC#2). Active mode and specific mode follow the same rule — `permanent` is permitted unconditionally in both, and the emission rule is mode-agnostic.
7. **target_mode forwarded**: `target_mode: input.target_mode` is passed to `invokeCli` as-is so the adapter applies its active-mode locator-stripping defence-in-depth (per [src/cli-adapter/cli-adapter.ts:60-62](../../../src/cli-adapter/cli-adapter.ts#L60-L62)).

### Response parsing invariants

1. **Success path**: the handler parses `{ stdout, stderr }` from the `InvokeCliSuccess` return value. The parsing logic locks against the live CLI's output (R4, locked at T0) — currently hypothesised as `Trashed: <path>` / `Deleted: <path>` (parity with write_note's `Created:` / `Overwrote:`). T0 verifies and amends the regex if the CLI's wording differs.
2. **`deleted` is always literal `true`**: the success path returns `deleted: true` unconditionally. There is no `deleted: false` shape — failures throw `UpstreamError` instead of producing a no-op return.
3. **`path` parsed verbatim from CLI stdout**: the `path` value is the CLI's reported value, NOT a re-derivation from the input locator. For wikilink-form input (`file=`) the CLI resolves to a canonical folder-prefixed path; the handler propagates the resolved value verbatim.
4. **`toTrash` derived structurally**: `toTrash = !input.permanent`, computed AFTER the response is parsed but BEFORE the output is returned. NOT parsed from the CLI's response wording. The typed surface owns the audit invariant per spec SC-014.
5. **No content / size echo**: the response does NOT include any echoed content or file metadata. The single CLI line is the full success signal.

### Failure propagation invariants

1. **No swallowing**: the handler does NOT catch `UpstreamError` to mask, mutate, or re-classify. It propagates the adapter's classification verbatim; `registerTool`'s outer catch wraps it via `asToolError`.
2. **Re-throw on unexpected**: any non-`UpstreamError` exception (e.g., a runtime TypeError from a bug in argv-assembly) is allowed to escape; `registerTool` re-throws, the SDK's outer envelope catches and serialises as a generic error. Mirrors the `obsidian_exec` / `read_note` / `write_note` precedent.
3. **No new error codes**: zero new codes are introduced (FR-018). The four propagated codes from the adapter (`CLI_BINARY_NOT_FOUND`, `CLI_NON_ZERO_EXIT`, `CLI_REPORTED_ERROR`, `ERR_NO_ACTIVE_FILE`) plus `VALIDATION_ERROR` from `registerTool`'s wrap cover the entire failure surface.
4. **Unparseable success**: if the CLI exits 0 but the stdout doesn't match any known success-response pattern (per R4), the handler throws `UpstreamError({ code: "CLI_REPORTED_ERROR", message: "delete_note could not parse CLI response: ...", details: { stdout } })`. Treats unparseable success as an in-band CLI error rather than crashing the bridge.
5. **Active-mode no-active-file**: the cli-adapter classifies "no active file" responses as `ERR_NO_ACTIVE_FILE` (per [003-cli-adapter](../../003-cli-adapter/spec.md) FR-008(b)). The handler propagates verbatim; the recovery message ("focus a note or switch to specific mode" or substantively equivalent) is the adapter's, not the handler's.
6. **Unknown vault**: `Vault not found.` on stdout (exit 0) is re-classified by the cli-adapter to `CLI_REPORTED_ERROR` per [011-write-note R5 / T002](../../011-write-note/research.md). The handler propagates; no `delete_note`-specific handling needed (verified live during 012 plan stage — the response is byte-identical to the create subcommand's).
7. **File-not-found**: the CLI's wording (likely `Error: file not found at <path>` or similar) is captured during T0. The dispatch layer's `Error:` prefix matcher classifies it as `CLI_REPORTED_ERROR`; the handler propagates verbatim.

---

## `invokeCli` call shape (canonical)

### Specific mode

```ts
const parameters: Record<string, string> = {
  ...(input.file !== undefined ? { file: input.file } : {}),  // NOTE: no rename — direct map (R3)
  ...(input.path !== undefined ? { path: input.path } : {}),
};
const flags: string[] = input.permanent === true ? ["permanent"] : [];

const { stdout } = await invokeCli(
  {
    command: "delete",
    vault: input.vault!,                // non-null assertion justified by primitive's superRefine invariant
    parameters,
    flags,
    target_mode: "specific",
  },
  { spawnFn: deps.spawnFn, env: deps.env, logger: deps.logger, queue: deps.queue },
);
const parsed = parseDeleteResponse(stdout);
return { deleted: true, path: parsed.path, toTrash: !input.permanent };
```

### Active mode

```ts
// Schema guarantees: parsed.vault === undefined, parsed.file === undefined, parsed.path === undefined.
// parsed.permanent is a boolean (default-coerced).
const parameters: Record<string, string> = {};
const flags: string[] = input.permanent === true ? ["permanent"] : [];

const { stdout } = await invokeCli(
  {
    command: "delete",
    vault: undefined,
    parameters,
    flags,
    target_mode: "active",
  },
  { spawnFn: deps.spawnFn, env: deps.env, logger: deps.logger, queue: deps.queue },
);
const parsed = parseDeleteResponse(stdout);
return { deleted: true, path: parsed.path, toTrash: !input.permanent };
```

The two branches share the same `parseDeleteResponse` helper. The only differences:
- `vault` is `input.vault!` (specific) vs `undefined` (active).
- `parameters` carries the locator (specific) vs is empty (active).
- The `flags` array is identical (`permanent` flag emission rule is mode-agnostic).
- The `toTrash` derivation is identical (`!input.permanent` in both modes).

### `parseDeleteResponse` helper

```ts
const RESPONSE_RE = /^(Trashed|Deleted): (.+?)\s*$/m;  // T0-locked — exact pattern verified at /speckit-implement T0

function parseDeleteResponse(stdout: string): { path: string } {
  const match = stdout.trimStart().match(RESPONSE_RE);
  if (match) {
    return { path: match[2]! };
  }
  throw new UpstreamError({
    code: "CLI_REPORTED_ERROR",
    cause: null,
    details: { stdout },
    message: `delete_note could not parse CLI response: ${stdout.trimStart().slice(0, 200)}`,
  });
}
```

The first regex capture group exists for diagnostic / future-extension purposes (e.g., a future BI might want to log whether the CLI considered the operation a trash or a permanent — orthogonal to `toTrash` which is structural). The handler's return value uses ONLY the second capture (the path). `toTrash` comes from `!input.permanent`, never from the regex.

If T0 finds the CLI's wording uses different lead-words (e.g., `Removed:` instead of `Trashed:`), the regex is amended at T0 before the handler tests are written. Spec amendment per FR-019 if the captured wording materially differs from the hypothesis.

---

## Test seam (FR-016 Handler Tests)

`deps.spawnFn` is the canonical injection point. Tests construct stub `SpawnLike` factories that return mock `ChildProcess` objects with controlled exit codes, stdout, and stderr. The existing `write_note` handler tests at [src/tools/write_note/handler.test.ts](../../../src/tools/write_note/handler.test.ts) demonstrate the shape; `delete_note`'s handler tests reuse the pattern.

Example handler test scaffold:

```ts
import { test, expect, vi } from "vitest";
import { executeDeleteNote } from "./handler.js";
// ... fixture imports, stubSpawn helper

test("happy-path specific path mode to-trash (Story 1 IT)", async () => {
  const argvCalls: string[][] = [];
  const stubSpawn = makeStubSpawn({
    onSpawn: (binary, argv) => argvCalls.push(argv),
    exitCode: 0,
    stdout: "\nTrashed: Inbox/Old.md\n",
  });
  const result = await executeDeleteNote(
    {
      target_mode: "specific",
      vault: "MyVault",
      path: "Inbox/Old.md",
      permanent: false,
    },
    { logger: createLogger(), queue: createQueue(), spawnFn: stubSpawn },
  );
  expect(result).toEqual({ deleted: true, path: "Inbox/Old.md", toTrash: true });
  expect(argvCalls[0]).toEqual(["vault=MyVault", "delete", "path=Inbox/Old.md"]);
  // Note: NO `permanent` token in argv (default-false-omit rule).
});

test("happy-path specific permanent (Story 3 IT)", async () => {
  const argvCalls: string[][] = [];
  const stubSpawn = makeStubSpawn({
    onSpawn: (binary, argv) => argvCalls.push(argv),
    exitCode: 0,
    stdout: "\nDeleted: Old.md\n",
  });
  const result = await executeDeleteNote(
    { target_mode: "specific", vault: "V", path: "Old.md", permanent: true },
    { logger: createLogger(), queue: createQueue(), spawnFn: stubSpawn },
  );
  expect(result).toEqual({ deleted: true, path: "Old.md", toTrash: false });
  expect(argvCalls[0]).toEqual(["vault=V", "delete", "path=Old.md", "permanent"]);
});
```

Argv shape in the test reflects `dispatchCli`'s actual hoisting — `vault=` first, then subcommand, then key=value parameters, then flags. The handler doesn't construct this exact array; it passes structured `{vault, parameters, flags, target_mode}` to `invokeCli`, which then hoists into `dispatchCli`'s argv assembly. Tests verify the final argv that hits `spawnFn`.

---

## Audit-trail invariant test (Story 8 / SC-014)

A parameterised test enumerates the four success-path combinations and asserts `toTrash === !input.permanent`:

```ts
const cases = [
  { permanent: undefined, toTrash: true,  desc: "specific + omitted" },
  { permanent: false,     toTrash: true,  desc: "specific + false" },
  { permanent: true,      toTrash: false, desc: "specific + true" },
  // active mode covered separately (no vault/file/path)
];

test.each(cases)("audit invariant: $desc → toTrash: $toTrash", async ({ permanent, toTrash }) => {
  const stubSpawn = makeStubSpawn({ exitCode: 0, stdout: "\nTrashed: T.md\n" });
  const input: DeleteNoteInput = {
    target_mode: "specific",
    vault: "V",
    path: "T.md",
    ...(permanent !== undefined ? { permanent } : {}),
  } as DeleteNoteInput;
  const result = await executeDeleteNote(input, deps);
  expect(result.toTrash).toBe(toTrash);
});
```

Plus the active-mode equivalent (omitted vs explicit-true). Together these cover all four combinations.

---

## Handler module size budget (SC-007)

Total file LOC ≤ 50. Breakdown estimate:

| Section | LOC |
|---------|-----|
| `// Original — no upstream.` header | 1 |
| imports (invokeCli, UpstreamError, schema types, Logger, Queue) | ~6 |
| `ExecuteDeps` interface | ~6 |
| `RESPONSE_RE` constant | 1 |
| `parseDeleteResponse` helper | ~12 |
| `executeDeleteNote` body (parameters/flags assembly, invokeCli call, return) | ~20 |
| blank lines / minimal comments | ~4 |
| **Total** | **~50** |

Lower than `write_note`'s ≤70 ceiling (per [011 spec SC-007](../../011-write-note/spec.md)) because:
- One field (`permanent`), not four.
- No file→name rename (single locator pass-through).
- No content/template handling.
- No `(input.open ?? false)` undefined-handling clause.

If the handler grows beyond 50 LOC, that's a signal to extract logic to the adapter (per the existing pattern; e.g., the unknown-vault response-inspection lives in the adapter, not in delete_note).

---

## Stability

- **Internal**: yes. The handler is not exported from `src/index.ts`; its only consumer is `src/tools/delete_note/index.ts`.
- **Test contract**: the `ExecuteDeps` interface is the test surface. Renaming or restructuring it requires updating the co-located handler tests in the same change.
- **Adapter coupling**: the handler is tightly coupled to `invokeCli`'s `InvokeCliInput` shape. If the adapter's signature changes (e.g., the 008-refactor surface unfreezes in a future BI), the handler updates in lock-step with `read_note` / `write_note` / `obsidian_exec`.
- **CLI coupling**: the `parseDeleteResponse` regex is locked at T0 against the live CLI's response wording. Future CLI version drift surfaces as test failures rather than silent regressions (per spec SC-011).

---

## Cross-references

- [spec.md](../spec.md) — FRs that drive this contract (FR-007, FR-008, FR-009, FR-010, FR-011, FR-019)
- [data-model.md](../data-model.md) — argv mapping table, response-parsing decision tree, per-tool invariants
- [research.md](../research.md) — R1 (no logger events), R2 (flag form), R3 (no rename), R4 (response parsing + structural toTrash), R5 (unknown-vault inheritance), R6 (no superRefine)
- [delete-note-input.contract.md](./delete-note-input.contract.md) — input schema this handler consumes
- [011-write-note/contracts/write-note-handler.contract.md](../../011-write-note/contracts/write-note-handler.contract.md) — sibling artifact this one mirrors
