// Original — no upstream. Spec 070 FR-010 / SC-002: every in-scope file-path tool's published description names exactly the file types it declares — the sentence built from its declaration plus the categories contracts/tool-support.md requires — so description and behaviour cannot drift. Out-of-scope and non-file-path tools are excluded by name.
import { describe, expect, test } from "vitest";

import { APPEND_NOTE_SUPPORTED } from "./append_note/handler.js";
import { APPEND_NOTE_DESCRIPTION } from "./append_note/index.js";
import { BACKLINKS_DESCRIPTION, BACKLINKS_SUPPORTED } from "./backlinks/index.js";
import { CREATE_BASE_DESCRIPTION, CREATE_BASE_SUPPORTED } from "./create_base/index.js";
import { DELETE_DESCRIPTION, DELETE_SUPPORTED } from "./delete/index.js";
import {
  FIND_AND_REPLACE_DESCRIPTION,
  FIND_AND_REPLACE_SUPPORTED,
} from "./find_and_replace/index.js";
import { LINKS_DESCRIPTION, LINKS_SUPPORTED } from "./links/index.js";
import { MOVE_DESCRIPTION, MOVE_SUPPORTED } from "./move/index.js";
import { OPEN_FILE_DESCRIPTION, OPEN_FILE_SUPPORTED } from "./open_file/index.js";
import { OUTLINE_SUPPORTED } from "./outline/handler.js";
import { OUTLINE_DESCRIPTION } from "./outline/index.js";
import { PREPEND_SUPPORTED } from "./prepend/handler.js";
import { PREPEND_DESCRIPTION } from "./prepend/index.js";
import { QUERY_BASE_DESCRIPTION, QUERY_BASE_SUPPORTED } from "./query_base/index.js";
import { READ_SUPPORTED } from "./read/handler.js";
import { READ_DESCRIPTION } from "./read/index.js";
import { RENAME_DESCRIPTION, RENAME_SUPPORTED } from "./rename/index.js";
import {
  SMART_CONNECTIONS_SIMILAR_DESCRIPTION,
  SMART_CONNECTIONS_SIMILAR_SUPPORTED,
} from "./smart_connections_similar/index.js";
import { VIEWS_BASE_DESCRIPTION, VIEWS_BASE_SUPPORTED } from "./views_base/index.js";
import { WRITE_NOTE_SUPPORTED } from "./write_note/handler.js";
import { WRITE_NOTE_DESCRIPTION } from "./write_note/index.js";
import { describeSupport, type SupportDeclaration } from "../file-type/file-type.js";

const ANY = "Works on any file type (notes, canvases, bases, attachments and others).";
const NOTES = "Supported file types: notes.";
const BASES = "Supported file types: bases.";

// [tool, description, declaration, the sentence contracts/tool-support.md requires]
const IN_SCOPE: Array<[string, string, SupportDeclaration, string]> = [
  ["rename", RENAME_DESCRIPTION, RENAME_SUPPORTED, ANY],
  ["move", MOVE_DESCRIPTION, MOVE_SUPPORTED, ANY],
  ["delete", DELETE_DESCRIPTION, DELETE_SUPPORTED, ANY],
  ["open_file", OPEN_FILE_DESCRIPTION, OPEN_FILE_SUPPORTED, ANY],
  ["read", READ_DESCRIPTION, READ_SUPPORTED, "Supported file types: notes, canvases and bases."],
  ["write_note", WRITE_NOTE_DESCRIPTION, WRITE_NOTE_SUPPORTED, NOTES],
  ["append_note", APPEND_NOTE_DESCRIPTION, APPEND_NOTE_SUPPORTED, NOTES],
  ["prepend", PREPEND_DESCRIPTION, PREPEND_SUPPORTED, NOTES],
  ["outline", OUTLINE_DESCRIPTION, OUTLINE_SUPPORTED, NOTES],
  ["find_and_replace", FIND_AND_REPLACE_DESCRIPTION, FIND_AND_REPLACE_SUPPORTED, NOTES],
  ["links", LINKS_DESCRIPTION, LINKS_SUPPORTED, NOTES],
  ["backlinks", BACKLINKS_DESCRIPTION, BACKLINKS_SUPPORTED, NOTES],
  [
    "smart_connections_similar",
    SMART_CONNECTIONS_SIMILAR_DESCRIPTION,
    SMART_CONNECTIONS_SIMILAR_SUPPORTED,
    NOTES,
  ],
  ["views_base", VIEWS_BASE_DESCRIPTION, VIEWS_BASE_SUPPORTED, BASES],
  ["query_base", QUERY_BASE_DESCRIPTION, QUERY_BASE_SUPPORTED, BASES],
  ["create_base", CREATE_BASE_DESCRIPTION, CREATE_BASE_SUPPORTED, BASES],
];

// Not covered here: read_heading, read_property, set_property, patch_heading, patch_block (out of
// scope, FR-013); files, paths, search, context_search, pattern_search, tag, find_by_property,
// properties, bases, vaults, get_active_file, help, smart_connections_query, obsidian_exec (no
// file locator).

describe("spec 070 — each in-scope tool's description names its declared file types", () => {
  test.each(IN_SCOPE)("%s", (_tool, description, declaration, sentence) => {
    expect(describeSupport(declaration)).toBe(sentence);
    expect(description).toContain(sentence);
  });

  test("rename and move state that the file keeps its type and name the obsidian_exec route", () => {
    for (const description of [RENAME_DESCRIPTION, MOVE_DESCRIPTION]) {
      expect(description).toContain("keeps its type");
      expect(description).toContain("obsidian_exec");
    }
    expect(RENAME_DESCRIPTION).not.toContain("Scoped to .md notes");
  });

  test("create_base says the created item is a note", () => {
    expect(CREATE_BASE_DESCRIPTION).toContain("The created item is a note.");
  });
});
