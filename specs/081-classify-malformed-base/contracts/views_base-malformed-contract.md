# Contract: `views_base` malformed-Base classification

**Feature**: [spec.md](../spec.md) | **Research**: [research.md](../research.md) D2–D4

This contract is the published behaviour the tests in `src/tools/views_base/handler.test.ts` assert. It changes only the failure side of `views_base`. The success envelope `{ views, count }` is unchanged.

## §1 Recognition

| ID | Rule |
|----|------|
| R1 | A **YAML complaint** is any text that `INVALID_YAML_PATTERN` (`src/tools/_base-malformed.ts`) matches. The pattern is the same constant `query_base` uses for `BASE_MALFORMED` / `invalid-yaml`. |
| R2 | **Failure path**: the `base:views` call rejects with an `UpstreamError` whose `code` is `CLI_REPORTED_ERROR` or `CLI_NON_ZERO_EXIT`. The scan text is `details.stderr` and `details.stdout`. |
| R3 | **Clean-exit path**: the call resolves. The scan text is stderr plus every stdout line that is **not** a view line. A view line is a line whose trailing tab-delimited token is in `KNOWN_VIEW_TYPES`. |
| R4 | Order on both paths: (1) a YAML complaint gives `BASE_MALFORMED` / `invalid-yaml`; (2) otherwise the existing not-a-base rule applies (`/Active file is not a base file/i`, on `CLI_REPORTED_ERROR` or a clean exit, as today); (3) otherwise a failure is rethrown unchanged and a clean exit returns `{ views, count }`. |
| R5 | "No views defined" or absent-views wording is never a YAML complaint and never yields `BASE_MALFORMED`. |

## §2 Failure shapes

Top-level `code` is always an existing code. No new code, `details.code` or `stage` is added. The `details.reason` set for `BASE_MALFORMED` in `views_base` is closed: `invalid-yaml` | `unknown`.

| Case | `code` | `details` | `message` |
|------|--------|-----------|-----------|
| Named, YAML complaint | `CLI_REPORTED_ERROR` | `{ code: "BASE_MALFORMED", reason: "invalid-yaml", base_path, message, messageLength }` | `views_base: base file at "<base_path>" is malformed: its YAML cannot be parsed` |
| Open, YAML complaint | `CLI_REPORTED_ERROR` | `{ code: "BASE_MALFORMED", reason: "invalid-yaml", message, messageLength }` | `views_base: the open base file is malformed: its YAML cannot be parsed` |
| Named, not-a-base report after focus | `CLI_REPORTED_ERROR` | `{ code: "BASE_MALFORMED", reason: "unknown", base_path, message, messageLength }` | `views_base: base file at "<base_path>" is structurally unusable` (unchanged) |
| Open, not-a-base report | `CLI_REPORTED_ERROR` | `{ code: "BASE_NOT_FOUND", reason: "not-open" }` (unchanged) | `views_base: active file is not a base file` (unchanged) |
| Named, missing | `CLI_REPORTED_ERROR` | `{ code: "BASE_NOT_FOUND", reason: "named-missing", base_path }` (unchanged) | unchanged |
| Unknown vault | `VAULT_NOT_FOUND` path, unchanged | `reason: "unknown"` | unchanged |
| Invalid locator | `VALIDATION_ERROR`, unchanged | `INVALID_BASE_PATH` issues | unchanged |
| Unrecognised upstream failure | the original error, rethrown unchanged | unchanged | unchanged |

### `details.message` / `details.messageLength`

- The **report** is the trimmed stderr and the trimmed stdout (on the clean-exit path, the trimmed non-view stdout lines), joined by `"\n"` when both are non-empty, otherwise whichever one is non-empty.
- `details.message` is the report whole when it is ≤ 1,000 characters. Otherwise it is its first 500 characters, `"\n[… cut …]\n"`, then its last 500 characters. This is `stdoutDetails` from `src/tools/_eval-parse.ts`, with the keys renamed.
- `details.messageLength` is the report's full length.
- The headline `message` never contains report text, line or column positions, or file content.
- `cause` is the dispatch error on the failure path and `null` on the clean-exit path. It is not serialised to the client.

