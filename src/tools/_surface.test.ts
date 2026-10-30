// Original — no upstream. Registry-wide published tool-surface enforcement tests.
import { Writable } from "node:stream";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { connectInMemoryClient } from "./_mcp-client-fixtures.js";
import { createServer } from "../server.js";

import type { Client } from "@modelcontextprotocol/client";

interface PublishedTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}

type Hints = readonly [readOnly: boolean, destructive: boolean, idempotent: boolean, openWorld: boolean];

const READ_ONLY: Hints = [true, false, true, false];
const ADDITIVE_WRITE: Hints = [false, false, false, false];
const REPEATABLE_WRITE: Hints = [false, false, true, false];
const DESTRUCTIVE: Hints = [false, true, false, false];
const PASSTHROUGH: Hints = [false, true, false, true];

// Spec FR-024, one row per tool (FR-023 second test). `vaults` joins the read-only row in PR 5.
const CLASSIFICATION: Readonly<Record<string, Hints>> = {
  read: READ_ONLY,
  read_heading: READ_ONLY,
  read_property: READ_ONLY,
  search: READ_ONLY,
  context_search: READ_ONLY,
  pattern_search: READ_ONLY,
  find_by_property: READ_ONLY,
  tag: READ_ONLY,
  backlinks: READ_ONLY,
  links: READ_ONLY,
  outline: READ_ONLY,
  files: READ_ONLY,
  paths: READ_ONLY,
  properties: READ_ONLY,
  bases: READ_ONLY,
  views_base: READ_ONLY,
  query_base: READ_ONLY,
  get_active_file: READ_ONLY,
  help: READ_ONLY,
  smart_connections_query: READ_ONLY,
  smart_connections_similar: READ_ONLY,
  append_note: ADDITIVE_WRITE,
  prepend: ADDITIVE_WRITE,
  patch_heading: ADDITIVE_WRITE,
  patch_block: ADDITIVE_WRITE,
  create_base: ADDITIVE_WRITE,
  set_property: REPEATABLE_WRITE,
  write_note: DESTRUCTIVE,
  delete: DESTRUCTIVE,
  move: DESTRUCTIVE,
  rename: DESTRUCTIVE,
  find_and_replace: DESTRUCTIVE,
  open_file: REPEATABLE_WRITE,
  obsidian_exec: PASSTHROUGH,
};

const HINT_KEYS = ["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"] as const;

