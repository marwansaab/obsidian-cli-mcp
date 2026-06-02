# Doc-Correction Contract: Verify Cross-Vault Routing

Per-tool mapping of the **current** documentation caveat → the **required corrected state** once the tool's own forcing-gate probe ([t0-probe-plan.md](t0-probe-plan.md)) resolves its `ToolVerdict` (data-model.md). Each correction is gated on that tool's own evidence (FR-003); none is applied by inference from another tool.

Two caveat shapes exist in the cohort today (confirmed by grep at plan time):

- **Shape 1 — the false "focus-first" precondition** (the real drift target): *"Recommendation: open the target vault in Obsidian before invoking `<tool>`."* Lives in the doc's **"Multi-vault basename ambiguity"** section and conflates a genuine same-display-name collision with the now-falsified routing assumption.
- **Shape 2 — already-accurate "omit → focused default / pass `vault` to scope"**: states that omitting `vault` uses the focused default and passing `vault` scopes to a named vault. This is *correct* and is confirmed, not removed.

## Group 1 — carries the false focus-first caveat (Shape 1) → expected `ROUTING_CONFIRMED`

| Tool | Caveat locus (before) | Required after (on `ROUTING_CONFIRMED`) |
|------|----------------------|------------------------------------------|
| `read_heading` | [read_heading.md:95](../../../docs/tools/read_heading.md#L95) — "open the target vault in Obsidian before invoking `read_heading`" | Remove the focus-first precondition. The specific-mode `vault=` read routes to the named open-but-unfocused vault (probe-confirmed). Keep the same-display-name collision as the real, scoped limitation, reworded so it no longer implies focusing fixes a true name collision. |
| `tag` | [tag.md:248](../../../docs/tools/tag.md#L248) — "open the target vault in Obsidian before invoking `tag`" (the section already states `vault=` "routes correctly for eval (verified live)") | Remove the focus-first precondition; the doc's own "routes correctly" line is now the headline. Keep the basename-collision note as the real limit. |
| `paths` | [paths.md:268](../../../docs/tools/paths.md#L268) — "open the target vault in Obsidian before invoking `paths`" | Remove focus-first precondition (specific mode). Keep collision note. Active mode unchanged. |
| `backlinks` | [backlinks.md:351](../../../docs/tools/backlinks.md#L351) — "open the target vault in Obsidian before invoking `backlinks`" | Remove focus-first precondition (specific mode). Keep collision note. Active mode unchanged. |
| `links` | [links.md:281](../../../docs/tools/links.md#L281) — "open the target vault in Obsidian before invoking `links`" | Remove focus-first precondition (specific mode). Keep collision note. Active mode unchanged. |

## Group 2 — already accurate (Shape 2) → confirm, light/no correction

| Tool | Current framing | Required after |
|------|-----------------|----------------|
| `find_by_property` | [find_by_property.md:68](../../../docs/tools/find_by_property.md#L68) — "pass `vault` explicitly" for deterministic scoping; omit → focused default | No false caveat to remove. Confirm the named-`vault` path routes cross-vault; if any wording implies the named path needs focus, tighten it. The omit-→-focused-default text stays (correct). |
| `pattern_search` | [pattern_search.md:7](../../../docs/tools/pattern_search.md#L7) — "routes to a named vault; omitting it uses the focused vault" | Confirm; no focus-first caveat present. Leave the accurate framing; add an explicit cross-vault confirmation line only if it improves clarity. |
| `smart_connections_query` | [smart_connections_query.md:34](../../../docs/tools/smart_connections_query.md#L34) — "omitted → focused vault" | Confirm; no focus-first caveat. Plugin-index caveats unrelated and untouched. |
| `smart_connections_similar` | active mode = focused-by-design ([:25](../../../docs/tools/smart_connections_similar.md#L25)); basename note ([:308](../../../docs/tools/smart_connections_similar.md#L308)) says "use `path`" | Confirm the specific-mode `vault=` path routes cross-vault. Active mode unchanged (correct-by-design). No focus-first caveat to remove. |

## Active-mode rows — DO NOT TOUCH (FR-004, research.md D3)

The `ERR_NO_ACTIVE_FILE` / active-mode rows in `read_heading`, `backlinks`, `links`, `smart_connections_similar` (and the `paths` active-mode line) describe focused-by-design behaviour. They are correct and stay verbatim. Only the **specific/`vault=`** path's caveat is in scope.

## Native-wrapper sweep (separate, clearer error — no eval framing)

Grep each native-wrapper read/query doc (`read`, `read_property`, `outline`, `search`, `context_search`, `bases`, `files`, `properties`, `views_base`) for any focus-first line. None is expected (native commands honour `vault=`); correct any found one without the eval/B1 framing. `views_base` is genuinely focused-`.base`-only by design — its focused requirement is correct and stays. `query_base`: its query path is native `base:query`; document its cross-vault behaviour on that path, and leave its `eval`-based closed-vault detector (the `not-open` signal) as-is (out of positive scope).

## Shared register

After the sweep, update the **B1 affected-features list** and **mitigation status** in [.architecture/Obsidian CLI - Upstream Issues and Limitations.md](../../../.architecture/Obsidian%20CLI%20-%20Upstream%20Issues%20and%20Limitations.md): mark B1 removed for each `ROUTING_CONFIRMED` tool; record native-wrappers as never-a-B1-victim (not B1-resolved); leave B1 standing only where a tool's own probe genuinely confirms it (expected: none).

## On a `LIMITATION_SIGNALLED` / `LIMITATION_DEFERRED` verdict (contingency)

If any tool's probe returns A (silent wrong-vault) instead of B:

- `LIMITATION_SIGNALLED` — state the real, confirmed limitation in its doc; wire **only** an already-emitted sibling signal (zero new code/reason, FR-013). Ships with its co-located `*.test.ts` failure-path case (Principle II).
- `LIMITATION_DEFERRED` — state the real limitation; note the structured signal is deferred to a dedicated BI (FR-014); do not mark the tool failed.

In both, the no-silent-wrong-vault guarantee (FR-012) still holds — the doc states the limitation rather than leaving the false "focus first" line.
