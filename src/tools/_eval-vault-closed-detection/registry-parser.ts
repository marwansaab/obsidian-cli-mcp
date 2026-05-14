// Original — no upstream. Structurally replicated from src/vault-registry/registry.ts and BI-026's inline isVaultRegistered helper. Parses `obsidian vaults verbose` stdout — BOM-tolerant, CRLF/LF tolerant, tab-separated `<name>\t<absolute path>` per line — and returns whether vaultName appears in the first column. Cross-cutting shared module extracted at BI-027 per FR-020 / Q8(c) hybrid extraction; consumed by smart_connections_similar (refactored in BI-027) and smart_connections_query (new in BI-027). Any future eval-driven typed tool with a `vault?` parameter MAY consume.
const BOM = "﻿";

export function parseVaultRegistry(stdout: string, vaultName: string): boolean {
  const body = stdout.startsWith(BOM) ? stdout.slice(1) : stdout;
  for (const rawLine of body.split("\n")) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (line.length === 0) continue;
    const tabIdx = line.indexOf("\t");
    if (tabIdx < 0) continue;
    const name = line.slice(0, tabIdx);
    if (name === vaultName) return true;
  }
  return false;
}
