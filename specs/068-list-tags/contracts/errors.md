# Error Contract: `tags`

Every error is an existing code; this feature adds no new top-level code (Principle IV, FR-021). The reasons used under `VALIDATION_ERROR` reuse ADR-032's roster verbatim (ADR-015: no new sub-states).

**Every `VALIDATION_ERROR`**, sub-coded or generic, carries `details.issues: [{ path, message, code }]` with the field paths zod reported (Constitution Principle III, FR-006). Sub-coded rows add `details.code` and `details.reason` alongside it, the same shape as `find_and_replace/index.ts`. For example: `{ code: "VALIDATION_ERROR", message, details: { code: "SCOPE_CONFLICT", reason: "file+path", issues: [ … ] } }`.

| Code | `details.code` / `details.reason` | When | CLI spawned? |
|---|---|---|---|
| `VALIDATION_ERROR` | `SCOPE_CONFLICT` / `file+path` | `file` and `path` both set | no |
| `VALIDATION_ERROR` | `SCOPE_CONFLICT` / `active+note` | `activeOnly: true` with `file` or `path` | no |
| `VALIDATION_ERROR` | `SCOPE_CONFLICT` / `active+vault` | `activeOnly: true` with `vault` | no |
| `VALIDATION_ERROR` | `INVALID_NOTE` / `path-traversal` | `file` or `path` structurally unsafe | no |
| `VALIDATION_ERROR` | — (generic `issues[]`) | unknown key, wrong type, empty `vault`, `[[…]]` in `file` | no |
| `ERR_NO_ACTIVE_FILE` | inherited dispatch `details` | `activeOnly: true` and no note is active. Message: *"No active file in Obsidian. Open a note in the editor, or call tags with `file` or `path` instead of `activeOnly`."* | yes |
| `CLI_REPORTED_ERROR` | `message: "Vault not found."` | unknown `vault` (re-classified by `invokeCli`; the CLI exits 0) | yes |
| `CLI_REPORTED_ERROR` | upstream `Error: …` message | `file` / `path` names no note (FR-017; never `FILE_NOT_FOUND`, never an empty listing); other upstream-reported failures | yes |
| `CLI_REPORTED_ERROR` | `stage: "json-parse"` / `"upstream-shape"`, full `stdout` | stdout not parseable, or not the expected array shape | yes |
| `CLI_OUTPUT_TOO_LARGE` | `limitBytes` | upstream output > 10 MiB | yes |
| `CLI_TIMEOUT` / `CLI_NON_ZERO_EXIT` / `CLI_BINARY_NOT_FOUND` / app-down codes | inherited | dispatch-layer failures (ADR-029 / ADR-030 recovery inherited) | yes |
| `INTERNAL_ERROR` | zod `issues` | the wrapper's own result failed `tagsOutputSchema` (should be unreachable) | yes |

The exact upstream wording for the missing-note and no-active-note cases is pinned by T0 probes P6 and P7 and quoted in `docs/tools/tags.md`.
