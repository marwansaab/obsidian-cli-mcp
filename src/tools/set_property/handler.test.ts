// Original — no upstream. Tests for the set_property handler — the data-model.md handler-test inventory plus the BI-0203 list wire-form cases. Covers per-mode argv shape (specific+path 1-spawn, specific+file 2-spawn, active 2-spawn), six-type inference, JSON-array list wire form and the explicit non-list-type comma join (BI-0203), empty-list literal, cross-type retype (three pairs + active-mode), response shape, name/value verbatim passthrough, type-vs-value CLI rejection, path-traversal CLI confinement, R5 unknown-vault inheritance, CLI_BINARY_NOT_FOUND / CLI_NON_ZERO_EXIT propagation, ERR_NO_ACTIVE_FILE on no-focused-file.
import { afterEach, beforeEach, expect, test } from "vitest";

import { executeWriteProperty } from "./handler.js";
import { __resetInFlightRegistryForTests, type SpawnLike } from "../../cli-adapter/_dispatch.js";
import { UpstreamError } from "../../errors.js";
import { createQueue } from "../../queue.js";
import { captureRejection, makeQueuedSpawn, silentLogger, type StubResponse } from "../_handler-test-fixtures.js";

function deps(spawnFn: SpawnLike) {
  return { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} };
}

const SET_OK = (name: string, value: string): StubResponse => ({ stdout: `Set ${name}: ${value}\n`, exitCode: 0 });

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

// (1) specific+path text → argv shape; inferred type=text (US1#1, SC-001, FR-019, FR-020)
test("specific+path text — argv [vault, property:set, name, value, type=text, path]; response { written, path, name }", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([SET_OK("status", "shipped")]);
  const result = await executeWriteProperty(
    { target_mode: "specific", vault: "Demo", path: "notes/x.md", name: "status", value: "shipped" },
    deps(spawnFn),
  );
  expect(result).toEqual({ written: true, path: "notes/x.md", name: "status" });
  expect(recorded).toHaveLength(1);
  expect(recorded[0]!.argv).toEqual([
    "vault=Demo",
    "property:set",
    "name=status",
    "value=shipped",
    "type=text",
    "path=notes/x.md",
  ]);
});

// (2) specific+path number → inferred type=number (US1#3, SC-003)
test("specific+path number — value=7, type=number inferred", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([SET_OK("count", "7")]);
  const result = await executeWriteProperty(
    { target_mode: "specific", vault: "V", path: "x.md", name: "count", value: 7 },
    deps(spawnFn),
  );
  expect(result).toEqual({ written: true, path: "x.md", name: "count" });
  expect(recorded[0]!.argv).toContain("value=7");
  expect(recorded[0]!.argv).toContain("type=number");
});

// (3) specific+path boolean true → inferred type=checkbox (US1#4, SC-004)
test("specific+path boolean true — value=true, type=checkbox inferred", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([SET_OK("archived", "true")]);
  await executeWriteProperty(
    { target_mode: "specific", vault: "V", path: "x.md", name: "archived", value: true },
    deps(spawnFn),
  );
  expect(recorded[0]!.argv).toContain("value=true");
  expect(recorded[0]!.argv).toContain("type=checkbox");
});

// (4) specific+path boolean false → inferred type=checkbox (US1#4)
test("specific+path boolean false — value=false, type=checkbox inferred", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([SET_OK("archived", "false")]);
  await executeWriteProperty(
    { target_mode: "specific", vault: "V", path: "x.md", name: "archived", value: false },
    deps(spawnFn),
  );
  expect(recorded[0]!.argv).toContain("value=false");
  expect(recorded[0]!.argv).toContain("type=checkbox");
});

