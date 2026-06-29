# Phase 1 Data Model: Report Active File (`get_active_file`)

Derives the Zod shapes, the eval envelope, and the handler control flow from the spec entities + the Phase 0 decisions. All shapes are `.strict()`; the Zod schema is the single source of truth (`z.infer` downstream — Principle III).

## Entities (from spec)

| Entity | Realisation |
|--------|-------------|
| **Active file** | The `TFile` returned by `app.workspace.getActiveFile()` in the targeted vault. Identity fields: `path`, `name`, `basename`, `extension` (Obsidian's own members). |
| **Active-file result** | The output `{ active: FileInfo \| null }`. `null` ⇒ no active file (success). Present ⇒ the four fields. Distinguishable on `active === null` (FR-006). |
| **File-name parts** | `name = basename + extension`; `extension` = final dot-delimited segment; `basename` = remainder; no dot ⇒ `extension: ""`, `name === basename`. Obsidian-native semantics (no re-parser). |
| **Target mode** | `"active" \| "specific"` discriminator. `active` ⇒ focused vault, no `vault`, no locator. `specific` ⇒ named vault (`vault` required), no locator, cross-vault. |
| **Vault identifier** | `vault` string — required in `specific`, forbidden in `active`. Unregistered ⇒ `VAULT_NOT_FOUND/unknown`. |

## Input schema (`schema.ts`)

```ts
// applyTargetModeRefinementForFolderScoped(targetModeBaseSchema)
// → { target_mode: "active" | "specific", vault?: string }   (file/path forbidden in BOTH modes)
export const getActiveFileInputSchema =
  applyTargetModeRefinementForFolderScoped(targetModeBaseSchema);
export type GetActiveFileInput = z.infer<typeof getActiveFileInputSchema>;
```

Refinement (inherited, `target-mode.ts`):
- `specific` + missing `vault` → issue `vault is required in specific mode`.
- `active` + present `vault` → issue `vault is not allowed in active mode`.
- `file` present (either mode) → issue `file is not allowed for folder-scoped tools`.
- `path` present (either mode) → issue `path is not allowed for folder-scoped tools`.
- `.strict()` → unknown field rejected.

All of the above surface as `VALIDATION_ERROR` (FR-014) at the boundary before any eval.

**Published-schema note (I1)**: because `targetModeBaseSchema` declares `file`/`path` as optional, the emitted MCP `inputSchema` lists them even though the refinement always rejects them — identical to the shipped `files`/`paths` tools. This published-but-rejected shape is the accepted cohort convention (cohort parity over a bespoke `{ target_mode, vault? }` schema); spec FR-009 states it honestly.

## Output schema (`schema.ts`)

```ts
export const fileInfoSchema = z
  .object({
    path: z.string(),       // vault-relative
    name: z.string(),       // basename + extension
    basename: z.string(),
    extension: z.string(),  // "" when none (FR-003)
  })
  .strict();

export const getActiveFileOutputSchema = z
  .object({ active: fileInfoSchema.nullable() })   // null ⇒ no active file (FR-005/006)
  .strict();
export type GetActiveFileOutput = z.infer<typeof getActiveFileOutputSchema>;
```

No `vault` / `target_mode` echo (FR-015 — pure-read echo convention). File-only (no pane/leaf — FR-017/018).

## Eval envelope (`schema.ts`)

```ts
export const getActiveFileEvalResponseSchema = z
  .object({
    ok: z.literal(true),
    active: fileInfoSchema.nullable(),
  })
  .strict();
export type GetActiveFileEvalResponse = z.infer<typeof getActiveFileEvalResponseSchema>;
```

Single `ok:true` arm: `getActiveFile()` cannot fail at the eval level (it returns a `TFile` or `null`); there is no in-eval `ok:false` case (cf. `backlinks`, which has `NO_ACTIVE_FILE`/`FILE_NOT_FOUND`/`NOT_MARKDOWN` arms — none apply here). A malformed/unparseable eval body is caught by `decodeEvalEnvelope` and classified `CLI_REPORTED_ERROR` (cohort default for reads). The `ok:true` wrapper is kept for cohort parity and forward-compatibility.

## Eval template (`_template.ts`)

Frozen, no payload, no `__PAYLOAD_B64__` (D4):

```js
(()=>{const f=app.workspace.getActiveFile();return JSON.stringify(f?{ok:true,active:{path:f.path,name:f.name,basename:f.basename,extension:f.extension}}:{ok:true,active:null});})()
```

## Handler flow (`handler.ts`)

```text
executeGetActiveFile(input, deps):
  1. if input.target_mode === "specific":
        await resolveVaultRootOrRemap(deps.vaultRegistry, input.vault, "get_active_file")
        // throws CLI_REPORTED_ERROR / VAULT_NOT_FOUND / reason:"unknown" if unregistered (FR-010)
        // returned base path discarded (no guard)
  2. result = await invokeCli(
        { command:"eval",
          vault: input.target_mode === "specific" ? input.vault : undefined,
          parameters:{ code: ACTIVE_FILE_TEMPLATE },
          flags:[],
          target_mode: input.target_mode },
        { spawnFn: deps.spawnFn, env: deps.env, logger: deps.logger, queue: deps.queue })
        // dispatchCli inherits ADR-029 cold-start retry + ADR-030 app-down launch (FR-012)
        // an invokeCli throw (app down/unrecoverable, binary missing) propagates unchanged
  3. data = decodeEvalEnvelope(result.stdout, getActiveFileEvalResponseSchema,
              { toolName:"get_active_file", malformedCode:"CLI_REPORTED_ERROR" })
  4. return getActiveFileOutputSchema.parse({ active: data.active })   // null passes straight through (FR-005)
```

`ExecuteDeps`: `{ logger: Logger; queue: Queue; vaultRegistry: VaultRegistry; spawnFn?: SpawnLike; env?: NodeJS.ProcessEnv }` — mirrors `open_file`.

## Error roster (FR-016 — zero new top-level codes)

| Condition | `code` | `details` | Source |
|-----------|--------|-----------|--------|
| Missing/forbidden `vault`; locator supplied; unknown field; wrong type | `VALIDATION_ERROR` | zod field paths | schema (boundary) |
| `specific`, unregistered vault | `CLI_REPORTED_ERROR` | `{ code:"VAULT_NOT_FOUND", reason:"unknown", vault }` | `resolveVaultRootOrRemap` (D6) |
| Malformed / non-JSON eval body | `CLI_REPORTED_ERROR` | `{ stage:"json-parse" \| "envelope-parse", stdout }` | `decodeEvalEnvelope` |
| App down, could not launch (`OBSIDIAN_AUTO_LAUNCH=0`) | `CLI_NON_ZERO_EXIT` | `{ reason:"obsidian-not-running", ... }` | inherited `dispatchCli` (D7) |
| `obsidian` binary missing | `CLI_BINARY_NOT_FOUND` | adapter details | inherited adapter |

No-active-file is **not** in this table — it is `{ active: null }` success (D3).

## Registration / boot (server.ts, _register-baseline.json)

- `createGetActiveFileTool({ logger, queue, vaultRegistry })` added to the `server.ts` registration array (the sanctioned boot-spine extension point).
- `_register-baseline.json` gains a `get_active_file` entry (regenerated description+schema fingerprints) — the FR-018 registry-stability baseline; updating it is the reviewed path for adding a tool.
- `docs/tools/get_active_file.md` supplies `help({ tool_name: "get_active_file" })` content. **Required at boot (O1)**: `createServer` calls `assertToolDocsExist`, which throws at startup if any registered tool lacks `docs/tools/<name>.md`; `server.test.ts` also asserts every registered tool has a corresponding doc. So the doc must exist with real content in the same change as registration — not deferrable to a later phase. Add a `**get_active_file**` row to `docs/tools/index.md` for catalogue discoverability.
