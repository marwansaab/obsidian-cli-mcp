// Original — no upstream. File-type classification for the file-path tools (BI-0060, spec 070): the core extension table (notes, canvases, bases and Obsidian's native attachments), extensionOf / categoryOf, the per-tool supported-type check that throws VALIDATION_ERROR + details.code UNSUPPORTED_FILE_TYPE before any vault change, the rename/move destination-name rule that keeps a file's type, and the description sentence each tool builds from its declaration. Leaf module: imports only src/errors.ts.
import { UpstreamError } from "../errors.js";

/** The four core file categories (spec 070 Key Entities: Core file type). */
export type FileCategory = "note" | "canvas" | "base" | "attachment";

export const ALL_CATEGORIES: readonly FileCategory[] = ["note", "canvas", "base", "attachment"];

/**
 * A tool's declared support: the categories it handles, or `"any"` for tools that work on every
 * file, including files whose extension is not a core type (rename, move, delete, open_file).
 */
export type SupportDeclaration = readonly FileCategory[] | "any";

// Lower-case extensions per category. The attachment row is the set Obsidian opens natively
// without plugins, cross-checked against `app.viewRegistry.typeByExtension` at T0 P5.
const EXTENSIONS: Readonly<Record<FileCategory, readonly string[]>> = {
  note: ["md"],
  canvas: ["canvas"],
  base: ["base"],
  attachment: [
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
  ],
};

const CATEGORY_BY_EXTENSION: ReadonlyMap<string, FileCategory> = new Map(
  ALL_CATEGORIES.flatMap((category) => EXTENSIONS[category].map((ext) => [ext, category] as const)),
);

const SINGULAR: Readonly<Record<FileCategory, string>> = {
  note: "a note",
  canvas: "a canvas",
  base: "a base",
  attachment: "an attachment",
};

const PLURAL: Readonly<Record<FileCategory, string>> = {
  note: "notes",
  canvas: "canvases",
  base: "bases",
  attachment: "attachments",
};

/**
 * The extension of a vault-relative path: the text after the last `.` of the final `/` segment,
 * in its original case, or `""` when that segment has no `.`.
 */
export function extensionOf(path: string): string {
  const segment = path.slice(path.lastIndexOf("/") + 1);
  const dot = segment.lastIndexOf(".");
  return dot === -1 ? "" : segment.slice(dot + 1);
}

/** The core category of an extension, matched case-insensitively; `null` when it is not a core type. */
export function categoryOf(ext: string): FileCategory | null {
  return CATEGORY_BY_EXTENSION.get(ext.toLowerCase()) ?? null;
}

/** "notes", "notes and bases", "notes, canvases and bases". */
export function describeCategories(categories: readonly FileCategory[]): string {
  const names = categories.map((c) => PLURAL[c]);
  return names.length <= 1
    ? names.join("")
    : `${names.slice(0, -1).join(", ")} and ${names.at(-1)!}`;
}

/** The supported-types sentence a tool's description carries, built from its declaration (FR-010). */
export function describeSupport(support: SupportDeclaration): string {
  return support === "any"
    ? "Works on any file type (notes, canvases, bases, attachments and others)."
    : `Supported file types: ${describeCategories(support)}.`;
}

// "a canvas", "an attachment (.png)" style phrase for messages; non-core extensions are quoted.
function describeFile(ext: string, withExtension: boolean): string {
  const category = categoryOf(ext);
  if (category !== null)
    return withExtension ? `${SINGULAR[category]} (.${ext})` : SINGULAR[category];
  return ext === "" ? "a file with no extension" : `a ".${ext}" file`;
}

export interface SupportedFileTypeCheck {
  /** Vault-relative path of the file the tool will act on (resolved for `file` / `active` locators). */
  relPath: string;
  supported: readonly FileCategory[];
  toolName: string;
  /** Tool to use instead, carried in `details.alternative` and named in the message. */
  alternative?: string;
}

