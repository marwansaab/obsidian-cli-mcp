// Original — no upstream. Frozen `obsidian eval` template for get_active_file (BI-063, research D4). A plain
// synchronous IIFE that reads app.workspace.getActiveFile() and returns { active: { path, name, basename,
// extension } | null } — the exact published output shape. The four fields map directly to Obsidian TFile
// members; the name = basename + extension, multi-dot, and no-extension rules are the substrate's own
// semantics (no re-parser). There is NO ok-wrapper: getActiveFile() returns a TFile or null and cannot fail
// at the eval level, so unlike the discriminated-union cohort (backlinks/links/open_file) there is no
// ok:false arm to discriminate — the body emits `{ active }` directly and decodeEvalEnvelope validates it
// straight into getActiveFileOutputSchema (see schema.ts / handler.ts).
//
// NO __PAYLOAD_B64__ and NO composeEvalCode: the tool injects NO caller-supplied data into the eval —
// active vs specific routing is carried by invokeCli's vault/target_mode, not the template — so there is no
// injection surface (unlike backlinks, which interpolates a path/file payload). A plain frozen string is
// simpler and equally safe.
//
// Read-only: the template only READS getActiveFile() — it never calls openLinkText / setActiveLeaf or any
// mutation, so FR-019 (never changes which file is active) holds structurally.
//
// Byte-stable: _template.test.ts and handler.test.ts (recorded argv) assert this exact string. It MUST NOT
// change without updating those tests.
export const ACTIVE_FILE_TEMPLATE =
  "(()=>{const f=app.workspace.getActiveFile();return JSON.stringify({active:f?{path:f.path,name:f.name,basename:f.basename,extension:f.extension}:null});})()";
