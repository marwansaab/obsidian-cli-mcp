# Phase 0 Research: Prevent File Type Changes

**Feature**: `070-prevent-filetype-changes` (BI-0060)
**Input**: [spec.md](spec.md) (post-clarify, three Clarifications entries)

The spec and its clarify session settled the behavioural contract: rename and move keep the source's file type and reject any explicit change to another recognised type; tools that do not support a type reject it with `VALIDATION_ERROR` + `details.code: "UNSUPPORTED_FILE_TYPE"`; `read` accepts notes, canvases and bases and rejects attachments; existing `NOT_MARKDOWN` (links, backlinks) and `open_file`'s CLI-reported `UNSUPPORTED_FILE_TYPE` stay unchanged. This document records the implementation decisions that follow and the live-CLI verification gates that remain. No `NEEDS CLARIFICATION` markers remain.

---

## D1 — One shared, pure file-type module

**Decision**: Add `src/file-type/file-type.ts` (plus `file-type.test.ts`), a leaf module with no imports beyond `src/errors.ts`. It holds:

- the core extension table, grouped by category: `note` → `md`; `canvas` → `canvas`; `base` → `base`; `attachment` → the image, audio, video and PDF extensions Obsidian opens natively (`avif bmp gif jpeg jpg png svg webp`, `flac m4a mp3 oga ogg opus wav webm 3gp` (`oga` and `opus` added after T0 P5), `mkv mov mp4 ogv`, `pdf`);
- `extensionOf(path)` — the substring after the last `.` of the final path segment, or `""` when there is none;
- `categoryOf(ext)` — case-insensitive lookup returning `"note" | "canvas" | "base" | "attachment" | null` (`null` = not a core type);
- `assertSupportedFileType(relPath, supported, toolName, alternative?)` — throws the D4 rejection when `categoryOf(extensionOf(relPath))` is not in `supported`.

**Rationale**: The type rule must be identical in every tool (FR-001, FR-002) and testable without a vault. A single pure module is the smallest thing that guarantees one table and one comparison. It sits below `src/tools/**` in the import direction (tool → helper), like `src/path-safety/**`, so Principle I's one-directional rule holds and no tool imports another tool.

**Alternatives considered**: (a) Inline `endsWith` checks per tool — rejected; that is the current state that let rename and move diverge (rename appends `.md` unconditionally, move guards on the source). (b) Put the table in `_shared.ts` — rejected; `_shared.ts` is the registration helper module and the type table is not a registration concern. (c) Ask Obsidian for its registered view types at runtime (`app.viewRegistry`) — rejected; it adds an eval round-trip to every call and makes the rule depend on installed plugins, which the spec puts out of scope.

## D2 — Per-tool support declaration

**Decision**: Each in-scope tool declares its supported categories once, in its own module, as a `readonly` tuple consumed by both the handler check and the description text. The declarations:

