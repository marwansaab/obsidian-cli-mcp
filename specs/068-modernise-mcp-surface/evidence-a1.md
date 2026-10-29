# Evidence: A1 metadata refresh (T004, before the fix)

- **Date**: 2026-10-28
- **Branch / build**: `068-pr1-fixes` at the PR-0 docs commit, so the source is identical
  to `main` (`npm run build`, `node dist/index.js`, MCP SDK v1)
- **Vault**: `TestVault-Obsidian-CLI-MCP`. It was the vault open in Obsidian, so it was also
  the focused vault.
- **Client**: a scratch stdio MCP client (SDK v1 `Client` + `StdioClientTransport`) that
  makes each call back to back with no delay
- **Fixture**: `Sandbox/a1-t004-20261028075400.md`, seeded with `Body line for probe.` and
  no frontmatter

## Result: user-visible defect NOT reproduced

In each round, `write_note` set a property and the very next call, `find_by_property`,
found it. Verbatim responses:

```text
### write_note adds frontmatter
request: {"name":"write_note","arguments":{"target_mode":"specific","vault":"TestVault-Obsidian-CLI-MCP","path":"Sandbox/a1-t004-20261028075400.md","content":"---\na1probe: t004-20261028075400\n---\nBody line for probe.\n","overwrite":true}}
response: {"content":[{"type":"text","text":"{\"created\":false,\"path\":\"Sandbox/a1-t004-20261028075400.md\"}"}]}
### find_by_property immediately after
request: {"name":"find_by_property","arguments":{"vault":"TestVault-Obsidian-CLI-MCP","property":"a1probe","value":"t004-20261028075400"}}
response: {"content":[{"type":"text","text":"{\"count\":1,\"paths\":[\"Sandbox/a1-t004-20261028075400.md\"]}"}]}
### round 2: write_note changes value
response: {"content":[{"type":"text","text":"{\"created\":false,\"path\":\"Sandbox/a1-t004-20261028075400.md\"}"}]}
### round 2: find_by_property new value
response: {"content":[{"type":"text","text":"{\"count\":1,\"paths\":[\"Sandbox/a1-t004-20261028075400.md\"]}"}]}
### round 3: write_note changes value
response: {"content":[{"type":"text","text":"{\"created\":false,\"path\":\"Sandbox/a1-t004-20261028075400.md\"}"}]}
### round 3: find_by_property new value
response: {"content":[{"type":"text","text":"{\"count\":1,\"paths\":[\"Sandbox/a1-t004-20261028075400.md\"]}"}]}
### round 4: write_note new note with property
request: {"name":"write_note","arguments":{"target_mode":"specific","vault":"TestVault-Obsidian-CLI-MCP","path":"Sandbox/Deep/a1-t004-new.md","content":"---\na1probe: t004-r4\n---\nNew.\n"}}
response: {"content":[{"type":"text","text":"{\"created\":true,\"path\":\"Sandbox/Deep/a1-t004-new.md\"}"}]}
### round 4: find_by_property new note
response: {"content":[{"type":"text","text":"{\"count\":1,\"paths\":[\"Sandbox/Deep/a1-t004-new.md\"]}"}]}
```

## Code-level defect: confirmed

The refresh eval that runs today passes the **absolute** path to `getFileByPath`. Obsidian
returns `null` for an absolute path, so the refresh does nothing. Raw `Obsidian.com` output:

```text
expr: app.vault.getFileByPath("C:\\Marwan-Saab-ADO\\My-Setup\\My-Setup\\TestVault-Obsidian-CLI-MCP\\Sandbox\\a1-t004-20261028075400.md")?.path ?? 'NULL (absolute path)'
exit=0 stdout: => NULL (absolute path)
 stderr:
expr: app.vault.getFileByPath('Sandbox/a1-t004-20261028075400.md')?.path ?? 'NULL (relative path)'
exit=0 stdout: => Sandbox/a1-t004-20261028075400.md
 stderr:
```

The search is fresh only because Obsidian's file watcher re-indexes the note before the
next call arrives. The server's refresh plays no part. Each MCP call spawns the CLI at
least once, and that seems to give the watcher enough time.

## Cleanup

`Sandbox/` is empty and `Welcome.md` is untouched. No `.trash/` entries were created,
because the fixtures were removed directly from disk.

