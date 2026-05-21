# Contract: Dual validation envelope acknowledgement (per-tool error roster format)

**Story**: User Story 5 (FR-015, FR-016, FR-017)
**Surface**: per-tool `docs/tools/<name>.md` error-roster section
**Cohort**: `search`, `context_search`, `pattern_search`, `find_and_replace`, `find_by_property`, `backlinks`, `query_base`, `tag`

## Two envelope shapes

### Wrapped envelope (`UpstreamError`)

Produced when the rejecting validation is reached by the wrapper's own zod parse inside the registered handler (Cowork-class clients, post-strip; strict-rich clients that forward the full input unchanged).

Wire shape:
```jsonc
{
  "code": "VALIDATION_ERROR",
  "details": {
    "code": "<INVALID_PATTERN | INVALID_SUBFOLDER | OCCURRENCE_COUNT_EXCEEDED | ...>",
    "reason": "<empty | too-long | regex-syntax | path-traversal | not-found | ...>",
    "<field>": "<value>"
  },
  "message": "<human-readable diagnostic>"
}
```

### MCP transport error envelope (JSON-RPC `-32602`)

Produced when an MCP client that performs `inputSchema` validation client-side rejects the request before the wrapper-side handler runs (strict-rich pathway clients like MCP Inspector).

Wire shape:
```jsonc
{
  "jsonrpc": "2.0",
  "id": <request id>,
  "error": {
    "code": -32602,
    "message": "Invalid params",
    "data": {
      "issues": [
        {
          "code": "<zod issue code>",
          "path": ["<field name>"],
          "message": "<zod-generated message>",
          "expected": "<expected shape>",
          "received": "<actual shape>"
        }
      ]
    }
  }
}
```

## Per-tool roster format

The error-roster section in each cohort tool's `docs/tools/<name>.md` MUST include, immediately under the existing per-code rows, a paired summary line per envelope-producing rule. Format:

> | Rule | Wrapped envelope | MCP transport envelope |
> |---|---|---|
> | `<field>` length / numeric constraint | `VALIDATION_ERROR(<details.code>)` | `-32602 Invalid Params` (zod issue body) |
> | `<other rule>` | … | … |

Where each row corresponds to one field-level constraint declared in `src/tools/<name>/schema.ts`. The two envelope columns may carry different code values per rule — the rule is the join key, not the code.

## Cohort-wide invariant (FR-017)

- No tool's error roster MAY name a wrapped envelope code that the tool does not actually produce. Verified by per-tool probe against a Cowork-class client.
- No tool MAY produce a wrapped envelope code that its roster does not name. Verified by enumerating unique `UpstreamError({ code: ... })` instantiations in `src/tools/<name>/handler.ts` and `src/tools/<name>/index.ts` and cross-checking against the roster.
- The MCP transport envelope column is uniform across the cohort (always `-32602 Invalid Params` with a zod-issue body) — the per-rule variation is in the wrapped envelope column.

## Probe evidence

Per-tool probe records persisted to `dual-envelope-evidence.md` (created during `/speckit-implement`). Each record captures:
- Tool name
- Field-level rule probed
- Cowork-class client invocation + response (wrapped envelope shape)
- Strict-rich client invocation + response (MCP transport envelope shape)
- Confirmation: both envelopes produced under the documented rule.
