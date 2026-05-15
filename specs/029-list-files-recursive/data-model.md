# Data Model — 029-list-files-recursive

**Branch**: `029-list-files-recursive`
**Date**: 2026-05-15
**Status**: Phase 1 deliverable; consumed by `/speckit-tasks` and `/speckit-implement`.

This document captures the schemas, the rendered eval JS template, the base64 payload assembly, per-tool invariants, the module LOC budget, the test inventory, and the architectural delta map for BI-029. It is the source-of-truth for downstream task generation.

## Input schema

`treeInputSchema` extends `targetModeBaseSchema` (the shared post-010 flat-extension idiom from `src/target-mode/target-mode.ts`) with four optional folder-scoped fields. The discriminator semantics follow `applyTargetModeRefinement` with the folder-scoped adaptation already established by `files` (BI-019).

```typescript
const treeInputSchema = targetModeBaseSchema.extend({
  folder: z.string().optional(),
  depth: z.number().int().positive().optional(),
  ext: z.string().optional(),
  total: z.boolean().optional().default(false),
}).strict().superRefine((data, ctx) => {
  applyTargetModeRefinement(data, ctx, {
    forbidFileLocator: true,   // file/path locators forbidden in both modes
    folderScoped: true,         // accept folder field
  });
});

export type TreeInput = z.infer<typeof treeInputSchema>;
```

Field policy:

| Field | Type | Mode | Required | Default | Notes |
|---|---|---|---|---|---|
| `target_mode` | `"specific" \| "active"` | discriminator | yes | — | Standard ADR-003 discriminator. |
| `vault` | `string` | specific | yes in specific; FORBIDDEN in active | — | Display name; routed to `obsidian vault=…`. |
| `folder` | `string` | both | no | vault root | Trailing slash normalised away (FR-014). |
| `depth` | `integer >= 1` | both | no | unbounded | Positive integer; rejects 0/negative/non-integer/non-number per FR-006. |
| `ext` | `string` | both | no | none | Leading-dot and bare forms equivalent (FR-007). |
| `total` | `boolean` | both | no | `false` | Project-wide count-only convention. |

The schema layer rejects `file` / `path` keys in both modes (FR-004); `vault` is required in specific mode; `vault` is forbidden in active mode (FR-003); unknown top-level keys are forbidden via `.strict()` (FR-009).

## Output schema

```typescript
const treeOutputSchema = z.object({
  count: z.number().int().nonnegative(),
  paths: z.array(z.string()),
}).strict();

export type TreeOutput = z.infer<typeof treeOutputSchema>;
```

Cross-mode invariant (FR-008 + FR-010):
- On `total: false` branch: `count === paths.length`.
- On `total: true` branch: `paths === []` (literal empty array) AND `count` carries the filtered subtree count.

Per-entry invariant (FR-028):
- Folder entries in `paths` end with `/` (e.g. `Inbox/`, `Inbox/Sub/`, `Archive/`).
- File entries in `paths` do NOT end with `/` (e.g. `README.md`, `Inbox/a.md`, `Inbox/Sub/c.md`).
- The terminal character of each path string is the in-band file-vs-folder signal.

Note: read-tool responses across this project do not echo the input locator (`vault` / `folder`) per the project's no-locator-echo convention. The `count` + `paths` shape is the entire response surface.

## Eval-envelope wire schema

The eval JS template emits a discriminated envelope on success or failure. The handler `safeParse`s this against the wire schema and discriminates on `ok`.

```typescript
const treeEnvelopeSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    count: z.number().int().nonnegative(),
    paths: z.array(z.string()),
  }),
  z.object({
    ok: z.literal(false),
    code: z.enum(["FOLDER_NOT_FOUND", "NOT_A_FOLDER"]),
    folder: z.string(),
  }),
]);
```

Envelope discrimination:
- `{ ok: true, count, paths }` → return as success.
- `{ ok: false, code: "FOLDER_NOT_FOUND", folder }` → throw `UpstreamError(CLI_REPORTED_ERROR, details: { stage: "envelope-error", code: "FOLDER_NOT_FOUND", folder })`.
- `{ ok: false, code: "NOT_A_FOLDER", folder }` → throw `UpstreamError(CLI_REPORTED_ERROR, details: { stage: "envelope-error", code: "NOT_A_FOLDER", folder })`.

