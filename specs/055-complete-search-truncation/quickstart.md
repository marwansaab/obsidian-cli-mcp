# Quickstart: Complete Search Truncation

Verifies that `search` / `context_search` `limit = N` returns the leading N of the path-ascending ordering across the **full** match set — not the leading N of upstream's opaque order.

## Unit verification (merge gate — no live CLI)

```bash
npm run lint && npm run typecheck && npm run build && npx vitest run src/tools/search src/tools/context_search
```

Expected: the new leading-N + truncated tests pass. The decisive test stubs `invokeCli` to return a deliberately scrambled order and asserts the path-ascending leading N:

```ts
// search default mode — upstream returns non-path-ascending order
invokeCli → ["body-3.md","body-5.md","body-2.md","body-4.md","body-1.md"]
executeSearch({ query: "...", limit: 2 }, deps)
// EXPECT: { count: 2, paths: ["body-1.md","body-2.md"], truncated: true }
//   NOT  { count: 2, paths: ["body-2.md","body-3.md"], ... }  ← the pre-fix bug
```

Boundary tests:

- `limit: 3` over the same 5 → `paths: ["body-1.md","body-2.md","body-3.md"]`, `truncated: true`.
- total ≤ limit → all returned path-ascending, `truncated` absent, no drop.
- line/context, `S === limit`, no drop → `truncated: true` (conservative, preserved).
- default, `S === limit` → `truncated` absent (precise, preserved).

## Live-CLI re-validation (manual — gated)

> Before running anything that touches the real `obsidian` binary or a vault, read `.memory/test-execution-instructions.md` for the authorised vault, scratch subdirectory, and cleanup protocol. This step is NOT part of the vitest gate.

Reuses the BI-0084 T0 corpus (`Fixtures/BI-0011/body-{1..5}.md`, marker `Zb1q9k2xBody`), whose names sort `body-1 < body-2 < body-3 < body-4 < body-5` but whose upstream order is `body-3, body-5, body-2, body-4, body-1` (T0 §1).

1. `search` with the marker query and `limit: 2` → response paths are `body-1.md, body-2.md`, `count: 2`, `truncated: true`.
2. `search` `limit: 3` → `body-1.md, body-2.md, body-3.md`.
3. `context_search` with the marker query and `limit: 2` → matches cover `body-1.md, body-2.md`, count 2, `truncated: true`.
4. No `limit` → up to `DEFAULT_CAP` (1000) entries, all path-ascending; the full set crossed the pipe (the output-cap backstop is unaffected for this small corpus).

## Help-doc fidelity check (manual)

For each of `docs/tools/search.md` and `docs/tools/context_search.md`: follow the rewritten "Truncation slice direction" section's documented call against the documented fixture; the returned subset MUST match the documented description verbatim (FR-006 / FR-007).

## Done when

- All four unit-test obligations (contracts/leading-n-truncation.md) pass for both surfaces.
- `npm run lint`, `typecheck`, `build`, `vitest run` all green; statements-coverage floor holds.
- Both help docs' truncation-direction sections describe full-set fetch and match runtime verbatim.
- No new `UpstreamError` code introduced (SC-006).
