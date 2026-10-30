// Original — no upstream. Tests for the owner's access settings (068 T075, contracts/configuration): the truthy parsing of OBSIDIAN_MCP_READ_ONLY, the allow / deny / read-only composition of the offered tool set, the aggregated unknown-name boot error, an empty offered set, and instructions that name only offered tools.
import { Writable } from "node:stream";

import { describe, expect, it } from "vitest";

import { createServer, parseAccessConfig, selectOfferedTools } from "./server.js";
import { connectInMemoryClient } from "./tools/_mcp-client-fixtures.js";

/** The names `tools/list` returns, and the instructions, for a server built with `env`. */
async function offeredWith(env: NodeJS.ProcessEnv): Promise<{ names: string[]; instructions: string | undefined }> {
  const app = createServer({
    env,
    loggerStream: new Writable({ write: (_chunk, _enc, cb) => cb() }),
    registerSignalHandlers: false,
    exit: () => undefined,
  });
  const client = await connectInMemoryClient(app.buildMcpServer(), "server-config-test");
  try {
    const { tools } = await client.listTools();
    return { names: tools.map((t) => t.name).sort(), instructions: client.getInstructions() };
  } finally {
    await client.close();
  }
}

// The FR-024 read-only row: every tool published with readOnlyHint true (pinned in _surface.test.ts).
const READ_ONLY_TOOLS = [
  "backlinks", "bases", "context_search", "files", "find_by_property", "get_active_file", "help", "links",
  "outline", "paths", "pattern_search", "properties", "query_base", "read", "read_heading", "read_property",
  "search", "smart_connections_query", "smart_connections_similar", "tag", "vaults", "views_base",
];

describe("parseAccessConfig", () => {
  it.each(["1", "true", "yes", "on", " TRUE ", "On"])("OBSIDIAN_MCP_READ_ONLY=%j is on", (value) => {
    expect(parseAccessConfig({ OBSIDIAN_MCP_READ_ONLY: value }).readOnly).toBe(true);
  });

  it.each(["0", "false", "off", "no", "", "maybe"])("OBSIDIAN_MCP_READ_ONLY=%j is off", (value) => {
    expect(parseAccessConfig({ OBSIDIAN_MCP_READ_ONLY: value }).readOnly).toBe(false);
  });

  it("unset: every flag off, no allow list, empty deny list", () => {
    expect(parseAccessConfig({})).toEqual({ allowEval: false, readOnly: false, deny: [] });
  });

  it("lists are split on commas, trimmed, and blank entries dropped; a blank list counts as unset", () => {
    expect(parseAccessConfig({ OBSIDIAN_MCP_TOOLS: " read , ,search,", OBSIDIAN_MCP_DISABLE: "tag" })).toEqual({
      allowEval: false,
      readOnly: false,
      allow: ["read", "search"],
      deny: ["tag"],
    });
    expect(parseAccessConfig({ OBSIDIAN_MCP_TOOLS: " , " }).allow).toBeUndefined();
  });

  it("OBSIDIAN_MCP_ALLOW_EVAL is parsed here too", () => {
    expect(parseAccessConfig({ OBSIDIAN_MCP_ALLOW_EVAL: "yes" }).allowEval).toBe(true);
  });
});

describe("offered tool set (FR-043, FR-044)", () => {
  it("read-only offers exactly the readOnlyHint set (22 tools), and its instructions name no write tool", async () => {
    const { names, instructions } = await offeredWith({ OBSIDIAN_MCP_READ_ONLY: "1" });
    expect(names).toEqual(READ_ONLY_TOOLS);
    expect(names).toHaveLength(22);
    const backticked = [...(instructions ?? "").matchAll(/`([a-z_]+)`/g)].map((m) => m[1]!);
    expect(backticked.length).toBeGreaterThan(0);
    for (const name of backticked) expect(READ_ONLY_TOOLS).toContain(name);
  });

  it("allow only", async () => {
    expect((await offeredWith({ OBSIDIAN_MCP_TOOLS: "read,search" })).names).toEqual(["read", "search"]);
  });

  it("deny only", async () => {
    const { names } = await offeredWith({ OBSIDIAN_MCP_DISABLE: "delete,obsidian_exec" });
    expect(names).toHaveLength(33);
    expect(names).not.toContain("delete");
    expect(names).not.toContain("obsidian_exec");
  });

  it("allow and deny overlapping: deny wins", async () => {
    expect((await offeredWith({ OBSIDIAN_MCP_TOOLS: "read,search", OBSIDIAN_MCP_DISABLE: "search" })).names).toEqual(["read"]);
  });

  it("read-only drops a write tool even when the allow list names it", async () => {
    expect((await offeredWith({ OBSIDIAN_MCP_READ_ONLY: "1", OBSIDIAN_MCP_TOOLS: "read,write_note" })).names).toEqual([
      "read",
    ]);
  });

  it("an empty offered set: the server starts and lists 0 tools", async () => {
    const { names } = await offeredWith({ OBSIDIAN_MCP_READ_ONLY: "1", OBSIDIAN_MCP_TOOLS: "write_note" });
    expect(names).toEqual([]);
  });
});

describe("unknown tool names (FR-045)", () => {
  it("unknown names in both lists → one boot error naming every one of them and the valid names", () => {
    expect(() =>
      createServer({ env: { OBSIDIAN_MCP_TOOLS: "read,nope", OBSIDIAN_MCP_DISABLE: "zap" }, registerSignalHandlers: false }),
    ).toThrow(
      /^Unknown tool name\(s\) in OBSIDIAN_MCP_TOOLS \/ OBSIDIAN_MCP_DISABLE: nope \(OBSIDIAN_MCP_TOOLS\), zap \(OBSIDIAN_MCP_DISABLE\)\. Valid names: append_note, backlinks, /,
    );
  });

  it("selectOfferedTools alone reports the unknown names before filtering anything", () => {
    expect(() => selectOfferedTools([], { allowEval: false, readOnly: false, deny: ["ghost"] })).toThrow(
      "ghost (OBSIDIAN_MCP_DISABLE)",
    );
  });
});