// (5) specific+path list 3-element → JSON-array argv (US1#2, SC-002, BI-0203)
test("specific+path list 3-element — value=[\"alpha\",\"beta\",\"gamma\"], type=list inferred", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([SET_OK("tags", "alpha,beta,gamma")]);
  await executeWriteProperty(
    { target_mode: "specific", vault: "V", path: "x.md", name: "tags", value: ["alpha", "beta", "gamma"] },
    deps(spawnFn),
  );
  expect(recorded[0]!.argv).toContain('value=["alpha","beta","gamma"]');
  expect(recorded[0]!.argv).toContain("type=list");
});

// (6) specific+path list 1-element (R9 single-element)
test("specific+path list 1-element — value=[\"alpha\"], type=list inferred", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([SET_OK("tags", "alpha")]);
  await executeWriteProperty(
    { target_mode: "specific", vault: "V", path: "x.md", name: "tags", value: ["alpha"] },
    deps(spawnFn),
  );
  expect(recorded[0]!.argv).toContain('value=["alpha"]');
  expect(recorded[0]!.argv).toContain("type=list");
});

// (6a)–(6f) BI-0203 — an array's wire form, specific+path. A resolved list type sends a JSON array, one
// argv element (TC-00904, TC-00905); an explicit non-list type keeps the comma join (owner ruling, option B).
test.each<{ title: string; value: string[]; type?: "list" | "text"; name: string; wire: string; wireType: string }>([
  { title: "(6a) wikilink list, no type", value: ["[[A]]", "[[B]]"], name: "related", wire: 'value=["[[A]]","[[B]]"]', wireType: "list" },
  { title: "(6b) wikilink list, explicit type=list", value: ["[[A]]", "[[B]]"], type: "list", name: "related", wire: 'value=["[[A]]","[[B]]"]', wireType: "list" },
  { title: "(6c) one-link list", value: ["[[A]]"], name: "related", wire: 'value=["[[A]]"]', wireType: "list" },
  { title: "(6d) item with a comma stays one item", value: ["one", "two, three"], name: "tags", wire: 'value=["one","two, three"]', wireType: "list" },
  { title: '(6e) items with " and \\ are JSON-escaped', value: ['a "q" b', "back\\slash", "Smith, John"], name: "tags", wire: String.raw`value=["a \"q\" b","back\\slash","Smith, John"]`, wireType: "list" },
  { title: "(6f) explicit type=text keeps the comma join", value: ["a", "b"], type: "text", name: "note", wire: "value=a,b", wireType: "text" },
])("BI-0203 $title — argv carries $wire", async ({ value, type, name, wire, wireType }) => {
  const { spawnFn, recorded } = makeQueuedSpawn([SET_OK(name, "x")]);
  await executeWriteProperty(
    { target_mode: "specific", vault: "V", path: "x.md", name, value, ...(type === undefined ? {} : { type }) },
    deps(spawnFn),
  );
  expect(recorded[0]!.argv).toEqual(["vault=V", "property:set", `name=${name}`, wire, `type=${wireType}`, "path=x.md"]);
});

// (6g) BI-0203 — specific+file carries the JSON-array wire form on its property:set call
test("BI-0203 specific+file — property:set carries value=[\"[[A]]\",\"[[B]]\"]", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: "path\tInbox/Welcome.md\nname\tWelcome\nextension\tmd\n", exitCode: 0 },
    SET_OK("related", "[[A]],[[B]]"),
  ]);
  await executeWriteProperty(
    { target_mode: "specific", vault: "Demo", file: "Welcome", name: "related", value: ["[[A]]", "[[B]]"] },
    deps(spawnFn),
  );
  expect(recorded[1]!.argv).toEqual([
    "vault=Demo",
    "property:set",
    "name=related",
    'value=["[[A]]","[[B]]"]',
    "type=list",
    "path=Inbox/Welcome.md",
  ]);
});