## Frozen JS template (rendered ~70 LOC)

The template is a single string with one substitution token `__PAYLOAD_B64__`. The handler renders it by replacing that token with the base64-encoded JSON payload; no other interpolation occurs.

```javascript
// Template body (formatted for readability; the actual template is a single
// frozen string in src/tools/tree/handler.ts with one __PAYLOAD_B64__ token).

(async () => {
  const p = JSON.parse(atob("__PAYLOAD_B64__"));
  const { folder, depth, ext, total } = p;

  // Step 1: normalise starting folder (strip trailing slash; '' means vault root)
  const start = (folder || "").replace(/\/$/, "");

  // Step 2: stat-based trichotomy (skip stat for '' = vault root)
  let kind = "folder";
  if (start !== "") {
    let s = null;
    try { s = await app.vault.adapter.stat(start); } catch { s = null; }
    if (s === null) return { ok: false, code: "FOLDER_NOT_FOUND", folder: start };
    if (s.type !== "folder") return { ok: false, code: "NOT_A_FOLDER", folder: start };
    kind = "folder";
  }

  // Step 3: walk with depth bound + in-walk dotfile filter
  const hasDot = (path) => path.split("/").some(seg => seg.startsWith("."));
  const out = [];  // { p: string, d: boolean }
  const walk = async (current, level) => {
    if (depth !== null && level > depth) return;
    const r = await app.vault.adapter.list(current);
    for (const f of r.files) {
      if (!hasDot(f)) out.push({ p: f, d: false });
    }
    for (const d of r.folders) {
      if (!hasDot(d)) {
        out.push({ p: d, d: true });
        await walk(d, level + 1);
      }
    }
  };
  await walk(start, 1);

  // Step 4: ext filter (drops folders unconditionally when ext set; matches files by extension)
  let filtered = out;
  if (ext !== null) {
    const normalised = ext.replace(/^\./, "").toLowerCase();
    filtered = out.filter(e => !e.d && e.p.toLowerCase().endsWith("." + normalised));
  }

  // Step 5: render trailing-slash on folders
  const rendered = filtered.map(e => e.d ? (e.p + "/") : e.p);

  // Step 6: sort byte-asc
  rendered.sort();

  // Step 7: emit envelope, branched on total
  if (total) {
    return { ok: true, count: rendered.length, paths: [] };
  }
  return { ok: true, count: rendered.length, paths: rendered };
})()
```

The template is a SINGLE STRING constant in `handler.ts`. The `__PAYLOAD_B64__` substitution is the only mutation per call.

## Base64 payload assembly

```typescript
const payload = JSON.stringify({
  folder: input.folder ?? null,
  depth: input.depth ?? null,
  ext: input.ext ?? null,
  total: input.total ?? false,
});
const b64 = Buffer.from(payload, "utf-8").toString("base64");
const code = FROZEN_TEMPLATE.replace("__PAYLOAD_B64__", b64);
```

The payload is a single JSON object with four scalar fields; serialisation is deterministic per `JSON.stringify` field-order rules in V8 (insertion order is preserved). The base64 alphabet `[A-Za-z0-9+/=]` is opaque to JS source-parsing — no user input ever reaches the JS source as code.

## Handler dispatch shape

