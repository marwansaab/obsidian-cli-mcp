// Original — no upstream. patch_block note-name locator tests (spec 089, BI-0171): a `file` name resolves through the shared `obsidian file` lookup before any fs access (rows N1–N9 of contracts/note-name-contract.md, run from the shared battery in ../_note-name-locator-cases.ts).
import { expect } from "vitest";

import { deps, fakeFs, fakeRegistry, VAULT_ROOT } from "./_handler-fixtures.js";
import { executePatchBlock } from "./handler.js";
import { describeNoteNameLocator } from "../_note-name-locator-cases.js";

describeNoteNameLocator({
  vaultRoot: VAULT_ROOT,
  note: "intro\n\nA simple paragraph. ^foo\n\nclosing\n",
  fakeFs: (content, readFile) => fakeFs({ content }, readFile ? { readFile } : {}),
  execute: (locator, vault, spawnFn, fs) =>
    executePatchBlock(
      { target_mode: "specific", vault, ...locator, block_id: "foo", content: "Replaced text." },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    ),
  assertEdited: (written) => expect(written).toContain("Replaced text. ^foo"),
  targetMissing: { note: "no markers here\n", code: "BLOCK_NOT_FOUND" },
});
