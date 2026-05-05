# Quickstart: CLI Adapter

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-05-05

This walkthrough verifies the new CLI adapter end-to-end. The adapter is **internal** — it has no MCP tool registration, so end-to-end verification is a unit-test concern (vitest with stub spawn) rather than an MCP-client concern. The MCP-client surface remains the existing `obsidian_exec` tool (unchanged by this feature), so the adapter's correctness is validated by the ten co-located vitest cases plus the consumer-side typed-tool BIs that land on top of it.

## Prerequisites

- This branch (`003-cli-adapter`) checked out and built (`npm run build`).
- The repository's existing test toolchain configured (`vitest`, `@vitest/coverage-v8`).
- For the optional consumer-side smoke (Scenario 7 below): a typed-tool BI on top of the adapter (e.g., a future `read_note` BI). Until that lands, Scenarios 1–6 fully verify the adapter in isolation.

## Verification scenarios

### Scenario 1 — Happy-path specific mode (FR-016(a), Story 1 AC #1)

The adapter assembles argv per the documented vault-hoisting rule and resolves `{ stdout, stderr }` on a clean exit-zero close.

```ts
import { invokeCli } from "../../src/cli-adapter/cli-adapter.js";

const stub = (binary, argv, options) => {
  // synthesize a child that exits 0 with stdout "# Note body\n"
  const child = makeStubChild({ stdout: "# Note body\n", stderr: "", exitCode: 0 });
  // assert spawn arguments
  expect(binary).toBe("obsidian");
  expect(argv).toEqual(["read", "vault=MyVault", "file=Note"]);
  expect(options.shell).toBe(false);
  return child;
};

const result = await invokeCli(
  { command: "read", parameters: { vault: "MyVault", file: "Note" }, flags: [], target_mode: "specific" },
  { spawnFn: stub },
);

expect(result).toEqual({ stdout: "# Note body\n", stderr: "" });
```

### Scenario 2 — Happy-path active-mode strip (FR-016(b), Story 2 AC #1)

The adapter strips `vault` and `file` from `parameters` when `target_mode === "active"`, leaving non-target-locator keys (`lines`) intact.

```ts
const stub = (binary, argv) => {
  expect(argv).toEqual(["read", "lines=5"]);
  return makeStubChild({ stdout: "OK\n", stderr: "", exitCode: 0 });
};

await invokeCli(
  { command: "read", parameters: { vault: "V", file: "F", lines: 5 }, flags: [], target_mode: "active" },
  { spawnFn: stub },
);
```

### Scenario 3 — Failure-path `ERR_NO_ACTIVE_FILE` (FR-016(e), Story 3 AC #2)

A child that exits `0` with stdout starting `Error: no active file` rejects with `ERR_NO_ACTIVE_FILE` and the recovery-instruction `Error.message`.

```ts
import { UpstreamError } from "../../src/cli-adapter/cli-adapter.js";

const stub = () => makeStubChild({ stdout: "Error: no active file\n", stderr: "", exitCode: 0 });

await expect(invokeCli(
  { command: "read", parameters: {}, flags: [], target_mode: "active" },
  { spawnFn: stub },
)).rejects.toThrow(UpstreamError);

try {
  await invokeCli(/* ... */);
} catch (e) {
  expect(e).toBeInstanceOf(UpstreamError);
  expect(e.code).toBe("ERR_NO_ACTIVE_FILE");
  expect(e.cause).toBeNull();
  expect(e.details).toEqual({
    command: "read",
    stdout: "Error: no active file\n",
    stderr: "",
    exitCode: 0,
    message: "Error: no active file",
  });
  expect(e.message).toBe(
    'No active file in Obsidian. Open a note in the editor, or call this tool with target_mode: "specific" and an explicit vault/file.',
  );
}
```

### Scenario 4 — Failure-path `CLI_NON_ZERO_EXIT` (FR-016(d), Story 3 AC #1)

A child that exits with code `1` and stderr `"boom"` rejects with `CLI_NON_ZERO_EXIT`.

```ts
const stub = () => makeStubChild({ stdout: "", stderr: "boom", exitCode: 1 });

try {
  await invokeCli(/* ... */, { spawnFn: stub });
} catch (e) {
  expect(e.code).toBe("CLI_NON_ZERO_EXIT");
  expect(e.cause).toEqual({ exitCode: 1, signal: null });
  expect(e.details).toMatchObject({
    stderr: "boom",
    exitCode: 1,
    signal: null,
  });
  expect(e.details.command).toBe("<input command>");
}
```

### Scenario 5 — Boundary `ERR_NO_ACTIVE_FILE` beats `CLI_REPORTED_ERROR` (FR-016(h))

