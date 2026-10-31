// Original — no upstream. Registry-wide published tool-surface enforcement tests.
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/client/validators/ajv";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { BASE_PATH_DESCRIPTION } from "./_base-path.js";
import { connectInMemoryClient, connectModernClient, quietServer, serveOne } from "./_mcp-client-fixtures.js";
import { undescribedProperties } from "./_schema-test-utils.js";
import { TYPED_RESULT_FIXTURES } from "./_typed-result-fixtures.js";
import { UpstreamError } from "../errors.js";
import { createVaultsTool } from "./vaults/index.js";
import { createVaultRegistry } from "../vault-registry/registry.js";

import type { Client } from "@modelcontextprotocol/client";

interface PublishedTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

/** Validate `value` against a published JSON Schema with the client SDK's own validator (not zod). */
function validatesAgainst(schema: Record<string, unknown>, value: unknown): boolean {
  return new AjvJsonSchemaValidator().getValidator(schema as never)(value).valid;
}

type Hints = readonly [readOnly: boolean, destructive: boolean, idempotent: boolean, openWorld: boolean];

const READ_ONLY: Hints = [true, false, true, false];
const ADDITIVE_WRITE: Hints = [false, false, false, false];
const REPEATABLE_WRITE: Hints = [false, false, true, false];
const DESTRUCTIVE: Hints = [false, true, false, false];
const PASSTHROUGH: Hints = [false, true, false, true];

// Spec FR-024, one row per tool (FR-023 second test).
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
  vaults: READ_ONLY,
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

describe("published tool surface (068 US6, US8)", () => {
  let client: Client;
  let tools: PublishedTool[];

  beforeAll(async () => {
    client = await connectInMemoryClient(quietServer().buildMcpServer(), "surface-test");
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
      expect(readOnlyRow.length).toBe(22);
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

    // Spec 072 SC-004: `not-open` is never emitted for a closed vault, so no description may
    // advertise it. `views_base` keeps its own `BASE_NOT_FOUND` / `not-open` (FR-010).
    it("only views_base mentions a not-open state", () => {
      const offenders = tools
        .filter((t) => /not-open|registered but not open/.test(t.description ?? ""))
        .map((t) => t.name);
      expect(offenders).toEqual(["views_base"]);
    });
  });

  describe("family parameter names (spec 073 SC-001, FR-008)", () => {
    const publishedProps = (name: string) =>
      toolNamed(name).inputSchema["properties"] as Record<string, { description?: string }>;
    const desc = (name: string, key: string) => publishedProps(name)[key]?.description ?? "";

    it("each shared concept carries the same parameter name across its family", () => {
      const families: Array<[string[], string[]]> = [
        [["read_property", "set_property", "find_by_property"], ["name"]],
        [["search", "context_search", "pattern_search", "find_by_property", "find_and_replace"], ["case_sensitive", "folder"]],
        [["views_base", "query_base", "create_base"], ["base_path"]],
        [["query_base", "create_base"], ["view_name"]],
      ];
      for (const [names, keys] of families) {
        for (const name of names) {
          for (const key of keys) {
            expect(Object.keys(publishedProps(name)), `${name} lists ${key}`).toContain(key);
          }
        }
      }
    });

    it("each renamed key opens with its siblings' wording of the concept", () => {
      expect(desc("find_by_property", "name").startsWith('Frontmatter property name to match, matched exactly (e.g. "status").')).toBe(true);
      expect(desc("read_property", "name")).toContain('matched exactly (e.g. "status").');

      for (const name of ["find_by_property", "find_and_replace"]) {
        expect(desc(name, "case_sensitive").startsWith("Match case exactly when true.")).toBe(true);
      }
      // The siblings' shared opening (pattern_search continues with ";", the others with ".").
      for (const name of ["search", "context_search", "pattern_search"]) {
        expect(desc(name, "case_sensitive").startsWith("Match case exactly when true")).toBe(true);
      }

      expect(desc("find_and_replace", "folder").startsWith(desc("context_search", "folder"))).toBe(true);
      expect(desc("context_search", "folder")).toBe(desc("pattern_search", "folder"));

      expect(desc("query_base", "base_path")).toBe(BASE_PATH_DESCRIPTION);
      expect(desc("create_base", "base_path").startsWith(BASE_PATH_DESCRIPTION)).toBe(true);

      for (const name of ["create_base", "query_base"]) {
        expect(desc(name, "view_name").startsWith("Exact, case-sensitive name of the view to")).toBe(true);
      }
    });
  });
});

// Tools whose result is not always a JSON object publish no outputSchema (068 FR-041, R6):
// `read` and `help` are text, `obsidian_exec` is free-form CLI output, and `tag`'s count-only
// form is a bare integer.
const UNTYPED_TOOLS = ["help", "obsidian_exec", "read", "tag"];

// One sample per variant of each union-of-objects result (068 R6, T066).
const UNION_VARIANT_SAMPLES: Readonly<Record<string, readonly unknown[]>> = {
  search: [
    { count: 1, paths: ["Notes/a.md"] },
    { count: 1, matches: [{ path: "Notes/a.md", line: 3, text: "a match" }], truncated: true },
  ],
  find_and_replace: [
    {
      mode: "preview",
      affected_notes: [
        {
          path: "Notes/a.md",
          occurrence_count: 1,
          occurrences: [{ line_number: 1, full_line: "foo", matched_substring: "foo", replacement_substring: "bar" }],
        },
      ],
      total_occurrences: 1,
    },
    { mode: "commit", changed_notes: ["Notes/a.md"], total_occurrences_replaced: 1, partial: false },
  ],
};

