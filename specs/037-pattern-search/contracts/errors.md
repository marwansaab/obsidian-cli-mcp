# Error Contract: pattern_search

**Feature**: 037-pattern-search
**Date**: 2026-05-17

Failures surface through `UpstreamError` (Constitution Principle IV). **Every failure code in this cohort is a reused top-level code** — the BI introduces zero new top-level codes and zero new `details.code` values, preserving the fifteen-tool zero-new-codes streak (sixteen tools as of this BI).

---

## Cohort summary

| Failure | Top-level `code` | `details` discriminator | Detection point |
|---|---|---|---|
| Missing/empty/whitespace-only pattern | `VALIDATION_ERROR` | `issues[].path = ["pattern"]` | zod schema |
| Syntactically invalid pattern | `VALIDATION_ERROR` | `issues[].path = ["pattern"]`, `issues[].message = <SyntaxError.message>` | zod `superRefine` |
| Pattern exceeds 1000 chars | `VALIDATION_ERROR` | `issues[].path = ["pattern"]` | zod schema |
| Empty folder string | `VALIDATION_ERROR` | `issues[].path = ["folder"]` | zod schema |
| `limit` out of `[1, 10000]` | `VALIDATION_ERROR` | `issues[].path = ["limit"]` | zod schema |
| `case_sensitive` not a boolean | `VALIDATION_ERROR` | `issues[].path = ["case_sensitive"]` | zod schema |
| Empty vault string | `VALIDATION_ERROR` | `issues[].path = ["vault"]` | zod schema |
| Unknown key | `VALIDATION_ERROR` | `issues[].path = ["<unknown-key>"]` | zod `.strict()` |
| Folder does not exist in vault | `CLI_REPORTED_ERROR` | `details.code = "FOLDER_NOT_FOUND"`, `details.folder = <folder>` | eval template envelope |
| Vault not registered with CLI | `CLI_REPORTED_ERROR` | `details.message: "Vault not found."` | cli-adapter stdout classifier |
| Vault registered but closed | `CLI_REPORTED_ERROR` | `details.code = "VAULT_NOT_FOUND"`, `details.reason = "not-open"` | `_eval-vault-closed-detection` |
| CLI timeout / output cap kill | `CLI_NON_ZERO_EXIT` | `details.exitCode`, `details.stderr` | cli-adapter ADR-007 bounds |
| CLI stdout malformed JSON | `CLI_REPORTED_ERROR` | `details.stage = "json-parse"`, `details.stdout = <prefix>` | handler post-parse |
| CLI stdout fails envelope schema | `CLI_REPORTED_ERROR` | `details.stage = "envelope-parse"`, `details.stdout = <prefix>` | handler post-parse |

---

## Validation-time failures (`VALIDATION_ERROR`)

All emitted by `_register.ts`'s `ZodError` → `VALIDATION_ERROR` conversion. The error envelope shape:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "pattern_search input failed schema validation",
  "details": {
    "issues": [
      { "path": [<field>], "message": <human-readable>, "code": <zod-issue-code> }
    ]
  }
}
```

### Invalid regex example

Caller passes `{ "pattern": "BI-(\\d{4}" }` (unbalanced paren).

```json
{
  "code": "VALIDATION_ERROR",
  "message": "pattern_search input failed schema validation",
  "details": {
    "issues": [
      {
        "path": ["pattern"],
        "message": "Invalid regular expression: /BI-(\\d{4}/: Unterminated group",
        "code": "custom"
      }
    ]
  }
}
```

The Node `SyntaxError.message` is surfaced verbatim — agents can branch on the issue's `path[0] === "pattern"` and surface the engine message to a human or to a downstream retry policy.

### Why invalid regex isn't a new top-level code

Two alternatives were considered and rejected (see [research.md](../research.md) R7):

- New top-level `INVALID_PATTERN` code — would break the Principle IV "zero new top-level codes" streak.
- New `details.code = "INVALID_PATTERN"` under `CLI_REPORTED_ERROR` — would grow the `details.code` cohort without functional benefit; ADR-015 evaluation becomes mandatory.

Routing through `VALIDATION_ERROR` is structurally correct: the pattern is **input** that fails **validation**, exactly the cohort `VALIDATION_ERROR` exists for.

---

## Eval-envelope failures (`CLI_REPORTED_ERROR`)

The eval template emits a discriminated envelope:

```ts
type Envelope =
  | { ok: true; count: number; matches: WireMatch[]; truncated?: true }
  | { ok: false; code: "FOLDER_NOT_FOUND"; folder: string };
```

Wrapper-side handler discriminates on `ok` and throws `CLI_REPORTED_ERROR` for the `ok: false` branch:

```json
{
  "code": "CLI_REPORTED_ERROR",
  "message": "pattern_search: folder not found in vault",
  "details": {
    "code": "FOLDER_NOT_FOUND",
    "folder": "Projects/NoSuchFolder",
    "stage": "handler-stage-3"
  }
}
```

The `details.code = "FOLDER_NOT_FOUND"` value is **reused from `paths` (BI-019)** — no new `details.code` is added. ADR-015 stays N/A because the pair `(CLI_REPORTED_ERROR, FOLDER_NOT_FOUND)` has the same single-state semantics as in `paths`.

---

## CLI-adapter failures

These bypass the handler entirely — the cli-adapter classifies before the handler post-processes.

### `Vault not found.`

The CLI returns exit code 0 with stdout starting `"Vault not found."`. The `invokeCli` facade's success-path stdout classifier re-throws as `CLI_REPORTED_ERROR`. Sibling parity with every typed tool in this surface.

### Closed-but-registered vault

A vault listed in the CLI's `vaults verbose` registry but not currently open. Detected by `_eval-vault-closed-detection` (shared module) when an `eval` invocation returns exit 0 with empty stdout AND the named vault is in the registry. Wrapper throws `CLI_REPORTED_ERROR` with `details.code = "VAULT_NOT_FOUND"`, `details.reason = "not-open"`, `details.stage = "handler-stage-0"`. Sibling parity with `paths` (BI-019).

### Timeout / output cap

Inherited from ADR-007 bounds (10 s timeout / 10 MiB output cap). Surfaces as `CLI_NON_ZERO_EXIT` with the cli-adapter's standard envelope. The pattern_search handler does **not** customise this — the inherited envelope is the contract.

---

## Stdout-parse failures

If the CLI returns exit 0 with stdout that fails the JSON parse or the envelope wire schema, the handler surfaces `CLI_REPORTED_ERROR` with a `details.stage` discriminator:

- `details.stage = "json-parse"` — `JSON.parse(stdout)` threw. The wrapper exposes `details.stdout = stdout.slice(0, 500)` for diagnostics.
- `details.stage = "envelope-parse"` — JSON parsed but the result fails `wireEnvelopeSchema.safeParse()`. The wrapper exposes `details.stdout = stdout.slice(0, 500)` for diagnostics.

Both stages are diagnostics — not sub-states under a top-level `details.code` — so ADR-015 evaluation does not engage.

---

## Principle IV compliance summary

| Aspect | Status |
|---|---|
| New top-level codes introduced | 0 |
| New `details.code` values introduced under existing top-level codes | 0 |
| New sub-states added to existing `(top-level-code, details.code)` pairs | 0 |
| Plain `throw new Error("…")` at any boundary | 0 (every failure routes through `UpstreamError` or zod) |
| Silent fallback / empty-result-masks-failure path | 0 (zero-match valid-pattern is FR-009, explicitly NOT a failure mask) |

Zero-new-codes streak: maintained.
