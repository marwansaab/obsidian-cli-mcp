# Research: Classify Malformed Base

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-11-01 | **HEAD**: `03b90b5` (spec 080 merged)

## Findings

### F1 — Where the malformed-Base outcome is lost today

`listFocusedViews` (`src/tools/views_base/handler.ts:96`) runs active-mode `base:views` and recognises one upstream report only: `NOT_A_BASE_FILE_PATTERN` (`/Active file is not a base file/i`, `handler.ts:47`). It checks for that report on the `CLI_REPORTED_ERROR` catch path and on the clean-exit path. Any other `CLI_REPORTED_ERROR` is rethrown unchanged (`handler.ts:111`). A `.base` whose YAML Obsidian cannot parse therefore surfaces as the dispatch layer's generic error:

- `code: "CLI_REPORTED_ERROR"`, built by priority (c) in `src/cli-adapter/_dispatch.ts:628-641`, with no explicit message, so the message is the default `CLI bridge upstream error: CLI_REPORTED_ERROR` (`src/errors.ts:16`);
- `details: { argv, command, stdout, stderr, exitCode: 0, message }`, where `stdout` is the full raw output, up to the 10 MiB output cap, and `message` is the parser's `Error:` line.

The parser's complaint is therefore the only cause-specific content, and it arrives raw and unbounded. That is the defect the spec describes.

A non-zero exit (`CLI_NON_ZERO_EXIT`, `_dispatch.ts:577-591`) carrying the complaint on stderr is also rethrown unchanged today.

### F2 — What reaches the agent

`registerTool`'s handler catch (`src/tools/_register.ts`, the `err instanceof UpstreamError` arm) serialises **only** `{ code, message, details }`. `UpstreamError.cause` never reaches the wire. A classified error that wraps the dispatch error as `cause` therefore stops the raw `details.stdout` from leaking. Only the new error's own `details` are published.

### F3 — The sibling's recognition (`query_base`)

`query_base` (`src/tools/query_base/handler.ts:109-139`, `CLASSIFIER_PATTERNS`) recognises YAML parser complaints with one regex, which maps to `BASE_MALFORMED` / `reason: "invalid-yaml"`. It covers the literal `yaml` tokens and the js-yaml structural phrases captured live on 2026-05-29 (BI-057), such as "Flow sequence in block collection must be sufficiently indented and end with a ]". `query_base` also has schema-level patterns (`missing-required-key`, which includes "no views defined", and `unsupported-schema-version`), and on its JSON-parse path an `unknown` fallback when stderr is non-empty (`handler.ts:409-423`). `classifyAndThrow` (`handler.ts:159-203`) composes the complaint as trimmed stderr, a newline, then trimmed stdout, and places it **unbounded** in `details.message`.

Constitution Principle I forbids a tool→tool import. To share the regex, `views_base` must not import `query_base/handler.ts`.

### F4 — The bound rule (spec 080) is already on `main`

`src/tools/_eval-parse.ts` exports `stdoutDetails(text)`, which returns `{ stdout, stdoutLength }`. The text is kept whole up to `EXCERPT_LIMIT` (1,000) characters; a longer text becomes its first and last `EXCERPT_EDGE` (500) characters around `EXCERPT_CUT_MARKER` (`"\n[… cut …]\n"`). The function is pure and has no eval coupling, so its output can be renamed at the call site. Spec 080 merged as `03b90b5`, so spec Clarifications Q1 ("do not wait on spec 080") is satisfied without any fallback code.

### F5 — The success-path false-positive risk

On a clean exit, `base:views` stdout is one `<name>\t<type>` line per view, with `<type>` in `KNOWN_VIEW_TYPES` (`table`, `cards`, `list`; `handler.ts:55`). A view legitimately named, for example, "YAML notes" or "Block mapping" contains `invalid-yaml` tokens. Scanning raw stdout on the success path would therefore turn a healthy Base into a false `BASE_MALFORMED`. `query_base` avoids the same risk with its `[`-prefix (JSON) short-circuit, which has no equivalent for line output.

### F6 — Published surface

`VIEWS_BASE_DESCRIPTION` (`src/tools/views_base/index.ts:10-21`) describes `BASE_MALFORMED` as "the named `.base` is unusable". `docs/tools/views_base.md:59` lists it with `details.reason` "—". Both must change (spec FR-013). The description is fingerprinted in `src/tools/_register-baseline.json`, so the baseline moves deliberately (`npm run baseline:write`), which is the constitution's deliberate-change gate.