/**
 * Throw VALIDATION_ERROR + `details.code: "UNSUPPORTED_FILE_TYPE"`, `reason: "unsupported-type"`
 * unless `relPath` is one of the `supported` categories. Callers run it before any CLI call that
 * acts on the file and before any filesystem write (FR-007).
 */
export function assertSupportedFileType(check: SupportedFileTypeCheck): void {
  const { relPath, supported, toolName, alternative } = check;
  const extension = extensionOf(relPath);
  const category = categoryOf(extension);
  if (category !== null && supported.includes(category)) return;
  const hint = alternative === undefined ? "" : ` Use ${alternative} for this file instead.`;
  throw new UpstreamError({
    code: "VALIDATION_ERROR",
    cause: null,
    details: {
      code: "UNSUPPORTED_FILE_TYPE",
      reason: "unsupported-type",
      path: relPath,
      extension,
      supported: [...supported],
      ...(alternative !== undefined ? { alternative } : {}),
    },
    message: `${toolName}: ${relPath} is ${describeFile(extension, true)}; ${toolName} supports ${describeCategories(supported)}. Nothing was changed.${hint}`,
  });
}

export interface TypeChangeContext {
  /** Resolved vault-relative path of the source file. */
  relPath: string;
  /** The destination as given (rename `name`, move `to`). */
  destination: string;
  toolName: string;
}

/**
 * The `reason: "type-change"` rejection: the destination names a recognised core extension that
 * differs from the source's. The deliberate route for a type change is `obsidian_exec`.
 */
export function typeChangeError(ctx: TypeChangeContext): UpstreamError {
  const { relPath, destination, toolName } = ctx;
  const extension = extensionOf(relPath);
  const destinationExtension = extensionOf(destination);
  const source = describeFile(extension, false);
  const target = toolName === "rename" ? "the new name" : "the destination";
  return new UpstreamError({
    code: "VALIDATION_ERROR",
    cause: null,
    details: {
      code: "UNSUPPORTED_FILE_TYPE",
      reason: "type-change",
      path: relPath,
      extension,
      supported: [...ALL_CATEGORIES],
      destination,
      destinationExtension,
      alternative: "obsidian_exec",
    },
    message: `${toolName}: ${relPath} is ${source}; ${target} "${destination}" would make it ${describeFile(destinationExtension, false)}. rename and move keep a file's type. Nothing was changed. Omit the extension to keep it ${source}, or use obsidian_exec to change the type deliberately.`,
  });
}

/**
 * The rename/move destination-name rule (spec 070 research D5, data-model DestinationNameRule).
 * Returns the destination to forward, or throws {@link typeChangeError}:
 *
 * 1. A recognised destination extension that differs (case-insensitively) from the source's → reject.
 * 2. A source with no extension → the destination as given.
 * 3. A destination that already carries the source's extension → as given. For a `.md` source the
 *    check stays the byte-exact `endsWith(".md")` it always was, so `Renamed.MD` still becomes
 *    `Renamed.MD.md` (FR-012); for every other source it is case-insensitive (`New.png` on a
 *    `.PNG` source stays `New.png`).
 * 4. Otherwise → the destination plus `.` and the source's extension in its own spelling.
 */
export function resolveDestinationName(ctx: TypeChangeContext): string {
  const { relPath, destination } = ctx;
  const srcExt = extensionOf(relPath);
  const dstExt = extensionOf(destination);
  if (categoryOf(dstExt) !== null && dstExt.toLowerCase() !== srcExt.toLowerCase()) {
    throw typeChangeError(ctx);
  }
  if (srcExt === "") return destination;
  const carriesSourceExtension =
    srcExt === "md" ? destination.endsWith(".md") : dstExt.toLowerCase() === srcExt.toLowerCase();
  return carriesSourceExtension ? destination : `${destination}.${srcExt}`;
}
