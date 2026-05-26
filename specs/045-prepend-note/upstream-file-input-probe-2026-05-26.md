# Upstream File-Input Probe — Obsidian CLI 1.12.7

**Investigation question.** Does the upstream `obsidian` CLI binary on this host support a file-based or stdin-based content input mode for `prepend`, `create`, or `append`, as an alternative to the `content=<bytes>` argv-element shape that caps payload size at the Windows CreateProcess limit (~32 767 chars; the wrapper's prepend schema cap of 24 576 chars derives from this).

**Why it matters.** The wrapper bug BI-0120 ("Fix Prepend Wrapper Side Large Content Failure") fires deterministically at ~10 KB content. The bug is wrapper-side (direct-CLI bisect at the same size returned ZERO failures across 4008–60008 argv bytes). One candidate fix is to switch the wrapper to a file-based or stdin-based input shape so content never crosses argv. That path is gated on upstream support.

---

## Test environment

| Item | Value |
| ---- | ----- |
| Obsidian CLI binary | `C:\Program Files\Obsidian\obsidian.exe` |
| Reported version | `1.12.7 (installer 1.12.7)` (via `obsidian version`) |
| Host OS | Windows 11 Pro 10.0.26200 |
| Test vault | `TestVault-Obsidian-CLI-MCP` at `C:\Marwan-Saab-ADO\Marwan at Metcash\Obsidian\TestVault-Obsidian-CLI-MCP` |
| Probe harness | `specs/047-fix-prepend-reliability/scratch/probe-file-input.cjs` (Node, `child_process.spawn` with `shell: false, windowsHide: true`) |
| Probe sandbox | `Sandbox/upstream-file-input/` (created/cleaned by harness) |
| Payload file | `Sandbox/upstream-file-input/payload.txt` containing `hello from temp file 12345` (26 bytes) |
| Pre-staged target baseline | `BASE_CONTENT_MARKER\n` (20 bytes) for prepend/append targets; absent for `create` targets |
| Raw probe output | `specs/047-fix-prepend-reliability/scratch/probe-results.json` |

Each probe spawned `obsidian.exe` directly (no shell, no MCP wrapper). For stdin probes, the harness used `stdio: ['pipe','pipe','pipe']` and wrote the payload to `child.stdin` before closing it. Each probe used a unique target filename to avoid vault-cache contamination.

Payloads stayed ≤ 1 KB across all probes — no risk of triggering the BI-0120 wrapper crash or the BI-0038 argv-IPC crash on the upstream side.

---

## Discoverability results

### `obsidian help` (global)

The global help listing enumerates every subcommand and its parameters. The relevant entries for the three write commands:

```
  append                Append content to a file
    file=<name>         - File name
    path=<path>         - File path
    content=<text>      - Content to append (required)
    inline              - Append without newline

  create                Create a new file
    name=<name>         - File name
    path=<path>         - File path
    content=<text>      - Initial content
    template=<name>     - Template to use
    overwrite           - Overwrite if file exists
    open                - Open file after creating
    newtab              - Open in new tab

  prepend               Prepend content to a file
    file=<name>         - File name
    path=<path>         - File path
    content=<text>      - Content to prepend (required)
    inline              - Prepend without newline
```

Header note in the global help:

```
Notes:
  file resolves by name (like wikilinks), path is exact (folder/note.md)
  Most commands default to the active file when file/path is omitted
  Quote values with spaces: name="My Note"
  Use \n for newline, \t for tab in content values
```

### `obsidian help prepend`, `obsidian help append`, `obsidian help create`

Each per-command help emits exactly the same parameter block listed above — no additional flags, no aliases, no documented stdin or file-input mechanism.

### `obsidian prepend --help`, `obsidian prepend -h`

Neither `--help` nor `-h` is recognised as a help flag. Both fall through to the parser, which then rejects the call:

```
Error: Missing required parameter: content=<text>
Usage: prepend [file=<name>] [path=<path>] content=<text> [inline]
```

The Usage line is the parser's exhaustive parameter set. There is no `[content-file=<path>]`, `[--stdin]`, or analogous element.

---

## Probe matrix

All 19 probes ran successfully (CLI process exited cleanly in every case; the harness captured exit code, stdout, stderr, and the post-state file content).

| # | Sub | Input mode tested | Result | stdout (verbatim) | Post-file content |
|---|-----|-------------------|--------|-------------------|-------------------|
| 1 | prepend | `content-file=<path>` | rejected (missing required) | `Error: Missing required parameter: content=<text>` | `BASE_CONTENT_MARKER\n` (unchanged) |
| 2 | prepend | `content_file=<path>` | rejected (missing required) | same | unchanged |
| 3 | prepend | `contentFile=<path>` | rejected (missing required) | same | unchanged |
| 4 | prepend | `--content-file=<path>` | rejected (missing required) | same | unchanged |
| 5 | prepend | `--content-file <path>` (two-arg) | rejected (missing required) | same | unchanged |
| 6 | prepend | `content=@<path>` | **literally prepended** the string `@<path>` | `Prepended to: …probe-06…` | `@Sandbox/upstream-file-input/payload.txt\nBASE_CONTENT_MARKER\n` |
| 7 | prepend | stdin (no `content` arg) | rejected (missing required); stdin ignored | `Error: Missing required parameter: content=<text>` | unchanged |
| 8 | prepend | `content=-` + stdin pipe | **literally prepended** the string `-`; stdin ignored | `Prepended to: …probe-08…` | `-\nBASE_CONTENT_MARKER\n` |
| 9 | prepend | `content=` (empty) + stdin pipe | rejected (different error: `Missing required parameter: content`) | `Error: Missing required parameter: content` | unchanged |
| 10 | prepend | `file=<wikilink>` + `content-file=<path>` | rejected (missing required) | `Error: Missing required parameter: content=<text>` | unchanged |
| 11 | append | `content-file=<path>` | rejected (missing required) | `Error: Missing required parameter: content=<text>` | unchanged |
| 12 | append | `content=@<path>` | **literally appended** the string `@<path>` | `Appended to: …probe-12…` | `BASE_CONTENT_MARKER\n\n@Sandbox/upstream-file-input/payload.txt` |
| 13 | append | stdin (no `content` arg) | rejected (missing required); stdin ignored | `Error: Missing required parameter: content=<text>` | unchanged |
| 14 | append | `content=-` + stdin pipe | **literally appended** the string `-`; stdin ignored | `Appended to: …probe-14…` | `BASE_CONTENT_MARKER\n\n-` |
| 15 | create | `content-file=<path>` | exit 0, file created EMPTY (size 0); `content-file` silently dropped, default empty content used | `Created: …probe-15…` | `` (empty) |
| 16 | create | `content=@<path>` | exit 0, file written with **literal** content `@<path>` | `Created: …probe-16…` | `@Sandbox/upstream-file-input/payload.txt` |
| 17 | create | stdin (no `content` arg) | exit 0, file created EMPTY; stdin ignored | `Created: …probe-17…` | `` (empty) |
| 18 | create | `content=-` + stdin pipe | exit 0, file written with **literal** content `-`; stdin ignored | `Created: …probe-18…` | `-` |
| 19 | prepend | BASELINE `content=<text>` | accepted, file prepended | `Prepended to: …probe-19…` | `BASELINE_PREPEND_OK\n\nBASE_CONTENT_MARKER\n` |

### Three observations from the matrix

1. **Unknown argv keys are silently dropped.** `content-file=`, `content_file=`, `contentFile=`, `--content-file=`, and a `--content-file <arg>` two-arg pair all left no trace — the parser kept walking, found no `content=` key, and emitted the same `Missing required parameter: content=<text>` error. No "unknown parameter" warning. The wrapper cannot probe for partial support by sniffing exit codes.
2. **`@<path>` is not file-dereference syntax.** Probes 6, 12, 16 confirm `content=@<path>` is treated as the literal string `@<path>` — exactly what a shell-naïve programmer would expect, and exactly what disqualifies it as an upstream-supported file-input shape.
3. **`content=-` is not stdin convention.** Probes 8, 14, 18 confirm `-` is taken as the literal single-character content `-`. The CLI does not honour the Unix dash convention.

Additionally, **`create` differs from `prepend`/`append` in one way**: `create` does NOT require `content=` (note the absence of `required:!0` in the asar-extracted schema below for `create`). Probes 15 and 17 confirm: with no `content` arg, `create` happily creates an empty file. This is consistent with `create` having `template=<name>` as an alternate content source. But it still does not honour `content-file=` or stdin.

---

## Source inspection findings

**Critical reframing.** The forum thread the spec referenced (`forum.obsidian.md/t/.../113867`) and the existence of `obsidian.exe` as a single binary led to an initial assumption that the CLI is a community plugin. **It is not.** The Obsidian CLI is *first-party* — it shipped in Obsidian 1.12 as part of the desktop binary itself. See [Obsidian's Official CLI Is Here — No More Hacking Your Vault from the Back Door](https://dev.to/shimo4228/obsidians-official-cli-is-here-no-more-hacking-your-vault-from-the-back-door-3123) (DEV Community) and the official landing page at [obsidian.md/cli](https://obsidian.md/cli). The username `WhiteNoise` mentioned in the spec is a forum user, not a separable plugin maintainer.

Consequence: there is no public GitHub repo to inspect or send PRs to. However, the CLI's JS source is bundled (minified) inside `C:\Program Files\Obsidian\resources\obsidian.asar`. Byte-level scan of that asar:

| Needle | Hits in `obsidian.asar` |
| ------ | ----------------------- |
| `content-file` | **0** |
| `contentFile` | **0** |
| `content_file` | **0** |
| `from-file` | 1, but in a Scheme/Lisp keyword list (`with-input-from-file`) — false positive |
| `--stdin` | 0 |
| `Missing required parameter` | 5 (the per-handler error strings) |
| `Prepended to` | 1 |
| `Usage: prepend` | 1 (offset 2199076) |

The 0-hit results for `content-file`, `contentFile`, and `content_file` rule out any feature-flagged, undocumented, or commented-out file-input branch in the bundled code.

### Decompiled prepend handler

Extracted from `obsidian.asar` at offset 2199076 (whitespace inserted for legibility; otherwise verbatim):

```js
this.registerHandler("prepend", "Prepend content to a file", {
    file:    { value: "<name>", description: "File name" },
    path:    { value: "<path>", description: "File path" },
    content: { value: "<text>", description: "Content to prepend", required: !0 },
    inline:  { description: "Prepend without newline" }
},
(function (t) {
    return y(e, void 0, void 0, function () {
        var e, n, i;
        return b(this, function (o) {
            switch (o.label) {
                case 0:
                    e = this.tryResolveFile(t);
                    if (!t.content)
                        throw "Missing required parameter: content\nUsage: prepend [file=<name>] [path=<path>] content=<text> [inline]";
                    n = t.content.replace(/\\n/g, "\n").replace(/\\t/g, "\t");
                    i = t.inline;
                    return [4, r.process(e, function (e) {
                        var t = Xx(e).contentStart,
                            r = e.substring(0, t),
                            o = e.substring(t);
                        return r + n + (i ? "" : "\n") + o;
                    })];
                case 1:
                    o.sent();
                    return [2, "Prepended to: ".concat(e.path)];
            }
        });
    });
}));
```

What this tells us:

- The schema is a closed dictionary with exactly four keys (`file`, `path`, `content`, `inline`). The `registerHandler` framework is the argv parser and only accepts declared keys; unknown keys are silently dropped before reaching the handler body. That matches probe behaviour 1:1.
- The handler reads `t.content` directly — no fallback to a file, no stdin read, no transformation other than escaping `\n` and `\t`.
- The `Xx(e).contentStart` call computes the "after frontmatter" insertion point, then splices `t.content` in. This is the same insertion point design pattern the wrapper's research artefacts assume.
- The handler body is ~15 lines minified. There is no commented-out branch.

The neighbouring `append` handler (visible in the same extract window) is structurally identical aside from the splice formula.

### `from-file` false positive

Offset 10384970 in `obsidian.asar`:

```
… string>? string? substring symbol->string symbol? #t tan transcript-off transcript-on truncate values vector vector->list vector-fill! vector-length vector-ref vector-set! with-input-from-file with-output-to-file write write-char zero?
```

This is a syntax-highlighting keyword list for a Scheme/Lisp language definition — unrelated to the CLI argv parser.

---

## Forum / changelog findings

Two open feature requests on the Obsidian forum confirm both that the feature is absent and that demand exists:

1. **[Support stdin pipe for obsidian CLI](https://forum.obsidian.md/t/support-stdin-pipe-for-obsidian-cli/112855)** — opened by `elliot-nelson`, March 30, 2026. Proposes nix-style `-` for stdin, with the example `echo "helloWorld()" | obsidian eval code=-`. Multiple supporting replies from users hitting the same multiline-content / quote-escaping wall. **No Obsidian-team response in the thread.**

2. **[CLI `create --overwrite`: Support stdin input and file source for multiline content](https://forum.obsidian.md/t/cli-create-overwrite-support-stdin-input-and-file-source-for-multiline-content/111071)** — opened by `mathias1510`, February 11, 2026. Proposes either stdin support or a `--from-file` parameter. Quotes the core argument: "Adding stdin/file support for create would close the last significant gap and make the CLI a complete solution for programmatic vault operations." Confirmed by `yanother` on Windows (March 9, 2026) — same defect surfaces on both Windows and macOS, by different shell-escape mechanisms. Workaround scripts posted by `ClareMacrae` (April 28) and `mkosma` (May 4). **No Obsidian-team response in the thread.**

A third forum thread, the user's original [CLI content parameter corrupts multi-byte UTF-8 at 8 KB chunk boundary (silent)](https://forum.obsidian.md/t/cli-content-parameter-corrupts-multi-byte-utf-8-at-8-kb-chunk-boundary-silent/113867) (May 10, 2026), documents the macOS variant of the argv-IPC corruption that motivated BI-0120 in the first place. WebFetch returned only the OP — no reply from any team member is visible at the URL.

The official changelog at [obsidian.md/changelog](https://obsidian.md/changelog/) and the help docs at [help.obsidian.md/cli](https://help.obsidian.md/Obsidian+CLI) document only the `content=<text>` shape — no mention of `content-file=`, `--from-file`, or stdin in any version released to date.

---

## Cross-subcommand asymmetry

None on the input mode. `prepend`, `append`, and `create` each accept only the documented schema keys. The single behavioural asymmetry is structural, not file-input-relevant:

- `prepend` and `append`: `content` is `required: !0` (handler throws if missing).
- `create`: `content` is **not** required. With no `content` and no `template=`, the file is created empty.

If a future change added `content-file=` to any one handler, the others would need the same change independently — the schema declarations are per-handler and the parser is a closed allow-list.

The `eval` subcommand (`code=<javascript>`) was scanned for an analogous shape; it follows the same pattern — `code` is the only content-bearing argv key, no `code-file=` or stdin. So an `eval`-based workaround that reads `app.vault.adapter.read(<wrapper-staged-temp>)` inside an inline `code=` template would have to fit the entire **template** into argv, which puts it back under the same Windows CreateProcess cap. It is workable only when the template + the resolved path are well under 24 KB — not a general solution to the wrapper's large-content path.

---

## Conclusion

**Verdict D (with a refinement worth surfacing).**

The matrix and the asar source extract together establish that none of `prepend`, `append`, or `create` accepts a file-based or stdin-based content input shape in Obsidian CLI 1.12.7. The parser is a closed allow-list over four declared keys; unknown keys are silently dropped. `@<path>` and `-` are taken as literal content. The bundled JS contains zero occurrences of `content-file`, `contentFile`, `content_file`, or any other file-input marker — there is no feature flag, no commented-out branch, no undocumented surface.

**Refinement on the verdict-C / verdict-D boundary.** The architectural spot to *add* `content-file=` is in fact clean — the `registerHandler` schema is a key map, and adding `"content-file": { value: "<path>", description: "Content from file", required: !1 }` plus a one-line `if (t["content-file"]) t.content = readFileSync(...)` precondition at the top of each handler body would be a sub-10-line change per handler. Verdict C ("trivial upstream change") would normally apply.

But the source is closed-bundled inside the Obsidian desktop binary, with no public repo and no merged-PR path. There is no maintainer-acknowledged feature request on the forum to ride. The shortest-path practical action upstream is to add a vote/comment on the two existing forum threads above; the longest is to file a paid support escalation through Obsidian Sync. Neither has a bounded timeline.

So treat this as **D-by-source-access**, not D-by-architecture. The architectural readiness for the change is high; the access-to-make-it path is closed.

---

## Recommendation for BI-0120

The upstream gate that would unlock the "use file or stdin so content never crosses argv" fix is **closed today and has no bounded ETA to open**. Treat any wrapper plan that depends on upstream `content-file=` or stdin support as blocked on third-party action with no SLA.

BI-0120's tractable options reduce to two:

1. **Wrapper-side argv path fix.** Diagnose the wrapper's spawn / queue / serialization layer to find the ~10 KB regression. The direct-CLI bisect at the same size returning ZERO failures bounds the defect to wrapper code, not upstream. This is the in-scope path for BI-0120 as currently chartered. Cost: bounded; we control the timeline.

2. **Repath to fs-direct per ADR-009.** Skip the CLI entirely on the write path; resolve the vault root via `obsidian.exe`'s existing read-side surface, then write the file via `fs.writeFileSync` from the wrapper. This is currently marked out-of-scope for BI-0120 against FR-005b's wrapper-side YAML-parser ban — but the eval-probed-frontmatter-boundary pattern from `write_note`'s design (probe the boundary with a small `eval=` template that returns the byte offset of `contentStart`, then write the splice from Node) keeps the YAML parsing on the Obsidian side and avoids the constitutional violation. This is the only path that *also* sidesteps the upstream argv-IPC defect itself (BI-0038 / forum thread 113867), so it has dual value. Cost: larger surface change; revisits FR-005b scope.

Path 1 is the current BI-0120 charter and should remain the first attempt. Path 2 is the structural fallback if Path 1 surfaces a wrapper-side bug whose root cause is the same Windows IPC layer the CLI uses for argv transport, in which case fs-direct is the only path that fully eliminates the failure mode. **What this probe rules OUT** is the third path the BI-0120 spec hinted at: switching the wrapper to upstream `content-file=` or stdin. That path is unavailable in CLI 1.12.7 and there is no upstream momentum that would change that within the BI-0120 window.

If the project does want to influence the upstream timeline, the cheapest non-engineering action is a vote + concrete-usage comment on [forum.obsidian.md/t/.../112855](https://forum.obsidian.md/t/support-stdin-pipe-for-obsidian-cli/112855) and [/t/.../111071](https://forum.obsidian.md/t/cli-create-overwrite-support-stdin-input-and-file-source-for-multiline-content/111071), citing the wrapper's specific failure mode (BI-0120: deterministic crash at ~10 KB on Windows; BI-0038: silent UTF-8 corruption at 4 KB boundaries on macOS / 8 KB on Windows). Two-thread evidence with a real downstream wrapper hitting two distinct argv-related defects is the strongest case available short of a paid escalation.
