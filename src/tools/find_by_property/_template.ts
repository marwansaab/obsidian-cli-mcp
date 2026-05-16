// Original — no upstream. Frozen JS template for the find_by_property eval subcommand — base64 payload anti-injection (R6); walks `app.metadataCache.fileCache` × `app.metadataCache.metadataCache` directly; folder-prefix narrowing (trailing slash trim); per-property `eq`/`arrEq` comparators support case-sensitive / case-insensitive matching on strings and exact array equality with `arrayMatch: false` (or "any element matches" with `arrayMatch: true`); type-faithful equality on numbers/booleans/null. BI-034 (spec branch 034-fix-unicode-lookups): extracted from inlined `handler.ts` JS_TEMPLATE so the cohort layout becomes uniform (Principle I) and the decode line adopts the shared UTF-8-safe `B64_PAYLOAD_DECODE_EXPR`.
import { B64_PAYLOAD_DECODE_EXPR } from "../_shared.js";

export const JS_TEMPLATE = `(()=>{
const a=JSON.parse(${B64_PAYLOAD_DECODE_EXPR});
const m=[];
const eq=(x,y)=>(typeof x==='string'&&typeof y==='string'&&!a.caseSensitive)?x.toLowerCase()===y.toLowerCase():x===y;
const arrEq=(x,y)=>Array.isArray(x)&&Array.isArray(y)&&x.length===y.length&&x.every((e,i)=>eq(e,y[i]));
const prefix=a.folder?a.folder.replace(/[/\\\\]+$/,'')+'/':'';
const fc=app.metadataCache.fileCache;
const mc=app.metadataCache.metadataCache;
for(const p in fc){
if(prefix&&!p.startsWith(prefix))continue;
const fm=mc[fc[p].hash]&&mc[fc[p].hash].frontmatter;
if(!fm||!(a.property in fm))continue;
const v=fm[a.property];
let hit=false;
if(Array.isArray(v)){
if(a.arrayMatch){hit=!Array.isArray(a.value)&&v.some(e=>eq(e,a.value));}
else{hit=Array.isArray(a.value)&&arrEq(v,a.value);}
}else{
hit=!Array.isArray(a.value)&&eq(v,a.value);
}
if(hit)m.push(p);
}
return JSON.stringify({count:m.length,paths:m});
})()`;