| Tool | Supported | Enforcement |
|------|-----------|-------------|
| `rename`, `move` | note, canvas, base, attachment, and files of any other extension (kept as is) | type-preservation rule (D5); explicit change to another recognised type → `type-change` rejection |
| `delete`, `open_file` | every file | none needed; description only |
| `read` | note, canvas, base | attachments → `unsupported-type` rejection (Clarifications Q3) |
| `write_note`, `append_note`, `prepend` | note | non-note → `unsupported-type` rejection |
| `outline` | note | non-note → `unsupported-type` rejection (today the CLI's `Error: File is not a markdown file.` surfaces as a generic `CLI_REPORTED_ERROR` with no discriminator) |
| `find_and_replace` (single-file scope) | note | existing `VALIDATION_ERROR` + `INVALID_NOTE` / `not-eligible` kept (D7) |
| `links`, `backlinks`, `smart_connections_similar` | note | existing in-eval `CLI_REPORTED_ERROR` + `NOT_MARKDOWN` kept (FR-007a, D7) |
| `views_base`, `query_base`, `create_base` | base (the `base_path` locator) | existing `VALIDATION_ERROR` + `INVALID_BASE_PATH` kept (D7) |

Out of scope and untouched (FR-013): `read_heading`, `read_property`, `set_property`, `patch_heading`, `patch_block`. Not file-path tools: `files`, `paths`, `search`, `context_search`, `pattern_search`, `tag`, `find_by_property`, `properties`, `bases`, `vaults`, `get_active_file` (no file locator), `help`, `smart_connections_query`, `obsidian_exec` (raw escape hatch, the documented route for deliberate type changes).

**Rationale**: FR-002 requires a declared, enforced set per tool; FR-010 requires the description to match. Keeping the declaration next to the handler keeps Principle I's per-surface ownership. The rename and move rows implement FR-003 and Clarifications Q1; the read row implements Clarifications Q3; the content-editing rows follow the spec's Assumptions (writing note text into a canvas, base or attachment corrupts it).

**Alternatives considered**: A central registry mapping tool name → supported types — rejected; it would make `src/file-type/` import knowledge of every tool (an upward dependency) and split each tool's contract across two files.

## D3 — Where the type is known: classify the file the tool will act on

**Decision**: The check runs on the resolved target, by locator form (FR-009):

- **`path` locator**: the extension comes from `path` directly. No extra call.
- **`file` locator (wikilink-style name)**: `append_note` and `prepend` already resolve the name with `resolveFileByTsv` (`_active-file.ts`), so they check the resolved path at no extra cost. `write_note` does not resolve names: its short form appends `.md` to a slash-free `file` that does not end in `.md` (`isCanonicalShortForm`), so `file: "Plan.canvas"` silently becomes `Plan.canvas.md`. It gets a string check instead: a `file` whose trailing extension is a recognised non-note core type is rejected; unrecognised trailing segments stay part of the stem (`version_1.2.3` → `version_1.2.3.md`, unchanged). For the four CLI-pass-through tools (`read`, `rename`, `move`, `outline`), resolve the name with the existing `resolveFileByTsv` (`obsidian file file=<name>` → TSV `path` line) and check that path. T0 gate P2 records whether the CLI ever resolves an extensionless name to a non-`.md` file; the design does not depend on the answer because it always checks the resolved path.
- **`active` mode**: write tools already resolve the focused file (`resolveActiveFocusedFile` / `resolveActiveLocatorWithVault`) and check the resolved `relPath`; this closes today's gap where `write_note` in active mode overwrites whatever file is focused, canvas included. The CLI-pass-through tools resolve it with `resolveActiveFocusedFile` before the call.

What the four CLI-pass-through tools then forward to the CLI depends on the locator (analysis I2, option (b)):

- **`file` mode**: after the pre-check, forward the **original** `file=` locator unchanged. The action command resolves the name with the same wikilink resolution the `file` subcommand used, so the checked file and the acted-on file are the same; Markdown calls keep exactly today's action-call arguments. The only new behaviour is the preceding resolution call, tested on its own.
- **`active` mode**: forward the resolved path as `path=` and send **no `vault=`** (the call goes out in specific mode so the adapter keeps the `path=`; with no vault the argv carries no `vault=` token). A vault-less CLI command uses the CLI's current vault, the same one the vault-less focused-file eval just read (T0 P6), so the CLI acts on exactly the file that was checked even if focus moves to another file between the two calls. This matches the pre-feature active mode, which also sent no `vault=`.

**Amended 2026-10-31 (PR #97 review, owner ruling Q1 = B; BI-0117 fix path 3)**: the first version of this decision forwarded `vault=<display name>` from `resolveVaultDisplayName`. That helper falls back to the absolute base path when the registry's reverse lookup misses, and the CLI rejects `vault=<absolute path>`; BI-0121 tracks that `?? base` fallback as a latent bug, and a lookup miss must never surface as a misleading "Vault not found". Sending no `vault=` keeps the registry out of the path entirely. The residual risk is a switch of the focused **vault** between the eval and the action call; the owner accepted the same residual for the metadata-cache refresh (spec 068 research R13, PR #87 ruling Q1 = A). Fallback recorded by the ruling, not used because T0 P6 passed: keep the display name, but fail loudly with a typed error naming the unresolved vault when the reverse lookup returns null — never forward the absolute path as `vault=` (BI-0117 fix path 2).

**DI consequence**: none. `read`, `rename`, `move` and `outline` keep their pre-feature `ExecuteDeps` (no vault registry), and their `createServer` registration lines are unchanged (`createXTool({ logger, queue })`).

**Rationale**: Classifying the locator string alone is unsafe for `active` mode (no string to classify) and fragile for `file` mode (resolution rules belong to Obsidian). In active mode the focused file can change between two calls, so acting on the resolved path closes that gap. In `file` mode both calls resolve the same name the same way, so forwarding the original `file=` keeps the action-call arguments byte-stable for Markdown (FR-012, SC-005) without reopening a gap.

**Test consequence**: existing `file`-mode and active-mode tests for these four tools record a resolution spawn before the action spawn. Assertions that index the first recorded spawn, or that count spawns (outline's single-spawn test), are updated to address the action spawn; the action spawn's arguments are unchanged in `file` mode. Active-mode Markdown tests change their expected action arguments from the bare active form to `path=<resolved>` with no `vault=`; that is the one deliberate argument change, required by FR-009.

**Alternatives considered**: (e) Forward the resolved `path=` in `file` mode too — rejected at analysis (I2): it changes Markdown action-call arguments for no safety gain, since the action command resolves the name identically. (c) Keep the active-mode CLI call in active mode after the check (no `path=`) — rejected; if focus moves between the check and the call, `rename`/`move` would apply a destination extension computed for one file to another, which is exactly the silent type change this feature forbids. (d) Derive the vault name from the base path's folder name — rejected; it duplicates the registry's job and diverges where display names and folder names differ. (f) Forward `vault=<display name>` from the registry's reverse lookup — the first version of this decision; superseded by the 2026-10-31 amendment above (a lookup miss forwards the absolute path, which the CLI rejects). (a) Classify the `file` string's own extension and assume an extensionless name means a note — rejected as the primary design; it is cheaper but relies on an unverified resolution rule, and still needs the eval for active mode. Kept as a recorded fallback if T0 P2 shows `resolveFileByTsv` is unreliable for non-note names. (b) Post-check after the CLI acts (compare `fromPath`/`toPath` extensions in the rename/move response) — rejected; by then the vault has already changed, which violates FR-007 ("before changing anything").

**Cost**: one extra CLI round-trip for `file` and `active` calls of the four CLI-pass-through tools; `path` calls (the automation-recommended form per the server instructions) are unchanged in cost.

## D4 — The rejection envelope

**Decision**: `assertSupportedFileType` (and the rename/move type-change check) throws:

```
UpstreamError {
  code: "VALIDATION_ERROR",
  details: {
    code: "UNSUPPORTED_FILE_TYPE",
    reason: "unsupported-type" | "type-change",
    path: "<resolved vault-relative path>",
    extension: "<received extension, original case, or \"\">",
    supported: ["note", ...],          // the tool's declared categories
    destination?: "<as given>",        // type-change only
    destinationExtension?: "<ext>",    // type-change only
    alternative?: "<tool name>"        // e.g. "obsidian_exec" for type-change, "open_file" for read on an attachment
  },
  message: "<tool>: <path> is a <category or \".ext\"> file; <tool> supports <list>. Nothing was changed. <alternative hint>"
}
```

Two `details.reason` values: `unsupported-type` (the tool does not handle this type: pick another tool) and `type-change` (rename/move destination names a different recognised type: drop the extension, or use `obsidian_exec` deliberately).

**Rationale**: Clarifications Q2 fixes `VALIDATION_ERROR` + `details.code: "UNSUPPORTED_FILE_TYPE"`, zero new top-level codes (Principle IV). ADR-015's three-condition gate is met for `details.reason`: the two sub-states exist, they are distinguishable at the point of failure, and they have materially different remediation (choose a different tool vs. change the destination name). FR-008 requires the message to name the received type, the accepted types and the alternative; carrying the same data in `details` makes it machine-actionable.

**Alternatives considered**: One reason-less code for both cases — rejected; an agent cannot tell "use another tool" from "fix your destination name" without parsing prose.

## D5 — Rename and move: the type-preservation rule

**Decision**: Replace `appendMdIfMissing` (rename) and the source-`.md` guard in `resolveTo` (move) with one rule applied to the destination file name (rename: `name`; move: the final segment of `to` when `to` does not end in `/`), given the resolved source path:

1. Let `srcExt = extensionOf(source)`, `dstExt = extensionOf(destinationName)`.
2. If `dstExt` is a recognised core extension (`categoryOf(dstExt) !== null`) **and** it differs from `srcExt` case-insensitively → reject with `type-change` (Clarifications Q1). This applies in both directions (canvas → `.md`, `.md` → `.canvas`).
3. Else if the destination already ends with the source's extension → forward verbatim. For a Markdown source the comparison stays the existing byte-exact `endsWith(".md")` (FR-012: `Renamed.MD` still becomes `Renamed.MD.md`, exactly as today). For every other source it is case-insensitive, so `Photo.PNG` renamed to `New.png` stays `New.png`, not `New.png.PNG`.
4. Else → append `.` + `srcExt` in the source's spelling (no append when the source has no extension). Unrecognised trailing segments stay part of the stem: `Release v1.2` → `Release v1.2.md`; `Plan.v2` on a canvas → `Plan.v2.canvas`.

Move's folder form (`to` ending in `/`) keeps the source's full basename, unchanged.

**Rationale**: This is the one rule that satisfies FR-004 (no extension → source extension), FR-005 (no doubling), FR-006 (explicit different type rejected), the case-insensitive recognition of FR-001, and FR-012's byte-stability for notes. The Markdown special case in step 3 exists only to keep the existing documented `.MD` row and its test unchanged (SC-005).

**Alternatives considered**: (a) Case-insensitive step 3 for Markdown too — rejected; it changes a documented Markdown outcome (`Renamed.MD` → `Renamed.MD` instead of `Renamed.MD.md`) and fails SC-005. (b) Case-sensitive step 3 for every type — rejected; it produces `New.png.PNG` for a case-mismatched attachment rename. (c) Let the Obsidian CLI preserve the extension natively by forwarding the bare name — rejected as the design and kept as T0 gate P1: if the CLI already preserves the extension for an extensionless name, the wrapper's append step is redundant but harmless; the rejection step is still required because the CLI does not refuse a cross-type name.

**Supersedes**: the spec 021 (`rename`) Clarifications Q1 lock (".md-only allowlist; non-`.md` targets use `obsidian_exec`") and the source-`.md` guard locked in spec 030 (`move`) Clarifications Q1+Q2. Both were spec-level decisions, not ADRs; the BI-0060 spec now governs. The 021 rationale ("source introspection would force per-call CLI lookups") is addressed by D3: `path` calls need no lookup, and the lookup for `file` / `active` calls is the price of FR-009.

## D6 — Descriptions, help pages and server instructions

**Decision**: Every in-scope tool's description gains one sentence naming its supported file types, built from the D2 declaration so the text cannot drift from the check (FR-010, SC-002). `docs/tools/<tool>.md` for the same tools states the same types and documents `UNSUPPORTED_FILE_TYPE` (with both reasons where they apply). The rename and move docs replace the ".md-only / route through `obsidian_exec`" text with the preservation rule and the `type-change` rejection. The server instructions line "Move, rename or delete a note" becomes "Move, rename or delete a file (any type)", and "Read a note" names canvases and bases; one rule line states that tools reject file types they do not support with `UNSUPPORTED_FILE_TYPE`. All three texts stay within the instructions size limits (MCP Tool Surface Standards).

**Rationale**: FR-010 and US3. ADR-005 keeps descriptions short and pushes detail to `help`, so the description carries one sentence and the docs page carries the full rule.

**Baseline**: every tool whose description or schema text changes moves its `descriptionFingerprint` in `src/tools/_register-baseline.json`; the baseline is regenerated and reviewed in the same change (MCP Tool Surface Standards, schema-dialect rule). Input schemas do not change (no new fields), so `schemaFingerprint`s stay put unless a parameter description is reworded; the `rename.name` and `move.to` parameter descriptions are reworded to state the preservation rule, so those two schema fingerprints move.

## D7 — Existing non-Markdown rejections stay as they are

**Decision**: `links` / `backlinks` / `smart_connections_similar` keep their in-eval `CLI_REPORTED_ERROR` + `NOT_MARKDOWN`; `open_file` keeps its CLI-reported `UNSUPPORTED_FILE_TYPE`; `find_and_replace` keeps `VALIDATION_ERROR` + `INVALID_NOTE` / `not-eligible`; the Bases trio keeps `VALIDATION_ERROR` + `INVALID_BASE_PATH`. Their descriptions and docs gain the supported-types sentence only.

**Rationale**: FR-007a and Clarifications Q2 (ADR-015 is additive-only; renaming an emitted discriminator is a breaking contract change). The `find_and_replace` and Bases shapes are the same kind of existing, relied-on emission as `NOT_MARKDOWN`, so the same rule applies. They already satisfy FR-007's substance (rejected before any change, structured, typed); only the discriminator name differs.

**Alternatives considered**: Migrating them to `UNSUPPORTED_FILE_TYPE` — rejected per Clarifications Q2.

## D8 — Recognised attachment list and casing

**Decision**: The attachment set is Obsidian's built-in natively-opened extensions (D1). Recognition is case-insensitive (`categoryOf("PNG") === "attachment"`); preserved extensions keep their original spelling (FR-001, Edge Cases). Files with no extension or an unrecognised extension (`.txt`, `.docx`) are not a core type: notes-only tools reject them as `unsupported-type`; rename and move keep whatever extension they have; `read` rejects them (it supports note, canvas and base only). One visible consequence: `write_note` with a slash-containing `path` that lacks `.md` (for example `Folder/Note` or `Folder/todo.txt`), which today writes an extensionless or `.txt` file as given, is now rejected; the slash-free `file` short form keeps appending `.md` as before.

**Rationale**: The spec's Assumptions define attachments as Obsidian's native, plugin-free types. A fixed table is deterministic and testable; T0 gate P3 cross-checks it against the running Obsidian version.

## D9 — Not-found precedence

**Decision**: When a `file` or `active` resolution fails (no such file, no active file), the existing error from that resolution (`CLI_REPORTED_ERROR` from the `file` subcommand, `ERR_NO_ACTIVE_FILE`) surfaces unchanged; the type check never runs on an unresolved target. For `path` calls the type check runs on the given string before the CLI call, so a missing `photo.png` passed to `read` reports `UNSUPPORTED_FILE_TYPE` rather than not-found.

**Rationale**: Edge Cases ("the file type check does not mask a not-found"). For `path` calls the type is a property of the requested path itself, so rejecting the type first is not masking: the call could not succeed whether or not the file exists, and nothing is changed either way. This avoids an extra existence round-trip on every `path` call.

**Alternatives considered**: An existence check before the type check on `path` calls — rejected; it adds a CLI call to the cheapest, most common form to change only which of two errors an impossible call reports.

---

## T0 live-CLI verification gates

Run at `/speckit-implement` time against `Obsidian.com` and the authorised TestVault `Sandbox/` per `.memory/test-execution-instructions.md`. Full procedure: [contracts/t0-probe-plan.md](contracts/t0-probe-plan.md).

- **P1** — `obsidian rename path=Sandbox/P.canvas name=Q` and `obsidian move path=Sandbox/P.canvas to=Sandbox/Sub/Q`: does the CLI itself add, keep or drop the extension? Confirms the D5 append step is needed (or redundant but harmless) and captures the response shapes for canvas, base and attachment sources.
- **P2** — `obsidian file file=<name>` for a canvas, a base and an image addressed with and without their extension: confirms `resolveFileByTsv` returns the right path for non-note files (D3).
- **P3** — the focused-file eval with a canvas, a base and an image active: confirms `FOCUSED_FILE_TEMPLATE` reports their paths (not `null`) so the active-mode check sees the real extension (D3).
- **P4** — `obsidian outline` and `obsidian read` on a canvas, a base and an image: records today's behaviour (the undiscriminated upstream outline error, garbled attachment read) as the before-state the new rejections replace.
- **P5** — `app.viewRegistry` extension list in the plugin-free TestVault: cross-checks the D1 attachment table (D8).
