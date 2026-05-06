# Quickstart — Verifying `read_note` (BI-003)

**Branch**: `006-read-note` | **Date**: 2026-05-06 | **Plan**: [plan.md](./plan.md) | **Spec**: [spec.md](./spec.md)

This document enumerates the verification scenarios for `read_note`. Each scenario maps to one or more User Stories / Acceptance Criteria from [spec.md](./spec.md) and is automated by the test bodies enumerated in [data-model.md](./data-model.md#5-test-coverage-map). Run `npm run test` to execute all scenarios.

The scenarios are grouped into four tiers:

- **Component (schema)** — direct schema parsing, no handler, no adapter.
- **Component (handler)** — handler with stub adapter (real adapter, stub `spawnFn`).
- **Component (registration)** — `registerReadNoteTool` factory + the `RegisteredTool` it returns.
- **Server / integration** — registry-consistency block at `src/server.test.ts` and end-to-end `help({ tool_name: "read_note" })`.

---

## Scenario 1 — Schema accepts both happy paths and the active branch

**Maps to**: Story 1 AC#1, Story 2 AC#1, Story 3 AC#1 (schema layer)

**Setup**: import `readNoteInputSchema` from `src/tools/read_note/schema.ts`.

**Steps**:

```typescript
import { readNoteInputSchema } from "./schema.js";

const r1 = readNoteInputSchema.safeParse({ target_mode: "specific", vault: "MyVault", file: "Recipe" });
const r2 = readNoteInputSchema.safeParse({ target_mode: "specific", vault: "MyVault", path: "Templates/Recipe.md" });
const r3 = readNoteInputSchema.safeParse({ target_mode: "active" });
```

**Expected**:
- `r1.success === true`, `r1.data.target_mode === "specific"`, `r1.data.vault === "MyVault"`, `r1.data.file === "Recipe"`, `r1.data.path === undefined`.
- `r2.success === true`, `r2.data.path === "Templates/Recipe.md"`, `r2.data.file === undefined`.
- `r3.success === true`, `r3.data.target_mode === "active"`.

**Automated by**: `schema.test.ts` cases #1–#3.

---

## Scenario 2 — Schema rejects every malformed-input class

**Maps to**: Story 4 AC#1–AC#5, Story 3 AC#2

**Steps**:

```typescript
const f1 = readNoteInputSchema.safeParse({ target_mode: "specific", vault: "MyVault" });          // neither file nor path
const f2 = readNoteInputSchema.safeParse({ target_mode: "specific", vault: "MyVault", file: "F", path: "P" }); // both
const f3 = readNoteInputSchema.safeParse({});                                                       // discriminator missing
const f4 = readNoteInputSchema.safeParse({ target_mode: "specific", file: "F" });                 // vault missing
const f5 = readNoteInputSchema.safeParse({ target_mode: "active", vault: "V" });                  // forbidden in active
const f6 = readNoteInputSchema.safeParse({ target_mode: "unknown", vault: "V", file: "F" });      // invalid discriminator
```

**Expected**:
- All six produce `success: false`.
- `f1.error.issues[*].message` includes `"exactly one of"`.
- `f2.error.issues` has TWO entries — one with `path: ["file"]` and one with `path: ["path"]`, both mentioning `"exactly one of"` and `"got both"`.
- `f3.error.issues[*].path` includes `["target_mode"]` (missing-discriminator).
- `f4.error.issues[*].path` includes `["vault"]`.
- `f5.error.issues[*].path` includes `["vault"]` and message contains `"vault"` AND `"active mode"`.
- `f6.error.issues[*].path` includes `["target_mode"]` (invalid-discriminator-value).

**Automated by**: `schema.test.ts` cases #4–#9.

---

## Scenario 3 — Handler invokes adapter with correct argv (file branch)

**Maps to**: Story 1 IT (Independent Test for Story 1)

**Setup**: a stub `SpawnLike` that records its arguments and emits a stub child whose stdout is `"# Recipe\n\nIngredients...\n"`, exit code 0.

**Steps**:

```typescript
import { executeReadNote } from "./handler.js";
import { createQueue } from "../../queue.js";

const recordedArgs: { binary: string; args: string[] }[] = [];
const stubSpawn: SpawnLike = (binary, args) => {
  recordedArgs.push({ binary, args });
  return makeStubChild({ stdout: "# Recipe\n\nIngredients...\n", exitCode: 0 });
};
const stubLogger = makeStubLogger();
const queue = createQueue();

const result = await executeReadNote(
  { target_mode: "specific", vault: "MyVault", file: "Recipe" },
  { logger: stubLogger, queue, spawnFn: stubSpawn },
);
```

**Expected**:
- `result === { content: "# Recipe\n\nIngredients...\n" }`.
- `recordedArgs` has exactly one entry: `{ binary: "obsidian", args: ["read", "vault=MyVault", "file=Recipe"] }` (vault hoisted by adapter; `file=` second).
- `stubLogger.callStart` was called once with `{ callId: <uuid>, command: "read", vault: "MyVault", queueDepth: 0, locator: "file" }`.
- `stubLogger.callEndSuccess` was called once with `{ callId: <same>, durationMs: <number ≥ 0>, stdoutBytes: 23 }` (the byte length of `"# Recipe\n\nIngredients...\n"` in UTF-8).
- `stubLogger.callEndFailure` was NOT called.

**Automated by**: `handler.test.ts` case #1.

---

## Scenario 4 — Handler invokes adapter with correct argv (path branch)

**Maps to**: Story 2 IT

**Setup**: same as Scenario 3 but stub stdout is `"<template body>"`.

**Steps**:

```typescript
const result = await executeReadNote(
  { target_mode: "specific", vault: "MyVault", path: "Templates/Recipe.md" },
  deps,
);
```

**Expected**:
- `result === { content: "<template body>" }`.
- Adapter received argv `["read", "vault=MyVault", "path=Templates/Recipe.md"]`.
- `callStart` payload's `locator === "path"`.

**Automated by**: `handler.test.ts` case #2.

---

## Scenario 5 — Handler invokes adapter with bare argv (active branch)

**Maps to**: Story 3 AC#1

**Setup**: stub stdout `"<active body>"`, exit 0.

**Steps**:

```typescript
const result = await executeReadNote(
  { target_mode: "active" },
  deps,
);
```

**Expected**:
- `result === { content: "<active body>" }`.
- Adapter received argv `["read"]` — no `vault=`, no `file=`, no `path=` tokens.
- `callStart` payload's `vault === null` and `locator === "active"`.

**Automated by**: `handler.test.ts` case #3.

---

## Scenario 6 — Adapter failures propagate verbatim

**Maps to**: Story 5 AC#1–AC#3, Story 3 AC#3

**Stubs**:

| Stub configuration | Expected error code |
|--------------------|---------------------|
| exit 1, stderr `"file not found"` | `CLI_NON_ZERO_EXIT`, `details.exitCode === 1` |
| exit 0, stdout `"Error: File not found\n"` | `CLI_REPORTED_ERROR`, `details.message === "Error: File not found"` |
| exit 0, stdout `"Error: no active file\n"` (active mode) | `ERR_NO_ACTIVE_FILE` |
| spawn raises `ENOENT` | `CLI_BINARY_NOT_FOUND`, `details.binaryAttempted === "obsidian"` |

For each stub:

```typescript
await expect(executeReadNote(input, depsWithStub))
  .rejects.toMatchObject({ code: <expected_code> });
```

**Expected** (all four):
- The handler re-throws an `UpstreamError` instance whose `code` matches the expected code.
- `details` carries the adapter-classified shape (NOT a read_note-rewritten message).
- `stubLogger.callEndFailure` was called once with `{ callId, errorCode: <code>, durationMs: <number> }`.
- `stubLogger.callEndSuccess` was NOT called.

**Automated by**: `handler.test.ts` cases #4–#7.

---

## Scenario 6b — Non-`UpstreamError` exceptions re-throw verbatim WITHOUT `callEndFailure`

**Maps to**: Story 5 AC#4 (added by /speckit-analyze C2 remediation)

**Setup**: stub `spawnFn` that throws a plain `new Error("synthetic non-UpstreamError")` — NOT an `UpstreamError` subclass, NOT an ENOENT-shaped object that the adapter would classify.

**Steps**:

```typescript
const synthetic = new Error("synthetic non-UpstreamError");
const stubSpawn: SpawnLike = () => { throw synthetic; };
let rejection: unknown;
try { await executeReadNote(input, depsWith(stubSpawn)); }
catch (e) { rejection = e; }
```

**Expected**:
- `rejection === synthetic` (reference equality — the SAME `Error` instance, not a copy or wrapped version).
- `stubLogger.callEndFailure` was NOT called (re-throw is reserved for unclassified exceptions and intentionally bypasses the structured failure-event contract — matches obsidian_exec at tool.ts:59).
- `stubLogger.callEndSuccess` was NOT called.
- `stubLogger.callStart` WAS called (the start event fires before the adapter throws — that's an honest record).

**Automated by**: `handler.test.ts` case #9.

---

## Scenario 7 — Boundary: empty stdout returns `{ content: "" }`

**Maps to**: Story 1 AC#2

**Setup**: stub stdout `""`, exit 0.

**Steps**:

```typescript
const result = await executeReadNote(
  { target_mode: "specific", vault: "V", file: "EmptyNote" },
  deps,
);
```

**Expected**:
- `result === { content: "" }`.
- `callEndSuccess` payload's `stdoutBytes === 0`.

**Automated by**: `handler.test.ts` case #8.

---

## Scenario 8 — Tool registration: stripped schema + verb-led description

**Maps to**: Story 6 AC#1, AC#2

**Setup**: import `registerReadNoteTool`; construct minimal deps; call the factory.

**Steps**:

```typescript
import { registerReadNoteTool } from "./tool.js";
const { descriptor, handler } = registerReadNoteTool({ logger: stubLogger, queue: createQueue() });
```

**Expected**:
- `descriptor.name === "read_note"`.
- A recursive walk over `descriptor.inputSchema` (visiting `properties`, `oneOf`, `anyOf`, `items`, `additionalProperties`) finds zero `description` keys at any depth.
- `descriptor.description.toLowerCase().includes("help")` is true.
- `descriptor.description.includes("read_note")` is true.
- `descriptor.description.length` is between 100 and 500 chars (sanity range — pinned text is ~270 chars).

**Automated by**: `tool.test.ts` cases #1–#3.

---

## Scenario 9 — End-to-end through the registered handler: VALIDATION_ERROR

**Maps to**: Story 4 (end-to-end through the SDK envelope)

**Setup**: same as Scenario 8.

**Steps**:

```typescript
const errResult = await handler({});  // empty input — target_mode missing
```

**Expected**:
- `errResult.isError === true`.
- `errResult.content[0].type === "text"`.
- `JSON.parse(errResult.content[0].text)` is `{ code: "VALIDATION_ERROR", message: <non-empty string>, details: { issues: [<array>] } }`.
- The issues array includes an entry whose path includes `"target_mode"`.

**Automated by**: `tool.test.ts` case #4.

---

## Scenario 10 — Documentation: stub TODO marker is gone AND full content list is present

**Maps to**: FR-011, FR-013 (e), Story 6 AC#3, P7 (strengthened by /speckit-analyze L5 remediation to assert all error codes + all examples per Story 6 AC#3)

**Setup**: file read via `node:fs.readFileSync` with path resolved from `import.meta.url`.

**Steps**:

```typescript
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const docPath = resolve(here, "../../../docs/tools/read_note.md");
const body = readFileSync(docPath, "utf8");
```

**Expected**:
- `body.includes("<!-- TODO(BI-003)")` is false (TODO marker absent per FR-011 last paragraph).
- `body.length > 500` (sanity — a fully populated doc is ≳ 1500 bytes; this is a floor against accidentally truncating).
- `body.includes("Read a note")` is true (Overview anchor).
- Both example shapes present: `body.includes('read_note({ target_mode: "specific"')` AND `body.includes('read_note({ target_mode: "active"')`.
- Both specific-branch locator forms documented: `body.includes("file=")` AND `body.includes("path=")`.
- Each of the 5 propagated error codes appears in the body: `["VALIDATION_ERROR", "CLI_NON_ZERO_EXIT", "CLI_REPORTED_ERROR", "ERR_NO_ACTIVE_FILE", "CLI_BINARY_NOT_FOUND"].forEach(code => expect(body).toContain(code))`.

**Automated by**: `tool.test.ts` case #5.

---

## Scenario 11 — Server registry consistency picks up `read_note`

**Maps to**: SC-009, BI-030's FR-017

**Setup**: the existing registry-consistency block at `src/server.test.ts` runs against the full server's `tools/list` output.

**Expected** (existing test, no edits needed):
- The block iterates every registered tool and asserts `docs/tools/<name>.md` exists for each.
- After this BI lands, `read_note` appears in the iteration; `docs/tools/read_note.md` is asserted to exist.
- The same block asserts every tool's `inputSchema.properties` tree is description-free; `read_note`'s tree is description-free (no `.describe()` annotations + the strip utility applied).

**Automated by**: existing `server.test.ts` registry-consistency block — picks up `read_note` once `src/server.ts` registers it.

---

## Scenario 12 — End-to-end: `help({ tool_name: "read_note" })` returns the populated doc

**Maps to**: Story 6 AC#3, SC-006

**Setup**: a running MCP server with all three tools registered.

**Steps**:

```typescript
const helpResult = await server.callTool({
  name: "help",
  arguments: { tool_name: "read_note" },
});
```

**Expected**:
- `helpResult.isError !== true`.
- `helpResult.content[0].text` is the full body of `docs/tools/read_note.md`.
- The body does NOT contain the substring `<!-- TODO(BI-003)`.
- The body contains the section headers `Input Schema`, `Output`, `Errors`, `Examples` (per P5 ordering).

**Automated by**: this scenario is verified by the integration of Scenario 10 (file content) + the help tool's existing tests (which assert the help tool reads the right file). No new test body is needed in BI-003 specifically.

---

## Pre-implementation gate checklist

Before starting Phase 2 (tasks) and implementation:

- [ ] [spec.md](./spec.md) is current: 3 clarifications recorded in Session 2026-05-06; FR-016, FR-017, and the empty-string Edge Case are in their final form.
- [ ] [plan.md](./plan.md) Constitution Check has all five principles `Y`; no Complexity Tracking entries.
- [ ] [research.md](./research.md) resolves P1–P8.
- [ ] [data-model.md](./data-model.md) lists all 22 new test bodies with their User Story / AC mappings.
- [ ] [contracts/read-note.contract.md](./contracts/read-note.contract.md) is the binding interface description.
- [ ] [docs/tools/read_note.md](../../docs/tools/read_note.md) currently carries the `<!-- TODO(BI-003): … -->` stub marker (this BI removes it).
- [ ] No other branch is mid-flight on `src/server.ts` (a registration-list edit can collide).

---

## Post-implementation verification (run before opening PR)

- [ ] `npm run test` — all 23 new test bodies pass; the registry-consistency block at `src/server.test.ts` picks up `read_note`; total test count grew by exactly 23.
- [ ] `npm run typecheck` passes.
- [ ] `npm run lint` passes with zero warnings.
- [ ] `npm run build` succeeds.
- [ ] Aggregate statements coverage ≥ floor in `vitest.config.ts` (no regression; expected slight uptick).
- [ ] Manual: open `docs/tools/read_note.md` — section headers present per P5; no stub marker; one example per branch; all 5 error codes named.
- [ ] Manual: open `docs/tools/index.md` — read_note's bullet line is no longer the BI-030 stub-placeholder summary; reads as a real one-line summary (FR-012 verification).
- [ ] Manual: run the server, `tools/list` — `read_note` appears alongside `obsidian_exec` and `help`; its `description` mentions `help({ tool_name: "read_note" })`; its `inputSchema.properties.*` tree is description-free.
- [ ] Manual: `help({ tool_name: "read_note" })` returns the populated body.
- [ ] PR description: Constitution Compliance checklist all `Y`; FR-014's coverage-floor mention; explicit reference to Clarifications 2026-05-06 Q1/Q2/Q3 and the FR-002 deviation per P1; mention the /speckit-analyze remediation that landed in this PR (C1 + C2 + I1 + I2 + L1–L6).