### F7 — Live behaviour not yet observed

No T0 capture exists of what `base:views` prints for a malformed `.base`, in either mode. Obsidian was not running at plan time, and the authorised test vault's `Sandbox/` is empty. The spec's problem statement reports that the failure surfaces as a generic upstream error carrying the parser's text. The exact channel (stdout `Error:` line, stderr, non-zero exit) and wording still have to be captured before code is written (D7).

## Decisions

### D1 — One shared YAML-complaint pattern

- **Decision**: Move `query_base`'s `invalid-yaml` regex, unchanged byte for byte, into a new shared tool helper, `src/tools/_base-malformed.ts`, exported as `INVALID_YAML_PATTERN`. `query_base`'s `CLASSIFIER_PATTERNS` entry references the constant instead of the inline literal, and `views_base` imports the same constant.
- **Rationale**: FR-011 and SC-005 require the same broken file to classify the same way from both tools. One constant makes that structural, not a copy kept in step by hand. Principle I forbids `views_base` from importing `query_base`.
- **Alternatives**:
  - (a) Copy the regex into `views_base`. Rejected: it drifts silently the next time a probe adds a phrase.
  - (b) Import from `query_base/handler.ts`. Rejected: it is a tool→tool edge (Principle I).
  - (c) Move all of `query_base`'s patterns. Rejected: `missing-required-key` includes "no views defined", which FR-015 forbids for `views_base`, and `query_base`'s behaviour is out of scope.
- **Scope note**: `query_base`'s behaviour is byte-identical. Only where the regex literal lives changes. Its existing classifier tests are the guard.

### D2 — Where and in what order `views_base` recognises a malformed Base

- **Decision**: In `listFocusedViews`, the YAML-complaint check runs **before** the existing not-a-base check, on both paths:
  - **Failure path**: the error is an `UpstreamError` with code `CLI_REPORTED_ERROR` or `CLI_NON_ZERO_EXIT`. The scan text is the error's `details.stderr` and `details.stdout`. A YAML match yields `invalid-yaml`. Otherwise the existing not-a-base rule applies, still to `CLI_REPORTED_ERROR` only. Otherwise the error is rethrown unchanged.
  - **Clean-exit path**: the scan text is stderr plus the stdout lines that are **not** view lines. A view line is a line whose trailing tab-delimited token is a known view type, which is the same test `stripTypeLabel` uses. A YAML match yields `invalid-yaml`. Otherwise the existing not-a-base check runs, unchanged.
- **Rationale**:
  - FR-010 requires recognition on either channel, whether the report is a failure or arrives on a clean exit.
  - The spec's edge case says the YAML complaint wins over a simultaneous "not a Base file" report, because the Base is open but unusable, not absent.
  - Leaving view lines out of the scan removes the F5 false positive.
  - Widening to `CLI_NON_ZERO_EXIT` covers a stderr-only complaint. The not-a-base rule keeps its current code scope, so its behaviour does not change.
- **Alternatives**:
  - (a) Scan full stdout on the clean-exit path. Rejected because of F5.
  - (b) Recognise on the failure path only. Rejected: FR-010.
  - (c) Parse the `.base` YAML client-side. Rejected: it adds a dependency and duplicates Obsidian's parser, and the Bases cohort never parses `.base` client-side (the `query_base` description, BI-041).

### D3 — The failure's shape

- **Decision**: Both modes raise `CLI_REPORTED_ERROR` with these `details`:

  | Key | Value |
  |-----|-------|
  | `code` | `"BASE_MALFORMED"` |
  | `reason` | `"invalid-yaml"` (D2 YAML match) or `"unknown"` (named-mode not-a-base report) |
  | `base_path` | the supplied path, named mode only |
  | `message` | the bounded upstream report |
  | `messageLength` | the report's total length |

  The bounded report is the trimmed stderr and stdout joined by a newline, in that order, as `query_base` composes it, passed through `stdoutDetails` and renamed at the call site.

  Headline messages:
  - named + `invalid-yaml`: `views_base: base file at "<base_path>" is malformed: its YAML cannot be parsed`
  - open + `invalid-yaml`: `views_base: the open base file is malformed: its YAML cannot be parsed`
  - named + `unknown`: the existing `views_base: base file at "<base_path>" is structurally unusable`, unchanged

  `cause` is the dispatch error on the failure path and `null` on the clean-exit path. It is not serialised (F2).
