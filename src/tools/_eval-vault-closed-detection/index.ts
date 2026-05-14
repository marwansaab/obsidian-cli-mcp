// Original — no upstream. Re-export barrel for the cross-cutting `_eval-vault-closed-detection` shared module — extracted at BI-027 per FR-020 / Q8(c) hybrid extraction.
export { detectIfClosed, type DetectIfClosedInput, type DetectorDeps } from "./detector.js";
export { parseVaultRegistry } from "./registry-parser.js";