describe("published outputSchema in both eras (068 US12, FR-039, R6 T0)", () => {
  let legacy: Client;
  let modern: Client;
  let legacyTools: PublishedTool[];
  let modernTools: PublishedTool[];

  beforeAll(async () => {
    const app = quietServer();
    legacy = await connectInMemoryClient(app.buildMcpServer(), "surface-test-2025");
    modern = await connectModernClient(app, "surface-test-2026");
    ({ tools: legacyTools } = (await legacy.listTools()) as { tools: PublishedTool[] });
    ({ tools: modernTools } = (await modern.listTools()) as { tools: PublishedTool[] });
  });

  afterAll(async () => {
    await legacy.close();
    await modern.close();
  });

  it("the two clients negotiated different eras", () => {
    expect(legacy.getNegotiatedProtocolVersion()).toMatch(/^2025-/);
    expect(modern.getNegotiatedProtocolVersion()).toBe("2026-07-28");
  });

  it("every tool except the untyped four publishes an outputSchema with an object root", () => {
    const untyped = legacyTools.filter((t) => t.outputSchema === undefined).map((t) => t.name);
    expect(untyped.sort()).toEqual(UNTYPED_TOOLS);
    for (const tool of legacyTools.filter((t) => t.outputSchema !== undefined)) {
      expect(tool.outputSchema!.type, tool.name).toBe("object");
    }
  });

  it("every outputSchema is identical in both eras (no era exception)", () => {
    const byName = (list: PublishedTool[]) => Object.fromEntries(list.map((t) => [t.name, t.outputSchema]));
    expect(byName(modernTools)).toEqual(byName(legacyTools));
  });

  it.each(Object.keys(UNION_VARIANT_SAMPLES))(
    "%s publishes its union as an object root wrapping the variants, unwrapped by the 2025 codec",
    (name) => {
      const schema = legacyTools.find((t) => t.name === name)!.outputSchema!;
      expect(schema.type).toBe("object");
      const variants = (schema["anyOf"] ?? schema["oneOf"]) as Array<Record<string, unknown>>;
      expect(variants.length).toBe(2);
      for (const variant of variants) expect(variant.type).toBe("object");
      // The 2025-era codec wraps a non-object root as {properties: {result: …}}; it did not here.
      expect(schema["properties"]).toBeUndefined();
      for (const sample of UNION_VARIANT_SAMPLES[name]!) expect(validatesAgainst(schema, sample)).toBe(true);
      expect(validatesAgainst(schema, { count: 1 })).toBe(false);
    },
  );

  it("every typed tool has a round-trip fixture below", () => {
    const typed = legacyTools.filter((t) => t.outputSchema !== undefined).map((t) => t.name);
    expect(new Set(TYPED_RESULT_FIXTURES.map((f) => f.name))).toEqual(new Set(typed));
  });
});

type ToolResult = { isError?: boolean; structuredContent?: unknown; content: Array<{ type: string; text: string }> };

// FR-042 / T069: a stubbed success through a real client validates against the published schema,
// and its text block parses to the same object.
describe("typed-result round trip (068 FR-042, T069)", () => {
  it.each(TYPED_RESULT_FIXTURES.map((f, i) => [`${f.name} #${i}`, f] as const))("%s", async (_label, fixture) => {
    const client = await serveOne(fixture.build(), "surface-round-trip");
    try {
      const { tools } = (await client.listTools()) as { tools: PublishedTool[] };
      const schema = tools[0]!.outputSchema!;
      const result = (await client.callTool({ name: fixture.name, arguments: fixture.args })) as ToolResult;
      expect(result.isError, result.content[0]?.text).toBeFalsy();
      expect(result.structuredContent).toBeDefined();
      expect(validatesAgainst(schema, result.structuredContent)).toBe(true);
      expect(JSON.parse(result.content[0]!.text)).toEqual(result.structuredContent);
    } finally {
      await client.close();
    }
  });

  it("an input-validation failure and an upstream failure are text-only (FR-040)", async () => {
    const failure = new UpstreamError({ code: "CLI_REPORTED_ERROR", cause: null, details: {}, message: "app down" });
    const client = await serveOne(
      createVaultsTool({ vaultRegistry: createVaultRegistry({ invokeProbe: () => Promise.reject(failure) }) }),
      "surface-round-trip",
    );
    try {
      const invalid = (await client.callTool({ name: "vaults", arguments: { vault: "x" } })) as ToolResult;
      const upstream = (await client.callTool({ name: "vaults", arguments: {} })) as ToolResult;
      for (const [result, code] of [[invalid, "VALIDATION_ERROR"], [upstream, "CLI_REPORTED_ERROR"]] as const) {
        expect(result.isError).toBe(true);
        expect(result.structuredContent).toBeUndefined();
        expect(JSON.parse(result.content[0]!.text).code).toBe(code);
      }
    } finally {
      await client.close();
    }
  });
});
