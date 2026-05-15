# Data Model — Extract Registration Stub Fixture

**Branch**: `031-extract-registration-fixture` | **Date**: 2026-05-15
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Research**: [research.md](research.md)

This refactor has no domain data model — it touches only test-infrastructure code. The "model" captured here is therefore the **interface shape** of the new fixture (exported TypeScript signature, options bag shape, runtime invariants of the returned `SpawnLike`) plus the **per-caller diff template** the editing protocol will apply.

---

## 1. Fixture export shape

### 1.1 Module file

`src/tools/_registration-stub.ts`

### 1.2 Exported symbol

```typescript
export function makeRegistrationStubSpawn(opts?: RegistrationStubOpts): SpawnLike;
```

### 1.3 Options type

```typescript
export interface RegistrationStubOpts {
  stdout?: string;
  exitCode?: number;
}
```

- `stdout`: optional. When provided, the child writes the value (encoded as UTF-8) to `stdout` before the stream's `null` push.
- `exitCode`: optional. Defaults to `0`. The child emits `exit` with this code.

Both fields are optional. Calling `makeRegistrationStubSpawn()` with no argument is equivalent to `makeRegistrationStubSpawn({})`.

### 1.4 Return type

The existing `SpawnLike` type from `src/cli-adapter/_dispatch.ts` (line 14):

```typescript
export type SpawnLike = (binary: string, args: string[], options: SpawnOptions) => ChildProcess;
```

No re-declaration in the fixture module. The fixture imports the type from `_dispatch.js`.

### 1.5 Module header

Per Principle V and FR-009:

```typescript
// Original — no upstream. Shared test fixture for the typed-tool registration cohort:
// returns a SpawnLike that constructs a one-shot EventEmitter-backed child whose
// stdout / stderr / pid / kill / exit lifecycle satisfies the cli-adapter's dispatch
// contract. Consumed by 16 src/tools/<name>/index.test.ts files (BI-031).
```

The header is the documentation. No JSDoc on the exported function — the type signature plus this contract document plus the co-located test cases ARE the contract.

---

## 2. Runtime invariants of the returned `SpawnLike`

When invoked as `stub(binary, argv, options)`, the returned function MUST:

| Invariant | Spec | Verification |
|-----------|------|--------------|
| I-1 | Returns an EventEmitter cast to `ChildProcess` (via the same `as unknown as ReturnType<SpawnLike>` cast every existing caller uses) | `_registration-stub.test.ts` case 5 |
| I-2 | The returned child has a `.stdout` property that is a `Readable` stream | `_registration-stub.test.ts` case 5 |
| I-3 | The returned child has a `.stderr` property that is a `Readable` stream | `_registration-stub.test.ts` case 5 |
| I-4 | The returned child has `.pid = 7` (literal; no caller currently asserts pid value, but the literal is preserved for byte-equivalence with the 11 currently-identical bodies) | `_registration-stub.test.ts` case 5 |
| I-5 | The returned child has a `.kill` method that returns `true` and accepts an optional signal argument | `_registration-stub.test.ts` case 5 |
| I-6 | Lifecycle order under setImmediate: (a) if `opts.stdout` provided, push the UTF-8-encoded buffer to `child.stdout`; (b) push `null` to `child.stdout`; (c) push `null` to `child.stderr`; (d) on the NEXT setImmediate tick, emit `exit` with `opts.exitCode ?? 0` and a `null` signal | `_registration-stub.test.ts` case 6 |
| I-7 | The `binary` and `options` arguments are accepted but not inspected (the body assigns `void binary;` and the options parameter is unused). The `argv` argument is also unused | `_registration-stub.test.ts` cases 1-4 do not assert on these but exercise the call shape |
| I-8 | The function is synchronous — invocation returns the child immediately; the stdout writes and exit emission happen on a later turn via `setImmediate` chains | `_registration-stub.test.ts` case 1 verifies the call returns before the exit event fires |

---

## 3. Per-caller diff template

