// Original — no upstream. Boot-time parser for default-off opt-in environment flags such as OBSIDIAN_MCP_ALLOW_EVAL (068 research R4; data-model §1).

/** The closed enable-set for default-off opt-in flags such as `OBSIDIAN_MCP_ALLOW_EVAL` (068 research R4). */
const ENV_FLAG_ENABLE_SET = new Set(["1", "true", "yes", "on"]);

/**
 * 068 opt-in flag parser (research R4; data-model §1) — the inverse convention of `autoLaunchEnabled`
 * (`cli-adapter/_dispatch.ts`): OFF by default; ON only when the value, trimmed and lower-cased, is one
 * of {1,true,yes,on}. Unset, empty and any other value leave it off.
 */
export function envFlagEnabled(value: string | undefined): boolean {
  if (typeof value !== "string") return false;
  return ENV_FLAG_ENABLE_SET.has(value.trim().toLowerCase());
}
