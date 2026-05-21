# Contract: `find_and_replace` symmetric sub-discriminator on `INVALID_SUBFOLDER`

**Story**: User Story 4 (FR-012, FR-013, FR-014)
**Surface**: `src/tools/find_and_replace/handler.ts:512-523` (handler-layer ENOENT rejection)
**ADR**: ADR-015 (Sub-Discriminators via `details.reason` for Multi-State Error Codes)

## Before

The `(VALIDATION_ERROR, INVALID_SUBFOLDER)` pair has two rejection branches:

**Branch A — path-traversal-shape rejection** (schema layer, `src/tools/find_and_replace/schema.ts:42-51`):
```jsonc
{
  "code": "VALIDATION_ERROR",
  "details": {
    "code": "INVALID_SUBFOLDER",
    "reason": "path-traversal",
    "subfolder": "../escape",
    "vault": "Demo"
  },
  "message": "find_and_replace: path is not structurally safe (must not start with '/', '\\\\', or a drive letter; must not contain '..' segments or control characters)"
}
```

**Branch B — missing-subfolder ENOENT rejection** (handler layer, `src/tools/find_and_replace/handler.ts:512-523`):
```jsonc
{
  "code": "VALIDATION_ERROR",
  "details": {
    "code": "INVALID_SUBFOLDER",
    "subfolder": "does/not/exist",
    "vault": "Demo"
  },
  "message": "find_and_replace: subfolder \"does/not/exist\" does not exist in vault"
}
```

Note Branch B has no `details.reason` field. An agent pattern-matching on `details.reason` must conditional-handle whether the field is present.

## After

**Branch A — UNCHANGED.**

**Branch B — `reason: "not-found"` added**:
```jsonc
{
  "code": "VALIDATION_ERROR",
  "details": {
    "code": "INVALID_SUBFOLDER",
    "reason": "not-found",
    "subfolder": "does/not/exist",
    "vault": "Demo"
  },
  "message": "find_and_replace: subfolder \"does/not/exist\" does not exist in vault"
}
```

## Closed union (ADR-015 sub-state set on this pair)

```text
details.reason ∈ { "path-traversal", "not-found" }
```

No third sub-state is introduced by this BI. The union is exhaustive across the two rejection branches that produce `(VALIDATION_ERROR, INVALID_SUBFOLDER)` envelopes.

## Diff scope

- One edit at `handler.ts:516-521` — add `reason: "not-found"` to the `details` object literal of the `UpstreamError` instantiation in the ENOENT branch.
- One edit at `handler.test.ts:720-733` — flip the assertion from "no path-traversal reason" (asserting `details.reason` is `undefined`) to "reason is `'not-found'`"; update the test description to "ENOENT on subfolder realpath → VALIDATION_ERROR/INVALID_SUBFOLDER (reason: not-found)".
- One new symmetry test at `handler.test.ts` (or `index.test.ts`, co-located alongside the existing path-traversal symmetry case at `index.test.ts:134-148`) — exercises both rejection branches in the same test file and asserts the `details.reason` field is present on both, narrowed to the closed union above.
- One edit at `index.ts:1` header-comment — extend the reason enumeration from `empty / too-long / regex-syntax / path-traversal` to `empty / too-long / regex-syntax / path-traversal / not-found`.
- Doc update at `docs/tools/find_and_replace.md` — error-roster section names both reasons on the `INVALID_SUBFOLDER` row.

## Test plan (Constitution Principle II)

Co-located with the source modification:

1. **Existing test update** — `handler.test.ts:720` flips the assertion from absence to `"not-found"`.
2. **Path-traversal regression guard** — `index.test.ts:134-148` is untouched (asserts `details.reason === "path-traversal"` on the path-traversal-shape rejection). This test continues to pass and serves as the symmetry counterpart.
3. **New symmetry test** — fail-on-asymmetry: a single test that triggers both rejection paths in turn and asserts both envelopes carry a `details.reason` field that narrows to the closed union `"path-traversal" | "not-found"`. This is the FR-013 test.

## Constitution Compliance signal

- **Principle I**: Y — change localised within the `find_and_replace` module.
- **Principle II**: Y — co-located tests updated + new symmetry test added in the same change.
- **Principle III**: Y — no schema shape change. The schema's `superRefine` continues to produce the path-traversal branch; the handler-layer ENOENT path remains schema-untouched.
- **Principle IV**: Y — no new top-level code. The change is a `details.reason` value addition on an existing sub-discriminator pair.
- **Principle V**: Y — no new files; existing headers preserved.
- **ADR-010**: N/A — no new typed tool.
- **ADR-013**: N/A — no new plugin-namespace tool.
- **ADR-014**: N/A — no plugin-backed tool.
- **ADR-015**: Y — adds a new sub-state to an existing `(top-level-code, details.code)` pair via `details.reason`, per the ADR's canonical pattern.
