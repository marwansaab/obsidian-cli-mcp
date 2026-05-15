# Handler Contract: `tag`

**Branch**: `028-list-tagged-files`
**Date**: 2026-05-15

Invariants the `tagHandler` factory must satisfy. The handler lives at `src/tools/tag/handler.ts` and is the single load-bearing module between the validated input and the cli-adapter's `invokeCli`.

## Handler invariants (I-1..I-12)

### I-1 — Validation-before-dispatch
The handler MUST call `tagInputSchema.parse(rawInput)` BEFORE any `invokeCli` invocation. Validation failures throw `ZodError` (which the SDK serialises as `VALIDATION_ERROR`); no CLI spawn occurs.

**Test pattern**: handler.test.ts mocks `invokeCli` with a spy; the spy MUST NOT be called for any input that fails schema parse.

### I-2 — Single `invokeCli` call per request
The handler MUST invoke `invokeCli` exactly once per request (default mode AND count-only mode). Branching happens INSIDE the JS template via `wantTotal`, not by spawning twice.

**Test pattern**: spy on `invokeCli`; assert `spy.calls.length === 1` post-call regardless of `input.total`.

### I-3 — Subcommand contract
The handler MUST set `subcommand: "eval"` and provide `parameters.code = <rendered-frozen-template>`. No other parameters at v1 (vault optionally flows through; total flows through via payload only).

**Test pattern**: assert `invokeCli` call args.

### I-4 — Base64 payload assembly
The handler MUST construct the payload as:
```
payloadObj = { query: input.tag, total: !!input.total }
payloadJson = JSON.stringify(payloadObj)
payloadB64 = Buffer.from(payloadJson, "utf8").toString("base64")
code = FROZEN_TEMPLATE.replace("__PAYLOAD_B64__", payloadB64)
```

The payload reaches the JS source ONLY as a base64 literal inside an `atob(...)` call (FR-020). User text is never template-interpolated.

**Test pattern**: extract the `__PAYLOAD_B64__`-substituted region from `code`, base64-decode it, JSON.parse the result, assert deep-equal to the expected payload shape.

### I-5 — Frozen JS template byte-stability
The handler MUST NOT mutate the frozen JS template between calls. The only varying region per call is the substituted base64 payload.

**Test pattern**: two calls with different inputs — `code1.replace(b64_1, "X")` MUST equal `code2.replace(b64_2, "X")`.

### I-6 — Stage-0 closed-vault detection via shared module
The handler MUST consume `src/tools/_eval-vault-closed-detection/index.ts` for closed-but-registered-vault detection BEFORE attempting JSON parse. When the detector returns true, the handler MUST throw `UpstreamError("CLI_REPORTED_ERROR", { details: { code: "VAULT_NOT_FOUND", reason: "not-open" } })`.

**Test pattern**: feed empty-stdout exit-0 invokeCli mock; assert thrown error matches the closed-vault shape.

### I-7 — Multi-stage parse contract
Five-stage parse:
- **Stage 0**: closed-vault detection (I-6).
- **Stage 1**: extract JSON — `trimmed = stdout.trimStart()`; `jsonText = trimmed.startsWith("=> ") ? trimmed.slice(3) : trimmed`. (BI-026 pattern — no LAST-`=> ` rescan needed since the JS template is quiet.)
- **Stage 2**: `JSON.parse(jsonText)` — failure → `CLI_REPORTED_ERROR(stage: "json-parse")`.
- **Stage 3**: `tagEvalEnvelopeSchema.safeParse(parsed)` — failure → `CLI_REPORTED_ERROR(stage: "envelope-parse")`.
- **Stage 4**: discriminate on `envelope.ok`. `ok: false` → `CLI_REPORTED_ERROR(stage: "envelope-error", code: envelope.code)`.
- **Stage 5**: return per-mode shape — `envelope.mode === "count-only"` returns bare integer (validated via `tagCountOnlyOutputSchema.parse`); otherwise returns `{count, paths}` (validated via `tagDefaultOutputSchema.parse`).

### I-8 — Envelope-error → UpstreamError mapping
The v1 envelope-error branch is reserved for future cache-state failures the JS template might want to surface. At v1, the JS template returns ONLY `ok: true` shapes — but the handler MUST handle `ok: false` defensively, mapping `envelope.code` into `CLI_REPORTED_ERROR.details.code` directly.

| Envelope code (future) | UpstreamError mapping |
|------------------------|----------------------|
| `<any-string>` | `CLI_REPORTED_ERROR(stage: "envelope-error", code: <as-emitted>)` |

ZERO new top-level error codes introduced by this BI.

