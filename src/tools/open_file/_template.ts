// Original — no upstream. Frozen JS template for the eval subcommand (BI-057) — base64 payload
// anti-injection (R12); single block-body async IIFE folds the focused-vault guard + locator
// resolution + viewRegistry type-check + openLinkText into ONE eval (R2), eliminating the
// guard→open TOCTOU window. Eval-composition layer reaches Obsidian core API (app.vault /
// app.metadataCache / app.viewRegistry / app.workspace) the same way write_note's open eval
// does (ADR-009 lineage). Byte-identical in convention to backlinks/_template.ts &
// links/_template.ts — frozen string, async because step 4 awaits openLinkText.
//
// T0 (research R7 — reconciled at T020 against the authorised test vault):
//   - viewRegistry method name: candidate `isExtensionRegistered(ext)`; if absent the guard
//     no-ops (open proceeds) rather than fabricating UNSUPPORTED_FILE_TYPE.
//   - openLinkText vs getLeaf().openFile dedup: confirm (path,"",false) focuses an existing
//     leaf with no duplicate and (path,"",true) always opens a fresh leaf.
//   - basePath normalisation: confirm app.vault.adapter.basePath vs resolveVaultPath shape on
//     Windows; the norm() below folds separators always and case-folds only drive-letter paths.
//   - getFirstLinkpathDest: confirm bare-name resolution INCLUDING non-markdown attachments.
import { B64_PAYLOAD_DECODE_EXPR } from "../_shared.js";

export const JS_TEMPLATE = `(async()=>{
const a=JSON.parse(${B64_PAYLOAD_DECODE_EXPR});
const norm=s=>{let r=String(s).split('\\\\').join('/');if(r.endsWith('/'))r=r.slice(0,-1);return /^[A-Za-z]:/.test(r)?r.toLowerCase():r;};
if(norm(app.vault.adapter.basePath)!==norm(a.expectedBase))return JSON.stringify({ok:false,code:'VAULT_NOT_FOCUSED'});
let f;
if(a.path){
f=app.vault.getFiles().find(x=>x.path===a.path);
}else{
f=app.metadataCache.getFirstLinkpathDest(a.file,'');
}
if(!f)return JSON.stringify({ok:false,code:'FILE_NOT_FOUND',detail:a.path||a.file});
const vr=app.viewRegistry;
if(vr&&typeof vr.isExtensionRegistered==='function'&&!vr.isExtensionRegistered(f.extension))return JSON.stringify({ok:false,code:'UNSUPPORTED_FILE_TYPE',detail:f.extension});
await app.workspace.openLinkText(f.path,'',a.new_tab);
return JSON.stringify({ok:true,opened:f.path,new_tab:a.new_tab});
})()`;