// (6h) BI-0203 — active mode carries the JSON-array wire form on its property:set call
test("BI-0203 active — property:set carries value=[\"[[A]]\",\"[[B]]\"]", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: '=> {"path":"focused/note.md","vault":"FocusedVault"}\n', exitCode: 0 },
    SET_OK("related", "[[A]],[[B]]"),
  ]);
  await executeWriteProperty(
    { target_mode: "active", name: "related", value: ["[[A]]", "[[B]]"] },
    deps(spawnFn),
  );
  expect(recorded[1]!.argv).toEqual([
    "vault=FocusedVault",
    "property:set",
    "name=related",
    'value=["[[A]]","[[B]]"]',
    "type=list",
    "path=focused/note.md",
  ]);
});

// (7) specific+path empty list — literal "[]" argv (US5#1, SC-010, FR-018, R10)
test("specific+path empty list — value=[] literal argv, type=list inferred", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([SET_OK("tags", "[]")]);
  const result = await executeWriteProperty(
    { target_mode: "specific", vault: "V", path: "x.md", name: "tags", value: [] },
    deps(spawnFn),
  );
  expect(result).toEqual({ written: true, path: "x.md", name: "tags" });
  expect(recorded[0]!.argv).toContain("value=[]");
  expect(recorded[0]!.argv).toContain("type=list");
});

// (8) specific+path date with explicit type=date (US1#5, SC-005, FR-009)
test("specific+path date with explicit type — value=2026-12-31, type=date explicit", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([SET_OK("due", "2026-12-31")]);
  await executeWriteProperty(
    { target_mode: "specific", vault: "V", path: "x.md", name: "due", value: "2026-12-31", type: "date" },
    deps(spawnFn),
  );
  expect(recorded[0]!.argv).toContain("value=2026-12-31");
  expect(recorded[0]!.argv).toContain("type=date");
});

// (9) specific+path datetime with explicit type=datetime (US1#6, SC-005)
test("specific+path datetime with explicit type — value=2026-05-10T14:30:00, type=datetime explicit", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([SET_OK("updated", "2026-05-10T14:30:00")]);
  await executeWriteProperty(
    {
      target_mode: "specific",
      vault: "V",
      path: "x.md",
      name: "updated",
      value: "2026-05-10T14:30:00",
      type: "datetime",
    },
    deps(spawnFn),
  );
  expect(recorded[0]!.argv).toContain("value=2026-05-10T14:30:00");
  expect(recorded[0]!.argv).toContain("type=datetime");
});

// (10) explicit type overrides default (FR-007 explicit-wins)
test("explicit type=text on a number value overrides default — type=text in argv", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([SET_OK("count", "7")]);
  await executeWriteProperty(
    { target_mode: "specific", vault: "V", path: "x.md", name: "count", value: 7, type: "text" },
    deps(spawnFn),
  );
  expect(recorded[0]!.argv).toContain("value=7");
  expect(recorded[0]!.argv).toContain("type=text");
  expect(recorded[0]!.argv).not.toContain("type=number");
});

// (11) specific+file — TWO calls (file TSV → property:set), R3 specific+file
test("specific+file — TWO spawns (file resolves canonical path → property:set with path)", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: "path\tInbox/Welcome.md\nname\tWelcome\nextension\tmd\n", exitCode: 0 },
    SET_OK("status", "shipped"),
  ]);
  const result = await executeWriteProperty(
    { target_mode: "specific", vault: "Demo", file: "Welcome", name: "status", value: "shipped" },
    deps(spawnFn),
  );
  expect(result).toEqual({ written: true, path: "Inbox/Welcome.md", name: "status" });
  expect(recorded).toHaveLength(2);
  expect(recorded[0]!.argv).toEqual(["vault=Demo", "file", "file=Welcome"]);
  expect(recorded[1]!.argv).toEqual([
    "vault=Demo",
    "property:set",
    "name=status",
    "value=shipped",
    "type=text",
    "path=Inbox/Welcome.md",
  ]);
});

