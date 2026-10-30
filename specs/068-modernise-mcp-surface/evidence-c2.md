# Evidence: C2 passthrough denylist command names (T020)

**Task**: T020 (PR-2, User Story 3) · **Feeds**: research R4, data-model §7, FR-010
**Probe date**: 2026-10-30 · **Host**: Windows 11, `Obsidian.com` resolved from `PATH`
(`C:\Users\sirzi\AppData\Local\Programs\Obsidian\Obsidian.com`, the same binary bare
`obsidian` resolves to and that the production binary resolver spawns).

## Invocation

```powershell
Start-Process -FilePath (Get-Command obsidian).Source -ArgumentList "help" `
  -RedirectStandardOutput out.txt -RedirectStandardError err.txt -NoNewWindow -Wait -PassThru
```

`help` takes no `vault=` and touches no vault, so no `Sandbox/` fixture was created and
there is nothing to clean up.

- Exit code: `0`
- stderr: empty (0 bytes)
- stdout: 579 lines, reproduced verbatim at the end of this file.

## Pinned denylist (FR-010, spec clarification Q3)

| Rule | Command names | Source line in the `help` output |
|---|---|---|
| exact | `eval` | `eval                  Execute JavaScript and return result` |
| exact | `devtools` | `devtools              Toggle Electron dev tools` |
| exact | `restart` | `restart               Restart the app` |
| exact (plugin lifecycle) | `plugin:install` | `plugin:install        Install a community plugin` |
| exact (plugin lifecycle) | `plugin:enable` | `plugin:enable         Enable a plugin` |
| exact (plugin lifecycle) | `plugin:disable` | `plugin:disable        Disable a plugin` |
| prefix | `dev:` | `dev:cdp`, `dev:console`, `dev:css`, `dev:debug`, `dev:dom`, `dev:errors`, `dev:mobile`, `dev:screenshot` (the whole `Developer:` section) |

## Deliberately allowed (spec clarification Q3, accepted residual risk)

- `command` (`Execute an Obsidian command`): command-palette execution.
- `plugin:reload` (`Reload a plugin (for developers)`).

## Adjacent commands seen in the output and not on the denylist

FR-010 says the gate refuses *exactly* the briefed list, so these are not blocked. They are
recorded here so the owner can see them; adding any of them would be a spec change.

- `plugin:uninstall` (`Uninstall a community plugin`): plugin lifecycle, but not install,
  enable or disable.
- `plugins:restrict` (`Toggle or check restricted mode`, `on` / `off`): turning restricted
  mode off lets installed community plugins load.
- `theme:install`, `theme:set`, `theme:uninstall`, `snippet:enable`, `snippet:disable`:
  appearance changes (CSS), not code execution.
- `reload` (`Reload the vault`): reloads the vault, not the app.
- Plugin-contributed commands (here `obsidian-excalidraw-plugin:*`, from a plugin installed
  in the focused vault; the authorised test vault has no plugins). Their names depend on the
  plugins a vault has installed, so a fixed list cannot cover them.

## How the CLI picks the command token (follow-up probe, same session)

Run to check whether a `command` value can move a blocked name into command position.
Every probe used the harmless `version` command; each argv element was passed as one
quoted argument, stdout and stderr captured separately. stderr was empty and the exit code
was `0` in every case.

| # | argv after the binary | stdout (verbatim) |
|---|---|---|
| 1 | `vault=TestVault-Obsidian-CLI-MCP` `version` | `1.14.5 (installer 1.14.4)` |
| 2 | `foo=bar` `version` | `Error: Command "foo=bar" not found. It may require a plugin to be enabled.` |
| 3 | `vault=TestVault-Obsidian-CLI-MCP` `foo=bar` `version` | `Error: Command "foo=bar" not found. It may require a plugin to be enabled.` |
| 4 | `--copy` `version` | `Error: Command "--copy" not found. It may require a plugin to be enabled.` |
| 5 | `vault=TestVault-Obsidian-CLI-MCP` `vault=TestVault-Obsidian-CLI-MCP` `version` | `Error: Command "vault=TestVault-Obsidian-CLI-MCP" not found. It may require a plugin to be enabled.` |
| 6 | `VAULT=TestVault-Obsidian-CLI-MCP` `version` | `Error: Command "VAULT=TestVault-Obsidian-CLI-MCP" not found. It may require a plugin to be enabled.` |
| 7 | ` version` (leading space) | `Error: Command " version" not found. Did you mean: version?` |
| 8 | `VERSION` | `Error: Command "VERSION" not found. Did you mean: version?` |

**Reading**: the CLI consumes exactly one leading, lower-case `vault=` token and runs the
next token as the command, with exact case and whitespace. So when the `vault` field is
unset, `{command: "vault=X", flags: ["eval", "code=…"]}` would spawn
`obsidian vault=X eval code=…` (the same shape as case 1) and run `eval`. The gate checks
that effective command (research R4, T0 result). The gate's trim and lower-case are wider
than the CLI's exact match, so a variant the CLI would reject anyway is also refused.

## Verbatim stdout

```text
Obsidian CLI

