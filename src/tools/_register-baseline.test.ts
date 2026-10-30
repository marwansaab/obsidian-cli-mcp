// Original — no upstream. Co-located tests for the FR-018 fingerprint helper module (BI-022); 068 R3: fingerprints come from a v2 Client's view of the published tools/list.
import { fromJsonSchema, McpServer } from "@modelcontextprotocol/server";
import { describe, expect, it } from "vitest";

import { canonicalJSON, fingerprintLiveRegistry, sha256 } from "./_register-baseline.js";

describe("canonicalJSON", () => {
  it("produces deterministic output for an object with shuffled keys (happy)", () => {
    const a = { b: 1, a: 2, c: 3 };
    const b = { c: 3, a: 2, b: 1 };
    expect(canonicalJSON(a)).toBe(canonicalJSON(b));
    expect(canonicalJSON(a)).toBe('{"a":2,"b":1,"c":3}');
  });

  it("preserves array order (boundary — arrays positional in JSON Schema)", () => {
    const arr = [3, 1, 2];
    expect(canonicalJSON(arr)).toBe("[3,1,2]");
  });

  it("recurses into nested objects sorting keys at every depth", () => {
    const nested = { outer: { z: 1, a: 2 }, beta: { y: 3, b: 4 } };
    expect(canonicalJSON(nested)).toBe('{"beta":{"b":4,"y":3},"outer":{"a":2,"z":1}}');
  });

  it("emits primitives via JSON.stringify (null / number / string / boolean)", () => {
    expect(canonicalJSON(null)).toBe("null");
    expect(canonicalJSON(42)).toBe("42");
    expect(canonicalJSON("text")).toBe('"text"');
    expect(canonicalJSON(true)).toBe("true");
  });
});

describe("sha256", () => {
  it("returns a 64-char lowercase hex string (happy)", () => {
    const out = sha256("hello");
    expect(out).toMatch(/^[0-9a-f]{64}$/);
    expect(out).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
  });

  it("differs by one bit when input differs by one character (boundary)", () => {
    const a = sha256("a");
    const b = sha256("b");
    expect(a).not.toBe(b);
  });
});

describe("fingerprintLiveRegistry", () => {
  it("returns one entry per registered tool, sorted by name", async () => {
    const entries = await fingerprintLiveRegistry();
    expect(entries.length).toBe(35);
    const names = entries.map((e) => e.name);
    expect(names).toEqual([...names].sort());
    for (const entry of entries) {
      expect(entry.descriptionFingerprint).toMatch(/^[0-9a-f]{64}$/);
      expect(entry.schemaFingerprint).toMatch(/^[0-9a-f]{64}$/);
      expect(entry.titleFingerprint).toMatch(/^[0-9a-f]{64}$/);
      expect(entry.annotationsFingerprint).toMatch(/^[0-9a-f]{64}$/);
      expect(entry.outputSchemaFingerprint).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("fingerprints a published outputSchema, and a tool without one as null (068 PR 5)", async () => {
    const outputSchema = { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] };
    const buildMcpServer = () => {
      const server = new McpServer({ name: "fake", version: "0.0.0" }, { capabilities: { tools: { listChanged: false } } });
      server.registerTool("typed_tool", { description: "typed", outputSchema: fromJsonSchema(outputSchema) }, () => ({
        content: [],
        structuredContent: { ok: true },
      }));
      server.registerTool("untyped_tool", { description: "untyped" }, () => ({ content: [] }));
      return server;
    };

    const [typed, untyped] = await fingerprintLiveRegistry({ buildMcpServer });
    expect(typed!.outputSchemaFingerprint).toBe(sha256(canonicalJSON(outputSchema)));
    expect(untyped!.outputSchemaFingerprint).toBe(sha256(canonicalJSON(null)));
  });

  it("fingerprints exactly what a client receives from the injected server (happy — published surface)", async () => {
    const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
    const buildMcpServer = () => {
      const server = new McpServer({ name: "fake", version: "0.0.0" }, { capabilities: { tools: { listChanged: false } } });
      server.registerTool("only_tool", { title: "Only Tool", description: "desc", annotations }, () => ({ content: [] }));
      return server;
    };

    const entries = await fingerprintLiveRegistry({ buildMcpServer });
    expect(entries).toEqual([
      {
        name: "only_tool",
        descriptionFingerprint: sha256("desc"),
        schemaFingerprint: sha256(canonicalJSON({ type: "object", properties: {} })),
        titleFingerprint: sha256("Only Tool"),
        annotationsFingerprint: sha256(canonicalJSON(annotations)),
        outputSchemaFingerprint: sha256(canonicalJSON(null)),
      },
    ]);
  });

  it("fingerprints a tool with no title or annotations as the empty title and null (boundary)", async () => {
    const buildMcpServer = () => {
      const server = new McpServer({ name: "fake", version: "0.0.0" }, { capabilities: { tools: { listChanged: false } } });
      server.registerTool("bare_tool", { description: "desc" }, () => ({ content: [] }));
      return server;
    };

    const [entry] = await fingerprintLiveRegistry({ buildMcpServer });
    expect(entry!.titleFingerprint).toBe(sha256(""));
    expect(entry!.annotationsFingerprint).toBe(sha256(canonicalJSON(null)));
  });

  it("yields no entries when the injected server declares no tools capability (boundary — empty published surface)", async () => {
    const buildMcpServer = () => new McpServer({ name: "fake", version: "0.0.0" });

    await expect(fingerprintLiveRegistry({ buildMcpServer })).resolves.toEqual([]);
  });
});