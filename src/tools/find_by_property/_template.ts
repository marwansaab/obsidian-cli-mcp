// Original — no upstream. Frozen JS template for the find_by_property eval subcommand — base64 payload anti-injection (R6); walks `app.metadataCache.fileCache` × `app.metadataCache.metadataCache` directly; folder-prefix narrowing (trailing slash trim); per-property `eq`/`arrEq` comparators support case-sensitive / case-insensitive matching on strings and exact array equality with `arrayMatch: false` (or "any element matches" with `arrayMatch: true`); type-faithful equality on numbers/booleans/null. BI-034 (spec branch 034-fix-unicode-lookups): extracted from inlined `handler.ts` JS_TEMPLATE so the cohort layout becomes uniform (Principle I) and the decode line adopts the shared UTF-8-safe `B64_PAYLOAD_DECODE_EXPR`. BI-0181: Obsidian's metadata cache holds a note's `tags` values with or without a leading `#` depending on which path last refreshed it, so for the property `tags` only, `tg` (the interpolated `WITHOUT_TAG_HASH_JS` from `../_tag-hash.ts`, the same rule `read_property` applies) strips one leading `#` from the stored value and from the query, once each, before the unchanged `eq` / `arrEq` compare them.
import { B64_PAYLOAD_DECODE_EXPR } from "../_shared.js";
import { TAGS_PROPERTY, WITHOUT_TAG_HASH_JS } from "../_tag-hash.js";

export const JS_TEMPLATE = `(()=>{
const a=JSON.parse(${B64_PAYLOAD_DECODE_EXPR});
const m=[];
const tg=a.property===${JSON.stringify(TAGS_PROPERTY)}?${WITHOUT_TAG_HASH_JS}:(x=>x);
const q=tg(a.value);
const eq=(x,y)=>(typeof x==='string'&&typeof y==='string'&&!a.caseSensitive)?x.toLowerCase()===y.toLowerCase():x===y;
const arrEq=(x,y)=>Array.isArray(x)&&Array.isArray(y)&&x.length===y.length&&x.every((e,i)=>eq(e,y[i]));
const prefix=a.folder?a.folder.replace(/[/\\\\]+$/,'')+'/':'';
const fc=app.metadataCache.fileCache;
const mc=app.metadataCache.metadataCache;
for(const p in fc){
if(prefix&&!p.startsWith(prefix))continue;
const fm=mc[fc[p].hash]&&mc[fc[p].hash].frontmatter;
if(!fm||!(a.property in fm))continue;
const v=tg(fm[a.property]);
let hit=false;
if(Array.isArray(v)){
if(a.arrayMatch){hit=!Array.isArray(q)&&v.some(e=>eq(e,q));}
else{hit=Array.isArray(q)&&arrEq(v,q);}
}else{
hit=!Array.isArray(q)&&eq(v,q);
}
if(hit)m.push(p);
}
return JSON.stringify({count:m.length,paths:m});
})()`;
