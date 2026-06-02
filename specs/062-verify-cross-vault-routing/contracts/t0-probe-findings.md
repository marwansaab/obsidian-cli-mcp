# T0 Probe Findings: Verify Cross-Vault Routing (BI-0134)

Per-tool raw evidence for the open-but-unfocused forcing gate. One row per at-risk eval read/query tool. Created during `/speckit-implement`; probes run 2026-06-02.

**Forcing-gate setup** (per [t0-probe-plan.md](t0-probe-plan.md) + `.memory/test-execution-instructions.md`):

- **Vault A (focused / "other")**: `The Setup` — held focus throughout (user-arranged).
- **Vault B (target, open-but-unfocused)**: `TestVault-Obsidian-CLI-MCP`.
- **Driver**: `Obsidian.com` (production-resolved shim), via the real `executeXxx` handlers (production code path minus the MCP JSON-RPC envelope), real `invokeCli` → real spawn, real single-flight `createQueue`, no-op `Logger`. Probe harness: `bi0134-probe.mjs` (outside repo tree; imports `dist/`).
- **Fixtures**: `TestVault-Obsidian-CLI-MCP/Sandbox/BI-0134/` (staged T003).
- **PASS** = answer computed from B's content (B-only discriminator returned). **FAIL (hard stop)** = answer reflects A (FR-012). All 9 returned B → no FAIL.

## Findings ledger

| Tool | Focused (A) | Target (B) | Discriminator (B-only) | Exact call | Returned-from | Verdict |
|------|-------------|-----------|------------------------|-----------|---------------|---------|
| `backlinks` | The Setup | TestVault | backlink set {`bi0134-source`} of `bi0134-target` | `executeBacklinks({target_mode:"specific", vault:"TestVault-Obsidian-CLI-MCP", file:"bi0134-target"})` | **B** | **ROUTING_CONFIRMED** |
| `links` | The Setup | TestVault | forward-link set {`bi0134-target`} of `bi0134-source` | `executeLinks({target_mode:"specific", vault:"TestVault-Obsidian-CLI-MCP", file:"bi0134-source"})` | **B** | **ROUTING_CONFIRMED** |
| `read_heading` | The Setup | TestVault | heading body `BODYUNIQB-4F2A9` under `BI0134 Heading Fixture::BI0134 Heading Marker` | `executeReadHeading({target_mode:"specific", vault:"TestVault-Obsidian-CLI-MCP", file:"bi0134-heading", heading:"BI0134 Heading Fixture::BI0134 Heading Marker"})` | **B** | **ROUTING_CONFIRMED** |
| `paths` | The Setup | TestVault | path `Sandbox/BI-0134/bi0134-pattern-Z8KX.md` | `executePaths({target_mode:"specific", vault:"TestVault-Obsidian-CLI-MCP", folder:"Sandbox/BI-0134"})` | **B** | **ROUTING_CONFIRMED** |
| `tag` | The Setup | TestVault | tag `#bi0134tagUNIQB` → {`bi0134-tag`} | `executeTag({vault:"TestVault-Obsidian-CLI-MCP", tag:"bi0134tagUNIQB"})` | **B** | **ROUTING_CONFIRMED** |
| `find_by_property` | The Setup | TestVault | `bi0134prop: UNIQB-7Q3` → {`bi0134-prop`} | `executeFindByProperty({vault:"TestVault-Obsidian-CLI-MCP", property:"bi0134prop", value:"UNIQB-7Q3", arrayMatch:false, caseSensitive:true})` | **B** | **ROUTING_CONFIRMED** |
| `pattern_search` | The Setup | TestVault | content `PATTERNUNIQB-Z8Q7M` → {`bi0134-pattern-Z8KX`} | `executePatternSearch({vault:"TestVault-Obsidian-CLI-MCP", pattern:"PATTERNUNIQB-Z8Q7M"})` | **B** | **ROUTING_CONFIRMED** |
| `smart_connections_query` | The Setup | TestVault | B-indexed note on "Patagonian BI0134 ashfall sandgrouse" | `executeSmartConnectionsQuery({vault:"TestVault-Obsidian-CLI-MCP", query:"Patagonian ashfall sandgrouse volcanic winter", limit:10})` | **B** | **ROUTING_CONFIRMED** |
| `smart_connections_similar` | The Setup | TestVault | similar set of B-indexed `bi0134-sc` → {`bi0134-sc-related`} | `executeSmartConnectionsSimilar({target_mode:"specific", vault:"TestVault-Obsidian-CLI-MCP", file:"bi0134-sc", limit:10})` | **B** | **ROUTING_CONFIRMED** |

