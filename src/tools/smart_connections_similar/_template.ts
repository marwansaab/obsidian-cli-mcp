// Original — no upstream. Frozen JS template for the eval subcommand — base64 payload anti-injection (R6); reaches the Smart Connections plugin's similarity API via app.plugins.plugins["smart-connections"].env.smart_sources.items[<sourceKey>].find_connections({limit}) (R2/F2); async IIFE because find_connections is async (R7/F3); seven load-bearing in-eval stages — (Stage 1) plugin-lifecycle check emitting SMART_CONNECTIONS_NOT_INSTALLED, (Stage 2) file resolution per a.active/a.path/a.file emitting NO_ACTIVE_FILE/FILE_NOT_FOUND, (Stage 3) f.extension==='md' guard emitting NOT_MARKDOWN, (Stage 4) env.smart_sources readiness check emitting SMART_CONNECTIONS_NOT_READY, (Stage 5) per-source lookup emitting SOURCE_NOT_INDEXED, (Stage 6) find_connections query + per-match transform splitting on first # into {path, headingPath} (R7/F4/F6, frontmatter sentinel "---frontmatter---" preserved verbatim) + Number.isFinite score filter (R10/Q2) + source-path-keyed self-exclusion (R9/FR-010) + three-level sort score-desc/path-byte-asc/headingPath.join('#')-byte-asc (R8/FR-008), (Stage 7) a.total branch at envelope-emission preserving the cross-mode count invariant (R3/FR-006a). Slice to a.limit applied after transforms in case the plugin's internal cap exceeds the request limit. BI-034 (spec branch 034-fix-unicode-lookups): decode line uses the shared UTF-8-safe `B64_PAYLOAD_DECODE_EXPR`; per ADR-014, the three lifecycle-state branches below the decode line are byte-identical pre/post-fix.
import { B64_PAYLOAD_DECODE_EXPR } from "../_shared.js";

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
const raw=await src.find_connections({limit:a.limit});
const matches=(raw||[])
.map(r=>{
const key=(r.item&&r.item.key)||r.key||'';
const hashIdx=key.indexOf('#');
const path=hashIdx===-1?key:key.slice(0,hashIdx);
const headingPath=hashIdx===-1?[]:key.slice(hashIdx+1).split('#');
return {path,headingPath,score:r.score};
})
.filter(m=>Number.isFinite(m.score))
.filter(m=>m.path!==sourceKey)
.sort((x,y)=>{
if(x.score!==y.score)return y.score-x.score;
if(x.path!==y.path)return x.path<y.path?-1:1;
const xh=x.headingPath.join('#'),yh=y.headingPath.join('#');
return xh<yh?-1:xh>yh?1:0;
})
.slice(0,a.limit);
const count=matches.length;
return JSON.stringify({ok:true,count,matches:a.total===true?[]:matches});
})()`;