### I-9 — Cross-mode invariant
For ANY input `{tag, vault?, total?}`, calling once with `total: false` and once with `total: true` (otherwise identical input, identical vault state) MUST yield responses where the count-only result equals the default-mode `paths.length`.

**Test pattern**: handler.test.ts paired-call assertion against deterministic mocked stdout.

### I-10 — `vault` flow-through
When `input.vault === undefined`, the `invokeCli` call MUST NOT include a `vault` key. When `input.vault` is a non-empty string, it MUST flow through verbatim.

**Test pattern**: two parameterised cases asserting the `invokeCli` args' `vault` field.

### I-11 — Output schema validation at boundary
Before returning to the caller, the handler MUST validate the response shape against the appropriate output schema (`tagDefaultOutputSchema` or `tagCountOnlyOutputSchema`). This catches the unlikely case where the eval template returns a syntactically-valid envelope whose mode discriminator agrees with `input.total` but whose data shape is malformed.

**Test pattern**: feed an envelope with `mode: "default"` but `paths` containing non-strings — assert handler throws (envelope-parse catches it earlier; this is defence-in-depth).

### I-12 — Original-no-upstream attribution
Each new source file (`schema.ts`, `handler.ts`, `index.ts`) MUST carry a header of the form:
```
// Original — no upstream. <one-line description>.
```

Per Constitution Principle V.

## Failure propagation chain

```
caller
  └── tagHandler(rawInput)
       ├── Zod parse → throws ZodError → SDK serialises VALIDATION_ERROR
       └── invokeCli (single call)
            ├── cli-adapter Vault-not-found classifier
            │    └── CLI_REPORTED_ERROR{code: VAULT_NOT_FOUND, reason: "unknown"}
            ├── shared closed-vault detector (stage 0)
            │    └── CLI_REPORTED_ERROR{code: VAULT_NOT_FOUND, reason: "not-open"}
            ├── JSON.parse failure (stage 2)
            │    └── CLI_REPORTED_ERROR{stage: "json-parse"}
            ├── envelope safeParse failure (stage 3)
            │    └── CLI_REPORTED_ERROR{stage: "envelope-parse"}
            ├── envelope.ok === false (stage 4)
            │    └── CLI_REPORTED_ERROR{stage: "envelope-error", code: <as-emitted>}
            ├── output schema parse failure (stage 5, defence-in-depth)
            │    └── ZodError surfaces as bug; should be unreachable
            ├── cli-adapter CLI_NON_ZERO_EXIT (e.g. output cap kill)
            ├── cli-adapter CLI_DISPATCH_TIMEOUT
            ├── cli-adapter CLI_DISPATCH_CAP_KILL
            └── cli-adapter CLI_DISPATCH_KILL
```

## Test seam pattern

Per R12:

```ts
const mockInvokeCli = vi.fn();
const handler = tagHandler({ invokeCli: mockInvokeCli });

mockInvokeCli.mockResolvedValueOnce({
  stdout: '=> {"ok":true,"mode":"default","count":2,"paths":["a.md","b.md"]}',
  stderr: "",
  exitCode: 0,
});

const result = await handler({ tag: "alpha" });

expect(mockInvokeCli).toHaveBeenCalledTimes(1);
const call = mockInvokeCli.mock.calls[0][0];
expect(call.subcommand).toBe("eval");
expect(call.parameters.code).toContain("__PAYLOAD_B64__"); // NEVER — assert AFTER substitution
// Round-trip the payload:
const b64Match = call.parameters.code.match(/atob\("([A-Za-z0-9+/=]+)"\)/);
const payload = JSON.parse(Buffer.from(b64Match[1], "base64").toString("utf8"));
expect(payload).toEqual({ query: "alpha", total: false });

expect(result).toEqual({ count: 2, paths: ["a.md", "b.md"] });
```

## Single-spawn invariant

For ANY successful or failing handler call: `invokeCli` is called exactly once OR zero times (zero only when validation fails). NEVER twice.

This invariant is the structural lock that distinguishes single-call architectures (BI-014/015/025/026/027/028) from multi-call architectures (BI-018 write_property which spawns twice for specific+file). Test seam enforces it.

## Anti-injection structural lock

The base64 alphabet `[A-Za-z0-9+/=]` cannot break out of the JS string literal that wraps `__PAYLOAD_B64__`. Combined with the frozen-template byte-stability invariant (I-5), this provides a structural anti-injection guarantee that does NOT depend on input charset (FR-020 / R6).

Test characterisation: three adversarial inputs (`"\"); evil(); ("`, newlines, backticks) round-trip through base64 and produce byte-stable template output. Tests 41-43 in the handler suite.
