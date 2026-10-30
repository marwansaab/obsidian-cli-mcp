// Original — no upstream. Success fixtures for the FR-042 typed-result round trip: one stubbed tool per outputSchema-bearing tool (068 T069).
// Vitest-free like the other `_*fixtures.ts` files: every spawn is a stub, every filesystem is an
// in-memory fake, so no fixture starts Obsidian or touches a real vault. Each stub is cribbed from
// the tool's own index.test.ts / handler.test.ts success case.
import { resolve, sep } from "node:path";

import { createQueue } from "../queue.js";
import { makeQueuedSpawn, makeStubSpawn, silentLogger, type StubResponse } from "./_handler-test-fixtures.js";
import { createAppendNoteTool } from "./append_note/index.js";
import { createBacklinksTool } from "./backlinks/index.js";
import { createBasesTool } from "./bases/index.js";
import { createContextSearchTool } from "./context_search/index.js";
import { createCreateBaseTool } from "./create_base/index.js";
import { createDeleteTool } from "./delete/index.js";
import { createFilesTool } from "./files/index.js";
import { baseDeps, inMemoryFs, VAULT_ROOT as FIND_REPLACE_ROOT } from "./find_and_replace/_handler-fixtures.js";
import { createFindAndReplaceTool } from "./find_and_replace/index.js";
import { createFindByPropertyTool } from "./find_by_property/index.js";
import { createGetActiveFileTool } from "./get_active_file/index.js";
import { createLinksTool } from "./links/index.js";
import { createMoveTool } from "./move/index.js";
import { createOpenFileTool } from "./open_file/index.js";
import { createOutlineTool } from "./outline/index.js";
import { createPatchBlockTool } from "./patch_block/index.js";
import { createPatchHeadingTool } from "./patch_heading/index.js";
import { createPathsTool } from "./paths/index.js";
import { createPatternSearchTool } from "./pattern_search/index.js";
import {
  deps as prependDeps,
  fakeFs as prependFakeFs,
  fakeRegistry as prependFakeRegistry,
  PREPEND_OK,
  VAULT_ROOT as PREPEND_ROOT,
} from "./prepend/_handler-fixtures.js";
import { createPrependTool } from "./prepend/index.js";
import { createPropertiesTool } from "./properties/index.js";
import { createQueryBaseTool } from "./query_base/index.js";
import { createReadHeadingTool } from "./read_heading/index.js";
import { createReadPropertyTool } from "./read_property/index.js";
import { createRenameTool } from "./rename/index.js";
import { createSearchTool } from "./search/index.js";
import { createSetPropertyTool } from "./set_property/index.js";
import { createSmartConnectionsQueryTool } from "./smart_connections_query/index.js";
import { createSmartConnectionsSimilarTool } from "./smart_connections_similar/index.js";
import { createVaultsTool } from "./vaults/index.js";
import { createViewsBaseTool } from "./views_base/index.js";
import {
  deps as writeNoteDeps,
  EVAL_OK,
  fakeFs as writeNoteFakeFs,
  fakeRegistry as writeNoteFakeRegistry,
  VAULT_ROOT as WRITE_NOTE_ROOT,
} from "./write_note/_handler-fixtures.js";
import { createWriteNoteTool } from "./write_note/index.js";
import { createVaultRegistry, type VaultRegistry } from "../vault-registry/registry.js";

import type { RegisteredTool } from "./_shared.js";

export interface TypedResultFixture {
  /** Tool name as published. */
  name: string;
  /** Builds the tool with stubbed deps (spawnFn / fs / vaultRegistry) so a call with `args` succeeds. */
  build: () => RegisteredTool;
  /** Arguments for the successful call. */
  args: Record<string, unknown>;
}

/** Logger, queue, empty env and a spawn answering `responses` in order. */
function cli(...responses: StubResponse[]) {
  return { logger: silentLogger(), queue: createQueue(), env: {}, spawnFn: makeQueuedSpawn(responses).spawnFn };
}

/** A one-line eval envelope as the Obsidian CLI prints it. */
function evalOut(value: unknown): StubResponse {
  return { stdout: `=> ${JSON.stringify(value)}\n`, exitCode: 0 };
}

function out(stdout: string): StubResponse {
  return { stdout, exitCode: 0 };
}

const enoent = (): NodeJS.ErrnoException => Object.assign(new Error("ENOENT"), { code: "ENOENT" });

/** Registry resolving every name to `root` (with a reverse lookup that knows nothing). */
function registryAt(root: string): VaultRegistry {
  return { resolveVaultPath: async () => root, resolveVaultDisplayName: () => null };
}

const NOTE_VAULT_ROOT = resolve("/test-vault");

