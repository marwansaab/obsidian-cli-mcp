// Original — no upstream. Tests for the file-type module (spec 070): extensionOf / categoryOf over the core table, the UNSUPPORTED_FILE_TYPE unsupported-type and type-change envelopes, the rename/move destination-name rule over every data-model worked row, the description sentence, and the cross-category type-preservation invariant (US4).
import { describe, expect, test } from "vitest";

import {
  ALL_CATEGORIES,
  assertSupportedFileType,
  categoryOf,
  describeCategories,
  describeSupport,
  extensionOf,
  resolveDestinationName,
  typeChangeError,
  type FileCategory,
} from "./file-type.js";
import { UpstreamError } from "../errors.js";

function rejection(fn: () => unknown): UpstreamError {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(UpstreamError);
    return e as UpstreamError;
  }
  throw new Error("expected a throw");
}

describe("extensionOf", () => {
  test.each([
    ["a/b.md", "md"],
    ["a.b/c", ""],
    ["Photo.PNG", "PNG"],
    ["README", ""],
    ["x/.hidden", "hidden"],
    ["Doc.v1.draft", "draft"],
    ["Boards/Plan.canvas", "canvas"],
    ["trailing.", ""],
  ])("%s → %j", (path, ext) => {
    expect(extensionOf(path)).toBe(ext);
  });
});

describe("categoryOf", () => {
  const table: Array<[string, FileCategory]> = [
    ["md", "note"],
    ["canvas", "canvas"],
    ["base", "base"],
    ...[
      "avif",
      "bmp",
      "gif",
      "jpeg",
      "jpg",
      "png",
      "svg",
      "webp",
      "flac",
      "m4a",
      "mp3",
      "oga",
      "ogg",
      "opus",
      "wav",
      "webm",
      "3gp",
      "mkv",
      "mov",
      "mp4",
      "ogv",
      "pdf",
    ].map((ext): [string, FileCategory] => [ext, "attachment"]),
  ];

  test.each(table)("%s → %s, in lower and upper case", (ext, category) => {
    expect(categoryOf(ext)).toBe(category);
    expect(categoryOf(ext.toUpperCase())).toBe(category);
  });

  test.each(["txt", "docx", "", "draft"])("%j → null (not a core type)", (ext) => {
    expect(categoryOf(ext)).toBeNull();
  });
});

describe("describeCategories / describeSupport", () => {
  test("renders one, two and many categories", () => {
    expect(describeCategories(["note"])).toBe("notes");
    expect(describeCategories(["note", "base"])).toBe("notes and bases");
    expect(describeCategories(["note", "canvas", "base"])).toBe("notes, canvases and bases");
    expect(describeCategories(ALL_CATEGORIES)).toBe("notes, canvases, bases and attachments");
  });

  test("the description sentence for a category list and for any file", () => {
    expect(describeSupport(["note"])).toBe("Supported file types: notes.");
    expect(describeSupport(["note", "canvas", "base"])).toBe(
      "Supported file types: notes, canvases and bases.",
    );
    expect(describeSupport("any")).toBe(
      "Works on any file type (notes, canvases, bases, attachments and others).",
    );
  });
});

describe("assertSupportedFileType", () => {
  test("a supported type passes, whatever its case", () => {
    expect(() =>
      assertSupportedFileType({ relPath: "a/Note.md", supported: ["note"], toolName: "outline" }),
    ).not.toThrow();
    expect(() =>
      assertSupportedFileType({
        relPath: "Boards/Plan.CANVAS",
        supported: ["note", "canvas", "base"],
        toolName: "read",
      }),
    ).not.toThrow();
  });

  test("an unsupported type throws the unsupported-type envelope with an alternative", () => {
    const err = rejection(() =>
      assertSupportedFileType({
        relPath: "Att/photo.png",
        supported: ["note", "canvas", "base"],
        toolName: "read",
        alternatives: { attachment: "open_file" },
      }),
    );
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.details).toEqual({
      code: "UNSUPPORTED_FILE_TYPE",
      reason: "unsupported-type",
      path: "Att/photo.png",
      extension: "png",
      supported: ["note", "canvas", "base"],
      alternative: "open_file",
    });
    for (const fragment of [
      "Att/photo.png",
      "attachment",
      ".png",
      "notes",
      "canvases",
      "bases",
      "open_file",
    ]) {
      expect(err.message).toContain(fragment);
    }
    expect(err.message).toContain("Nothing was changed.");
  });

  test("an alternative is named only for its own category", () => {
    for (const relPath of ["F/todo.txt", "a/N.md"]) {
      const err = rejection(() =>
        assertSupportedFileType({
          relPath,
          supported: ["canvas"],
          toolName: "read",
          alternatives: { attachment: "open_file" },
        }),
      );
      expect(err.details).not.toHaveProperty("alternative");
      expect(err.message).not.toContain("open_file");
    }
  });

  test("without an alternative the details carry no alternative key", () => {
    const err = rejection(() =>
      assertSupportedFileType({
        relPath: "Boards/X.canvas",
        supported: ["note"],
        toolName: "write_note",
      }),
    );
    expect(err.details).toEqual({
      code: "UNSUPPORTED_FILE_TYPE",
      reason: "unsupported-type",
      path: "Boards/X.canvas",
      extension: "canvas",
      supported: ["note"],
    });
    expect(err.message).toBe(
      "write_note: Boards/X.canvas is a canvas (.canvas); write_note supports notes. Nothing was changed.",
    );
  });

  test("non-core and extensionless paths are rejected and named", () => {
    const txt = rejection(() =>
      assertSupportedFileType({ relPath: "F/todo.txt", supported: ["note"], toolName: "prepend" }),
    );
    expect(txt.details.extension).toBe("txt");
    expect(txt.message).toContain('a ".txt" file');
    const bare = rejection(() =>
      assertSupportedFileType({ relPath: "F/Note", supported: ["note"], toolName: "prepend" }),
    );
    expect(bare.details.extension).toBe("");
    expect(bare.message).toContain("a file with no extension");
  });
});

