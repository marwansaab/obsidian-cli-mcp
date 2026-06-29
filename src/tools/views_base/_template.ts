// Original — no upstream. Frozen JS template for the named-Base FOCUS step (BI-064; cross-vault
// rewrite ADR-031) — base64 payload anti-injection (composeEvalCode). A single block-body async IIFE
// resolves the named `.base` by exact vault-relative path and opens it into the active leaf, switching
// Obsidian's focus to it so the subsequent active-mode `base:views` reads THAT Base (T0 probe P3:
// focus-then-active is reliable; the cross-process handoff to the persistent instance is race-free).
//
// The eval runs IN the requested vault when the handler issues it in target_mode:"specific" with
// vault=requested (eval honours vault=, B1 false per ADR-031), so the open lands in that vault even
// when it is unfocused or cold-launched (recovery inherited from dispatchCli, ADR-029/030); with no
// vault it runs target_mode:"active" against the focused vault. This reuses the open MECHANISM via the
// shared eval primitive `composeEvalCode` — it does NOT import the sibling `open_file` module (that
// would be a tool→tool upward edge, Principle I). Minimal vs open_file's _template: no new_tab, no
// placement enum, no viewRegistry type-check — `views_base` only needs the file focused, and the
// schema already guarantees a `.base` extension.
//
// `getAbstractFileByPath` is an O(1) hash lookup; a folder (no `extension`) or a missing path both
// yield {ok:false, code:'FILE_NOT_FOUND'}, which the handler remaps to BASE_NOT_FOUND/named-missing
// (never leaked). Async because the open awaits `openLinkText`.
import { B64_PAYLOAD_DECODE_EXPR } from "../_shared.js";

export const FOCUS_BASE_TEMPLATE = `(async()=>{
const a=JSON.parse(${B64_PAYLOAD_DECODE_EXPR});
const f=app.vault.getAbstractFileByPath(a.path);
if(!f||f.extension===undefined)return JSON.stringify({ok:false,code:'FILE_NOT_FOUND'});
await app.workspace.openLinkText(f.path,'',false);
return JSON.stringify({ok:true,opened:f.path});
})()`;