// (12) specific+file canonical-path lands in response (FR-011 response.path)
test("specific+file response.path = canonical from Call A (not the input wikilink)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: "path\tdeep/folder/QuickNote.md\nname\tQuickNote\n", exitCode: 0 },
    SET_OK("tag", "x"),
  ]);
  const result = await executeWriteProperty(
    { target_mode: "specific", vault: "V", file: "QuickNote", name: "tag", value: "x" },
    deps(spawnFn),
  );
  expect(result.path).toBe("deep/folder/QuickNote.md");
  expect(result.path).not.toBe("QuickNote");
});

// (13) active mode happy — TWO spawns (eval → property:set); resolved path+vault land in response (US2#1, SC-013)
test("active happy — TWO spawns (eval resolves {path, vault} → property:set lands at resolved locator)", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: '=> {"path":"focused/note.md","vault":"FocusedVault"}\n', exitCode: 0 },
    SET_OK("status", "review"),
  ]);
  const result = await executeWriteProperty(
    { target_mode: "active", name: "status", value: "review" },
    deps(spawnFn),
  );
  expect(result).toEqual({ written: true, path: "focused/note.md", name: "status" });
  expect(recorded).toHaveLength(2);
  // Call A: eval with FIXED template (no vault prefix in active mode)
  expect(recorded[0]!.argv[0]).toBe("eval");
  expect(recorded[0]!.argv.some((a) => a.startsWith("code="))).toBe(true);
  expect(recorded[0]!.argv.some((a) => a === "vault=")).toBe(false);
  // Call B: property:set with resolved vault + path
  expect(recorded[1]!.argv).toEqual([
    "vault=FocusedVault",
    "property:set",
    "name=status",
    "value=review",
    "type=text",
    "path=focused/note.md",
  ]);
});

// (14) active no-focused-file — ONE spawn (eval only); ERR_NO_ACTIVE_FILE thrown (US2#2, FR-024)
test("active no-focused-file — ONE spawn (eval returns path:null); ERR_NO_ACTIVE_FILE thrown; property:set short-circuited", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: '=> {"path":null,"vault":"V"}\n', exitCode: 0 },
  ]);
  const err = (await captureRejection(
    executeWriteProperty({ target_mode: "active", name: "status", value: "v" }, deps(spawnFn)),
  )) as UpstreamError;
  expect(err).toBeInstanceOf(UpstreamError);
  expect(err.code).toBe("ERR_NO_ACTIVE_FILE");
  expect(recorded).toHaveLength(1);
});

// BI-0193: the advice names this tool (not the retired write_property), specific mode, a vault and a note.
test("active no-focused-file — ERR_NO_ACTIVE_FILE advice names set_property + target_mode=specific + vault + file/path (BI-0193)", async () => {
  const { spawnFn } = makeQueuedSpawn([{ stdout: '=> {"path":null,"vault":"V"}\n', exitCode: 0 }]);
  const err = (await captureRejection(
    executeWriteProperty({ target_mode: "active", name: "status", value: "v" }, deps(spawnFn)),
  )) as UpstreamError;
  expect(err.code).toBe("ERR_NO_ACTIVE_FILE");
  expect(err.message).toBe(
    "No active file in Obsidian. Open a note in the editor, or call set_property with target_mode=specific + vault + file/path.",
  );
  expect(err.message).not.toContain("write_property");
  expect(err.details).toEqual({});
});

// (15) active TOCTOU — eval resolves the focused path at step 1; response reports that path (CONCURRENCY edge case)
test("active TOCTOU — response.path is the path resolved at Call A (no second resolve before write)", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: '=> {"path":"resolved-at-step-1.md","vault":"V"}\n', exitCode: 0 },
    SET_OK("k", "v"),
  ]);
  const result = await executeWriteProperty(
    { target_mode: "active", name: "k", value: "v" },
    deps(spawnFn),
  );
  expect(result.path).toBe("resolved-at-step-1.md");
  // Call B's path argv equals the Call A-resolved path verbatim — no re-resolution.
  expect(recorded[1]!.argv).toContain("path=resolved-at-step-1.md");
});