describe("typeChangeError", () => {
  test("builds the type-change envelope (contracts/errors.md second example)", () => {
    const err = typeChangeError({
      relPath: "Boards/Plan.canvas",
      destination: "Plan.md",
      destinationLabel: "the new name",
      toolName: "rename",
    });
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.details).toEqual({
      code: "UNSUPPORTED_FILE_TYPE",
      reason: "type-change",
      path: "Boards/Plan.canvas",
      extension: "canvas",
      supported: ["note", "canvas", "base", "attachment"],
      destination: "Plan.md",
      destinationExtension: "md",
      alternative: "obsidian_exec",
    });
    expect(err.message).toBe(
      'rename: Boards/Plan.canvas is a canvas; the new name "Plan.md" would make it a note. rename and move keep a file\'s type. Nothing was changed. Omit the extension to keep it a canvas, or use obsidian_exec to change the type deliberately.',
    );
  });

  test("move names the destination", () => {
    const err = typeChangeError({
      relPath: "a/N.md",
      destination: "b/N.canvas",
      destinationLabel: "the destination",
      toolName: "move",
    });
    expect(err.message).toContain('the destination "b/N.canvas" would make it a canvas');
  });
});

describe("resolveDestinationName — data-model worked rows", () => {
  test.each([
    ["Inbox/Note.md", "Renamed", "Renamed.md"],
    ["Inbox/Note.md", "Renamed.md", "Renamed.md"],
    ["Inbox/Note.md", "Renamed.MD", "Renamed.MD.md"],
    ["Inbox/Note.md", "Doc.v1.draft", "Doc.v1.draft.md"],
    ["Boards/Plan.canvas", "Roadmap", "Roadmap.canvas"],
    ["Boards/Plan.canvas", "Roadmap.canvas", "Roadmap.canvas"],
    ["Boards/Plan.canvas", "Plan.v2", "Plan.v2.canvas"],
    ["Views/Tasks.base", "Open Tasks", "Open Tasks.base"],
    ["Att/Photo.PNG", "New", "New.PNG"],
    ["Att/Photo.PNG", "New.png", "New.png"],
    ["Misc/README", "Readme2", "Readme2"],
    ["Misc/todo.txt", "done", "done.txt"],
    // Final segment of a move `to`.
    ["Boards/Plan.canvas", "Archive/Plan2", "Archive/Plan2.canvas"],
  ])("%s + %j → %j", (relPath, destination, forwarded) => {
    expect(resolveDestinationName({ relPath, destination, destinationLabel: "the new name", toolName: "rename" })).toBe(forwarded);
  });

  test.each([
    ["Inbox/Note.md", "Sketch.canvas", "md", "canvas"],
    ["Boards/Plan.canvas", "Plan.md", "canvas", "md"],
    ["Att/Photo.png", "New.jpg", "png", "jpg"],
  ])("%s + %j → type-change rejection", (relPath, destination, extension, destinationExtension) => {
    const err = rejection(() =>
      resolveDestinationName({ relPath, destination, destinationLabel: "the new name", toolName: "rename" }),
    );
    expect(err.details).toMatchObject({
      code: "UNSUPPORTED_FILE_TYPE",
      reason: "type-change",
      path: relPath,
      extension,
      destination,
      destinationExtension,
      alternative: "obsidian_exec",
    });
  });
});

// US4 / FR-011: whatever destination is asked for, a successful result keeps the source's
// extension, or the call is rejected as a type change.
describe("type-preservation invariant across every category", () => {
  const SOURCES: Record<FileCategory, string> = {
    note: "Dir/Src.md",
    canvas: "Dir/Src.canvas",
    base: "Dir/Src.base",
    attachment: "Dir/Src.png",
  };

  for (const category of ALL_CATEGORIES) {
    const source = SOURCES[category];
    const srcExt = extensionOf(source);
    const otherExts = ALL_CATEGORIES.filter((c) => c !== category).map((c) =>
      extensionOf(SOURCES[c]),
    );
    const destinations = [
      "Dest",
      `Dest.${srcExt}`,
      `Dest.${srcExt.toUpperCase()}`,
      "Dest.v2",
      ...otherExts.map((ext) => `Dest.${ext}`),
    ];

    test.each(destinations)(
      `${category} source + %j keeps .${srcExt} or rejects type-change`,
      (destination) => {
        let forwarded: string;
        try {
          forwarded = resolveDestinationName({
            relPath: source,
            destination,
            destinationLabel: "the destination",
            toolName: "move",
          });
        } catch (e) {
          expect(e).toBeInstanceOf(UpstreamError);
          expect((e as UpstreamError).details.reason).toBe("type-change");
          expect(otherExts).toContain(extensionOf(destination).toLowerCase());
          return;
        }
        expect(extensionOf(forwarded).toLowerCase()).toBe(srcExt);
        expect(categoryOf(extensionOf(forwarded))).toBe(category);
      },
    );
  }
});
