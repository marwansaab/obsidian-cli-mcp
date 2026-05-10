# Upstream Obsidian bug report

> **Status**: Filed 2026-05-10 02:31 UTC
> **Live thread**: <https://forum.obsidian.md/t/cli-windows-json-parse-failure-crashes-obsidians-main-process-when-any-single-argv-element-exceeds-4-kb/114119>
> **Posted title**: `[CLI][Windows] JSON.parse failure crashes Obsidian's main process when any single argv element exceeds ~4 KB`
> **Cross-link suggested in body**: forum.obsidian.md/t/.../113867 (the macOS ~8 KB UTF-8 corruption thread, hypothesised same root)

The contents below are a snapshot of what was filed. Treat it as a working record — when the upstream thread accumulates replies or the Obsidian team responds, update the BI-038 record in this repo (`421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Investigations/BI-038 - ...`), not this file.

---

## Summary

Any Obsidian CLI subcommand call that includes a single argv element larger than approximately **4 KB** crashes Obsidian's main process on Windows with a "**A JavaScript error occurred in the main process**" dialog. The error is `SyntaxError: Unexpected token ... is not valid JSON` raised by `JSON.parse` inside `Socket.n` at `obsidian.asar/main.js:66:136`, called from `Pipe.onStreamRead` (Node's stream-chunk-arrived path).

This is **not specific to the `content=` parameter or the `create` subcommand**. We reproduced the same crash on `obsidian eval code=...` once the `code=` argv element crosses the same threshold. The defect is in how the receiving end of the CLI's IPC pipe handles a JSON message that gets split across two pipe chunk-reads — `JSON.parse` is invoked on the first partial chunk before the full message has been reassembled.

