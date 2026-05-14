// Original — no upstream. Tests for parseVaultRegistry — BOM stripping, CRLF/LF tolerance, empty-line skip, exact-name match (byte-sensitive), not-found, multi-tab first-column selection, empty stdout. 8 cases per data-model.md inventory.
import { expect, test } from "vitest";

import { parseVaultRegistry } from "./registry-parser.js";

// (1) BOM-prefixed stdout with a single vault match → true
test("BOM-prefixed stdout with single vault: matches by name", () => {
  const stdout = "﻿Demo\tC:\\Vaults\\Demo\n";
  expect(parseVaultRegistry(stdout, "Demo")).toBe(true);
});

// (2) CRLF line endings: match unaffected
test("CRLF line endings: match unaffected", () => {
  const stdout = "Demo\tC:\\Vaults\\Demo\r\nOther\tC:\\Vaults\\Other\r\n";
  expect(parseVaultRegistry(stdout, "Other")).toBe(true);
});

// (3) LF line endings: match unaffected
test("LF line endings: match unaffected", () => {
  const stdout = "Demo\tC:\\Vaults\\Demo\nOther\tC:\\Vaults\\Other\n";
  expect(parseVaultRegistry(stdout, "Other")).toBe(true);
});

// (4) Empty lines skipped between valid lines
test("empty lines between valid lines: skipped", () => {
  const stdout = "Demo\tC:\\Vaults\\Demo\n\n\nOther\tC:\\Vaults\\Other\n";
  expect(parseVaultRegistry(stdout, "Other")).toBe(true);
});

// (5) Vault not in registry → false
test("vault not in registry: returns false", () => {
  const stdout = "Demo\tC:\\Vaults\\Demo\nOther\tC:\\Vaults\\Other\n";
  expect(parseVaultRegistry(stdout, "Missing")).toBe(false);
});

// (6) Tab-separated tokens — first column = vault name (exact)
test("first column equals vault name (byte-exact, case-sensitive)", () => {
  const stdout = "demo\tC:\\Vaults\\demo\n";
  // case mismatch must NOT match
  expect(parseVaultRegistry(stdout, "Demo")).toBe(false);
  expect(parseVaultRegistry(stdout, "demo")).toBe(true);
});

// (7) Multiple tabs per line — picks first
test("multiple tabs per line: picks first tab as separator", () => {
  const stdout = "Demo\tC:\\Vaults\\Demo\tcomment\n";
  expect(parseVaultRegistry(stdout, "Demo")).toBe(true);
});

// (8) Empty stdout → false
test("empty stdout: returns false", () => {
  expect(parseVaultRegistry("", "Demo")).toBe(false);
});