// (15a) active cross-type retype — string value flips a number property to text in active mode (US2#4, FR-033, SC-021)
test("active cross-type retype — pre-state count:7 (number) + value:'abc' (no explicit type) → argv carries type=text", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: '=> {"path":"focused.md","vault":"V"}\n', exitCode: 0 },
    SET_OK("count", "abc"),
  ]);
  const result = await executeWriteProperty(
    { target_mode: "active", name: "count", value: "abc" },
    deps(spawnFn),
  );
  expect(result.path).toBe("focused.md");
  // Cross-type retype is CLI-native (F3); wrapper sends type=text inferred from the string value.
  expect(recorded[1]!.argv).toContain("type=text");
  expect(recorded[1]!.argv).toContain("value=abc");
});

// (16) cross-type retype pair 1 — number → text (US1#12, FR-033, SC-021)
test("cross-type retype pair 1 — number → text (value:'abc' on count:7 → argv value=abc type=text)", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([SET_OK("count", "abc")]);
  const result = await executeWriteProperty(
    { target_mode: "specific", vault: "V", path: "x.md", name: "count", value: "abc" },
    deps(spawnFn),
  );
  expect(result.written).toBe(true);
  expect(recorded).toHaveLength(1);
  expect(recorded[0]!.argv).toContain("value=abc");
  expect(recorded[0]!.argv).toContain("type=text");
  // FR-033 invariant: no pre-write file-state peek — the handler issues exactly ONE spawn.
});

// (17) overwrite same type — text status flip status:queued → shipped (US1#7)
test("overwrite same type — text → text; handler issues ONE spawn, response shape unchanged", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([SET_OK("status", "shipped")]);
  const result = await executeWriteProperty(
    { target_mode: "specific", vault: "V", path: "x.md", name: "status", value: "shipped" },
    deps(spawnFn),
  );
  expect(result).toEqual({ written: true, path: "x.md", name: "status" });
  expect(recorded).toHaveLength(1);
});

// (18) non-existent file → CLI_REPORTED_ERROR (US1#9, SC-007, FR-016)
test("non-existent file → CLI_REPORTED_ERROR (CLI returns 'Error: File ... not found.')", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: 'Error: File "missing.md" not found.\n', exitCode: 0 },
  ]);
  const err = (await captureRejection(
    executeWriteProperty(
      { target_mode: "specific", vault: "V", path: "missing.md", name: "foo", value: "bar" },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details.message).toContain('Error: File "missing.md" not found.');
});

// (19) unknown vault → CLI_REPORTED_ERROR (011-R5 inheritance) (US1#10, FR-025)
test("unknown vault → CLI_REPORTED_ERROR with verbatim 'Vault not found.' (011-R5)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: "Vault not found.\n", exitCode: 0 },
  ]);
  const err = (await captureRejection(
    executeWriteProperty(
      { target_mode: "specific", vault: "NoSuchVault", path: "x.md", name: "foo", value: "bar" },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.message).toBe("Vault not found.");
});

