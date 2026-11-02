// Original — no upstream. Frozen read-back eval template for context_search (spec 088, research D1): for each [path, lines] tuple it reads the note through app.vault.cachedRead (the text Obsidian's search reads), splits it on "\n" (the CLI's line numbering, F5) and returns each requested line raw, or null past the end; a missing path or a folder is note-not-found, a rejected read is read-failed. Kept at or under 900 characters so every batch stays inside READ_BACK_CODE_MAX (F10).
import { B64_PAYLOAD_DECODE_EXPR } from "../_shared.js";

export const JS_TEMPLATE = `(async()=>{
const q=JSON.parse(${B64_PAYLOAD_DECODE_EXPR}),o=[];
for(const[p,ls]of q){
const f=app.vault.getAbstractFileByPath(p);
if(!f||f.children){o.push({path:p,state:'note-not-found'});continue;}
let c;
try{c=await app.vault.cachedRead(f);}catch(e){o.push({path:p,state:'read-failed',detail:String(e&&e.message||e)});continue;}
const a=c.split('\\n');
o.push({path:p,state:'read',lines:ls.map(n=>({line:n,raw:n>=1&&n<=a.length?a[n-1]:null}))});
}
return JSON.stringify({notes:o});
})()`;