Per T004 / research R13, code changes stopped here for an owner decision. The owner then
ruled (option A): FR-005/SC-001 now take the code-level null resolution above as the
"before" evidence.

# Evidence: A1 metadata refresh (T010, after the fix)

- **Date**: 2026-10-28
- **Build**: `068-pr1-fixes` working tree (`npm run build`, `node dist/index.js`)
- **Same client and vault as T004.** The server's stderr was captured for every run. A
  `bridge.metadata_refresh_failed` line would appear for any refresh that failed, or
  where Obsidian could not find the note (`missing`). Its absence therefore shows that
  the refresh resolved the written note and completed.

## Finding: the refresh call that ADR-009 §5 names wedges Obsidian's metadata worker

The first after-fix run used the inherited template body
`app.metadataCache.computeMetadataAsync(f)` with a correct vault-relative path. For the
first time it actually ran, and it did damage:

```text
### 2 tag a1appendt010 (next call)
response: {"content":[{"type":"text","text":"{\"count\":0,\"paths\":[]}"}]}
### 4 find_by_property a1probe=t010-f (next call)
response: {"content":[{"type":"text","text":"{\"count\":0,\"paths\":[]}"}]}
### server stderr
{"event":"bridge.metadata_refresh_failed","ts":"2026-10-27T21:04:15.694Z","vault":"TestVault-Obsidian-CLI-MCP","relPath":"Sandbox/a1-t010.md","reason":"unexpected eval output: [error] {}\n=> ok"}
```

Diagnosis with raw `Obsidian.com` evals:

```text
code: app.metadataCache.work.toString().slice(0,500)
exit=0 stdout: => function(e){var t=this;if(this.workerResolve)throw new Error("Work queue must be sequential!");return new Promise((function(n){t.workerResolve=n,t.worker.postMessage({metadataCache:e},[e])}))}
code: String(!!app.metadataCache.workerResolve)
exit=0 stdout: => true
code: (async()=>{const f=app.vault.getFileByPath('Welcome.md');const r=await app.metadataCache.computeMetadataAsync(await app.vault.readBinary(f));return JSON.stringify(Object.keys(r||{}));})()
exit=0 stdout: [error] {}
=> []
```

`computeMetadataAsync` expects the file's bytes (an ArrayBuffer). Given a TFile, `work()`
sets `workerResolve` first, then `postMessage` fails to clone the TFile. `workerResolve`
is never cleared, so every later metadata computation in that vault window fails, the
watcher's included. The note's cache went to `null`, and even `Welcome.md` could no longer
be indexed. Reloading the vault window (`app:reload`) cleared the stuck state:
`workerResolve` → `false`, and the cache showed `{"a1probe":"t010-f"}` again. Only the
test vault's window was affected. Before this release the call never ran in production,
because the absolute path always resolved to `null`.

**Fix**: the template calls `app.metadataCache.computeFileMetadataAsync(f)`, the method
Obsidian's own file watcher uses. It reads the bytes itself and queues them on the
worker. A unit test now forbids `computeMetadataAsync(` in the template. This departs
from the call ADR-009 §5 names; the ADR needs an owner-side amendment.

## Result after the fix: every path fresh on the next call, no refresh failures

