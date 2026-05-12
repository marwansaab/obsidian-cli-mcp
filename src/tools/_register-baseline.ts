// Original — no upstream. Fingerprint helpers for the FR-018 registry-stability baseline (BI-022).
// Shared between `_register.test.ts` (the verifier) and `scripts/write-register-baseline.ts` (the
// regenerator) so canonicalisation cannot drift between writer and reader.
import { createHash } from "node:crypto";

import { createServer } from "../server.js";

export interface BaselineEntry {
  name: string;
  descriptionFingerprint: string;
  schemaFingerprint: string;
}

export interface RegisterBaseline {
  schemaVersion: 1;
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

interface ListToolsResponse {
  tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
}

type ListToolsHandler = (req: unknown) => Promise<ListToolsResponse>;

export interface FingerprintDeps {
  createServer?: typeof createServer;
}

export async function fingerprintLiveRegistry(
  deps: FingerprintDeps = {},
): Promise<BaselineEntry[]> {
  const create = deps.createServer ?? createServer;
  const { server } = create({ registerSignalHandlers: false });
  const handlers = (server as unknown as { _requestHandlers: Map<string, ListToolsHandler> })
    ._requestHandlers;
  const listHandler = handlers.get("tools/list");
  if (!listHandler) throw new Error("tools/list handler not registered");
  const result = await listHandler({ method: "tools/list", params: {} });
  const entries: BaselineEntry[] = result.tools.map((t) => ({
    name: t.name,
    descriptionFingerprint: sha256(t.description),
    schemaFingerprint: sha256(canonicalJSON(t.inputSchema)),
  }));
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return entries;
}