Usage: obsidian <command> [options]

Options:
  vault=<name>          Target a specific vault by name

Notes:
  file resolves by name (like wikilinks), path is exact (folder/note.md)
  Most commands default to the active file when file/path is omitted
  Quote values with spaces: name="My Note"
  Use \n for newline, \t for tab in content values

Commands:
  aliases               List aliases in the vault
    file=<name>         - File name
    path=<path>         - File path
    total               - Return alias count
    verbose             - Include file paths
    active              - Show aliases for active file

  append                Append content to a file
    file=<name>         - File name
    path=<path>         - File path
    content=<text>      - Content to append (required)
    inline              - Append without newline

  backlinks             List backlinks to a file
    file=<name>         - Target file name
    path=<path>         - Target file path
    counts              - Include link counts
    total               - Return backlink count
    format=json|tsv|csv - Output format (default: tsv)

  base:create           Create a new item in a base
    file=<name>         - Base file name
    path=<path>         - Base file path
    view=<name>         - View name
    name=<name>         - New file name
    content=<text>      - Initial content
    open                - Open file after creating
    newtab              - Open in new tab

  base:query            Query a base and return results
    file=<name>         - Base file name
    path=<path>         - Base file path
    view=<name>         - View name to query
    format=json|csv|tsv|md|paths  - Output format (default: json)

  base:views            List views in the current base file

  bases                 List all base files in vault

  bookmark              Add a bookmark
    file=<path>         - File to bookmark
    subpath=<subpath>   - Subpath (heading or block) within file
    folder=<path>       - Folder to bookmark
    search=<query>      - Search query to bookmark
    url=<url>           - URL to bookmark
    title=<title>       - Bookmark title

  bookmarks             List bookmarks
    total               - Return bookmark count
    verbose             - Include bookmark types
    format=json|tsv|csv - Output format (default: tsv)

  command               Execute an Obsidian command
    id=<command-id>     - Command ID to execute (required)

  commands              List available commands
    filter=<prefix>     - Filter by ID prefix

  create                Create a new file
    name=<name>         - File name
    path=<path>         - File path
    content=<text>      - Initial content
    template=<name>     - Template to use
    overwrite           - Overwrite if file exists
    open                - Open file after creating
    newtab              - Open in new tab

  daily                 Open daily note
    paneType=tab|split|window  - Pane type to open in

  daily:append          Append content to daily note
    content=<text>      - Content to append (required)
    inline              - Append without newline
    open                - Open file after adding
    paneType=tab|split|window  - Pane type to open in

  daily:path            Get daily note path

  daily:prepend         Prepend content to daily note
    content=<text>      - Content to prepend (required)
    inline              - Prepend without newline
    open                - Open file after adding
    paneType=tab|split|window  - Pane type to open in

  daily:read            Read daily note contents

  deadends              List files with no outgoing links
    total               - Return dead-end count
    all                 - Include non-markdown files

  delete                Delete a file
    file=<name>         - File name
    path=<path>         - File path
    permanent           - Skip trash, delete permanently

  diff                  List or diff local/sync versions
    file=<name>         - File name
    path=<path>         - File path
    from=<n>            - Version number to diff from
    to=<n>              - Version number to diff to
    filter=local|sync   - Filter by version source

  file                  Show file info
    file=<name>         - File name
    path=<path>         - File path

  files                 List files in the vault
    folder=<path>       - Filter by folder
    ext=<extension>     - Filter by extension
    total               - Return file count

  folder                Show folder info
    path=<path>         - Folder path (required)
    info=files|folders|size  - Return specific info only

  folders               List folders in the vault
    folder=<path>       - Filter by parent folder
    total               - Return folder count

  help                  Show list of all available commands
    <command>           - Show help for a specific command

  history               List file history versions
    file=<name>         - File name
    path=<path>         - File path

  history:list          List files with history

  history:open          Open file recovery
    file=<name>         - File name
    path=<path>         - File path

  history:read          Read a file history version
    file=<name>         - File name
    path=<path>         - File path
    version=<n>         - Version number (default: 1)

  history:restore       Restore a file history version
    file=<name>         - File name
    path=<path>         - File path
    version=<n>         - Version number (required)

  hotkey                Get hotkey for a command
    id=<command-id>     - Command ID (required)
    verbose             - Show if custom or default

  hotkeys               List hotkeys
    total               - Return hotkey count
    verbose             - Show if hotkey is custom
    format=json|tsv|csv - Output format (default: tsv)
    all                 - Include commands without hotkeys

  links                 List outgoing links from a file
    file=<name>         - File name
    path=<path>         - File path
    total               - Return link count

  move                  Move or rename a file
    file=<name>         - File name
    path=<path>         - File path
    to=<path>           - Destination folder or path (required)

  obsidian-excalidraw-plugin[Excalidraw]: Native Excalidraw CLI
    input=<input>       - Vault-relative UTF-8 JSON request; exclusive with json
    json=<json>         - Small inline JSON request; exclusive with input

  obsidian-excalidraw-plugin:api[Excalidraw]: Native Excalidraw CLI — api
    surface=<surface>   - ea (default) or lib
    name=<name>         - Exact method name
    query=<query>       - Case-insensitive search
    input=<input>       - Vault-relative UTF-8 JSON request; exclusive with json
    json=<json>         - Small inline JSON request; exclusive with input

  obsidian-excalidraw-plugin:apply[Excalidraw]: Native Excalidraw CLI — apply
    requestId=<requestId>  - Unique caller ID; same effective request is replayed for 15 minutes in this session
    path=<path>         - Exact drawing path including extension
    view=<view>         - View ID from open/read; required for multiple views
    expectedRevision=<expectedRevision>  - Fresh revision from live read
    operations=<operations>  - Array of add, update, delete, connect, group, ungroup, image, or latex operations
    input=<input>       - Vault-relative UTF-8 JSON request; exclusive with json
    json=<json>         - Small inline JSON request; exclusive with input

  obsidian-excalidraw-plugin:create[Excalidraw]: Native Excalidraw CLI — create
    requestId=<requestId>  - Unique caller ID; same effective request is replayed for 15 minutes in this session
    path=<path>         - Exact drawing path including extension
    template=<template> - Optional exact drawing template; no picker
    elements=<elements> - Validated batch of installed Excalidraw skeletons
    input=<input>       - Vault-relative UTF-8 JSON request; exclusive with json
    json=<json>         - Small inline JSON request; exclusive with input

  obsidian-excalidraw-plugin:export[Excalidraw]: Native Excalidraw CLI — export
    requestId=<requestId>  - Unique caller ID; same effective request is replayed for 15 minutes in this session
    path=<path>         - Exact drawing path including extension
    view=<view>         - View ID from open/read; required for multiple views
    source=<source>     - auto (default), live, or disk
    out=<out>           - Exact .svg or .png output path
    overwrite           - Explicit permission to replace an existing output
    selectedOnly        - Live selection only
    theme=<theme>       - light or dark
    padding=<padding>   - 0 to 200, default 10
    scale=<scale>       - PNG scale 0.1 to 4, default 1
    area=<area>         - JSON object with x,y,width,height
    input=<input>       - Vault-relative UTF-8 JSON request; exclusive with json
    json=<json>         - Small inline JSON request; exclusive with input

  obsidian-excalidraw-plugin:help[Excalidraw]: Native Excalidraw CLI — help
    input=<input>       - Vault-relative UTF-8 JSON request; exclusive with json
    json=<json>         - Small inline JSON request; exclusive with input

  obsidian-excalidraw-plugin:list[Excalidraw]: Native Excalidraw CLI — list
    folder=<folder>     - Optional exact folder
    offset=<offset>     - Integer offset, default 0
    limit=<limit>       - Integer page size, default 50; maximum 200
    revision=<revision> - Required when offset is greater than zero
    input=<input>       - Vault-relative UTF-8 JSON request; exclusive with json
    json=<json>         - Small inline JSON request; exclusive with input

  obsidian-excalidraw-plugin:open[Excalidraw]: Native Excalidraw CLI — open
    path=<path>         - Exact drawing path including extension
    view=<view>         - View ID from open/read; required for multiple views
    input=<input>       - Vault-relative UTF-8 JSON request; exclusive with json
    json=<json>         - Small inline JSON request; exclusive with input

  obsidian-excalidraw-plugin:read[Excalidraw]: Native Excalidraw CLI — read
    path=<path>         - Exact drawing path including extension
    view=<view>         - View ID from open/read; required for multiple views
    source=<source>     - auto (default), live, or disk
    offset=<offset>     - Integer offset, default 0
    limit=<limit>       - Integer page size, default 50; maximum 200
    revision=<revision> - Required when offset is greater than zero
    detail=<detail>     - summary (default) or elements
    selectedOnly        - Live selection only
    ids=<ids>           - JSON array of element IDs
    input=<input>       - Vault-relative UTF-8 JSON request; exclusive with json
    json=<json>         - Small inline JSON request; exclusive with input

  obsidian-excalidraw-plugin:result[Excalidraw]: Native Excalidraw CLI — result
    requestId=<requestId>  - Unique caller ID; same effective request is replayed for 15 minutes in this session
    input=<input>       - Vault-relative UTF-8 JSON request; exclusive with json
    json=<json>         - Small inline JSON request; exclusive with input

  obsidian-excalidraw-plugin:schema[Excalidraw]: Native Excalidraw CLI — schema
    action=<action>     - Command to describe
    input=<input>       - Vault-relative UTF-8 JSON request; exclusive with json
    json=<json>         - Small inline JSON request; exclusive with input

  obsidian-excalidraw-plugin:script[Excalidraw]: Native Excalidraw CLI — script
    requestId=<requestId>  - Unique caller ID; same effective request is replayed for 15 minutes in this session
    path=<path>         - Exact drawing path including extension
    view=<view>         - View ID from open/read; required for multiple views
    script=<script>     - Exact existing .md or enabled .js script path
    trusted             - Required explicit true
    args=<args>         - JSON passed as utils.input; never interpolated into code
    input=<input>       - Vault-relative UTF-8 JSON request; exclusive with json
    json=<json>         - Small inline JSON request; exclusive with input

  obsidian-excalidraw-plugin:skill[Excalidraw]: Native Excalidraw CLI — skill
    format=<format>     - json (default) or markdown for native stdout
    input=<input>       - Vault-relative UTF-8 JSON request; exclusive with json
    json=<json>         - Small inline JSON request; exclusive with input

  obsidian-excalidraw-plugin:status[Excalidraw]: Native Excalidraw CLI — status
    input=<input>       - Vault-relative UTF-8 JSON request; exclusive with json
    json=<json>         - Small inline JSON request; exclusive with input

  open                  Open a file
    file=<name>         - File name
    path=<path>         - File path
    newtab              - Open in new tab

  orphans               List files with no incoming links
    total               - Return orphan count
    all                 - Include non-markdown files

  outline               Show headings for the current file
    file=<name>         - File name
    path=<path>         - File path
    format=tree|md|json - Output format (default: tree)
    total               - Return heading count

  plugin                Get plugin info
    id=<plugin-id>      - Plugin ID (required)

  plugin:disable        Disable a plugin
    id=<id>             - Plugin ID (required)
    filter=core|community  - Plugin type

  plugin:enable         Enable a plugin
    id=<id>             - Plugin ID (required)
    filter=core|community  - Plugin type

  plugin:install        Install a community plugin
    id=<id>             - Plugin ID (required)
    enable              - Enable after install

  plugin:reload         Reload a plugin (for developers)
    id=<id>             - Plugin ID (required)

  plugin:uninstall      Uninstall a community plugin
    id=<id>             - Plugin ID (required)

  plugins               List installed plugins
    filter=core|community  - Filter by plugin type
    versions            - Include version numbers
    format=json|tsv|csv - Output format (default: tsv)

  plugins:enabled       List enabled plugins
    filter=core|community  - Filter by plugin type
    versions            - Include version numbers
    format=json|tsv|csv - Output format (default: tsv)

  plugins:restrict      Toggle or check restricted mode
    on                  - Enable restricted mode
    off                 - Disable restricted mode

  prepend               Prepend content to a file
    file=<name>         - File name
    path=<path>         - File path
    content=<text>      - Content to prepend (required)
    inline              - Prepend without newline

  properties            List properties in the vault
    file=<name>         - Show properties for file
    path=<path>         - Show properties for path
    name=<name>         - Get specific property count
    total               - Return property count
    sort=count          - Sort by count (default: name)
    counts              - Include occurrence counts
    format=yaml|json|tsv  - Output format (default: yaml)
    active              - Show properties for active file

  property:read         Read a property value from a file
    name=<name>         - Property name (required)
    file=<name>         - File name
    path=<path>         - File path

  property:remove       Remove a property from a file
    name=<name>         - Property name (required)
    file=<name>         - File name
    path=<path>         - File path

  property:set          Set a property on a file
    name=<name>         - Property name (required)
    value=<value>       - Property value (required)
    type=text|list|number|checkbox|date|datetime  - Property type
    file=<name>         - File name
    path=<path>         - File path

  random                Open a random note
    folder=<path>       - Limit to folder
    newtab              - Open in new tab

  random:read           Read a random note
    folder=<path>       - Limit to folder

  read                  Read file contents
    file=<name>         - File name
    path=<path>         - File path

  recents               List recently opened files
    total               - Return recent file count

  reload                Reload the vault

  rename                Rename a file
    file=<name>         - File name
    path=<path>         - File path
    name=<name>         - New file name (required)

  restart               Restart the app

  search                Search vault for text
    query=<text>        - Search query (required)
    path=<folder>       - Limit to folder
    limit=<n>           - Max files
    total               - Return match count
    case                - Case sensitive
    format=text|json    - Output format (default: text)

  search:context        Search with matching line context
    query=<text>        - Search query (required)
    path=<folder>       - Limit to folder
    limit=<n>           - Max files
    case                - Case sensitive
    format=text|json    - Output format (default: text)

  search:open           Open search view
    query=<text>        - Initial search query

  snippet:disable       Disable a CSS snippet
    name=<name>         - Snippet name (required)

  snippet:enable        Enable a CSS snippet
    name=<name>         - Snippet name (required)

  snippets              List installed CSS snippets

  snippets:enabled      List enabled CSS snippets

  sync                  Pause or resume sync
    on                  - Resume sync
    off                 - Pause sync

  sync:deleted          List deleted files in sync
    total               - Return deleted file count

  sync:history          List sync version history for a file
    file=<name>         - File name
    path=<path>         - File path
    total               - Return version count

  sync:open             Open sync history
    file=<name>         - File name
    path=<path>         - File path

  sync:read             Read a sync version
    file=<name>         - File name
    path=<path>         - File path
    version=<n>         - Version number (required)

  sync:restore          Restore a sync version
    file=<name>         - File name
    path=<path>         - File path
    version=<n>         - Version number (required)

  sync:status           Show sync status

  tab:open              Open a new tab
    group=<id>          - Tab group ID
    file=<path>         - File to open
    view=<type>         - View type to open

  tabs                  List open tabs
    ids                 - Include tab IDs

  tag                   Get tag info
    name=<tag>          - Tag name (required)
    total               - Return occurrence count
    verbose             - Include file list and count

  tags                  List tags in the vault
    file=<name>         - File name
    path=<path>         - File path
    total               - Return tag count
    counts              - Include tag counts
    sort=count          - Sort by count (default: name)
    format=json|tsv|csv - Output format (default: tsv)
    active              - Show tags for active file

  task                  Show or update a task
    ref=<path:line>     - Task reference (path:line)
    file=<name>         - File name
    path=<path>         - File path
    line=<n>            - Line number
    toggle              - Toggle task status
    done                - Mark as done
    todo                - Mark as todo
    daily               - Use daily note
    status="<char>"     - Set status character

  tasks                 List tasks in the vault
    file=<name>         - Filter by file name
    path=<path>         - Filter by file path
    total               - Return task count
    done                - Show completed tasks
    todo                - Show incomplete tasks
    status="<char>"     - Filter by status character
    verbose             - Group by file with line numbers
    format=json|tsv|csv - Output format (default: text)
    active              - Show tasks for active file
    daily               - Show tasks from daily note

  template:insert       Insert template into active file
    name=<template>     - Template name (required)

  template:read         Read template content
    name=<template>     - Template name (required)
    resolve             - Resolve template variables
    title=<title>       - Title for variable resolution

  templates             List templates
    total               - Return template count

  theme                 Show active theme or get info
    name=<name>         - Theme name for details

  theme:install         Install a community theme
    name=<name>         - Theme name (required)
    enable              - Activate after install

  theme:set             Set active theme
    name=<name>         - Theme name (empty for default) (required)

  theme:uninstall       Uninstall a theme
    name=<name>         - Theme name (required)

  themes                List installed themes
    versions            - Include version numbers

  unresolved            List unresolved links in vault
    total               - Return unresolved link count
    counts              - Include link counts
    verbose             - Include source files
    format=json|tsv|csv - Output format (default: tsv)

  vault                 Show vault info
    info=name|path|files|folders|size  - Return specific info only

  vaults                List known vaults
    total               - Return vault count
    verbose             - Include vault paths

  version               Show Obsidian version

  wordcount             Count words and characters
    file=<name>         - File name
    path=<path>         - File path
    words               - Return word count only
    characters          - Return character count only

  workspace             Show workspace tree
    ids                 - Include workspace item IDs


