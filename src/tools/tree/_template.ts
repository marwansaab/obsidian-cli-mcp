// Original — no upstream. Frozen JS template for the `tree` eval subcommand — base64 payload anti-injection (R6 / FR-020); walks `app.vault.adapter` directly via stat()/list() for missing/file/folder trichotomy (R7) + recursive DFS descent (R8) with in-eval level counter for depth bound (R9); in-walk dotfile filter via segment-starts-with-`.` predicate (R12 / FR-027); post-walk ext filter that excludes folders unconditionally when set (R11 / FR-007 / FR-028); trailing-slash transform on folder entries (R10 / FR-028); byte-asc `out.sort()` on the final string array (R13 / FR-013); envelope emit branched on `payload.total` preserves cross-mode count invariant (R3 / FR-008). Returns JSON-stringified envelope so the eval `=> ` prefix carries raw JSON to the handler.
export const JS_TEMPLATE = `(async()=>{
const p=JSON.parse(atob('__PAYLOAD_B64__'));
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
