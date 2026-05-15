# Contract — `_registration-stub.ts`

**Branch**: `031-extract-registration-fixture` | **Date**: 2026-05-15
**Spec**: [../spec.md](../spec.md) | **Plan**: [../plan.md](../plan.md) | **Data Model**: [../data-model.md](../data-model.md)

This contract defines the public TypeScript interface of the shared registration-stub fixture introduced under BI-031. The fixture is **module-private support code** consumed only by `src/tools/*/index.test.ts` callers — not an MCP boundary, not a published API surface. Boundary input validation per Principle III does NOT apply because the consumer surface is in-process TypeScript code, not external input. The contract below is the TypeScript-type contract a consumer programs against.

---

## 1. Public exports

The module exports exactly two symbols:

| Export | Kind | Purpose |
|--------|------|---------|
| `makeRegistrationStubSpawn` | function | Factory for a `SpawnLike` test stub |
| `RegistrationStubOpts` | interface | The options bag shape consumed by the factory |

No default export. No named class export. No re-export of `SpawnLike` (the consumer imports it directly from `cli-adapter/_dispatch.js` if it needs the type; per R3, the 16 consumers being refactored do NOT need the type after the consolidation because their local `makeStubSpawn` annotation no longer exists).

---

## 2. `makeRegistrationStubSpawn` signature

```typescript
export function makeRegistrationStubSpawn(opts?: RegistrationStubOpts): SpawnLike;
```

### 2.1 Parameter

- `opts` (optional): a partial `RegistrationStubOpts`. Defaults to `{}` when absent.

### 2.2 Return value

A `SpawnLike` — a function with the signature:

```typescript
(binary: string, args: string[], options: SpawnOptions) => ChildProcess
```

The returned function, when invoked, creates a fresh `EventEmitter`-backed child process whose lifecycle satisfies the invariants in section 4. The function does not inspect `binary`, `args`, or `options` — they are accepted for type-conformance only.

---

## 3. `RegistrationStubOpts` shape

```typescript
export interface RegistrationStubOpts {
  stdout?: string;
  exitCode?: number;
}
```

| Field | Type | Default | Effect when set |
|-------|------|---------|-----------------|
| `stdout` | `string` (optional) | absent | The stub pushes `Buffer.from(opts.stdout, "utf8")` into the child's `stdout` stream before the stream's `null` push |
| `exitCode` | `number` (optional) | `0` | The child emits `exit` with this code |

**Invariant**: the options bag is `additionalProperties: never` semantically — passing any other field is a TypeScript compile error. The structural typing of the interface enforces this without an `additionalProperties: false` directive.

**Invariant**: the field set is FROZEN at this contract version. Adding a field requires a deliberate update to this contract document, FR-002 (spec), and R4 (research). Future-tool authors who need additional fields are expected to declare a local stub (the pre-extraction status quo) rather than grow the shared bag.

---

## 4. Runtime invariants of the returned `SpawnLike`

When the returned function is invoked, the produced child MUST satisfy each of the following invariants. Each invariant is verified by one or more cases in the co-located `_registration-stub.test.ts` (see data-model.md §5):

| ID | Invariant | Detail |
|----|-----------|--------|
| I-1 | The child is an `EventEmitter` cast to `ChildProcess` | The cast is `as unknown as ReturnType<SpawnLike>`. No subclassing. |
| I-2 | The child has a `.stdout` property that is a `node:stream` `Readable` | Constructed as `new Readable({ read() {} })`. |
| I-3 | The child has a `.stderr` property that is a `node:stream` `Readable` | Constructed identically to `.stdout`. |
| I-4 | The child has `.pid` set to the integer `7` | Literal. No caller asserts on this value; the fixed literal exists for byte-equivalence with the historical 788-byte template and absorbs the 5 trivial divergences per R4. |
| I-5 | The child has a `.kill` method that accepts an optional `NodeJS.Signals` argument and returns `true` | Implemented as the arrow `(signal?: NodeJS.Signals) => true`. The signal argument is ignored. |
| I-6 | The lifecycle, under `setImmediate` chaining, fires in this order: (a) optional `child.stdout.push(Buffer.from(opts.stdout, "utf8"))` when `opts.stdout` is provided; (b) `child.stdout.push(null)`; (c) `child.stderr.push(null)`; then on the next `setImmediate` tick, (d) `child.emit("exit", opts.exitCode ?? 0, null)` | Two-tick lifecycle: first tick handles stream closure, second tick fires the exit. Reviewers verifying this contract: this two-tick shape is byte-equivalent to the 788-byte template's setImmediate structure and is what every consuming test relies on. |
| I-7 | The function ignores the `binary`, `args`, and `options` arguments | The body does `void binary;` and does not bind `args`/`options` to any name. |
| I-8 | The factory invocation is synchronous; the lifecycle events fire asynchronously via `setImmediate` chains | The consumer can assign the returned `SpawnLike` to the `spawnFn` dep and start the descriptor test before the exit event fires; the cli-adapter's `_dispatch` machinery will await the exit via its own listeners. |