Each of the 16 consuming `src/tools/<name>/index.test.ts` files receives the same mechanical edit. The template below shows the before/after shape for `src/tools/move/index.test.ts` (the 788-byte e92c... reference case); the other 15 files have the same structural transformation modulo the `child.pid` literal cleanup absorbed by R4.

### 3.1 Before (illustrative — `move/index.test.ts` lines 2-37)

```typescript
import { type SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createMoveTool, MOVE_DESCRIPTION, MOVE_TOOL_NAME } from "./index.js";
import { __resetInFlightRegistryForTests, type SpawnLike } from "../../cli-adapter/_dispatch.js";
import { createLogger } from "../../logger.js";
import { createQueue } from "../../queue.js";

function makeStubSpawn(opts: { stdout?: string; exitCode?: number } = {}): SpawnLike {
  return (binary, _argv, _options: SpawnOptions) => {
    void binary;
    const child = new EventEmitter() as EventEmitter & {
      stdout: Readable;
      stderr: Readable;
      kill: (signal?: NodeJS.Signals) => boolean;
      pid?: number;
    };
    child.stdout = new Readable({ read() {} });
    child.stderr = new Readable({ read() {} });
    child.pid = 7;
    child.kill = () => true;
    setImmediate(() => {
      if (opts.stdout) child.stdout.push(Buffer.from(opts.stdout, "utf8"));
      child.stdout.push(null);
      child.stderr.push(null);
      setImmediate(() => child.emit("exit", opts.exitCode ?? 0, null));
    });
    return child as unknown as ReturnType<SpawnLike>;
  };
}
```

### 3.2 After (same file, equivalent region)

```typescript
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Writable } from "node:stream";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createMoveTool, MOVE_DESCRIPTION, MOVE_TOOL_NAME } from "./index.js";
import { __resetInFlightRegistryForTests } from "../../cli-adapter/_dispatch.js";
import { createLogger } from "../../logger.js";
import { createQueue } from "../../queue.js";
import { makeRegistrationStubSpawn as makeStubSpawn } from "../_registration-stub.js";
```

### 3.3 Edit set summary

| Operation | Count per file | Total across 16 files |
|-----------|---------------|----------------------|
| Import lines deleted (`node:child_process`, `node:events`) | 2 | 32 |
| Import lines trimmed (`Readable` removed from `node:stream`; `SpawnLike` removed from `_dispatch.js`) | 2 | 32 |
| Import lines added (the new fixture) | 1 | 16 |
| Function block deleted (the ~22-line `makeStubSpawn` declaration) | 1 | 16 |

Net per file: ~22 lines removed via function-block deletion, 2 lines removed via import deletion, 2 lines edited via import trim, 1 line added via fixture import.

**Note on SC-008**: the spec's SC-008 says the diff shows "deletion of the local function block, insertion of exactly one import line, no other edits." The "no other edits" clause is interpreted to mean "no edits to test-logic content" — the four-line import cleanup is mechanical and forced by `tsconfig.json`'s `noUnusedLocals: true` (per R3). Reviewers verifying SC-008 should expect to see the cleanup as part of the per-file diff; it is documented here and in R3 so the expectation is not a surprise.

---

## 4. The 16-caller table

The table maps each consuming file to its current byte-distinct body class (verified at spec time by `sha256sum`):