This appears to be **the same root-cause bug family** as the existing [`CLI: content= parameter corrupts multi-byte UTF-8 at ~8 KB chunk boundary (silent ��)`](https://forum.obsidian.md/t/cli-content-parameter-corrupts-multi-byte-utf-8-at-8-kb-chunk-boundary-silent/113867) thread (macOS, ~8 KB threshold, silent UTF-8 corruption) — different *manifestation* depending on what straddles the chunk boundary:

| Variant | Platform | Threshold | What straddles the chunk boundary | Symptom |
|---|---|---|---|---|
| Existing thread | macOS | ~8 KB | a multi-byte UTF-8 codepoint | Silent `U+FFFD` corruption, exit 0 |
| **This report** | **Windows** | **~4 KB** | **a JSON message** | **Host crash dialog, fatal `SyntaxError`** |

The threshold differential (4 KB Windows vs 8 KB macOS) is consistent with the platforms' different default IPC pipe buffer sizes.

## Reproduction (Windows, PowerShell)

A reproducible bisect with no third-party plugins. Tested against a fresh empty vault.

### Setup

1. Open a vault in the Obsidian desktop app — a fresh empty vault is sufficient. Confirm it is the focused window (the CLI's `vault=` parameter is functionally ignored — all calls hit the focused vault).
2. Open PowerShell anywhere on the host.

### Probe script

```powershell
function Build-Plain([int]$bytes) {
  $base = "The quick brown fox jumps over the lazy dog. ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789. "
  $sb = New-Object System.Text.StringBuilder
  while ($sb.Length -lt $bytes) { [void]$sb.Append($base) }
  $sb.ToString().Substring(0, $bytes)
}

function Probe-Create([int]$size) {
  $content = Build-Plain $size
  $r = obsidian create "path=Sandbox/probe-$size.md" "content=$content" overwrite 2>&1 | Out-String
  "create  size=$size  exit=$LASTEXITCODE  stdout='$($r.Trim())'"
}

function Probe-Eval([int]$size) {
  $content = Build-Plain $size
  $payload = @{path="Sandbox/probe-eval-$size.md"; content=$content} | ConvertTo-Json -Compress
  $b64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($payload))
  $tpl = "(async()=>{const p=JSON.parse(atob('$b64'));await app.vault.adapter.write(p.path,p.content);return JSON.stringify({ok:true,bytes:p.content.length});})()"
  $r = obsidian eval "code=$tpl" 2>&1 | Out-String
  "eval    size=$size  exit=$LASTEXITCODE  argvLen=$($tpl.Length+5)  stdout='$($r.Trim())'"
}

# Bisect both surfaces
2000, 3000, 4000, 5000 | ForEach-Object { Probe-Create $_ ; Probe-Eval $_ }
```

### Observed (verbatim from a real run)

```
create  size=2000  exit=0  stdout='Created: Sandbox/probe-2000.md'
eval    size=2000  exit=0  argvLen=3111  stdout='=> {"ok":true,"bytes":2000}'
create  size=3000  exit=0  stdout='Created: Sandbox/probe-3000.md'
eval    size=3000  exit=0  argvLen=4443  stdout=''                      <- CRASH (eval, JS-error dialog)
create  size=4000  exit=0  stdout='Created: Sandbox/probe-4000.md'
eval    size=4000  exit=0  argvLen=5779  stdout=''                      <- CRASH (eval)
create  size=5000  exit=0  stdout=''                                    <- CRASH (create, JS-error dialog)
eval    size=5000  exit=0  argvLen=7245  stdout=''                      <- CRASH (eval)
```

Each blank-stdout row corresponds to a host JS-error dialog popping. Note that the CLI's exit code is `0` and stderr is empty even when the host crashed — there is no signal back to the caller that anything went wrong.

### Threshold pattern (size of the largest single argv element)

| Surface | Largest argv element at success | Largest argv element at crash |
|---|---|---|
| `obsidian create` | `content=` ≈ 4076 bytes | `content=` ≈ 5128 bytes |
| `obsidian eval` | `code=` ≈ 3111 bytes | `code=` ≈ 4443 bytes |

Both surfaces flip from success to crash when their largest argv element crosses approximately **4 to 4.5 KB** — strongly consistent with a single shared root cause at the IPC layer, not a per-subcommand defect. The eval surface flips on a smaller *content* size only because its `code=` element packs in a constant ~150-byte JS template plus base64 expansion of the user's payload.

## Crash dialog (verbatim)

Title: `Error`  
Body: `A JavaScript error occurred in the main process`

```
Uncaught Exception:
SyntaxError: Unexpected token ',', ..."plain.md","overwrit"... is not valid JSON
    at JSON.parse (<anonymous>)
    at Socket.n (C:\Program Files\Obsidian\resources\obsidian.asar\main.js:66:136)
    at Socket.emit (node:events:519:28)
    at addChunk (node:internal/streams/readable:561:12)
    at readableAddChunkPushByteMode (node:internal/streams/readable:512:3)
    at Readable.push (node:internal/streams/readable:392:5)
    at Pipe.onStreamRead (node:internal/stream_base_commons:189:23)
```

Quoted snippets in the crashing JSON vary across runs — some examples we captured:

- `..."plain.md","overwrit"...` — from a `create` call's argv array
- `..."o-5kb.md","","overwrit"...` — from a `create` call with an empty parameter
- `..."",":["eval"],"tty":"fa"...` — from an `eval` call (note: shows the receiver is parsing the full argv array as JSON, including `["eval"]` and `"tty":"false"` framing fields)
- `...,"Calls.md",],"tty":"fa"...` — from a separate `create` call

The presence of `"tty":"false"` and `["eval"]` in the partially-parsed JSON confirms the receiver is parsing a serialised argv-plus-framing envelope — and the failure point is mid-string in the user-supplied argv payload (`"plain.md","overwrit"` mid-array, etc.) — exactly where you would expect a chunk-boundary cut to land in a single large argv element.

## Hypothesis

Same as the existing UTF-8 thread, applied to the JSON-framing path:

The CLI's IPC server-side `Socket` handler appears to invoke `JSON.parse` on each incoming pipe chunk individually rather than buffering until a complete framed message has arrived. When the message exceeds one Windows named-pipe chunk (~4 KB on this host), the first arriving chunk is a syntactically-incomplete JSON prefix and `JSON.parse` throws.

The macOS thread reports the same failure-to-buffer at ~8 KB but with the multi-byte-UTF-8 face: `Buffer#toString()` on a chunk that ends mid-codepoint replaces the partial codepoint with `U+FFFD` and the *concatenated* string is then valid JSON, hence silent corruption rather than a fatal parse failure.

A correct fix would buffer the incoming pipe stream and only invoke `JSON.parse` (and any encoding decode) once the framed message is complete — both faces of the bug then disappear together.

## Impact

- Any external integration that needs to send more than ~4 KB through `content=`, `code=`, or any other large argv parameter on Windows is unusable. Specifically MCP servers wrapping the CLI for AI agents, which routinely produce notes well above 4 KB.
- The bug is **silent at the call site** — exit code is `0`, stderr is empty. The only signal that anything went wrong is the modal JS-error dialog on the user's screen, which their AI agent / script cannot see. Repeated calls produce repeated dialogs that the user has to manually dismiss.
- Workarounds that route the data through a different CLI surface (e.g. `eval code=...` instead of `create content=...`) **do not help** — they hit the same chunk-boundary defect at the same overall argv-element threshold.

## Suggested workaround for callers (until fixed)

For external integrations doing writes: bypass the CLI for the bytes themselves. Write the file directly to the vault's filesystem with regular OS file I/O (Obsidian's own file watcher will pick up the new content). Use the CLI only for control-plane operations that fit comfortably under ~3 KB argv.

## Environment

- **Obsidian**: 1.12.7 (installer 1.12.7) — verified via `obsidian version`
- **Electron**: 39.8.3
- **Node**: 22.22.1
- **Chrome**: 142.0.7444.265
- **OS**: Windows 11 Pro, build 10.0.26200
- **CLI binary**: `C:\Program Files\Obsidian\obsidian.exe`
- **Vault**: fresh empty vault, no community plugins, default config

## Related

- [CLI: `content=` parameter corrupts multi-byte UTF-8 at ~8 KB chunk boundary (silent ��)](https://forum.obsidian.md/t/cli-content-parameter-corrupts-multi-byte-utf-8-at-8-kb-chunk-boundary-silent/113867) — likely the same root cause, different manifestation. macOS, ~8 KB, silent UTF-8 corruption.

## Notes for the maintainer posting this

- The Obsidian app + installer version above is what was on this host at the time of the bisect (2026-05-10). Confirm it still matches your installation before posting.
- The reproduction needs the focused vault to be the same one whose Sandbox path is being written to (the CLI's `vault=` parameter is honoured by neither `create` nor `eval` against the IPC pipe — both surfaces de-facto target the focused vault). This may be worth calling out as an aside if you want to mention it, but it is not the bug being reported here.
- After running the probe script you will need to dismiss several modal "JavaScript error occurred in the main process" dialogs — one per crashed call.