---

## 5. Test seam pattern

The fixture is consumed by every typed-tool registration test via the tool factory's `deps.spawnFn` injection point:

```typescript
import { makeRegistrationStubSpawn as makeStubSpawn } from "../_registration-stub.js";
// ...

const tool = createMoveTool({
  logger: silentLogger(),
  queue: createQueue(),
  spawnFn: makeStubSpawn(),                      // default-opts stub
  // or
  spawnFn: makeStubSpawn({ stdout: "..." }),     // stdout-emitting stub
  // or
  spawnFn: makeStubSpawn({ exitCode: 2 }),       // non-zero-exit stub
});
```

This shape is invariant across all 16 consumers and across the seven cases in the co-located unit test. The pattern is identical to the pre-refactor shape; only the function-name source changes (local declaration → fixture import).

---

## 6. Single-spawn invariant

This contract DOES NOT enforce a single-spawn count per invocation of the returned function — each call to the returned `SpawnLike` constructs a fresh child. Consumers that expect the cli-adapter's `_dispatch` machinery to invoke the stub exactly once per dispatch rely on the `_dispatch` machinery's invariant, not on this fixture. The fixture is a pure factory; multiplicity is the caller's responsibility.

---

## 7. Anti-injection structural lock

The fixture does not assemble argv, does not invoke `node:child_process`'s real `spawn`, and does not touch any filesystem path. The fixture is structurally incapable of executing external code. Any consumer-supplied string passed to `opts.stdout` is treated as opaque UTF-8 bytes and is written to an in-memory `Readable` stream that no actual process ever reads from.

---

## 8. Constitution alignment

- **Principle I (Modular Code Organization)**: the fixture is a single-purpose module with a single exported function and a single exported interface. The import direction is downward only — the fixture imports `SpawnLike` from `cli-adapter/_dispatch.js`; the 16 consumers import the fixture from one directory level up.
- **Principle II (Public Surface Test Coverage)**: the shared module is internal test infrastructure, not an MCP surface. The co-located `_registration-stub.test.ts` ships in the same change (per R6) covering 7 cases (1 happy path + 6 boundary / invariant cases). Mirrors the `_register-baseline.ts`/`_register-baseline.test.ts` precedent from BI-022.
- **Principle III (Boundary Input Validation with Zod)**: N/A. The fixture is consumed by in-process TypeScript code, not external input. The options bag is structurally typed; the TypeScript compiler is the validator.
- **Principle IV (Explicit Upstream Error Propagation)**: N/A. The fixture has no error path. The returned `SpawnLike` does not throw; it does not propagate errors.
- **Principle V (Attribution & Layered Composition Transparency)**: the fixture carries the `// Original — no upstream.` header per FR-009 and the data-model.md §1.5 verbatim text.

---

## 9. Out-of-scope structural concerns

The following are NOT covered by this contract:

- The `obsidian_exec` extended stub (FR-006 / R7). That file's local `makeStubSpawn` is a SEPARATE artifact with a SEPARATE shape (971-byte body with `stderr?` and `errorOnSpawn?` fields). It is NOT consumed via this contract.
- The handler-layer `handler.test.ts` stubs across `delete`, `move`, `read`, `rename` (Family A). Those stubs are customised per caller and are explicitly out-of-scope per the spec.
- The `src/cli-adapter/{cli-adapter,invoke-bounded-cli,_dispatch}.test.ts` files. Those stubs are bound to the adapter's internal contract, not the registration contract this fixture serves.