```typescript
async function handleTree(
  deps: HandlerDeps,
  input: TreeInput,
): Promise<TreeOutput> {
  // Stage 0: closed-vault detection via shared module (4th consumer of
  // src/tools/_eval-vault-closed-detection/)
  // [Note: actually applied AFTER invokeCli; here just for narrative ordering]

  // Stage 1: assemble payload + render template
  const payload = JSON.stringify({
    folder: input.folder ?? null,
    depth: input.depth ?? null,
    ext: input.ext ?? null,
    total: input.total ?? false,
  });
  const code = FROZEN_TEMPLATE.replace("__PAYLOAD_B64__", Buffer.from(payload).toString("base64"));

  // Stage 2: single invokeCli call (subcommand=eval, code=<rendered>)
  const result = await deps.invokeCli({
    subcommand: "eval",
    targetMode: input.target_mode,
    vault: input.target_mode === "specific" ? input.vault : undefined,
    parameters: { code },
  });

  // Stage 3: closed-vault detection (synthesises VAULT_NOT_FOUND, reason: "not-open")
  detectEvalVaultClosed(result);  // throws if empty-transparent-open observed

  // Stage 4: strip leading "=> " from stdout (eval convention)
  const trimmed = result.stdout.trimStart();
  const jsonText = trimmed.startsWith("=> ") ? trimmed.slice(3) : trimmed;

  // Stage 5: JSON.parse (json-parse stage on failure)
  let parsed;
  try { parsed = JSON.parse(jsonText); }
  catch (e) { throw new UpstreamError("CLI_REPORTED_ERROR", { stage: "json-parse", cause: e }); }

  // Stage 6: envelope safeParse (envelope-parse stage on failure)
  const env = treeEnvelopeSchema.safeParse(parsed);
  if (!env.success) {
    throw new UpstreamError("CLI_REPORTED_ERROR", { stage: "envelope-parse", details: env.error });
  }

  // Stage 7: discriminate
  if (env.data.ok === false) {
    throw new UpstreamError("CLI_REPORTED_ERROR", {
      stage: "envelope-error",
      code: env.data.code,           // "FOLDER_NOT_FOUND" | "NOT_A_FOLDER"
      folder: env.data.folder,
    });
  }

  // Stage 8: validate output shape
  return treeOutputSchema.parse({ count: env.data.count, paths: env.data.paths });
}
```

The dispatch is SINGLE-spawn (one `invokeCli` per request); test seams isolate the spawn via the `deps.invokeCli` injection.

## Per-tool invariants

| ID | Invariant |
|---|---|
| I-1 | Validation runs strictly before any `invokeCli` call (FR-015). |
| I-2 | Exactly one `invokeCli` call per request, regardless of `total` value (R3). |
| I-3 | The `invokeCli` call shape is `{ subcommand: "eval", parameters: { code: <rendered-template> } }`. No other parameter shapes. |
| I-4 | The rendered template differs from the frozen template by EXACTLY one substitution: `__PAYLOAD_B64__` replaced with a base64 string. No other mutation. |
| I-5 | The base64 payload decodes to a JSON object with exactly four keys: `folder`, `depth`, `ext`, `total`. Extra or missing keys are a bug. |
| I-6 | The closed-vault detector runs as stage 3 (after invoke, before stdout-strip). On detection, the handler throws `CLI_REPORTED_ERROR(details.code: "VAULT_NOT_FOUND", details.reason: "not-open")`. |
| I-7 | The envelope parse produces either a success object (`ok: true`) or a known failure object (`ok: false, code: in {"FOLDER_NOT_FOUND", "NOT_A_FOLDER"}`). Other shapes throw `envelope-parse`. |
| I-8 | The output schema parse is the FINAL stage; its failure is a developer-side bug (the eval template produced an invalid shape) and surfaces as `envelope-parse` stage. |
| I-9 | Folder entries in the FINAL `paths` array end with `/`; file entries do not (FR-028). |
| I-10 | `paths` is sorted byte-asc on the FINAL trailing-slash-rendered form (FR-013). |
| I-11 | When `total: true`, `paths` is the literal empty array `[]`. When `total: false`, `count === paths.length`. |
| I-12 | The starting folder NEVER appears in `paths` (FR-012). |
| I-13 | Dotfile filter (segment-begins-with-`.`) applies UNIFORMLY across files and folders (FR-027). |
| I-14 | Original-no-upstream attribution header on all new source files (Constitution Principle V / FR-026). |

## Module LOC budget

| Module | LOC (source) | LOC (test) |
|---|---|---|
| `src/tools/tree/schema.ts` | ~50 | ~280 |
| `src/tools/tree/handler.ts` | ~180 | ~600 |
| `src/tools/tree/index.ts` | ~30 | ~60 |
| Subtotal — new BI-029 source | **~260** | **~940** |

The frozen JS template (~70 LOC formatted) is a single string constant inside `handler.ts` — counted in the handler LOC.

Plus baseline registry roll-forward (no LOC count — JSON file update via `npm run baseline:write`).

## Test inventory (43 test-groups minimum to satisfy SC-016's "no fewer than 40 tests")

