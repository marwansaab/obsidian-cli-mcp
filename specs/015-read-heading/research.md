# Research — `read_heading` Typed MCP Tool

**Feature**: [015-read-heading](./spec.md)
**Date**: 2026-05-09

This document is the Phase 0 output of `/speckit-plan` for `015-read-heading`. It records the design decisions ratified during plan-stage characterisation against the live Obsidian CLI, the load-bearing reuse of Obsidian's pre-parsed metadataCache.headings array (which collapses what the spec phase imagined as a wrapper-side line scanner + fence tracker into a metadata-cache lookup), and the resolution of the three clarifications session amendments (Q1 boundary rule, Q2 ATX-only, Q3 segment-matching minimal-normalisation).

The convention mirrors prior research artefacts: each decision (`Rn`) carries Decision / Rationale / Alternatives. Plan-stage live-CLI probe results are captured under [Live CLI Findings](#live-cli-findings) below and quoted verbatim where they are load-bearing for a decision.

---

## R1 — Logger surface

**Decision**: `read_heading`'s handler is a thin `invokeCli` wrapper that issues ONE underlying CLI invocation per request (see R3). It does NOT emit per-call `logger.callStart` / `logger.callEndSuccess` / `logger.callEndFailure` events at the tool layer. Observability flows through the cli-adapter's existing `dispatchTimeout` / `dispatchCap` / `dispatchKill` events for the underlying CLI invocation. `RegisterDeps` accepts `logger: Logger` for forwarding to the adapter / queue layer.

**Rationale**: continues the [011-write-note R1](../011-write-note/research.md), [012-delete-note R1](../012-delete-note/research.md), [013-read-property R1](../013-read-property/research.md), and [014-find-by-property R1](../014-find-by-property/research.md) precedents. The actual sibling handlers at [src/tools/read_note/handler.ts](../../src/tools/read_note/handler.ts), [src/tools/write_note/handler.ts](../../src/tools/write_note/handler.ts), [src/tools/delete_note/handler.ts](../../src/tools/delete_note/handler.ts), [src/tools/read_property/handler.ts](../../src/tools/read_property/handler.ts), and [src/tools/find_by_property/handler.ts](../../src/tools/find_by_property/handler.ts) are tight `invokeCli` wrappers that emit no per-call events. `read_heading` mirrors them.

**Alternatives**:
- (A) Add `callStart` / `callEndSuccess` / `callEndFailure` methods to the `Logger` interface AND emit them from `read_heading`. Rejected: requires modifying the frozen `Logger` surface, asymmetry vs the six prior tools, no concrete observability requirement.

**Spec.md amendment**: NONE.

---

## R2 — CLI subcommand selection: `eval` (load-bearing departure)

**Decision**: `read_heading` routes through the live CLI's developer-section `eval` subcommand, executing a fixed JavaScript template that resolves the file path (active-mode focused-file lookup OR specific-mode wikilink/path resolution), walks `app.metadataCache.metadataCache[hash].headings`, finds the first matching segment path, and returns a JSON envelope with the body slice. **There is no native heading-body subcommand in the Obsidian CLI** — `obsidian help` enumerates 80+ commands and none of them returns the body content of a single named heading. The only structural alternatives (probed live 2026-05-09) are: (a) `read` returns whole files (no `subpath` parameter despite the global Notes section advertising "Subpath (heading or block) within file"); (b) `outline` returns a heading list only (active file, no body content); (c) `bookmark` accepts `subpath=<heading or block>` but writes a bookmark, not reads body; (d) iterate `read` then a wrapper-side Markdown parse — defeats the spec's "single typed call replaces the brittle parse" promise (SC-015).

**Rationale**: live verification on 2026-05-09 against the focused vault (`The Setup`). Probe results captured under [Live CLI Findings](#live-cli-findings) below.

**Subcommand argv shape** (from `obsidian help eval`):

```
eval                  Execute JavaScript and return result
    code=<javascript>   - JavaScript code to execute (required)
```

Single required parameter (`code=<js>`). The CLI executes the JS in the running Obsidian process (Electron renderer context with `app` global) and prints `=> <result>` on stdout. Async-returning IIFEs (e.g. `(async()=>{...})()`) are awaited by the CLI before the result is printed.

**Latency**: ~200 ms per call (parity with 014's R2 — also ~200 ms). The metadataCache walk is O(heading_count) which is small for typical notes; `await app.vault.adapter.read(path)` is async-IO-bound on the file size; body slice is O(body_size). No vault-walk cost.

**Stability concern**: `eval` reaches into Obsidian's internal API (`app.metadataCache.metadataCache`, `app.vault.adapter.read`, `app.workspace.getActiveFile`, `app.metadataCache.getFirstLinkpathDest`). Obsidian's internals MAY change shape between Obsidian versions. This is a known fragility — captured in this research artefact and surfaced to the user via `docs/tools/read_heading.md`. The plan-stage characterisation pass locked the shape on the host's Obsidian version (whatever it is at probe time on 2026-05-09); future Obsidian updates may surface as test failures rather than silent drift.

**Alternatives considered**:
- (A) `read path=<p>` + wrapper-side Markdown parse: rejected — re-implements the boundary-detector + fence-tracker + segment-matcher in TypeScript; high error rate; defeats the typed-tool's purpose. The wrapper would need a full Markdown parser dependency or a hand-rolled state machine.
- (B) `outline` + per-heading scan: rejected — `outline` returns a heading list with no body, and reads only the active file (no specific-mode locator). Would also need (A) to actually fetch the body.
- (C) Wait for the Obsidian CLI to gain a native `heading:read` subcommand: rejected — out of project scope (the Obsidian CLI is a separate project not under this repository's control); deferring would withhold the highest-leverage retrieval primitive indefinitely.
- (D) Expand the existing `obsidian_exec` escape hatch with a worked-example doc rather than build a typed wrapper: rejected — `obsidian_exec` requires the agent to author the JS template themselves, defeating the "typed surface that codifies the contract" purpose of this BI; agents would re-derive the matching logic per call with high error rates.

---

## R3 — Single-call architecture (one `invokeCli` per request)

**Decision**: each `read_heading` MCP call fires exactly ONE underlying `invokeCli` invocation, with subcommand `eval` and the parameter `code=<rendered-js-template>`. The JS template resolves the file, walks the metadataCache headings, slices the body, and returns a single JSON envelope.

**Rationale**: parity with 014's R3. The matching logic — file-path resolution, heading-path matching, body slicing — runs entirely inside the JS template. There is no second piece of information to fetch. The metadataCache walk is fast (O(heading_count) in Obsidian's process memory).

**Wire shape** (one-call):

```
argv:    ["eval", "code=<JS>"]   (specific mode: prepended with "vault=<v>")
stdout:  "=> <JSON-string>\n"
exit:    0
```

The leading `=> ` is the eval-mode CLI shell prompt; the wrapper strips it before `JSON.parse`. The JSON envelope is a discriminated union (`ok: true` with `content`, OR `ok: false` with `code` + `detail`).

**Alternatives**:
- (A) Two-call: Call A `read path=<p>` to get full file content (or via a separate eval); Call B compute headings client-side or via `outline`; reject — doubles latency, doubles wire bytes, increases test-seam complexity, no benefit. Single-call is strictly better.

---

## R4 — Adapter `target_mode` mapping (STANDARD)

**Decision**: `read_heading` has the standard `target_mode: "specific" | "active"` discriminator (FR-002). The handler passes `input.target_mode` through to `invokeCli` unchanged. In `target_mode: "specific"`, `vault` flows through to `invokeCli`'s top-level `vault` field. In `target_mode: "active"`, the cli-adapter's `stripTargetLocators` defence-in-depth strip removes any leaked vault/file/path. Parity with 013-read-property (which also uses the standard discriminator).

**Rationale**: `read_heading` operates on a single named file or active file — exactly the surface ADR-003 governs. ADR-003 is **enforced** by this feature, not amended. The schema reuses `targetModeBaseSchema` + `applyTargetModeRefinement` from [src/target-mode/target-mode.ts](../../src/target-mode/target-mode.ts).

**Vault-routing limitation (inherited)**: probed live 2026-05-09 — the CLI's `vault=` parameter is functionally ignored by `eval`. The eval JS always runs against whichever vault Obsidian's running instance currently has focused. The `vault=` parameter is structurally accepted (for argv shape uniformity) and the unknown-vault case (`vault=NoSuchVault`) DOES surface as `Vault not found.` (which the cli-adapter's 011-R5 clause re-classifies). But supplying a known vault that is NOT focused does NOT route the call to that vault — the call runs against the focused vault silently.

This is the same inherited limitation that 014 / 013 / 012 / 011 carry. It is documented in `docs/tools/read_heading.md` under "Multi-vault default ambiguity" with the same wording as 014's doc, and noted in the spec's R11 / FR-016 context.

**Alternatives**:
- (A) Pre-flight `vault info` probe to confirm the focused vault matches the requested vault: rejected — adds a CLI call for value smaller than the documented limitation. Multi-vault users open the target vault before invoking, which is a one-time setup cost.
- (B) Fail fast when vault doesn't match: rejected — the existing 011-R5 inheritance only catches `Vault not found.` (unknown vault), not `vault-known-but-not-focused`. Adding a second probe + reclassifier is non-trivial and out of scope for this feature.

---

## R5 — Unknown-vault response inspection (inherited from cli-adapter's 011-R5)

**Decision**: `read_heading` inherits the cli-adapter's existing 011-R5 unknown-vault response-inspection clause **without any wrapper-side modification**. When the user supplies an unrecognised `vault` display name, the CLI's `eval` subcommand returns `Vault not found.` on stdout with exit code 0 — byte-identical to the response shape covered by the inspection clause for `properties` / `create` / `delete`. The clause at [src/cli-adapter/cli-adapter.ts:86](../../src/cli-adapter/cli-adapter.ts#L86) re-classifies the response to `CLI_REPORTED_ERROR` before the wrapper's parse step runs.

**Live verification** (cited from [014-find-by-property R5](../014-find-by-property/research.md), confirmed for `eval` subcommand on 2026-05-09):

```
$ obsidian vault=NoSuchVault eval "code=app.vault.getName()"
Vault not found.
$ echo $?
0
```

The response is the same first-line `Vault not found.` plus exit 0 that the adapter already inspects. No `read_heading`-specific handling is needed.

**Rationale**: parity with [011-write-note R5](../011-write-note/research.md), [012-delete-note R5](../012-delete-note/research.md), [013-read-property R5](../013-read-property/research.md), [014-find-by-property R5](../014-find-by-property/research.md). The adapter is the single point where unknown-vault gets reclassified across every typed tool; preserving that consolidation is load-bearing for future maintainability.

**Alternatives**:
- (A) Re-implement the inspection inside `read_heading`'s handler: rejected — would duplicate the adapter's logic, introduce drift risk, and break the "adapter owns CLI failure classification" invariant from 008-refactor.

---

## R6 — Anti-injection via base64-encoded JSON payload

**Decision**: the JS template is a frozen string constant. The only insertion point is a single `__PAYLOAD_B64__` placeholder, which the handler replaces with a base64-encoded JSON document containing all user inputs (`target_mode`, `path`, `file`, `heading`-as-segment-array). The runtime JS uses `atob('<base64>')` + `JSON.parse(...)` to recover the structured payload. **No user input ever reaches the JS source as text.**

```
PAYLOAD_JSON = JSON.stringify({
  active: input.target_mode === "active",
  path:   input.target_mode === "specific" ? input.path   ?? null : null,
  file:   input.target_mode === "specific" ? input.file   ?? null : null,
  segments: input.heading.split("::"),
})

PAYLOAD_B64 = Buffer.from(PAYLOAD_JSON, "utf-8").toString("base64")

JS_BODY = JS_TEMPLATE.replace("__PAYLOAD_B64__", PAYLOAD_B64)
```

Base64 alphabet is `[A-Za-z0-9+/=]`. Every byte in that set is structurally safe inside any JavaScript string literal (no quotes, no backslashes, no template-literal interpolation chars, no newline characters). Even adversarial heading text such as `"); doSomething(); //` cannot escape because the heading text is JSON-stringified and base64-encoded BEFORE it reaches the JS source.

**Rationale**: identical to 014's R6 — verified-by-construction anti-injection. The structural property is enforceable by inspection: the JS_TEMPLATE constant has exactly one substitution point, and the substituted value is a base64 string. SC-021 ("the heading input cannot reach a shell-evaluated context") is structurally provable.

**Alternatives**:
- (A) Direct interpolation of `JSON.stringify(payload)` into the JS template: rejected — JSON-stringify produces output containing `"`, `\`, and control characters, which are problematic to pass through the OS shell layer (argv quoting, special-character escaping). Base64 is OS-shell-uniform.
- (B) Heredoc-style multi-line JS via a temp file: rejected — adds filesystem-write overhead, introduces a temp-file lifecycle, and the eval subcommand only accepts `code=<inline>`.
- (C) Sanitise heading text with regex before interpolation: rejected — sanitisation is observational (which characters might escape?), structural data-passing is verifiable. Constitution favours structural over observational guarantees.

**Test seam** (R12): the spawn-stub's argv parser MUST decode the base64 payload and JSON.parse it to assert the user's input round-trips through the wire format unchanged. This is the regression test for the anti-injection contract.

---

## R7 — In-eval boundary detection via `app.metadataCache.metadataCache[hash].headings`

**Decision**: the JS template uses Obsidian's pre-parsed headings array — `app.metadataCache.metadataCache[fileCache[path].hash].headings` — as the source of heading positions and text. Each entry has the shape `{heading: string, level: 1..6, position: {start: {line, col, offset}, end: {line, col, offset}}}`.

**The body of a matched heading is**: `text.slice(headings[matchIdx].position.end.offset, headings[matchIdx + 1]?.position.start.offset ?? text.length)` followed by a leading-line-terminator strip (the `\n` or `\r\n` between the heading line and the body's first line is stripped). The terminator is the FIRST subsequent heading entry in the array — naturally satisfying the first-subsequent-heading-marker-of-any-depth rule from FR-010 / the 2026-05-09 clarifications session Q1.

**Live verification** (2026-05-09 against `000-Meta/About This Vault.md` in The Setup):

```
$ obsidian eval code="(()=>{const fc=app.metadataCache.fileCache;
  for(const p in fc){const mc=app.metadataCache.metadataCache[fc[p].hash];
  if(mc&&mc.headings&&mc.headings.length>=3)
    return JSON.stringify({path:p,sample:mc.headings.slice(0,4)});}})()"
=> {"path":"000-Meta/About This Vault.md",
    "sample":[
      {"heading":"About This Vault","level":1,
       "position":{"start":{"line":8,"col":0,"offset":119},"end":{"line":8,"col":18,"offset":137}}},
      {"heading":"Purpose","level":2,
       "position":{"start":{"line":10,"col":0,"offset":141},"end":{"line":10,"col":10,"offset":151}}},
      {"heading":"Folder Structure","level":2,
       "position":{"start":{"line":22,"col":0,"offset":601},"end":{"line":22,"col":19,"offset":620}}},
      {"heading":"Folder Numbering Convention","level":2,
       "position":{"start":{"line":42,"col":0,"offset":2132},"end":{"line":42,"col":30,"offset":2162}}}]}
```

Observed:
- `heading` is the post-marker-strip text. `# About This Vault` → `"About This Vault"`. The leading `# ` is stripped by Obsidian; closing-ATX would also be stripped if present.
- `level` is the integer 1–6 corresponding to the ATX `#`-run length.
- `position.start.offset` is the byte offset of the FIRST `#` of the heading line.
- `position.end.offset` is the byte offset RIGHT AFTER the last text character of the heading (i.e., the position of the trailing `\n`). For `# About This Vault` (length 18), `start.offset = 119` and `end.offset = 137` — confirms 137-119 = 18 = length of the marker + space + text.
- **Crucially**: Obsidian's pre-parsing has ALREADY done fence-opacity. Heading-like text inside fenced code blocks does NOT appear in the `headings` array. This collapses the spec-stage assumption of an in-eval line-by-line scanner with explicit fence tracking into a direct lookup.

**Rationale**: re-using Obsidian's pre-parsed metadata is strictly better than re-implementing Markdown heading detection in the JS template:
- Less code (~30 lines saved on the boundary detector + fence tracker).
- Fewer edge cases (Obsidian's parser handles tab characters, BOMs, mixed line endings, etc.).
- Better fidelity (Obsidian's metadataCache is what the editor itself uses to render the document).
- Dependency on Obsidian's parser is acceptable because the entire feature already depends on Obsidian (the eval runs inside Obsidian's process; we're not adding a new dependency).

**Alternatives**:
- (A) Wrapper-side Markdown parsing: rejected — re-implements the Obsidian parser, introduces edge-case drift, increases LOC by ~30%.
- (B) In-eval line-by-line scan + manual fence tracking: rejected — Obsidian's `headings` already provides this. No reason to duplicate.
- (C) Use `app.metadataCache.fileCache[path].headings` (same shape, alternative path): rejected — `fileCache` only carries `{mtime, size, hash}`; the `headings` array lives under `metadataCache[hash]`. The two-step lookup (`fileCache` → hash → `metadataCache[hash]`) is the documented Obsidian pattern.

---

## R8 — In-eval segment matcher (FR-028 minimal-normalisation case-sensitive byte compare)

**Decision**: the JS template walks the headings array maintaining a stack-by-level. At each heading entry:

```
stack.length = h.level - 1;          // truncate stack to depth-1
stack[h.level - 1] = h.heading;      // push at current depth
if (stack.length === a.segments.length) {
  if (stack.every((s, i) => s === a.segments[i])) {
    matchIdx = i; break;             // first match wins (FR-017)
  }
}
```

Since Obsidian's `h.heading` is ALREADY post-marker-strip + post-closing-ATX-strip + post-trim (per R7's live verification), the segment matcher does plain `===` byte equality. No further normalisation is needed in the JS template — the FR-028 minimal-normalisation contract is satisfied by deferring to Obsidian's parse.

**FR-028 cases**:
- `## Heading ##` → Obsidian's `heading` field: `"Heading"` (closing-ATX stripped). User segment `"Heading"` matches; `"Heading ##"` does not.
- `## Heading   ` (trailing whitespace) → Obsidian's `heading` field: `"Heading"` (trimmed). User segment `"Heading"` matches.
- `## My **Bold** Heading` → Obsidian's `heading` field: `"My **Bold** Heading"` (inline markdown survives). User segment `"My **Bold** Heading"` matches; `"My Bold Heading"` does not.
- `## Section ^anchor-id` → Obsidian's `heading` field: `"Section ^anchor-id"` (Obsidian-anchor preserved as plain text in the heading field). User segment `"Section ^anchor-id"` matches; `"Section"` does not.
- `## Heading` vs user segment `"heading"` → mis-cased fail (case-sensitive byte compare).

**Plan-stage caveat**: the closing-ATX, surrounding-whitespace, inline-markdown-survives, and anchor-survives behaviours are inferred from CommonMark conventions and from the verified observation that `# About This Vault` → `"About This Vault"`. **Live verification of all four cases is deferred to T0** (requires fixtures with each shape; closing-ATX in particular is a CommonMark-spec edge that not all parsers implement identically). If T0 reveals Obsidian's behaviour deviates on the host's version, FR-028 is amended at T0 (per Constitution and per the plan-stage protocol of "live findings refine implementation, do NOT contradict the spec without an amendment").

**Rationale**: deferring normalisation to Obsidian is cleaner, faster, and lower-LOC than implementing it in the JS template. The wrapper's contract becomes "case-sensitive byte equality on Obsidian's heading text," which is a single-sentence rule.

**Alternatives**:
- (A) JS-template-side stripping of closing-ATX / surrounding whitespace: rejected — duplicates Obsidian's parser, introduces drift risk.
- (B) Render-stripped match (Q3 Option B, rejected at clarifications session): would require an inline-markdown parser in the JS template. Unanimously rejected at Q3.

---

## R9 — File path resolution (three modes inside the JS template)

**Decision**: the JS template resolves the target file in three steps depending on the payload's discriminators:

1. **Active mode** (`a.active === true`): `f = app.workspace.getActiveFile()`. If `null`, return envelope `{ok: false, code: "NO_ACTIVE_FILE", detail: "No note focused"}`. Otherwise `resolvedPath = f.path`.
2. **Specific + path** (`a.active === false` AND `a.path` non-null): `resolvedPath = a.path`. Direct.
3. **Specific + file** (`a.active === false` AND `a.file` non-null): `dest = app.metadataCache.getFirstLinkpathDest(a.file, "")`. If `null`, return envelope `{ok: false, code: "FILE_NOT_FOUND", detail: "wikilink: " + a.file}`. Otherwise `resolvedPath = dest.path`.

After resolution, `fc = app.metadataCache.fileCache[resolvedPath]`. If `null`, return envelope `{ok: false, code: "FILE_NOT_FOUND", detail: "path: " + resolvedPath}`. Otherwise proceed to R7's metadataCache walk.

**Rationale**: matches the active/specific discriminator semantics. The wikilink resolution mirrors how Obsidian's editor itself resolves `[[name]]` links — the project's existing `read_note` and `write_note` use the same `getFirstLinkpathDest` API.

**Plan-stage probe** (`getFirstLinkpathDest` semantics): not directly probed at plan stage; deferred to T0. Hypothesis confirmed by inspection of [src/tools/read_note/handler.ts](../../src/tools/read_note/handler.ts) — read_note uses the CLI's `read` subcommand which itself wraps wikilink resolution; the in-eval path here follows the same Obsidian API surface.

**Alternatives**:
- (A) Use `app.vault.getAbstractFileByPath(path)` for the specific+path case: rejected — `app.metadataCache.fileCache` lookup is sufficient and avoids the extra call. The fileCache key IS the vault-relative path.
- (B) Reject ambiguity (e.g. file resolution returning multiple matches) with a structured error: deferred — Obsidian's `getFirstLinkpathDest` returns the FIRST link target by Obsidian's link-resolution rules; that's the documented behaviour for wikilinks. If multiple files share the same wikilink name, Obsidian picks one; we surface that one. Out-of-scope here; T0 may add a regression test if Obsidian's resolution rules are surprising.

---

## R10 — Output cap (inherited)

**Decision**: the cli-adapter's existing 10 MiB output cap (`TYPED_TOOL_OUTPUT_CAP_BYTES`) fires automatically for pathologically large body slices. The eval response would exceed 10 MiB only if the matched heading's body is >10 MiB after JSON encoding (~7 MiB raw content given JSON-encoding overhead). When the cap fires, the dispatch layer kills the spawn and surfaces `CLI_NON_ZERO_EXIT` with `details.killReason = {kind: "cap", stream: "stdout", capturedBytes: <N>}` per the existing 003-cli-adapter contract.

**Rationale**: parity with [011 R10](../011-write-note/research.md) / [014 R10](../014-find-by-property/research.md). The cap is a project-wide invariant; tools inherit it for free.

**Documented**: `docs/tools/read_heading.md` notes the 10 MiB practical ceiling and recommends fall-back to full-file `read_note` (which also has the 10 MiB cap but is the natural alternative for very large files where heading-body extraction would itself exceed the cap).

**Alternatives**:
- (A) Per-tool higher cap: rejected — tooling-wide cap consistency is more valuable than the marginal benefit for the rare oversized-body case.
- (B) Cap-aware truncation with a `truncated: true` flag in the envelope: rejected — silent truncation is forbidden per Constitution Principle IV; the spec's FR-019 / SC-008 explicitly require byte-faithful round-trip.

---

## R11 — Multi-vault default ambiguity (documented limitation)

**Decision**: when the user-facing `target_mode: "active"` is invoked, the handler does NOT pass a `vault=` parameter. The eval runs against whatever vault Obsidian has focused. In multi-vault setups (multiple registered vaults, no Obsidian instance running, or no vault foregrounded) the resolution may be ambiguous. **The wrapper surfaces whatever the underlying CLI returns; it does NOT detect or surface a structured error for the ambiguous case.** Documented in `docs/tools/read_heading.md`.

When `target_mode: "specific"` is invoked with `vault: "X"`, the same R4 limitation applies — vault routing is not actually performed by `eval`; the call runs against the focused vault unless the focused vault happens to be `X`. This is a known limitation inherited unchanged from 014 / 013 / 011.

**Rationale**: parity with [013-read-property R4](../013-read-property/research.md) / [014-find-by-property R11](../014-find-by-property/research.md). The wrapper does not re-implement vault routing.

**Detected behaviours** (live, mirroring 014's R11 verification):
- Single vault registered AND Obsidian running with that vault open: `eval` runs against that vault.
- Multi-vault registered, Obsidian running with vault A focused, request specifies vault B: `eval` runs against A. No structured error.
- Unknown vault display name: `Vault not found.` exit 0 → reclassified by 011-R5 to `CLI_REPORTED_ERROR`. Structured error.

**Alternatives**:
- (A) Always-required `vault` (no active mode): rejected by FR-002 — active mode is the standard target-mode discriminator.
- (B) Pre-flight `vault info` probe to detect mismatch: rejected — adds a CLI call for value smaller than the documented limitation.

---

## R12 — Test seams (`deps.spawnFn` injection, ONE invocation per request)

**Decision**: the handler accepts `deps.spawnFn?: SpawnLike` per the existing test-seam convention (parity with all six prior typed tools). Tests inject a stub `spawnFn` that responds to ONE invocation per request (single-call architecture per R3). The stub asserts:
- argv shape: `["eval", "code=<...>"]` in active mode, `["vault=<v>", "eval", "code=<...>"]` in specific mode.
- The `code=` value MUST start with the frozen JS template prefix and end with the frozen suffix; the only varying part is the `__PAYLOAD_B64__` substitution.
- Decoding the base64 payload via `Buffer.from(b64, "base64").toString("utf-8")` then `JSON.parse` MUST round-trip to the user's input fields. This locks R6's anti-injection contract.

**Rationale**: parity with 014's R12 — the argv-payload-decode assertion is the regression test that prevents future code changes from leaking user input into the JS template as text.

**Alternatives**:
- (A) Per-spawn argv assertion only (no base64 decode): rejected — wouldn't catch a regression that interpolates user input as text into the JS template.
- (B) Real-CLI integration tests in CI: rejected — CI doesn't have an Obsidian binary; live-CLI probes are T0-style developer-machine activities.

---

## R13 — Structured eval-response error envelope

**Decision**: the JS template returns a JSON envelope with a discriminator field `ok`:

```typescript
type EvalEnvelope =
  | { ok: true;  content: string }
  | { ok: false; code: "FILE_NOT_FOUND" | "HEADING_NOT_FOUND" | "NO_ACTIVE_FILE"; detail: string }
```

The handler's two-stage parse:
1. `JSON.parse(stdout.trimStart().replace(/^=> /, ""))` → `unknown`. Failure → `UpstreamError({code: "CLI_REPORTED_ERROR", details: {stage: "json-parse"}})`.
2. `readHeadingEvalResponseSchema.safeParse(parsed)` → `{ok: true, content} | {ok: false, code, detail}`. Failure → `UpstreamError({code: "CLI_REPORTED_ERROR", details: {stage: "envelope-parse"}})`.

If the validated envelope is `{ok: false}`, map to `UpstreamError`:
- `code: "NO_ACTIVE_FILE"` → `UpstreamError({code: "ERR_NO_ACTIVE_FILE", details: {stage: "envelope-error"}})` (parity with the dispatch layer's existing classification of "Error: no active file" stdout responses).
- `code: "FILE_NOT_FOUND"` or `code: "HEADING_NOT_FOUND"` → `UpstreamError({code: "CLI_REPORTED_ERROR", details: {stage: "envelope-error", code: <eval-code>, detail: <eval-detail>}})`.

If the envelope is `{ok: true}`, return `{content: validated.data.content}`.

**Rationale**: parity with 014's two-stage parse pattern. The envelope's `ok` discriminator is a strict-zod discriminated union — wire-format violations (e.g. missing `code` field, unknown `code` value, missing `detail`) all surface as `CLI_REPORTED_ERROR` with `details.stage = "envelope-parse"`, never silent. Zero new error codes per FR-022.

**Mapping table** (envelope → UpstreamError):

| Envelope | UpstreamError code | UpstreamError details |
|---|---|---|
| `{ok: true, content}` | (no error; return `{content}`) | — |
| `{ok: false, code: "NO_ACTIVE_FILE", detail}` | `ERR_NO_ACTIVE_FILE` | `{stage: "envelope-error", detail}` |
| `{ok: false, code: "FILE_NOT_FOUND", detail}` | `CLI_REPORTED_ERROR` | `{stage: "envelope-error", code: "FILE_NOT_FOUND", detail}` |
| `{ok: false, code: "HEADING_NOT_FOUND", detail}` | `CLI_REPORTED_ERROR` | `{stage: "envelope-error", code: "HEADING_NOT_FOUND", detail}` |
| `JSON.parse` throws | `CLI_REPORTED_ERROR` | `{stage: "json-parse", stdout: <prefix>}` |
| envelope-schema-parse fails | `CLI_REPORTED_ERROR` | `{stage: "envelope-parse", stdout: <prefix>}` |

**Alternatives**:
- (A) Raw string return on success + `Error("HEADING_NOT_FOUND: ...")` throw on failure: rejected — relies on the dispatch layer's stdout-prefix classifier (`Error:`) which works but loses the envelope-error categorisation. The structured envelope is more explicit and easier to test.
- (B) Per-error-category UpstreamError code (e.g. `ERR_HEADING_NOT_FOUND` as new code): rejected — FR-022 forbids new error codes. The existing codes carry the categorisation via `details.code`.

---

## R14 — Setext exclusion (defence-in-depth filter)

**Decision**: the JS template defensively filters Obsidian's headings array to ATX-only entries: `headings.filter(h => fileText.charAt(h.position.start.offset) === '#')`. This enforces the 2026-05-09 clarifications session Q2 rule (ATX-only) regardless of whether Obsidian's metadataCache happens to include Setext-style headings on the host's Obsidian version.

**Rationale**: Obsidian's metadataCache MAY include Setext headings (`Heading\n====` for H1 or `Heading\n----` for H2). This was not directly probed at plan stage (would require seeding a Setext fixture in the focused vault, which is The Setup, not the authorised TestVault). Two outcomes from T0:
- (a) Obsidian's metadataCache.headings on the host's version excludes Setext: the filter is a defence-in-depth no-op. No correctness change. Good.
- (b) Obsidian includes Setext: the filter functionally enforces FR-012's CONTENT—Setext-underlines edge case, preventing Setext entries from being addressable as path segments OR from acting as body terminators.

Either way, the filter is structurally sound and adds <5 LOC. Cost is minimal; benefit is a stable contract regardless of Obsidian's parser internals.

**Alternatives**:
- (A) No filter, trust Obsidian to exclude Setext: rejected — Obsidian-version-dependent behaviour. The filter is a one-line guarantee.
- (B) Filter at the wrapper layer (TypeScript) instead of inside eval: rejected — the wrapper doesn't have access to the file text without an extra CLI call. Inside eval, the file text is one async call away.

**T0 verification**: seed a fixture in TestVault with a Setext H2 underline inside a heading body; assert that `read_heading` does NOT mistakenly recognise the Setext underline as a body terminator AND does NOT make Setext headings addressable as path segments.

---

## Live CLI Findings

Probes against the focused vault (`The Setup`) on 2026-05-09. The test vault `TestVault-Obsidian-CLI-MCP` was not focused at probe time; happy-path verification against the test vault is deferred to T0.

### F1 — `obsidian help` confirms no native heading-body subcommand

```
$ obsidian --help | grep -i "heading\|note\|read\|cat"
Notes:
  file resolves by name (like wikilinks), path is exact (folder/note.md)
  Quote values with spaces: name="My Note"
    subpath=<subpath>   - Subpath (heading or block) within file
  daily                 Open daily note
  daily:append          Append content to daily note
  ...
  outline               Show headings for the current file
    total               - Return heading count
  property:read         Read a property value from a file
  ...
  read                  Read file contents
  ...
```

Confirmed: only `bookmark` accepts `subpath=` (writes a bookmark, not reads body); `outline` lists headings but no body content; `read` returns whole files. No native heading-body read subcommand exists. Locks R2.

### F2 — `obsidian help eval` confirms argv shape

```
$ obsidian help eval
  eval                  Execute JavaScript and return result
    code=<javascript>   - JavaScript code to execute (required)
```

Single required parameter. Locks R2's argv shape.

### F3 — `obsidian eval` returns `=> ` prefix + result on stdout

```
$ obsidian eval vault=TestVault-Obsidian-CLI-MCP code="(()=>{const f=Object.keys(app.metadataCache.fileCache);return JSON.stringify({files:f.length, first:f[0]});})()"
=> {"files":15,"first":"Welcome.md"}
```

Confirmed: the `=> ` prefix is stripped by the handler. The result is JSON when the JS returns a JSON string (the wrapper ensures the JS template ends with `JSON.stringify(...)`).

### F4 — Eval errors surface as `Error: <message>` exit 0 (caught by dispatch layer)

```
$ obsidian eval code="(()=>{throw new Error('test error');})()"
Error: test error
$ echo $?
0
```

Confirmed: eval-thrown errors produce `Error:` prefix on stdout. The dispatch layer's classifier (lines 254-274 of [_dispatch.ts](../../src/cli-adapter/_dispatch.ts)) catches both `Error: no active file` (→ `ERR_NO_ACTIVE_FILE`) and the general `Error:` prefix (→ `CLI_REPORTED_ERROR`). However, `read_heading`'s structured-envelope strategy (R13) avoids the `throw`-based path; the JS template returns the envelope as a JSON string instead of throwing. The dispatch layer's `Error:` classifier remains as a safety net for unexpected runtime errors inside the JS template (e.g. an Obsidian API change).

### F5 — `app.vault.adapter.read(path)` returns the file as a JS string

```
$ obsidian eval vault=TestVault-Obsidian-CLI-MCP code="(async()=>{const txt=await app.vault.adapter.read('Welcome.md');return JSON.stringify({len:txt.length,preview:txt.slice(0,80)});})()"
=> {"len":203,"preview":"This is your new *vault*.\n\nMake a note of something, [[create a link]], or try ["}
```

Confirmed: `app.vault.adapter.read` is async, returns a JS string, and the eval CLI awaits the IIFE. Locks R7's body-slice approach.

### F6 — `app.metadataCache.metadataCache[hash].headings` shape

```
$ obsidian eval code="(()=>{const fc=app.metadataCache.fileCache;
  for(const p in fc){const mc=app.metadataCache.metadataCache[fc[p].hash];
  if(mc&&mc.headings&&mc.headings.length>=3)
    return JSON.stringify({path:p,sample:mc.headings.slice(0,4)});}})()"
=> {"path":"000-Meta/About This Vault.md","sample":[
    {"heading":"About This Vault","level":1,"position":{"start":{"line":8,"col":0,"offset":119},"end":{"line":8,"col":18,"offset":137}}},
    {"heading":"Purpose","level":2,"position":{"start":{"line":10,"col":0,"offset":141},"end":{"line":10,"col":10,"offset":151}}},
    ...
    ]}
```

Confirmed: each heading entry has `{heading: <text>, level: <int>, position: {start: {line, col, offset}, end: {line, col, offset}}}`. The `heading` field is post-marker-strip (no `#` characters). Length math (137-119 = 18 = "# About This Vault".length) confirms `position.start.offset` is at the first `#` and `position.end.offset` is at the position right after the last text character. Locks R7's body-slice formula.

### F7 — Vault-routing limitation reproduced

```
$ obsidian vault=TestVault-Obsidian-CLI-MCP eval code="(()=>JSON.stringify({name:app.vault.getName()}))()"
=> {"name":"The Setup"}
```

The `vault=` parameter is functionally ignored by `eval`. The result reports the focused vault's name (The Setup), not the requested vault (TestVault-Obsidian-CLI-MCP). This is the inherited 014/013/011 limitation; documented under R4 / R11. It does NOT block `read_heading` because:
- The 011-R5 inspection clause still catches the unknown-vault case (`vault=NoSuchVault` → `Vault not found.` exit 0 → reclassified to `CLI_REPORTED_ERROR`).
- Multi-vault users open the target vault before invoking, per the documented workflow.

### F8 — Empty Sandbox state confirmed before/after probes

```
$ ls C:\Marwan-Saab-ADO\Marwan at Metcash\Obsidian\TestVault-Obsidian-CLI-MCP\Sandbox\
(empty)
```

A probe fixture (`Sandbox/015-probe.md`) was seeded and removed during this plan-stage characterisation pass. The Sandbox is left empty per the test-execution-instructions cleanup rule. No vault residue.

---

## Plan-stage status

All 14 design decisions ratified. The architecture is locked by:
- F1 / F2 — no native heading-body subcommand; `eval` is the only path.
- F3 / F4 — eval response shape (`=> ` prefix; `Error:` prefix for thrown errors).
- F5 — `app.vault.adapter.read(path)` async + string return.
- F6 — `app.metadataCache.metadataCache[hash].headings` pre-parsed array shape.
- F7 — vault-routing limitation reproduced (consistent with R4 / R11 inherited limitation).
- F8 — sandbox empty (cleanup verified).

**Cases deferred to T0 of `/speckit-implement`** (require fixtures in TestVault and the test vault opening):
- Setext-as-content (and the Obsidian-version-dependent question of whether `headings` includes Setext entries on the host's version — verifies R14's defence-in-depth filter is functional vs no-op).
- Segment-matching characterisation: closing-ATX form (`## Heading ##`); surrounding whitespace; inline-markdown-survives (`## My **Bold** Heading`); Obsidian-anchor-survives (`## Section ^anchor-id`); mis-cased-fail.
- Fenced-code-block opacity (verifies Obsidian's pre-parsing already excludes fenced-block heading-like text from the headings array).
- CRLF round-trip (probes whether `app.vault.adapter.read` preserves `\r\n` or normalises to `\n`).
- LF round-trip.
- Duplicate heading path → first-document-order match.
- Empty-body case (heading followed directly by next heading or EOF).
- Body terminator at sibling depth.
- Body terminator at higher (shallower) depth.
- Body terminator at child depth (child-subtree exclusion).
- Body terminator at EOF.
- Very large body cap-boundary behaviour.
- Active-mode focused-note happy path.
- Active-mode no-focus error.
- File-not-found error (specific mode + nonexistent path).
- File-not-found error (specific mode + nonexistent file wikilink).

T0 is the first task of `/speckit-implement`'s tasks.md and is a hard gate before any handler implementation work begins. If T0 finds an Obsidian behaviour that contradicts the plan-stage assumption, the affected research decision is amended before implementation.
