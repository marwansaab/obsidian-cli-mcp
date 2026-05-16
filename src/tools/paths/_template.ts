// Original — no upstream. Frozen JS template for the `paths` eval subcommand — base64 payload anti-injection; walks `app.vault.adapter` directly via stat()/list() for missing/file/folder trichotomy + recursive DFS descent with in-eval level counter for depth bound; in-walk dotfile filter via segment-starts-with-`.` predicate; post-walk ext filter that excludes folders unconditionally when set; trailing-slash transform on folder entries; byte-asc `out.sort()` on the final string array; envelope emit branched on `payload.total` preserves cross-mode count invariant. Returns JSON-stringified envelope so the eval `=> ` prefix carries raw JSON to the handler. BI-034 (spec branch 034-fix-unicode-lookups): decode line uses the shared UTF-8-safe `B64_PAYLOAD_DECODE_EXPR` so non-ASCII folder names survive the base64 → atob round-trip.
import { B64_PAYLOAD_DECODE_EXPR } from "../_shared.js";

export const JS_TEMPLATE = `(async()=>{
const p=JSON.parse(${B64_PAYLOAD_DECODE_EXPR});
const folder=p.folder;
const depth=p.depth;
const ext=p.ext;
const total=!!p.total;
const start=(folder||'').replace(/\\/$/,'');
if(start!==''){
let s=null;
try{s=await app.vault.adapter.stat(start);}catch(e){s=null;}
if(s===null)return JSON.stringify({ok:false,code:'FOLDER_NOT_FOUND',folder:start});
if(s.type!=='folder')return JSON.stringify({ok:false,code:'NOT_A_FOLDER',folder:start});
}
const hasDot=(path)=>path.split('/').some(seg=>seg.startsWith('.'));
const out=[];
const walk=async(current,level)=>{
if(depth!==null&&level>depth)return;
const r=await app.vault.adapter.list(current);
for(const f of r.files){if(!hasDot(f))out.push({p:f,d:false});}
for(const d of r.folders){if(!hasDot(d)){out.push({p:d,d:true});await walk(d,level+1);}}
};
await walk(start,1);
let filtered=out;
if(ext!==null){
const normalised=String(ext).replace(/^\\./,'').toLowerCase();
filtered=out.filter(e=>!e.d&&e.p.toLowerCase().endsWith('.'+normalised));
}
const rendered=filtered.map(e=>e.d?(e.p+'/'):e.p);
rendered.sort();
if(total){return JSON.stringify({ok:true,count:rendered.length,paths:[]});}
return JSON.stringify({ok:true,count:rendered.length,paths:rendered});
})()`;