| File | Body bytes | Body sha (first 12 hex) | Per-file divergence vs 788/e92c baseline |
|------|-----------|-------------------------|------------------------------------------|
| `src/tools/delete/index.test.ts` | 788 | `e92c736c2f25` | None (identical to baseline) |
| `src/tools/find_by_property/index.test.ts` | 788 | `e92c736c2f25` | None |
| `src/tools/links/index.test.ts` | 788 | `e92c736c2f25` | None |
| `src/tools/move/index.test.ts` | 788 | `e92c736c2f25` | None |
| `src/tools/read/index.test.ts` | 788 | `e92c736c2f25` | None |
| `src/tools/read_heading/index.test.ts` | 788 | `e92c736c2f25` | None |
| `src/tools/read_property/index.test.ts` | 788 | `e92c736c2f25` | None |
| `src/tools/rename/index.test.ts` | 788 | `e92c736c2f25` | None |
| `src/tools/set_property/index.test.ts` | 788 | `e92c736c2f25` | None |
| `src/tools/smart_connections_query/index.test.ts` | 788 | `e92c736c2f25` | None |
| `src/tools/smart_connections_similar/index.test.ts` | 788 | `e92c736c2f25` | None |
| `src/tools/files/index.test.ts` | 789 | `78417ce8f166` | `child.pid = 11` (vs 7) |
| `src/tools/outline/index.test.ts` | 789 | `f6753f4b44b9` | `child.pid = 12` (vs 7) |
| `src/tools/properties/index.test.ts` | 789 | `ae069ed786a5` | `child.pid = 13` (vs 7) |
| `src/tools/tag/index.test.ts` | 789 | `ae069ed786a5` | `child.pid = 13` (vs 7) |
| `src/tools/tree/index.test.ts` | 789 | `ae069ed786a5` | `child.pid = 13` (vs 7) |

**Total: 16 files. 11 byte-identical + 5 pid-only divergences. All 16 land on `pid = 7` via the shared fixture per R4.** The pid literal is unused in test assertions in all five divergent files; the consolidation is structurally safe.

### 4.1 The carved-out caller (NOT in the table above)

| File | Body bytes | Body sha (first 12 hex) | Notes |
|------|-----------|-------------------------|-------|
| `src/tools/obsidian_exec/index.test.ts` | 971 | `edacb5c2b324` | Extended variant: adds `stderr?: string` (separate stderr push between stdout-null-push and exit) AND `errorOnSpawn?: NodeJS.ErrnoException` (synchronous throw on spawn). Retained verbatim per FR-006 / R7. Does NOT import from `_registration-stub.js`. |

---

## 5. Co-located test inventory (`_registration-stub.test.ts`)

Per R6, the new co-located test file ships with 5-7 cases. The inventory below locks the case count at **7** and names each case explicitly so the test file can be reviewed against this list:

| Case | Title | Invariant exercised |
|------|-------|---------------------|
| 1 | Default invocation produces an exit-0 child with empty stdout | I-1, I-2, I-3, I-7, I-8 + default exitCode (case 7 cross-reference) |
| 2 | `opts.stdout` is encoded as UTF-8 and pushed before the null sentinel | I-6 (push order) + UTF-8 encoding contract |
| 3 | `opts.exitCode` propagates to the `exit` event | exit-code mapping |
| 4 | Both `stdout` and `exitCode` together exercise the full pipeline | combined invariants from cases 1-3 |
| 5 | The returned child satisfies the SpawnLike shape contract (`.stdout`, `.stderr`, `.pid`, `.kill`) | I-1, I-2, I-3, I-4, I-5 |
| 6 | setImmediate lifecycle order: stdout-push precedes null-push; null-push precedes exit emission | I-6 (verified by listener-attached sequence recording) |
| 7 | Default `exitCode` is `0` when `opts.exitCode` is omitted | default-value contract for exit |

The test file uses the same vitest idioms (`describe`, `it`, `expect`) the rest of the project uses; no new test framework dependency.

---

## 6. Module LOC budget

| Module | LOC budget | Notes |
|--------|-----------|-------|
| `src/tools/_registration-stub.ts` | ~30 source LOC (header + interface + function) | Roughly the same as `_register-baseline.ts`'s helper section |
| `src/tools/_registration-stub.test.ts` | ~120-160 LOC (7 cases with setup + assertions) | Mirrors `_register-baseline.test.ts` shape |
| Per-consumer net change | ~−22 LOC | 22-line function block out, 1 import line in, 4 import lines edited |
| Total LOC delta across the 16 consumers | ~−352 LOC | (Approximate; reviewer-verifiable via `git diff --stat`) |

Net effect: roughly 152-192 LOC added (one new fixture + one new test) traded for roughly 352 LOC deleted across 16 files. Net code reduction in the tree: ~160-200 LOC.