## §3 Test cases (`handler.test.ts`; M16 in `index.test.ts`)

| ID | Setup | Expect |
|----|-------|--------|
| M1 | Named; focus ok; `base:views` → exit 0, stdout `Error: Flow sequence in block collection must be sufficiently indented and end with a ] at line 3, column 5:\n    - [a, b\n    ^` | `BASE_MALFORMED` / `invalid-yaml`; `base_path` set; `message` excludes `line 3`, `column` and `- [a, b` |
| M2 | Named; `base:views` → non-zero exit, stderr carries a YAML complaint | M1's shape (`CLI_NON_ZERO_EXIT` widened) |
| M3 | Named; `base:views` → exit 0, view-free stdout, stderr carries a YAML complaint | M1's shape (clean-exit path), `cause` null |
| M4 | Open; `base:views` → M1's output | `BASE_MALFORMED` / `invalid-yaml`; no `base_path`; open-mode headline |
| M5 | Open; output carries a YAML complaint **and** `Active file is not a base file` | `BASE_MALFORMED` / `invalid-yaml`, not `BASE_NOT_FOUND` / `not-open` |
| M6 | Named; `Error: Active file is not a base file: Broken.base` (the existing test) | `BASE_MALFORMED` / `reason: "unknown"`; `message` is the bounded report; existing headline |
| M7 | Named; YAML complaint of 5,000 characters | `message.length` = 500 + marker + 500; `messageLength` = 5000; head and tail preserved |
| M8 | Named; YAML complaint of ≤ 1,000 characters | `message` = the whole trimmed report |
| M9 | Open; exit 0, stdout `YAML notes\ttable\nBlock mapping\tcards\n` | success `{ views: ["YAML notes", "Block mapping"], count: 2 }` |
| M10 | Open; exit 0, stdout `Error: No views defined` | not `BASE_MALFORMED`; the generic error rethrown unchanged |
| M11 | Open; exit 0, stdout `Table\ttable\n` (materialised default view) | success, unchanged |
| M12 | Named; `Error: something unrelated` | the original `CLI_REPORTED_ERROR` rethrown unchanged (same object) |
| M13 | Roster: malformed (M1), named-missing, not-open, unknown-vault | four pairwise-distinct `(code, details.code, details.reason)` triples |
| M14 | Every `BASE_MALFORMED` in M1–M8 and M15 | `details.reason` ∈ {`invalid-yaml`, `unknown`} and never absent |
| M15 | Named; focus ok; `base:views` → exit 0, empty stderr, stdout `YAMLException: bad indentation of a mapping entry (3:5)` with no `Error:` prefix, so dispatch resolves it as a success | `BASE_MALFORMED` / `invalid-yaml` from the clean-exit stdout scan (R3); `base_path` set; `cause` null; named-mode headline (FR-010) |
| M16 | `src/tools/views_base/index.test.ts`: `tool.handler({ base_path: "Notes/x.md" })` | `isError: true`; the payload's `code` is `VALIDATION_ERROR` and `details.issues[0].message` starts `INVALID_BASE_PATH/wrong-extension`. Its top-level code differs from the `CLI_REPORTED_ERROR` of all four M13 causes, so the five SC-002 causes are pairwise-distinct. |

`src/tools/_base-malformed.test.ts`:

- the BI-057 phrase and a literal `YAMLException` match;
- `No views defined`, `missing required key` and a plain view name without YAML terms do not match.

## §4 Unchanged

- The success envelope, view-name cleaning, emission order and default-view behaviour.
- Named and open selection, the focus step and its `BASE_NOT_FOUND` / `named-missing` remap.
- `query_base` behaviour: its `CLASSIFIER_PATTERNS` reference the shared constant, with the same regex source and flags.
- `src/errors.ts`, `src/cli-adapter/**`, `src/server.ts` and every schema.
