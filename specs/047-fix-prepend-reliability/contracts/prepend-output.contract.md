# Contract: prepend tool output (success envelope)

**BI**: 047-fix-prepend-reliability
**Date**: 2026-05-27
**Source of truth**: `src/tools/prepend/schema.ts` (`prependOutputSchema`)
**Status**: Published contract. The output schema is byte-stable with v0.7.4; this BI's fix amends the handler's output-construction path to ensure no output envelope is constructed when the on-disk byte count is unchanged (FR-003 enforcement per R1 in [research.md](../research.md)).

## Shape

```text
{
  path: string,            // vault-relative path to the target note
  vault: string,           // vault display name
  bytes_written: number,   // integer ≥ 1 — the wrapper-observed byte-count delta
  inline: boolean          // echoes the inline input field
}
```

The strict mode (`prependOutputSchema.strict()` at `src/tools/prepend/schema.ts:66`) forbids any additional field; an envelope with extra keys is rejected at the SDK boundary.

## FR-003 structural enforcement

The `bytes_written: z.number().int().min(1)` constraint is the structural enforcement point for the broadened FR-003 prohibition. An output envelope with `bytes_written: 0` is **schema-invalid**; the SDK rejects it at the boundary regardless of what the handler emits.

However, the handler MUST NOT emit a `bytes_written: 0` envelope in the first place — emitting one and relying on the SDK to reject it would (a) violate Principle IV (silent partial-success behaviour), and (b) produce a generic schema-validation error that drops the wrapper-detected failure signal. The fix lands at the handler's success-path return site:

```text
After the upstream invokeCli call returns success:
  let postCallSize = (await fs.stat(absPath)).size
  let bytesWritten = postCallSize - preCallSize

  if (bytesWritten <= 0):
    throw new UpstreamError({
      code: "FS_WRITE_FAILED",
      cause: null,
      details: {
        reason: "post-stat-byte-delta-zero",
        path: relPath,
        vault: vaultDisplayName,
        preCallSize,
        postCallSize,
      },
      message: `prepend: upstream returned success but on-disk byte count is unchanged (pre=${preCallSize}, post=${postCallSize}); the write did not land. Possible silent-no-op from upstream — retry after confirming the target file is not held open by an external editor.`,
    })

  return { path, vault, bytes_written, inline }
```

This guard preserves the chain of custody from the wrapper-observable file-system state to the agent-visible discriminator (`FS_WRITE_FAILED.details.reason: "post-stat-byte-delta-zero"`), per Principle IV.

## Byte-count formula (R4)

The published byte-count contract is:

```text
postCallSize === preCallSize + utf8ByteLength(content) + separatorByteLength
bytes_written === postCallSize - preCallSize
```

Where `separatorByteLength` is the wrapper-inserted (actually upstream-inserted; the wrapper merely observes) separator length:

| Platform | `input.inline === false` | `input.inline === true` |
|----------|--------------------------|-------------------------|
| POSIX (Linux, macOS) | 1 byte (`\n`, 0x0A) | 0 bytes |
| Windows (CRLF target file) | 2 bytes (`\r\n`, 0x0D 0x0A) | 0 bytes |
| Windows (LF target file) | 1 byte (`\n`, 0x0A) | 0 bytes |

The Windows behaviour depends on the target file's existing line-ending convention; the upstream Obsidian CLI honours the file's existing convention rather than imposing CRLF. Callers SHOULD treat the `bytes_written` field as the authoritative wrapper-observed delta and reconstruct the upstream-inserted separator length client-side only when necessary.

## Acceptance criteria coverage

| Spec criterion | Output contract surface | Verification |
|----------------|--------------------------|--------------|
| FR-001 (in-cap success envelope, positive delta) | `bytes_written: number ≥ 1` | Output schema + handler guard. |
| FR-003 (no silent no-op, no zero-bytes-written envelope, no positive-bytes-written envelope when on-disk count unchanged) | Output schema rejects `bytes_written < 1`; handler guard catches `bytesWritten <= 0` against a primed pre-call stat | Output schema + handler guard. |
| FR-007 (post-state byte count formula) | Documented byte-count formula above | Empirical T0 probe at `/speckit-implement` confirms per-platform separator length. |
| SC-001 (100% in-cap success at structured envelope) | Success envelope schema | Regression suite at `/speckit-implement`. |
| SC-005 (0 success envelopes of any shape when on-disk count unchanged) | Handler guard + output schema | Regression suite at `/speckit-implement`. |

## Compatibility

This BI introduces NO breaking change to the output contract's success envelope shape. The four fields and their types are byte-stable with v0.7.4. The behavioural change is at the handler's output-construction path: an envelope that would have been emitted with `bytes_written: 0` in v0.7.4 (the silent-no-op anti-pattern) is replaced by a typed `UpstreamError` with the new sub-discriminator. Callers that already error-handle `UpstreamError` responses gain a new branch they can branch on (`FS_WRITE_FAILED.details.reason: "post-stat-byte-delta-zero"`); callers that ignore error responses see no behavioural change in the success path.
