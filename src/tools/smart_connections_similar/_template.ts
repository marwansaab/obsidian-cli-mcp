// Original — no upstream. Frozen JS template for the eval subcommand — base64 payload anti-injection (R6); reaches the Smart Connections plugin's similarity API via app.plugins.plugins["smart-connections"].env.smart_sources.items[<sourceKey>].find_connections({limit:MAX_LIMIT}) (R2/F2); async IIFE because find_connections is async (R7/F3); seven load-bearing in-eval stages — (Stage 1) plugin-lifecycle check emitting SMART_CONNECTIONS_NOT_INSTALLED, (Stage 2) file resolution per a.active/a.path/a.file emitting NO_ACTIVE_FILE/FILE_NOT_FOUND, (Stage 3) f.extension==='md' guard emitting NOT_MARKDOWN, (Stage 4) env.smart_sources readiness check emitting SMART_CONNECTIONS_NOT_READY, (Stage 5) per-source lookup emitting SOURCE_NOT_INDEXED, (Stage 6) find_connections query for a fixed MAX_LIMIT candidates whatever the agent's limit (spec 085 FR-002) + per-match transform into {path, headingPath, score} via the shared TO_MATCH_JS, which splits the key on its first # and drops empty segments so a pre-heading block keyed `<path>#` gets headingPath [] (R7/F4/F6, frontmatter sentinel "---frontmatter---" preserved verbatim; BI-0184) + Number.isFinite score filter (R10/Q2) + source-path-keyed self-exclusion (R9/FR-010) + three-level sort score-desc/path-byte-asc/headingPath.join('#')-byte-asc (R8/FR-008), (Stage 7) a.total branch at envelope-emission preserving the cross-mode count invariant (R3/FR-006a). The slice to a.limit is the only cut, applied after the filters and the full sort, so a smaller limit is a leading slice of a larger one. BI-034 (spec branch 034-fix-unicode-lookups): decode line uses the shared UTF-8-safe `B64_PAYLOAD_DECODE_EXPR`; per ADR-014, the three lifecycle-state branches below the decode line are byte-identical pre/post-fix. The sort, the slice and the envelope (from the sort on) are the shared SORT_SLICE_AND_EMIT tail, and MAX_LIMIT is shared too, both from `../_smart-connections.ts` (spec 085).
import { B64_PAYLOAD_DECODE_EXPR } from "../_shared.js";
import { MAX_LIMIT, SORT_SLICE_AND_EMIT, TO_MATCH_JS } from "../_smart-connections.js";

export const JS_TEMPLATE = `(async()=>{
const a=JSON.parse(${B64_PAYLOAD_DECODE_EXPR});
const p=app.plugins.plugins['smart-connections'];
if(!p)return JSON.stringify({ok:false,code:'SMART_CONNECTIONS_NOT_INSTALLED',detail:'plugin not loaded in vault: '+app.vault.getName()});
let f;
if(a.active){
f=app.workspace.getActiveFile();
if(!f)return JSON.stringify({ok:false,code:'NO_ACTIVE_FILE',detail:'No note focused; switch to specific mode or focus a note.'});
}else if(a.path){
f=app.vault.getAbstractFileByPath(a.path);
if(!f)return JSON.stringify({ok:false,code:'FILE_NOT_FOUND',detail:'path: '+a.path});
}else{
f=app.metadataCache.getFirstLinkpathDest(a.file,'');
if(!f)return JSON.stringify({ok:false,code:'FILE_NOT_FOUND',detail:'wikilink: '+a.file});
}
if(f.extension!=='md')return JSON.stringify({ok:false,code:'NOT_MARKDOWN',detail:'path: '+f.path+' extension: '+f.extension});
const env=p.env;
if(!env||!env.smart_sources||typeof env.smart_sources.items!=='object'||env.smart_sources.items===null){
return JSON.stringify({ok:false,code:'SMART_CONNECTIONS_NOT_READY',detail:'env.smart_sources unavailable'});
}
const sourceKey=f.path;
const src=env.smart_sources.items[sourceKey];
if(!src||typeof src.find_connections!=='function'){
return JSON.stringify({ok:false,code:'SOURCE_NOT_INDEXED',detail:sourceKey});
}
const raw=await src.find_connections({limit:${MAX_LIMIT}});
const toMatch=${TO_MATCH_JS};
const matches=(raw||[])
.map(r=>toMatch((r.item&&r.item.key)||r.key||'',r.score))
.filter(m=>Number.isFinite(m.score))
.filter(m=>m.path!==sourceKey)
${SORT_SLICE_AND_EMIT}
})()`;