```text
### 1 write_note adds frontmatter a1probe=t010-w
response: {"content":[{"type":"text","text":"{\"created\":false,\"path\":\"Sandbox/a1-t010.md\"}"}]}
### 1 find_by_property a1probe=t010-w (next call)
response: {"content":[{"type":"text","text":"{\"count\":1,\"paths\":[\"Sandbox/a1-t010.md\"]}"}]}
### 2 append_note adds #a1appendt010
response: {"content":[{"type":"text","text":"{\"path\":\"Sandbox/a1-t010.md\",\"vault\":\"TestVault-Obsidian-CLI-MCP\",\"bytes_written\":13,\"inline\":false}"}]}
### 2 tag a1appendt010 (next call)
response: {"content":[{"type":"text","text":"{\"count\":1,\"paths\":[\"Sandbox/a1-t010.md\"]}"}]}
### 4 find_and_replace commit scoped by path: t010-w -> t010-f
request: {"name":"find_and_replace","arguments":{"vault":"TestVault-Obsidian-CLI-MCP","path":"Sandbox/a1-t010.md","pattern":"a1probe: t010-w","replacement":"a1probe: t010-f","mode":"literal","commit":true}}
response: {"content":[{"type":"text","text":"{\"mode\":\"commit\",\"changed_notes\":[\"Sandbox/a1-t010.md\"],\"total_occurrences_replaced\":1,\"partial\":false}"}]}
### 4 find_by_property a1probe=t010-f (next call)
response: {"content":[{"type":"text","text":"{\"count\":1,\"paths\":[\"Sandbox/a1-t010.md\"]}"}]}
### server stderr
{"event":"bridge.shutdown","ts":"2026-10-27T21:06:24.535Z","reason":"transport_closed","inFlightKilled":false,"queuedDropped":0}

### 3 patch_heading append under Doc#Tasks adds #a1headingt010
response: {"content":[{"type":"text","text":"{\"path\":\"Sandbox/a1-t010.md\",\"vault\":\"TestVault-Obsidian-CLI-MCP\",\"heading_path\":\"Doc#Tasks\",\"mode\":\"append\",\"bytes_written\":79}"}]}
### 3 tag a1headingt010 (next call)
response: {"content":[{"type":"text","text":"{\"count\":1,\"paths\":[\"Sandbox/a1-t010.md\"]}"}]}
### 5 write_note new note in new folder (refresh on a just-created file)
response: {"content":[{"type":"text","text":"{\"created\":true,\"path\":\"Sandbox/New/a1-t010-new.md\"}"}]}
### 5 find_by_property a1probe=t010-new (next call)
response: {"content":[{"type":"text","text":"{\"count\":1,\"paths\":[\"Sandbox/New/a1-t010-new.md\"]}"}]}
### server stderr
{"event":"bridge.shutdown","ts":"2026-10-27T21:06:34.215Z","reason":"transport_closed","inFlightKilled":false,"queuedDropped":0}
```

SC-001: write, append, heading edit and committed find-and-replace were each found by
the very next call, 4 out of 4. No refresh-failure event was logged, so each refresh
resolved the written note.

## Multi-vault: the written vault is refreshed while another vault is focused

```text
args: eval code="app.vault.getName()"
exit=0 stdout: => My-Setup-Vault
### 6 write_note to TV while another vault is focused (open:true)
request: {"name":"write_note","arguments":{"target_mode":"specific","vault":"TestVault-Obsidian-CLI-MCP","path":"Sandbox/a1-t010.md","content":"---\na1probe: t010-m\n---\n# Doc\n\nmulti-vault\n","overwrite":true,"open":true}}
response: {"content":[{"type":"text","text":"{\"created\":false,\"path\":\"Sandbox/a1-t010.md\"}"}]}
### 6 find_by_property a1probe=t010-m in TV (next call)
response: {"content":[{"type":"text","text":"{\"count\":1,\"paths\":[\"Sandbox/a1-t010.md\"]}"}]}
### server stderr
{"event":"bridge.shutdown","ts":"2026-10-27T21:06:52.963Z","reason":"transport_closed","inFlightKilled":false,"queuedDropped":0}
args: vault=TestVault-Obsidian-CLI-MCP eval code="app.workspace.getActiveFile()?.path ?? \"none\""
exit=0 stdout: => Sandbox/a1-t010.md
args: vault=TestVault-Obsidian-CLI-MCP eval code="String(!!app.metadataCache.workerResolve)"
exit=0 stdout: => false
```

`open: true` opened the written note in the written vault (FR-003), and the test vault's
metadata worker stayed healthy.

## Refresh targeting an unfocused second vault (owner request)

With the test vault focused, the exact refresh template ran with `vault=My-Setup-Vault`
on an existing note. It only re-indexes the note; the file's SHA-256 was the same before
and after.

```text
args: eval code="app.vault.getName()"
exit=0 stdout: => TestVault-Obsidian-CLI-MCP
args: vault=My-Setup-Vault eval code="(async()=>{const f=app.vault.getFileByPath(\"000-Meta/Vault Identity.md\");if(!f)return \"missing\";await app.metadataCache.computeFileMetadataAsync(f);return \"ok\";})()"
exit=0 stdout: => ok
args: vault=My-Setup-Vault eval code="String(!!app.metadataCache.workerResolve)"
exit=0 stdout: => false
hash unchanged: True
```

## Cleanup (T010)

`Sandbox/` is empty, `Welcome.md` is untouched and there is no `.trash/`. The test vault's
window was reloaded once to clear the stuck metadata worker described above.