// (20) type-vs-value contradiction abc/number → CLI_REPORTED_ERROR (US1#11, SC-009, FR-012, R6)
test("type-vs-value contradiction value=abc type=number → CLI_REPORTED_ERROR (CLI is the rejection layer)", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: "Error: Invalid number: abc\n", exitCode: 0 },
  ]);
  const err = (await captureRejection(
    executeWriteProperty(
      { target_mode: "specific", vault: "V", path: "x.md", name: "count", value: "abc", type: "number" },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  // Wrapper forwards both — the CLI is the rejection layer (R6).
  expect(recorded[0]!.argv).toContain("value=abc");
  expect(recorded[0]!.argv).toContain("type=number");
});

// (21) type-vs-value contradiction hello/date → CLI_REPORTED_ERROR (SC-009)
test("type-vs-value contradiction value=hello type=date → CLI_REPORTED_ERROR", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: "Error: Invalid date format. Use YYYY-MM-DD\n", exitCode: 0 },
  ]);
  const err = (await captureRejection(
    executeWriteProperty(
      { target_mode: "specific", vault: "V", path: "x.md", name: "due", value: "hello", type: "date" },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
});

// (22) CLI_BINARY_NOT_FOUND propagates (FR-027)
test("ENOENT on spawn → CLI_BINARY_NOT_FOUND propagates verbatim", async () => {
  const enoent = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  const { spawnFn } = makeQueuedSpawn([{ errorOnSpawn: enoent }]);
  const err = (await captureRejection(
    executeWriteProperty(
      { target_mode: "specific", vault: "V", path: "x.md", name: "k", value: "v" },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_BINARY_NOT_FOUND");
});

// (23) CLI_NON_ZERO_EXIT propagates (FR-027)
test("non-zero exit → CLI_NON_ZERO_EXIT propagates with stderr in details", async () => {
  const { spawnFn } = makeQueuedSpawn([{ stderr: "permission denied", exitCode: 1 }]);
  const err = (await captureRejection(
    executeWriteProperty(
      { target_mode: "specific", vault: "V", path: "x.md", name: "k", value: "v" },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_NON_ZERO_EXIT");
  expect(err.details.exitCode).toBe(1);
  expect(err.details.stderr).toBe("permission denied");
});

// (24) name with dot — passthrough verbatim (FR-019)
test("name 'my.key' passes through to argv verbatim", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([SET_OK("my.key", "v")]);
  await executeWriteProperty(
    { target_mode: "specific", vault: "V", path: "x.md", name: "my.key", value: "v" },
    deps(spawnFn),
  );
  expect(recorded[0]!.argv).toContain("name=my.key");
});

// (25) name with dash — passthrough verbatim (FR-019)
test("name 'my-key' passes through to argv verbatim", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([SET_OK("my-key", "v")]);
  await executeWriteProperty(
    { target_mode: "specific", vault: "V", path: "x.md", name: "my-key", value: "v" },
    deps(spawnFn),
  );
  expect(recorded[0]!.argv).toContain("name=my-key");
});

// (26) name with colon — passthrough verbatim (FR-019, F10)
test("name 'my:key' passes through to argv verbatim", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([SET_OK("my:key", "v")]);
  await executeWriteProperty(
    { target_mode: "specific", vault: "V", path: "x.md", name: "my:key", value: "v" },
    deps(spawnFn),
  );
  expect(recorded[0]!.argv).toContain("name=my:key");
});

// (27) value with `#` — argv passthrough; no wrapper-side quoting (FR-020, FR-021)
test("value 'hello # world' passes through to argv as a single discrete element", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([SET_OK("note", "hello # world")]);
  await executeWriteProperty(
    { target_mode: "specific", vault: "V", path: "x.md", name: "note", value: "hello # world" },
    deps(spawnFn),
  );
  expect(recorded[0]!.argv).toContain("value=hello # world");
});

// (28) value with leading `!` — argv passthrough (FR-021)
test("value '!alert' passes through to argv verbatim (leading bang preserved)", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([SET_OK("note", "!alert")]);
  await executeWriteProperty(
    { target_mode: "specific", vault: "V", path: "x.md", name: "note", value: "!alert" },
    deps(spawnFn),
  );
  expect(recorded[0]!.argv).toContain("value=!alert");
});

// (29) path-traversal '../../etc/passwd' → CLI_REPORTED_ERROR (FR-026, SC-020)
test("path '../../etc/passwd' → CLI_REPORTED_ERROR (CLI-confined; no FS write)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: 'Error: File "../../etc/passwd" not found.\n', exitCode: 0 },
  ]);
  const err = (await captureRejection(
    executeWriteProperty(
      { target_mode: "specific", vault: "V", path: "../../etc/passwd", name: "k", value: "v" },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
});

// (30) path-traversal '../OtherVault/x.md' → CLI_REPORTED_ERROR (SC-020)
test("path '../OtherVault/x.md' → CLI_REPORTED_ERROR (CLI rejects cross-vault traversal)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: 'Error: File "../OtherVault/x.md" not found.\n', exitCode: 0 },
  ]);
  const err = (await captureRejection(
    executeWriteProperty(
      { target_mode: "specific", vault: "V", path: "../OtherVault/x.md", name: "k", value: "v" },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
});

// (31) response shape — specific+path echoes input.path verbatim (FR-011)
test("response.path = input.path verbatim in specific+path mode", async () => {
  const { spawnFn } = makeQueuedSpawn([SET_OK("k", "v")]);
  const result = await executeWriteProperty(
    { target_mode: "specific", vault: "V", path: "deep/nested/folder/note.md", name: "k", value: "v" },
    deps(spawnFn),
  );
  expect(result.path).toBe("deep/nested/folder/note.md");
});

// (32) response shape — written is literal true (R11)
test("response.written is literal true (z.literal(true) compile-time-verifiable)", async () => {
  const { spawnFn } = makeQueuedSpawn([SET_OK("k", "v")]);
  const result = await executeWriteProperty(
    { target_mode: "specific", vault: "V", path: "x.md", name: "k", value: "v" },
    deps(spawnFn),
  );
  expect(result.written).toBe(true);
  // type-check: result.written is `true` (not boolean) — the literal type makes this assignment valid.
  const _t: true = result.written;
  void _t;
});

// (33) cross-type retype pair 2 — text → number (US1#12, FR-033, SC-021)
test("cross-type retype pair 2 — text → number (value:42 type:'number' on tag:'hello' → argv value=42 type=number)", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([SET_OK("tag", "42")]);
  const result = await executeWriteProperty(
    { target_mode: "specific", vault: "V", path: "x.md", name: "tag", value: 42, type: "number" },
    deps(spawnFn),
  );
  expect(result.written).toBe(true);
  expect(recorded).toHaveLength(1);
  expect(recorded[0]!.argv).toContain("value=42");
  expect(recorded[0]!.argv).toContain("type=number");
});

// (34) cross-type retype pair 3 — list → text (US1#12, FR-033, SC-021)
test("cross-type retype pair 3 — list → text (value:'scalar' on tags:['a','b'] → argv value=scalar type=text)", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([SET_OK("tags", "scalar")]);
  const result = await executeWriteProperty(
    { target_mode: "specific", vault: "V", path: "x.md", name: "tags", value: "scalar" },
    deps(spawnFn),
  );
  expect(result.written).toBe(true);
  expect(recorded).toHaveLength(1);
  expect(recorded[0]!.argv).toContain("value=scalar");
  expect(recorded[0]!.argv).toContain("type=text");
  // FR-033 invariant: no file-state peek; one spawn regardless of pre-write list-state.
});