The counts below enumerate test GROUPS (one row per coverage concern). The per-story task decomposition in tasks.md realises these as individual `it()` blocks; the per-task realisation produces ~30+ handler test cases (more than the 20 groups below), comfortably exceeding the SC-016 minimum of 40 total individual cases.

| Suite | Groups | Coverage |
|---|---|---|
| `schema.test.ts` | 18 | target_mode × specific/active × required/forbidden field combinations; depth integer/positive validation; ext / folder / total type validation; unknown-key rejection; field policy worked examples A–H. |
| `handler.test.ts` | 20 | Happy path (specific + active, with/without folder, with/without depth, with/without ext, with/without total — 8 combinations); single-spawn invariant; payload base64 round-trip; envelope-error mapping (FOLDER_NOT_FOUND, NOT_A_FOLDER); closed-vault detection seam; trailing-slash invariant on folder entries; bare invariant on file entries; sort invariant; cross-mode count equality; dotfile filter under recursion (verified via SHA-256 byte-stability of `FROZEN_TEMPLATE`, not direct handler test — the filter lives in the template); depth-bound stop-at-N; ext filter excludes folders; vault flow-through. |
| `index.test.ts` | 5 | Registration consistency; tool name `tree`; factory accepts deps; tool description carries the FR-028 trailing-slash promise; original-no-upstream attribution header present. |
| **Total groups** | **43** | All US1–US9 acceptance criteria covered; cross-cutting invariants asserted. |
| **Realised cases** | **~60** | Per the tasks.md per-story decomposition (T003 18 schema + T006..T045 ~37 handler + T047 5 registration). |

## T0 fixture-seeding plan

Live-CLI characterisation (FR-024) runs against `…\TestVault-Obsidian-CLI-MCP\Sandbox\` per [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md). Fixtures:

| Fixture | Path | Contents |
|---|---|---|
| **Small flat** | `Sandbox/bi029-small/` | 3 `.md` files at root, 1 `.png`, no sub-folders. |
| **Deep narrow** | `Sandbox/bi029-deep/` | 5-level nested chain `a/b/c/d/e/leaf.md`. |
| **Wide shallow** | `Sandbox/bi029-wide/` | 20 sibling `.md` files at root, no nesting. |
| **Mixed (US1-style)** | `Sandbox/bi029-mixed/` | Matches the US1 / US3 fixture exactly: `README.md`, `Inbox/a.md`, `Inbox/b.md`, `Inbox/Sub/c.md`, `Archive/old.md` + `Empty/` empty subfolder. |
| **Dotfiles** | `Sandbox/bi029-dot/` | `visible.md`, `.gitkeep`, `.hidden.md`, `.config/inner.md`. |
| **Pathological large** | `Sandbox/bi029-large/` | 5000 stub `.md` files (synthesised at T0 by a setup script; cleaned up post-test). |

T0 cleanup: remove every `Sandbox/bi029-*` directory after the characterisation pass. The destructive-probe protocol applies.

## Architectural delta map

(See research.md "Architectural delta map vs predecessors" for the full table.)

Key deltas vs the closest precedent (BI-019 / `files`):
- Routing: native → `eval` (R2).
- Single-call: preserved via in-eval branch on `total` (R3).
- Folder entries: dropped (BI-019 FR-026) → INCLUDED with trailing slash when `ext` absent (BI-029 FR-007 + FR-028).
- Missing folder: conflated with empty (BI-019 FR-010) → DISTINCT structured error (BI-029 FR-011).
- New ADRs: 0 / 0.
- Cross-cutting consumer: BI-029 is the 4th consumer of `_eval-vault-closed-detection/` shared module.

Key deltas vs the closest precedent (BI-028 / `tag` — same routing pattern):
- Discriminator: BI-028 FLAT (vault-only fileless) → BI-029 STANDARD `target_mode` with folder-scoped adaptation.
- Stat-based trichotomy (R7) is new (BI-028 used pure-cache walk; BI-029 needs filesystem existence check).
- Recursive walk with depth-bound counter is new (BI-028 walked a flat cache).
- New `details.code` strings: 0 / 2 (`FOLDER_NOT_FOUND`, `NOT_A_FOLDER`).
