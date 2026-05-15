# Contract — `tree` handler

**Surface**: internal handler `handleTree` (factory `createTreeTool`)
**Branch**: `029-list-files-recursive`
**Status**: locked at /speckit-plan.

This document captures the load-bearing INTERNAL contracts of the handler — invariants that the test suite must lock and that future maintainers must not silently violate. The handler's public input/output shape is the [tree-input.contract.md](./tree-input.contract.md); this document covers the WIRING between the validated input and the dispatched CLI call.

## Dependencies shape

```typescript
type HandlerDeps = {
  invokeCli: InvokeCliFn;          // From src/cli-adapter
  detectEvalVaultClosed: (result: InvokeCliResult) => void;  // From src/tools/_eval-vault-closed-detection
};
```

`detectEvalVaultClosed` is imported from the shared module; BI-029 is the FOURTH consumer (after BI-026 inline → BI-027 lifted → BI-028 third-consumer). The function inspects the result for the empty-stdout transparent-open signature and throws `UpstreamError("CLI_REPORTED_ERROR", { details: { code: "VAULT_NOT_FOUND", reason: "not-open" } })` on detection. The handler is unaware of the internal detection rule — it merely calls and lets the throw propagate.

## Invariants I-1..I-14

(Identical to the per-tool invariants in [data-model.md](../data-model.md#per-tool-invariants); reproduced here for the contract surface.)

| ID | Invariant |
|---|---|
| **I-1 — Validation-before-dispatch** | The handler MUST NOT call `deps.invokeCli` for any input that fails the `treeInputSchema` validation. Schema errors throw `VALIDATION_ERROR` before any side effect. Test seam: spy on `deps.invokeCli` and assert zero calls across invalid-input fixtures. |
| **I-2 — Single-invokeCli-per-request** | Exactly ONE `deps.invokeCli` call per handler invocation, regardless of input shape (total true/false, folder set/unset, depth set/unset, ext set/unset). Test seam: spy.callCount assertion. |
| **I-3 — Fixed dispatch shape** | The `invokeCli` call shape is exactly: `{ subcommand: "eval", targetMode: <input.target_mode>, vault?: <input.vault>, parameters: { code: <rendered-template> } }`. No additional parameters keys; no command-line flags beyond what the eval subcommand and target_mode wiring naturally produce. |
| **I-4 — Frozen template + single-token substitution** | The `parameters.code` string equals `FROZEN_TEMPLATE.replace("__PAYLOAD_B64__", <b64-payload>)`. The frozen template is byte-stable across calls (test asserts SHA-256 of the constant); the only mutation is the one substitution. |
| **I-5 — Base64 payload round-trip** | The base64 payload decodes to a JSON object with exactly four keys: `folder`, `depth`, `ext`, `total`. Tests decode the captured payload and assert key set; values are normalised per the schema-output shape (`folder: null` when omitted, etc.). |
| **I-6 — Closed-vault detection at stage 3** | After `invokeCli` returns, the handler calls `detectEvalVaultClosed(result)` BEFORE any other parse step. If the detector throws, the throw propagates unchanged. Test seam: inject a mock invokeCli returning the empty-transparent-open signature and assert `VAULT_NOT_FOUND(reason: "not-open")` propagation. |
| **I-7 — `=> ` prefix strip** | The handler trims leading whitespace from `result.stdout`, then strips a leading `=> ` (the eval subcommand's literal return-value marker) if present. Stdout without the marker is passed through unchanged to JSON.parse. |
| **I-8 — Multi-stage parse** | Stages 5–8 of the dispatch: `JSON.parse` (failure → `json-parse`), `envelopeSchema.safeParse` (failure → `envelope-parse`), discriminate on `ok` (failure → `envelope-error` with `code` + `folder`), output-schema validation (failure → `envelope-parse` — should be unreachable in correct code). |
| **I-9 — Envelope-error mapping** | `{ ok: false, code: "FOLDER_NOT_FOUND", folder }` maps to `UpstreamError("CLI_REPORTED_ERROR", { details: { stage: "envelope-error", code: "FOLDER_NOT_FOUND", folder } })`. `{ ok: false, code: "NOT_A_FOLDER", folder }` maps to the same shape with `code: "NOT_A_FOLDER"`. No other envelope `code` values are accepted (the discriminated union restricts the enum). |
| **I-10 — Cross-mode count invariant** | The handler does NOT modify `count` or `paths` after the envelope parse. When `total: true` the envelope already carries `paths: []` AND `count: <filtered-length>`; when `total: false` the envelope carries `paths: [...]` AND `count === paths.length`. The handler trusts the eval template. |
| **I-11 — Vault flow-through** | In specific mode, `input.vault` flows to `deps.invokeCli({vault})` unchanged. In active mode, `vault` is omitted from the dispatch call. No vault echoing in the output (parity with other read tools — Memory `feedback_no_locator_echo_in_read_responses`). |
| **I-12 — Output schema validation at boundary** | The final return value is passed through `treeOutputSchema.parse()` to assert the wire shape one final time. A schema failure at this stage is a developer bug (the eval template produced an out-of-contract envelope). |
| **I-13 — Original-no-upstream attribution** | All three new source files (`schema.ts`, `handler.ts`, `index.ts`) carry the `// Original — no upstream. <intent>.` header per Constitution Principle V and FR-026. |
| **I-14 — Test-seam single-spawn assertion** | The test suite asserts `deps.invokeCli` is called EXACTLY ONCE per request via a `vi.fn()` spy with `expect(spy).toHaveBeenCalledTimes(1)`. |

## Failure-propagation chain

```
input
  │
  ├── treeInputSchema.parse() ──fail──> VALIDATION_ERROR
  │
  ▼
deps.invokeCli({ subcommand: "eval", code: rendered })
  │
  ├── dispatch-layer classifier ──"Vault not found."──> CLI_REPORTED_ERROR(VAULT_NOT_FOUND, reason: "unknown")
  ├── dispatch-layer classifier ──"no active file"───> ERR_NO_ACTIVE_FILE
  ├── dispatch-layer classifier ──"Error: ..."───────> CLI_REPORTED_ERROR(stage: dispatch)
  ├── adapter cap-kill ─────────────────────────────> CLI_NON_ZERO_EXIT(output-cap)
  │
  ▼
detectEvalVaultClosed(result) ──empty-transparent-open──> CLI_REPORTED_ERROR(VAULT_NOT_FOUND, reason: "not-open")
  │
  ▼
trimStart + strip "=> "
  │
  ▼
JSON.parse(jsonText) ──fail──> CLI_REPORTED_ERROR(stage: "json-parse")
  │
  ▼
treeEnvelopeSchema.safeParse(parsed) ──fail──> CLI_REPORTED_ERROR(stage: "envelope-parse")
  │
  ▼
discriminate on ok
  │
  ├── ok: false, code: "FOLDER_NOT_FOUND" ─> CLI_REPORTED_ERROR(envelope-error, FOLDER_NOT_FOUND)
  ├── ok: false, code: "NOT_A_FOLDER"     ─> CLI_REPORTED_ERROR(envelope-error, NOT_A_FOLDER)
  │
  ▼
treeOutputSchema.parse({ count, paths }) ──fail──> CLI_REPORTED_ERROR(stage: "envelope-parse")
  │
  ▼
return { count, paths }
```

## Test seam pattern (canonical)

```typescript
import { describe, it, expect, vi } from "vitest";
import { handleTree } from "./handler";

const makeMockCli = (response: { stdout: string; exitCode?: number }) => vi.fn().mockResolvedValue({
  stdout: response.stdout,
  stderr: "",
  exitCode: response.exitCode ?? 0,
});

describe("handleTree — invokeCli call shape", () => {
  it("dispatches exactly one eval call with base64-encoded payload", async () => {
    const invokeCli = makeMockCli({ stdout: "=> {\"ok\":true,\"count\":0,\"paths\":[]}\n" });
    const detectEvalVaultClosed = vi.fn();  // no-op for happy path

    await handleTree({ invokeCli, detectEvalVaultClosed }, {
      target_mode: "specific",
      vault: "Demo",
      folder: "Inbox",
      depth: 2,
      total: false,
    });

    expect(invokeCli).toHaveBeenCalledTimes(1);
    const [call] = invokeCli.mock.calls;
    expect(call[0].subcommand).toBe("eval");
    expect(call[0].targetMode).toBe("specific");
    expect(call[0].vault).toBe("Demo");
    expect(call[0].parameters.code).toContain("atob");

    // Round-trip the payload: extract the b64 token and decode
    const codeStr = call[0].parameters.code as string;
    const m = codeStr.match(/atob\("([^"]+)"\)/);
    expect(m).not.toBeNull();
    const payload = JSON.parse(Buffer.from(m![1], "base64").toString("utf-8"));
    expect(payload).toEqual({ folder: "Inbox", depth: 2, ext: null, total: false });
  });
});
```

## Anti-injection structural lock

The frozen template is a single string constant. The only way user input reaches the eval runtime is via the base64-encoded JSON payload, which is opaque to a JS parser. To attack the wrapper via input, an adversary would need to find a base64-encodable JSON payload that, when fed to the template's JSON.parse + structured walk, produces a side-effect outside the documented contract — but the template's only side effect is `app.vault.adapter` calls bounded by the vault root, and the vault root is enforced by the Obsidian CLI's vault-routing layer (verified per F8 / F9). No path-injection vector escapes the vault root.

The test suite asserts the frozen template is byte-stable across calls (a SHA-256 fingerprint test that re-runs on every commit). Drift here is a structural anti-injection regression and surfaces in test failures.
