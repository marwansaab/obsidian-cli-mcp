// Original — no upstream. Frozen JS template for the eval subcommand (BI-057; cross-vault rewrite
// ADR-031) — base64 payload anti-injection (R12); single block-body async IIFE folds locator
// resolution + viewRegistry type-check + the explicit placement open into ONE eval (R2). The eval
// runs IN the requested vault: the handler issues it in target_mode:"specific" with vault=requested,
// and because `eval` honours vault= (B1 falsified 2026-06-01, controlled-session probe), the IIFE
// resolves the locator and opens the file in that vault — switching Obsidian's focus to it as a side
// effect. NO focused-vault guard, no `expectedBase`, no `VAULT_NOT_FOCUSED` (all removed vs BI-057).
// Eval-composition layer reaches Obsidian core API (app.vault / app.metadataCache / app.viewRegistry
// / app.workspace) the same way write_note's open eval does (ADR-009 lineage). Async because the
// open branches await openLinkText.
//
// Placement (FR-008..FR-011 / BI-0129; data-model §5) is an EXPLICIT three-way branch, not a single
// openLinkText(new_tab): `openLinkText(path,'',false)` opens into the ACTIVE leaf and does NOT focus
// an already-open tab (T0-confirmed 2026-06-01 — it is the latent BI-057 reuse bug). So:
//   - new_tab           → openLinkText(path,'',true)  → a fresh leaf            → "new_tab_created"
//   - else already-open → setActiveLeaf(existing,{focus}) → no duplicate        → "existing_tab_reused"
//   - else              → openLinkText(path,'',false) → the active leaf         → "active_tab_used"
// The already-open scan uses `iterateAllLeaves` (ALL view types, not markdown-only): a `.base`/PDF/
// image leaf is missed by getLeavesOfType('markdown') but found by iterateAllLeaves (controlled-session
// probe 4, 2026-06-01).
import { B64_PAYLOAD_DECODE_EXPR } from "../_shared.js";

export const JS_TEMPLATE = `(async()=>{
const a=JSON.parse(${B64_PAYLOAD_DECODE_EXPR});
let f;
if(a.path){
f=app.vault.getFiles().find(x=>x.path===a.path);
}else{
f=app.metadataCache.getFirstLinkpathDest(a.file,'');
}
if(!f)return JSON.stringify({ok:false,code:'FILE_NOT_FOUND'});
const vr=app.viewRegistry;
if(vr&&typeof vr.isExtensionRegistered==='function'&&!vr.isExtensionRegistered(f.extension))return JSON.stringify({ok:false,code:'UNSUPPORTED_FILE_TYPE',detail:f.extension});
let existing=null;
app.workspace.iterateAllLeaves(l=>{if(!existing&&l.view&&l.view.file&&l.view.file.path===f.path)existing=l;});
let placement;
if(a.new_tab){await app.workspace.openLinkText(f.path,'',true);placement='new_tab_created';}
else if(existing){app.workspace.setActiveLeaf(existing,{focus:true});placement='existing_tab_reused';}
else{await app.workspace.openLinkText(f.path,'',false);placement='active_tab_used';}
return JSON.stringify({ok:true,opened:f.path,new_tab:a.new_tab,placement});
})()`;
