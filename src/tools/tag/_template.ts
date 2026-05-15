// Original — no upstream. Frozen JS template for the eval subcommand — base64 payload anti-injection (R6 / FR-020); walks `app.metadataCache.fileCache` × `app.metadataCache.metadataCache` directly (NOT a plugin API; sixth member of the eval-driven typed-tool cohort and the first core-metadataCache tag-index primitive); ASCII lower-fold inside the template (FR-008 / R14 amendment 1 — Obsidian's native `tag` subcommand is case-sensitive, contradicting Q1 defer-to-upstream); segment-bounded `isMatch` predicate (`tagLower === q || tagLower.startsWith(q + "/")`) enforces FR-016 child-tag subsumption + leaf-precision + substring-prefix rejection; per-path Set de-duplicates same-tag-multiple-occurrences (FR-007); `.md`-only filter (Obsidian tag cache indexes Markdown only); wrapper-side byte-asc `out.sort()` (R8 / FR-013 / Q5); envelope emit branched on `wantTotal` preserves cross-mode count invariant (FR-019).
export const JS_TEMPLATE = `(()=>{
const payload=JSON.parse(atob('__PAYLOAD_B64__'));
const q=String(payload.query).toLowerCase();
const wantTotal=!!payload.total;
const fc=app.metadataCache.fileCache;
const mc=app.metadataCache.metadataCache;
const normTag=(t)=>{let s=String(t);if(s.charCodeAt(0)===35)s=s.slice(1);return s.toLowerCase();};
const isMatch=(tagLower)=>tagLower===q||tagLower.startsWith(q+'/');
const out=[];
for(const path of Object.keys(fc)){
if(!path.endsWith('.md'))continue;
const m=mc[fc[path].hash];
if(!m)continue;
const seen=new Set();
if(Array.isArray(m.tags)){
for(const t of m.tags){
if(t&&typeof t.tag==='string')seen.add(normTag(t.tag));
}
}
if(m.frontmatter&&Array.isArray(m.frontmatter.tags)){
for(const t of m.frontmatter.tags){
if(typeof t==='string')seen.add(normTag(t));
}
}
let matched=false;
for(const n of seen){
if(isMatch(n)){matched=true;break;}
}
if(matched)out.push(path);
}
out.sort();
if(wantTotal){
return JSON.stringify({ok:true,mode:'count-only',total:out.length});
}
return JSON.stringify({ok:true,mode:'default',count:out.length,paths:out});
})()`;
