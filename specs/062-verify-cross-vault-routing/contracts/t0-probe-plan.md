# T0 Probe Plan: Verify Cross-Vault Routing (per-tool forcing-gate)

Live-CLI probes per `.memory/test-execution-instructions.md` (authorised `TestVault-Obsidian-CLI-MCP`, `Sandbox/` scratch, **drive `Obsidian.com`** never the GUI `.exe`, capture stdout/stderr separately). One forcing-gate probe **per eval-composed read/query tool**, on its **at-risk path only**. This is the deferred cohort re-verification ADR-031 refused to extrapolate (BI-0134); no tool's doc is corrected before its own probe passes (FR-003).

## Step 0 (done at plan time — research.md D1)

Each candidate handler was grepped for the `command:` it issues. **At-risk = eval-composed read/query, specific/vault-named path:** `backlinks`, `links`, `read_heading`, `find_by_property`, `tag`, `paths`, `pattern_search`, `smart_connections_query`, `smart_connections_similar`. **Native-wrappers (B1 N/A):** `read`, `read_property`, `outline`, `search`, `context_search`, `bases`, `files`, `properties`, `views_base`. **Mixed:** `query_base` (native query; eval = closed detector). **Excluded:** `open_file`, and the write tools.

## Fixture setup (once)

- **Vault A (focused / "other")**: a second open vault, e.g. `The Setup`. Holds focus throughout.
- **Vault B (target, open-but-unfocused)**: `TestVault-Obsidian-CLI-MCP`.
- **Discriminator**: stage in B's `Sandbox/` an item that is **present in B and absent or different in A** — tuned per tool's surface:
  - `backlinks` / `links`: a note in B whose backlink/forward-link set is unique to B.
  - `read_heading`: a note with a heading whose body text is unique to B.
  - `read_property` *(native — control)* / `find_by_property`: a frontmatter property/value present only in B.
  - `tag`: a tag applied only in B.
  - `paths` / `pattern_search`: a file path / content pattern present only in B.
  - `smart_connections_query` / `smart_connections_similar`: a note indexed only in B (plugin must be indexed in B).
- Confirm A is focused (not B) before each call.

## Forcing-gate procedure (eval-composed read/query, specific mode)

For each at-risk tool:

1. Focus vault A. Confirm B is open but **not** focused.
2. Call the tool in its specific/vault-named mode with `vault=B`, targeting the B-only discriminator.
3. **PASS = the answer is computed from B's content** (the B-only item is found / B's value returned), **while focus stays on A** (research.md D2). A `vault=B` *read* eval routes into B's `app` but does **not** move focus — do NOT read "focus didn't change" as a failure.
4. **FAIL (hard stop) = the answer reflects A** (the B-only item missing, or A's value returned) — a silent wrong-vault read (FR-012). Record and stop; this tool is `LIMITATION_*`, never silently corrected.
5. Record the run in [t0-probe-findings.md](t0-probe-findings.md): tool, focused vault, target vault, discriminator, exact call, returned-from, verdict.

## Hard rules

- **Active mode is correct-by-design — do NOT probe it as a limitation** (research.md D3). For `backlinks` / `links` / `read_heading` / `paths` / `smart_connections_similar`, probe the **specific** path only; the `active` path's focused-vault behaviour stays. Canonical trap: a "cross-vault" probe of an active-mode pre-flight (the `set_property` hazard) would falsely "confirm" a correct limitation.
- **Reproduce the documented failure scenario** (research.md D4) — design each probe from what that tool's doc claims fails (the "open the target vault first" recommendation in its multi-vault section), not just the convenient happy path.
- **Closed-B is a DISTINCT, out-of-positive-scope check** (research.md D5). The open-but-unfocused forcing-gate above is the only required positive case. A closed-B read rides the ADR-029 cold-start retry and is left as each tool does today (Group A `not-open`; Group B untouched) — include a closed-B probe only to *document* existing behaviour, never to add recovery.

## Native-wrapper sweep (no eval framing)

For each native-wrapper read/query doc, grep for any "focus first" line. If present, it is a *separate, clearer* error (native commands honour `vault=`); correct it without the eval/B1 framing. No forcing-gate eval probe is required for these (B1 never applied) — a single confirming `vault=B` native call suffices if any doc claims a focus precondition.

## Safety / scope

- Non-destructive: read-probes + doc edits. Any write-needing probe uses `TestVault-Obsidian-CLI-MCP` only.
- **Clean git working tree before any doc edit; rollback `git restore .`** (BI-0134 safety net).
- Cross-vault probes change which vault Obsidian shows — coordinate with the user and **restore A's focus** afterward. Do not close or reconfigure any vault. Tab/scratch residue in the test vault is harmless and closeable; clean up `Sandbox/` fixtures.
- Re-confirm any negative against `Obsidian.com` (the `.exe` detached-stdio false-clean artifact, corrected 2026-05-30).