## Raw evidence (verbatim handler output, 2026-06-02)

```json
{"tool":"backlinks","output":{"count":1,"backlinks":[{"source":"Sandbox/BI-0134/bi0134-source.md"}]}}
{"tool":"links","output":{"count":1,"links":[{"target":"bi0134-target","line":3,"kind":"wikilink"}]}}
{"tool":"read_heading","output":{"content":"\nBODYUNIQB-4F2A9 — this heading body text exists only in vault B.\n\n"}}
{"tool":"paths","output":{"count":8,"paths":["Sandbox/BI-0134/bi0134-heading.md","Sandbox/BI-0134/bi0134-pattern-Z8KX.md","Sandbox/BI-0134/bi0134-prop.md","Sandbox/BI-0134/bi0134-sc-related.md","Sandbox/BI-0134/bi0134-sc.md","Sandbox/BI-0134/bi0134-source.md","Sandbox/BI-0134/bi0134-tag.md","Sandbox/BI-0134/bi0134-target.md"]}}
{"tool":"tag","output":{"count":1,"paths":["Sandbox/BI-0134/bi0134-tag.md"]}}
{"tool":"find_by_property","output":{"count":1,"paths":["Sandbox/BI-0134/bi0134-prop.md"]}}
{"tool":"pattern_search","output":{"count":1,"matches":[{"path":"Sandbox/BI-0134/bi0134-pattern-Z8KX.md","line":3,"offset":35,"match":"PATTERNUNIQB-Z8Q7M"}]}}
{"tool":"smart_connections_query","output":{"count":10,"topHits":[{"path":"Sandbox/BI-0134/bi0134-sc.md","score":0.742},{"path":"Sandbox/BI-0134/bi0134-sc-related.md","score":0.742}],"note":"all 10 results are B paths"}}
{"tool":"smart_connections_similar","output":{"count":10,"topHit":{"path":"Sandbox/BI-0134/bi0134-sc-related.md","score":0.947},"note":"all 10 results are B paths"}}
```

> read_heading first probe returned `HEADING_NOT_FOUND` for a single-segment heading — a **probe-input bug** (the matcher requires the full `H1::H2` path; schema requires ≥2 `::`-segments). The error named the **B** file path (`Sandbox/BI-0134/bi0134-heading.md`), so routing into B was already confirmed; the corrected `H1::H2` call returned the B-only body. Not a routing or tool defect.

## Aggregation (T015)

All nine at-risk eval read/query tools route `vault=B` into B while A holds focus. **B1 is falsified per-tool for the entire eval read/query cohort** — confirming, on each tool's own evidence, what ADR-031 declined to extrapolate from `open_file`. No `returned-from = A`; **Phase 5 (US3) is empty** as expected (research.md D5). No hard stop.

| Tool | ToolVerdict |
|------|-------------|
| `backlinks` | ROUTING_CONFIRMED |
| `links` | ROUTING_CONFIRMED |
| `read_heading` | ROUTING_CONFIRMED |
| `paths` | ROUTING_CONFIRMED |
| `tag` | ROUTING_CONFIRMED |
| `find_by_property` | ROUTING_CONFIRMED |
| `pattern_search` | ROUTING_CONFIRMED |
| `smart_connections_query` | ROUTING_CONFIRMED |
| `smart_connections_similar` | ROUTING_CONFIRMED |

## Notes

- SC probes ran against Smart Connections **enabled + indexed** in TestVault (installed at `.obsidian/plugins/smart-connections/`). This is **not** a bare-vault deviation: Smart Connections backs the `smart_connections_query` / `smart_connections_similar` MCP tools, so it is part of the legitimate test baseline. The "no plugins" rule targets *unrelated* third-party extensions that could mutate state mid-test, not the plugin the MCP surface under test depends on. No revert at cleanup (FR-015 — the backing plugin is neither changed nor special-cased).
- All probes drove `Obsidian.com` (not `.exe`), so no detached-stdio false-clean risk. No negatives to re-confirm — every verdict is a positive B-content return.
- SC results also surfaced other B-vault notes (e.g. `Sandbox/BI-0016/...`, `Fixtures/BI-038/...`, `Sandbox/BI-047/...`) — all B paths, reinforcing that the query/index ran against B, not A.