Developer:
  dev:cdp               Run a Chrome DevTools Protocol command
    method=<CDP.method> - CDP method to call (required)
    params=<json>       - Method parameters as JSON

  dev:console           Show captured console messages
    clear               - Clear the console buffer
    limit=<n>           - Max messages to show (default 50)
    level=log|warn|error|info|debug  - Filter by log level

  dev:css               Inspect CSS with source locations
    selector=<css>      - CSS selector (required)
    prop=<name>         - Filter by property name

  dev:debug             Attach/detach Chrome DevTools Protocol debugger
    on                  - Attach debugger
    off                 - Detach debugger

  dev:dom               Query DOM elements
    selector=<css>      - CSS selector (required)
    total               - Return element count
    text                - Return text content
    inner               - Return innerHTML instead of outerHTML
    all                 - Return all matches instead of first
    attr=<name>         - Get attribute value
    css=<prop>          - Get CSS property value

  dev:errors            Show captured errors
    clear               - Clear the error buffer

  dev:mobile            Toggle mobile emulation
    on                  - Enable mobile emulation
    off                 - Disable mobile emulation

  dev:screenshot        Take a screenshot
    path=<filename>     - Output file path

  devtools              Toggle Electron dev tools

  eval                  Execute JavaScript and return result
    code=<javascript>   - JavaScript code to execute (required)
```
