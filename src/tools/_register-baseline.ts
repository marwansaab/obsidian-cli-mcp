// Original — no upstream. Fingerprint helpers for the FR-018 registry-stability baseline (BI-022).
// Shared between `_register.test.ts` (the verifier) and `scripts/write-register-baseline.ts` (the
// regenerator) so canonicalisation cannot drift between writer and reader. 068 R3: the registry is
// read as a client sees it — a v2 `Client` lists the tools of a freshly built `McpServer` over an
// in-memory transport — so the gate fingerprints the published surface, not project objects.
import { createHash } from "node:crypto";

import { createServer } from "../server.js";
import { connectInMemoryClient } from "./_mcp-client-fixtures.js";

import type { McpServer } from "@modelcontextprotocol/server";

export interface BaselineEntry {
  name: string;
  descriptionFingerprint: string;
  schemaFingerprint: string;
}

export interface RegisterBaseline {
  schemaVersion: 2;
  generatedFromBranch: string;
  generatedAt: string;
  tools: ReadonlyArray<BaselineEntry>;
}

export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function canonicalJSON(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalJSON).join(",") + "]";
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const entries = keys.map(
    (k) => JSON.stringify(k) + ":" + canonicalJSON((value as Record<string, unknown>)[k]),
  );
  return "{" + entries.join(",") + "}";
}

export interface FingerprintDeps {
  /** Builds the server to fingerprint; defaults to the real composition root's `buildMcpServer`. */
  buildMcpServer?: () => McpServer;
}

export async function fingerprintLiveRegistry(
  deps: FingerprintDeps = {},
): Promise<BaselineEntry[]> {
  const build = deps.buildMcpServer ?? (() => createServer({ registerSignalHandlers: false }).buildMcpServer());
  const client = await connectInMemoryClient(build(), "register-baseline");
  try {
    const { tools } = await client.listTools(undefined, { cacheMode: "bypass" });
    const entries: BaselineEntry[] = tools.map((t) => ({
      name: t.name,
      descriptionFingerprint: sha256(t.description ?? ""),
      schemaFingerprint: sha256(canonicalJSON(t.inputSchema)),
    }));
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    return entries;
  } finally {
    await client.close();
  }
}
