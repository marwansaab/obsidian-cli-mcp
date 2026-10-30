// Original — no upstream. Real-stdio probe for the built server (068 T038, quickstart): spawns `node dist/index.js` with a v2
// StdioClientTransport, opens it with the 2025-era handshake (`--era legacy`, `initialize`) or the 2026-era one
// (`--era modern`, `server/discover`), and prints the negotiated protocol version, serverInfo, whether `instructions` is
// present (and its length) and the tool count. `--no-elicitation` declares no elicitation capability (PR 6 probes);
// with `--vault <name> --note <vault-relative path>` it also sends a permanent `delete` of that note and a
// `find_and_replace` commit scoped to `--subfolder` (default `Sandbox`), and prints both envelopes, which must be
// CONFIRMATION_UNAVAILABLE with nothing changed (068 T081, quickstart §8). Exits non-zero on any failure. Run
// `npm run build` first.
//
//   npm run probe:stdio -- --era legacy
//   npm run probe:stdio -- --era modern [--no-elicitation [--vault <name> --note Sandbox/x.md]]
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const { values } = parseArgs({
  options: {
    era: { type: "string", default: "legacy" },
    "no-elicitation": { type: "boolean", default: false },
    vault: { type: "string" },
    note: { type: "string" },
    subfolder: { type: "string", default: "Sandbox" },
  },
});

if (values.era !== "legacy" && values.era !== "modern") {
  process.stderr.write(`--era must be "legacy" or "modern", got ${JSON.stringify(values.era)}\n`);
  process.exit(2);
}

async function main(): Promise<void> {
  const env = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve(import.meta.dirname, "..", "dist", "index.js")],
    env,
    stderr: "inherit",
  });
  const client = new Client(
    { name: "obsidian-cli-mcp-probe", version: "0.0.0" },
    {
      versionNegotiation: { mode: values.era === "modern" ? "auto" : "legacy" },
      capabilities: values["no-elicitation"] ? {} : { elicitation: {} },
    },
  );
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    const instructions = client.getInstructions();
    const report = {
      era: values.era,
      elicitation: !values["no-elicitation"],
      protocolVersion: client.getNegotiatedProtocolVersion(),
      serverInfo: client.getServerVersion(),
      instructions: instructions === undefined ? { present: false } : { present: true, length: instructions.length },
      toolCount: tools.length,
      ...(values["no-elicitation"] && values.vault !== undefined && { confirmationProbes: await confirmationProbes(client) }),
    };
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } finally {
    await client.close();
  }
}

/**
 * The two confirmation-gated calls, from a client that cannot confirm. The find_and_replace pattern is a fresh
 * random token and the scope a subfolder, so even a broken gate could change nothing outside it.
 */
async function confirmationProbes(client: Client): Promise<Record<string, unknown>> {
  if (values.note === undefined) throw new Error("--vault needs --note <vault-relative path of a fixture note>");
  const envelope = (result: unknown): unknown => {
    const { isError, content } = result as { isError?: boolean; content: Array<{ text: string }> };
    return { isError: isError === true, payload: JSON.parse(content[0]!.text) as unknown };
  };
  const deleteResult = await client.callTool({
    name: "delete",
    arguments: { target_mode: "specific", vault: values.vault, path: values.note, permanent: true },
  });
  const replaceResult = await client.callTool({
    name: "find_and_replace",
    arguments: {
      vault: values.vault,
      subfolder: values.subfolder,
      pattern: `pr6-probe-${randomUUID()}`,
      replacement: "x",
      commit: true,
    },
  });
  return { deletePermanent: envelope(deleteResult), findAndReplaceCommit: envelope(replaceResult) };
}

main().catch((err: unknown) => {
  process.stderr.write(`probe-stdio failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
  process.exit(1);
});