- **Rationale**:
  - Spec Clarifications Q1 asks for a bounded complaint kept as secondary detail.
  - Clarifications Q2 asks for the closed reason set `invalid-yaml` | `unknown`, with the reason never omitted.
  - `details.message` matches the key `query_base` uses for the same complaint. `messageLength` mirrors spec 080's `stdoutLength`.
  - The headline names the cause and the path only (FR-005).
  - Keeping the existing `unknown` message keeps that path's tests and wording stable. Adding `reason` and `message` is additive under ADR-015.
- **Alternatives**:
  - (a) Spread `stdoutDetails` directly, keeping the `stdout` / `stdoutLength` keys. Rejected: the text is a combined stderr+stdout report, not stdout, and the cohort key is `message`.
  - (b) Add the active Base's path in open mode. Rejected: it needs an extra eval round trip, and the spec does not require it (Assumptions).
  - (c) Give a not-a-base report in **open** mode `BASE_MALFORMED` / `unknown`. Rejected: spec 064 fixes that case as `BASE_NOT_FOUND` / `not-open`, and FR-007 keeps that roster.

### D4 — What is never malformed

- **Decision**: `views_base` uses only `INVALID_YAML_PATTERN`. "No views defined" and absent-views wording are not recognised. A clean exit with view lines, including Obsidian's materialised default view, returns `{ views, count }` as today. An unrecognised failure is rethrown unchanged.
- **Rationale**: FR-009, FR-012 and FR-015.

### D5 — Published surface and docs

- **Decision**: Rewrite the `BASE_MALFORMED` clause of `VIEWS_BASE_DESCRIPTION` to cover both modes and the two reasons, and regenerate `_register-baseline.json` deliberately. In `docs/tools/views_base.md`, replace the single `BASE_MALFORMED` row with two rows, one per reason, each with its recovery (`invalid-yaml`: repair the file's YAML; `unknown`: open the file in Obsidian and investigate), and add a worked failure example. Add a `CHANGELOG.md` `[Unreleased]` → Fixed entry. Update the plan pointer in `CLAUDE.md`. `.docs-as-code/` is updated after review by `/speckit-docs-as-code <n>`, per the PR lifecycle.
- **Rationale**: FR-013, ADR-015 (each `(code, reason)` pair enumerated in the per-tool docs), and the MCP Tool Surface Standards fingerprint gate.

### D6 — Tests

- **Decision**: Add the contract cases M1–M15 ([contracts/views_base-malformed-contract.md](contracts/views_base-malformed-contract.md) §3) to `src/tools/views_base/handler.test.ts`, and M16 (the invalid-locator cause, completing SC-002's five-cause roster) to `src/tools/views_base/index.test.ts`. Add `src/tools/_base-malformed.test.ts` (pattern positives and negatives, including "no views defined"). Leave `query_base`'s tests unchanged; they must pass as they are.
- **Rationale**: Principle II requires happy-path and failure/boundary coverage in the same change.

### D7 — T0 live probes before code

- **Decision**: Run probes P1–P4 ([quickstart.md](quickstart.md) §3) in `TestVault-Obsidian-CLI-MCP/Sandbox/` under `.memory/test-execution-instructions.md`, against `Obsidian.com`, before implementation. They capture the exact channel and wording of a malformed `.base` under `base:views` in named and open modes, and record the result in `contracts/t0-probe-findings.md`.
- **Gate**: if P2 or P3 shows **no complaint at all**, for example Obsidian materialises a default view for an unparseable file, stop and escalate to the owner. The spec's premise would then not hold for `views_base`, and client-side parsing is out of scope (D2 (c)). If a probe shows a complaint that `INVALID_YAML_PATTERN` does not match, also stop and escalate, recording the verbatim phrase in the findings. The pattern is shared, so adding the phrase would widen `query_base` too, which BI-0137 §Out of scope excludes. Keeping a `views_base`-only addition instead would weaken FR-011 for that wording. Both are owner decisions, not implementation choices (spec Assumptions).

**No `NEEDS CLARIFICATION` remains.**