// (35) specific+file — Call A exit-0 file stdout with NO "path\t" line → CLI_REPORTED_ERROR stage "file-tsv-parse"
test("specific+file — file subcommand stdout lacks a path line → CLI_REPORTED_ERROR stage 'file-tsv-parse'", async () => {
  // Call A is a valid exit-0 file-subcommand envelope (no "Error:" / "Vault not found." head,
  // so neither the dispatch "Error:" classification nor the adapter unknown-vault re-classification
  // fires) but carries no `path\t` line, so parseFileTSV throws before Call B is queued.
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: "name\tWelcome\nextension\tmd\n", exitCode: 0 },
  ]);
  const err = (await captureRejection(
    executeWriteProperty(
      { target_mode: "specific", vault: "Demo", file: "Welcome", name: "status", value: "shipped" },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err).toBeInstanceOf(UpstreamError);
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details.stage).toBe("file-tsv-parse");
  expect(err.details.stdout).toBe("name\tWelcome\nextension\tmd\n");
  // property:set short-circuited — only Call A (file resolve) was spawned.
  expect(recorded).toHaveLength(1);
});

// (36) active — Call A eval stdout body is unparseable JSON → CLI_REPORTED_ERROR stage "json-parse"
test("active — eval stdout body is unparseable JSON → CLI_REPORTED_ERROR stage 'json-parse'", async () => {
  // The call's tagged answer is "not-json{{{", which fails JSON.parse (spec 080: parseEvalAnswer).
  // Head does not start with "Error:" / "Vault not found.", so classification stays at exit-0 success
  // and the handler's own json-parse guard is the throw site.
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: "=> not-json{{{\n", exitCode: 0 },
  ]);
  const err = (await captureRejection(
    executeWriteProperty({ target_mode: "active", name: "status", value: "review" }, deps(spawnFn)),
  )) as UpstreamError;
  expect(err).toBeInstanceOf(UpstreamError);
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details.stage).toBe("json-parse");
  expect(err.cause).toBeInstanceOf(SyntaxError);
  // property:set short-circuited — only Call A (eval) was spawned.
  expect(recorded).toHaveLength(1);
});