// Rules the server instructions now own (FR-028) and the help-first instruction (FR-032).
const FORBIDDEN_IN_DESCRIPTIONS: ReadonlyArray<readonly [label: string, pattern: RegExp]> = [
  ["a call-help-first instruction", /call `?help\(/i],
  ["the target-mode rule", /specific mode/i],
  ["the vault display-name rule", /display name/i],
  ["the preview-before-commit rule", /preview first/i],
];

/** Every JSON-pointer-ish path to a property (at any depth) that has no non-empty description. */
function undescribedProperties(node: unknown, at: string): string[] {
  if (typeof node !== "object" || node === null) return [];
  const schema = node as Record<string, unknown>;
  const missing: string[] = [];
  const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
  for (const [key, child] of Object.entries(properties ?? {})) {
    const description = child.description;
    if (typeof description !== "string" || description.trim() === "") missing.push(`${at}.${key}`);
    missing.push(...undescribedProperties(child, `${at}.${key}`));
  }
  const items = schema.items;
  for (const item of Array.isArray(items) ? items : [items]) missing.push(...undescribedProperties(item, `${at}[]`));
  for (const keyword of ["anyOf", "oneOf", "allOf"] as const) {
    const branches = schema[keyword];
    if (Array.isArray(branches)) {
      branches.forEach((branch, i) => missing.push(...undescribedProperties(branch, `${at}/${keyword}/${i}`)));
    }
  }
  missing.push(...undescribedProperties(schema.additionalProperties, `${at}{}`));
  return missing;
}

describe("published tool surface (068 US6, US8)", () => {
  let client: Client;
  let tools: PublishedTool[];

  beforeAll(async () => {
    const sink = new Writable({ write: (_chunk, _enc, cb) => cb() });
    const app = createServer({ loggerStream: sink, registerSignalHandlers: false, exit: () => undefined });
    client = await connectInMemoryClient(app.buildMcpServer(), "surface-test");
    ({ tools } = (await client.listTools()) as { tools: PublishedTool[] });
  });

  afterAll(async () => {
    await client.close();
  });

  const toolNamed = (name: string): PublishedTool => {
    const tool = tools.find((t) => t.name === name);
    expect(tool, `tool '${name}' is not published`).toBeDefined();
    return tool!;
  };

  describe("titles and annotations (FR-019, FR-020, FR-023)", () => {
    it("every tool has a non-empty title and all four hints as booleans", () => {
      const problems: string[] = [];
      for (const tool of tools) {
        if (typeof tool.title !== "string" || tool.title.trim() === "") problems.push(`${tool.name}: title`);
        for (const key of HINT_KEYS) {
          if (typeof tool.annotations?.[key] !== "boolean") problems.push(`${tool.name}: ${key}`);
        }
      }
      expect(problems).toEqual([]);
    });

    it("every published tool has a pinned classification, and every pinned tool is published", () => {
      expect(new Set(tools.map((t) => t.name))).toEqual(new Set(Object.keys(CLASSIFICATION)));
    });

    it.each(Object.entries(CLASSIFICATION))("%s publishes its FR-024 hints", (name, hints) => {
      const [readOnlyHint, destructiveHint, idempotentHint, openWorldHint] = hints;
      expect(toolNamed(name).annotations).toEqual({ readOnlyHint, destructiveHint, idempotentHint, openWorldHint });
    });

    it("every read-only-row tool is readOnlyHint true and destructiveHint false (SC-006)", () => {
      const readOnlyRow = Object.entries(CLASSIFICATION)
        .filter(([, hints]) => hints === READ_ONLY)
        .map(([name]) => name);
      expect(readOnlyRow.length).toBe(21);
      for (const name of readOnlyRow) {
        expect(toolNamed(name).annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
      }
    });

    it("the tools that overwrite, delete, move, rename or bulk-replace, and the passthrough, are destructive (FR-021, FR-022)", () => {
      for (const name of ["write_note", "delete", "move", "rename", "find_and_replace", "obsidian_exec"]) {
        expect(toolNamed(name).annotations?.destructiveHint, name).toBe(true);
      }
      expect(toolNamed("obsidian_exec").annotations?.openWorldHint).toBe(true);
    });
  });

  describe("parameter descriptions and tool descriptions (FR-028, FR-030, FR-032)", () => {
    it("every property of every published inputSchema, at every depth, has a description", () => {
      const missing = tools.flatMap((tool) => undescribedProperties(tool.inputSchema, tool.name));
      expect(missing).toEqual([]);
    });

    it.each(FORBIDDEN_IN_DESCRIPTIONS)("no tool description contains %s", (_label, pattern) => {
      const offenders = tools.filter((t) => pattern.test(t.description ?? "")).map((t) => t.name);
      expect(offenders).toEqual([]);
    });
  });

  describe("the recursive description walk itself", () => {
    it("reports undescribed properties in nested objects, array items and union branches", () => {
      const schema = {
        type: "object",
        properties: {
          ok: { type: "string", description: "described" },
          bare: { type: "string" },
          nested: { type: "object", description: "d", properties: { inner: { type: "string" } } },
          list: {
            type: "array",
            description: "d",
            items: { type: "object", properties: { item: { type: "number", description: "  " } } },
          },
          either: { description: "d", anyOf: [{ type: "object", properties: { branch: { type: "boolean" } } }] },
        },
      };
      expect(undescribedProperties(schema, "t")).toEqual([
        "t.bare",
        "t.nested.inner",
        "t.list[].item",
        "t.either/anyOf/0.branch",
      ]);
    });
  });
});
