// Original — no upstream. patch_heading note-name locator tests (spec 089, BI-0171): a `file` name resolves through the shared `obsidian file` lookup before any fs access (rows N1–N9 of contracts/note-name-contract.md, run from the shared battery in ../_note-name-locator-cases.ts).
import { expect } from "vitest";

import { deps, fakeFs, fakeRegistry, SAMPLE_NOTE, VAULT_ROOT } from "./_handler-fixtures.js";
import { executePatchHeading } from "./handler.js";
import { describeNoteNameLocator } from "../_note-name-locator-cases.js";

describeNoteNameLocator({
  vaultRoot: VAULT_ROOT,
  note: SAMPLE_NOTE,
  fakeFs: (content, readFile) => fakeFs({ content }, readFile ? { readFile } : {}),
  execute: (locator, vault, spawnFn, fs) =>
    executePatchHeading(
      {
        target_mode: "specific",
        vault,
        ...locator,
        heading_path: "Daily#Tasks#TODO",
        mode: "append",
        content: "- Call dentist\n",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    ),
  assertEdited: (written) => {
    const todo = written.indexOf("### TODO");
    const added = written.indexOf("- Call dentist");
    expect(todo).toBeGreaterThanOrEqual(0);
    expect(added).toBeGreaterThan(todo);
    expect(added).toBeLessThan(written.indexOf("### Done"));
  },
  targetMissing: { note: "# Other\n\nbody\n", code: "HEADING_NOT_FOUND" },
});