// (37) active — Call A eval stdout is valid JSON but fails isFocusedFileResponse shape → CLI_REPORTED_ERROR stage "envelope-parse"
test("active — eval stdout is valid JSON of unexpected shape → CLI_REPORTED_ERROR stage 'envelope-parse'", async () => {
  // Valid JSON parses cleanly (past the json-parse guard) but path:123 is neither string nor null,
  // so isFocusedFileResponse returns false and the envelope-parse guard throws.
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: '=> {"path":123,"vault":"V"}\n', exitCode: 0 },
  ]);
  const err = (await captureRejection(
    executeWriteProperty({ target_mode: "active", name: "status", value: "review" }, deps(spawnFn)),
  )) as UpstreamError;
  expect(err).toBeInstanceOf(UpstreamError);
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details.stage).toBe("envelope-parse");
  expect(err.details.parsed).toEqual({ path: 123, vault: "V" });
  // property:set short-circuited — only Call A (eval) was spawned.
  expect(recorded).toHaveLength(1);
});

// (37b) Spec 080 contract E5 — envelope-parse also carries the stdout excerpt and its length, keeping parsed
test("active — envelope-parse carries the stdout excerpt and stdoutLength alongside parsed (E5)", async () => {
  let stdout = "";
  const { spawnFn } = makeQueuedSpawn([
    { stdout: ({ answerTag }) => (stdout = `plugin\n=> <<${answerTag}>>{"path":123,"vault":"V"}\n`), exitCode: 0 },
  ]);
  const err = (await captureRejection(
    executeWriteProperty({ target_mode: "active", name: "status", value: "review" }, deps(spawnFn)),
  )) as UpstreamError;
  expect(err.details).toEqual({
    stage: "envelope-parse",
    parsed: { path: 123, vault: "V" },
    stdout,
    stdoutLength: stdout.length,
  });
});

// (37c) Spec 080 — plugin output and a look-alike around the call's answer are ignored
test("active — plugin output and a look-alike around the focused-file answer are ignored", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    {
      stdout: ({ answerTag }) =>
        `[warn] plugin\n=> {"path":"Decoy.md","vault":"D"}\n=> <<${answerTag}>>{"path":"Notes/a.md","vault":"V"}\n`,
      exitCode: 0,
    },
    { stdout: "Set status: review\n", exitCode: 0 },
  ]);
  const out = await executeWriteProperty({ target_mode: "active", name: "status", value: "review" }, deps(spawnFn));
  expect(out).toEqual({ written: true, path: "Notes/a.md", name: "status" });
  expect(recorded[1]!.argv).toContain("vault=V");
});