stdout `"Error: no active file. Open one or use specific mode.\n"` (longer than the bare prefix) MUST classify as `ERR_NO_ACTIVE_FILE`, not `CLI_REPORTED_ERROR`.

```ts
const stub = () => makeStubChild({
  stdout: "Error: no active file. Open one or use specific mode.\n",
  stderr: "",
  exitCode: 0,
});

try {
  await invokeCli(/* ... */, { spawnFn: stub });
} catch (e) {
  expect(e.code).toBe("ERR_NO_ACTIVE_FILE");  // priority (b)
  expect(e.code).not.toBe("CLI_REPORTED_ERROR");  // priority (c) — would fire if (b) didn't
  expect(e.details.message).toBe("Error: no active file. Open one or use specific mode.");
}
```

### Scenario 6 — Boundary signal-only termination (FR-016(j), Q3)

A child that closes with `(code: null, signal: "SIGTERM")` MUST surface `details.exitCode: -1` (sentinel), `details.signal: "SIGTERM"`.

```ts
const stub = () => makeStubChild({ stdout: "", stderr: "", exitCode: null, signal: "SIGTERM" });

try {
  await invokeCli(/* ... */, { spawnFn: stub });
} catch (e) {
  expect(e.code).toBe("CLI_NON_ZERO_EXIT");
  expect(e.details.exitCode).toBe(-1);
  expect(e.details.signal).toBe("SIGTERM");
  expect(e.cause).toEqual({ exitCode: -1, signal: "SIGTERM" });
}
```

### Scenario 7 — Consumer-side smoke (deferred to first typed-tool BI)

When the first typed-tool BI lands on top of the adapter (e.g., `read_note`), an end-to-end test against a real Obsidian instance verifies the integration. The shape of that test is:

1. Set `OBSIDIAN_BIN` to a real Obsidian CLI binary.
2. Open Obsidian with **no** active note.
3. Call the typed tool with `target_mode: "active"`.
4. Expect MCP response with `isError: true` and `code: "ERR_NO_ACTIVE_FILE"`.
5. Open a note in Obsidian.
6. Call the typed tool with `target_mode: "active"` again.
7. Expect a success response.

This scenario is not part of feature 003 (the typed tool does not exist yet) but is the empirical validator of the adapter's interface per spec.md Assumptions row 11.

## Acceptance check

After running the unit-test scenarios 1–6 above:

- All ten FR-016(a)–(j) cases pass on first run (SC-001).
- `npm run lint`, `npm run typecheck`, `npm run build`, and `npm test` all pass (constitution gates 1–4).
- The aggregate statements coverage threshold remains ≥ 84.3% (FR-017, constitution gate 5).
- The MCP server's tool-registration list at [src/server.ts](../../src/server.ts) is unchanged (FR-015).
- A spec-search of `src/tools/*/handler.ts` (excluding the legacy `obsidian_exec`) finds zero lines matching `\bError:` against raw stdout (SC-003 — single-source error detection).

If any of these checks fail, refer to:
- [data-model.md](./data-model.md) — `details` shape for each error code, state transitions.
- [contracts/cli-adapter.contract.md](./contracts/cli-adapter.contract.md) — input/output/behavioural contract.
- [contracts/errors.contract-patch.md](./contracts/errors.contract-patch.md) — the canonical-contract diff this feature applies.

## Smoke test (no real Obsidian needed)

```pwsh
npm run lint
npm run typecheck
npm run build
npm test
```

All four MUST pass. The vitest run MUST report ≥ 84.3% statements coverage (per FR-017) and the ten new test cases under [src/cli-adapter/cli-adapter.test.ts](../../src/cli-adapter/cli-adapter.test.ts) (FR-016 cases (a)–(j)) MUST appear in the green list.

## Rollback

Should the change need to be reverted, `git revert <SHA>` of the implementation commit suffices — the change is additive (one new directory `src/cli-adapter/`, one new error code in the canonical contract, one new row in the README error-codes table). No data migration; no caller-state to unwind. Pre-revert callers that imported `invokeCli` or `UpstreamError` from `src/cli-adapter/cli-adapter.js` would lose those imports and require their own revert; until typed-tool BIs land on top of this adapter, no such caller exists in tree.

The errors-contract patch and the README row are documentation-only (unless the new typed-tool BIs have already shipped against `ERR_NO_ACTIVE_FILE`, in which case those BIs are the rollback gating). ADR-004 and the Architecture document already name the code `ERR_NO_ACTIVE_FILE`, so they are unaffected by either landing or reverting this feature.