/** In-memory note fs for the read-modify-write tools (append_note, patch_block, patch_heading). */
function noteFs(content: string) {
  return {
    readFile: async () => content,
    writeFile: async () => {},
    rename: async () => {},
    realpath: async (p: string) => {
      if (p === NOTE_VAULT_ROOT) return NOTE_VAULT_ROOT;
      throw enoent();
    },
    unlink: async () => {},
  };
}

const HEADING_NOTE =
  "# Daily\n\n## Tasks\n\n### TODO\n\n- Buy groceries\n\n### Done\n\n- Reviewed PR\n\n## Notes\n\nA quick thought.\n";

/** One note under the find_and_replace fake vault that contains the pattern once. */
function findReplaceTool(): RegisteredTool {
  const { fs } = inMemoryFs(
    [{ abs: resolve(FIND_REPLACE_ROOT, ["Notes", "a.md"].join(sep)), content: "alpha beta\n" }],
    FIND_REPLACE_ROOT,
  );
  return createFindAndReplaceTool(baseDeps({ fs }));
}

export const TYPED_RESULT_FIXTURES: readonly TypedResultFixture[] = [
  {
    name: "append_note",
    build: () =>
      createAppendNoteTool({ ...cli(EVAL_OK), vaultRegistry: registryAt(NOTE_VAULT_ROOT), fs: noteFs("abc\n") }),
    args: { target_mode: "specific", vault: "TestVault", path: "n.md", content: "def", inline: false },
  },
  {
    name: "backlinks",
    build: () => createBacklinksTool(cli(evalOut({ ok: true, count: 1, backlinks: [{ source: "Notes/Alpha.md" }] }))),
    args: { target_mode: "specific", vault: "Demo", path: "Target.md" },
  },
  {
    name: "bases",
    build: () => createBasesTool(cli(out("a.base\nb.base\n"))),
    args: {},
  },
  {
    name: "context_search",
    build: () => createContextSearchTool(cli(out(JSON.stringify([{ file: "a.md", matches: [{ line: 2, text: "foo" }] }])))),
    args: { query: "foo" },
  },
  {
    name: "create_base",
    build: () => createCreateBaseTool(cli(out("Created: New item.md\n"))),
    args: { path: "Tasks.base", name: "New item" },
  },
  {
    name: "delete",
    build: () => createDeleteTool(cli(out("Moved to trash: Inbox/Old.md\n"))),
    args: { target_mode: "specific", vault: "MyVault", path: "Inbox/Old.md", permanent: false },
  },
  {
    name: "files",
    build: () => createFilesTool(cli(out("Inbox/b.md\nInbox/a.md\n"))),
    args: { target_mode: "specific", vault: "Demo", folder: "Inbox" },
  },
  {
    name: "find_and_replace",
    build: findReplaceTool,
    args: { vault: "V", pattern: "alpha", replacement: "gamma" },
  },
  {
    name: "find_and_replace",
    build: findReplaceTool,
    args: { vault: "V", pattern: "alpha", replacement: "gamma", commit: true },
  },
  {
    name: "find_by_property",
    build: () => createFindByPropertyTool(cli(out('=> {"count":1,"paths":["x.md"]}\n'))),
    args: { vault: "Demo", property: "id", value: "BI-030" },
  },
  {
    name: "get_active_file",
    build: () =>
      createGetActiveFileTool({
        ...cli(evalOut({ active: { path: "Folder/note.md", name: "note.md", basename: "note", extension: "md" } })),
        vaultRegistry: registryAt("/vaults/Work"),
      }),
    args: { target_mode: "active" },
  },
  {
    name: "links",
    build: () =>
      createLinksTool(cli(evalOut({ ok: true, count: 1, links: [{ target: "Other-Note", line: 1, kind: "wikilink" }] }))),
    args: { target_mode: "specific", vault: "Demo", path: "Projects/brief.md" },
  },
  {
    name: "move",
    build: () => createMoveTool(cli(out("Moved: Inbox/Tax-2026.md → Archive/Tax-2026.md\n"))),
    args: { target_mode: "specific", vault: "MyVault", path: "Inbox/Tax-2026.md", to: "Archive/" },
  },
  {
    name: "open_file",
    build: () =>
      createOpenFileTool({
        ...cli(evalOut({ ok: true, opened: "Projects/Roadmap.md", new_tab: false, placement: "active_tab_used" })),
        vaultRegistry: registryAt("/vaults/Work"),
      }),
    args: { vault: "Work", path: "Projects/Roadmap.md" },
  },
  {
    name: "outline",
    build: () =>
      createOutlineTool(
        cli(out(JSON.stringify([{ level: 1, heading: "Top", line: 1 }, { level: 2, heading: "Sub A", line: 3 }]) + "\n")),
      ),
    args: { target_mode: "specific", vault: "Demo", path: "Notes/x.md" },
  },
  {
    name: "patch_block",
    build: () =>
      createPatchBlockTool({
        ...cli(EVAL_OK),
        vaultRegistry: registryAt(NOTE_VAULT_ROOT),
        fs: noteFs("intro\n\nA simple paragraph. ^foo\n\nclosing\n"),
      }),
    args: { target_mode: "specific", vault: "TestVault", path: "n.md", block_id: "foo", content: "Replaced text." },
  },
  {
    name: "patch_heading",
    build: () =>
      createPatchHeadingTool({ ...cli(EVAL_OK), vaultRegistry: registryAt(NOTE_VAULT_ROOT), fs: noteFs(HEADING_NOTE) }),
    args: {
      target_mode: "specific",
      vault: "TestVault",
      path: "Daily.md",
      heading_path: "Daily#Tasks#TODO",
      mode: "append",
      content: "- File expense report\n",
    },
  },
  {
    name: "paths",
    build: () => createPathsTool(cli(evalOut({ ok: true, count: 1, paths: ["README.md"] }))),
    args: { target_mode: "specific", vault: "Demo" },
  },
  {
    name: "pattern_search",
    build: () => createPatternSearchTool(cli(evalOut({ ok: true, count: 0, matches: [] }))),
    args: { pattern: "x", vault: "Demo" },
  },
  {
    name: "prepend",
    build: () =>
      createPrependTool(
        prependDeps({
          spawnFn: makeQueuedSpawn([PREPEND_OK]).spawnFn,
          vaultRegistry: prependFakeRegistry({ TestVault: PREPEND_ROOT }),
          fs: prependFakeFs({ sizes: [100, 158] }),
        }),
      ),
    args: { target_mode: "specific", vault: "TestVault", path: "Sandbox/journal.md", content: "## TL;DR\n\nLead.", inline: false },
  },
  {
    name: "properties",
    build: () => createPropertiesTool(cli(out("[]\n"))),
    args: {},
  },
  {
    name: "query_base",
    build: () =>
      createQueryBaseTool({
        ...cli(out(JSON.stringify([{ path: "x.md", status: "open" }]))),
        vaultRegistry: registryAt(resolve("/vault")),
        fs: { stat: async () => ({ size: 100 }), realpath: async (p: string) => p },
      }),
    args: { base_path: "Indexes/Active.base", view_name: "Open", vault: "Demo" },
  },
  {
    name: "read_heading",
    build: () => createReadHeadingTool(cli(out('=> {"ok":true,"content":"body."}\n'))),
    args: { target_mode: "active", heading: "A::B" },
  },
  {
    name: "read_property",
    build: () => createReadPropertyTool(cli(out('{"other":"x"}\n'))),
    args: { target_mode: "active", name: "missing_in_active" },
  },
  {
    name: "rename",
    build: () => createRenameTool(cli(out("Renamed: Inbox/focused.md -> Inbox/Today.md\n"))),
    args: { target_mode: "active", name: "Today" },
  },
  {
    name: "search",
    build: () => createSearchTool(cli(out(JSON.stringify(["a.md", "b.md"])))),
    args: { query: "foo" },
  },
  {
    name: "search",
    build: () => createSearchTool(cli(out(JSON.stringify([{ file: "a.md", matches: [{ line: 2, text: "foo bar" }] }])))),
    args: { query: "foo", context_lines: true },
  },
  {
    name: "set_property",
    build: () => createSetPropertyTool(cli(out("Set k: v\n"))),
    args: { target_mode: "specific", vault: "V", path: "x.md", name: "k", value: "v" },
  },
  {
    name: "smart_connections_query",
    build: () => createSmartConnectionsQueryTool(cli(evalOut({ ok: true, count: 0, matches: [] }))),
    args: { query: "deployment", vault: "Demo" },
  },
  {
    name: "smart_connections_similar",
    build: () => createSmartConnectionsSimilarTool(cli(evalOut({ ok: true, count: 0, matches: [] }))),
    args: { target_mode: "specific", vault: "Demo", path: "Source/Note.md" },
  },
  {
    name: "vaults",
    build: () => createVaultsTool({ vaultRegistry: createVaultRegistry({ invokeProbe: async () => "Work\t/vaults/Work\n" }) }),
    args: {},
  },
  {
    name: "views_base",
    build: () =>
      createViewsBaseTool({
        logger: silentLogger(),
        queue: createQueue(),
        vaultRegistry: registryAt("C:/vaults/Demo"),
        spawnFn: makeStubSpawn(out("All\ttable\nActive\ttable\n")).spawnFn,
      }),
    args: {},
  },
  {
    name: "write_note",
    build: () =>
      createWriteNoteTool(
        writeNoteDeps({
          spawnFn: makeQueuedSpawn([EVAL_OK]).spawnFn,
          vaultRegistry: writeNoteFakeRegistry({ TestVault: WRITE_NOTE_ROOT }),
          fs: writeNoteFakeFs(),
        }),
      ),
    args: { target_mode: "specific", vault: "TestVault", path: "Sandbox/note.md", content: "hello", overwrite: true },
  },
];
