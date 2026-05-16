// Original — no upstream. Frozen JS template for the eval subcommand — base64 payload anti-injection (R6); reaches the Smart Connections plugin's lookup API via app.plugins.plugins["smart-connections"].env.smart_sources.lookup({hypotheticals:[a.query], filter:{limit:a.limit}, collection:"smart_blocks"}) (R2/F3); async IIFE because lookup is async; seven load-bearing in-eval stages — (Stage 1) plugin-installation check emitting SMART_CONNECTIONS_NOT_INSTALLED, (Stage 2) env.smart_sources + lookup API-shape check emitting SMART_CONNECTIONS_NOT_READY_API_MISSING (R12), (Stage 3) lookup invocation, (Stage 4) return-value sentinel check `r && r.error` emitting SMART_CONNECTIONS_NOT_READY_EMBED_FAILED (R11 — NO try/catch; lookup returns sentinels not throws per amendment 2), (Stage 5) per-match transform splitting on first # into {path, headingPath} (R7 — frontmatter sentinel "---frontmatter---" preserved verbatim) + Number.isFinite score filter (R10) + three-level sort score-desc/path-byte-asc/headingPath.join('#')-byte-asc (R8) — NO self-exclusion (R9, no source path), (Stage 6) limit slice, (Stage 7) a.total branch at envelope-emission preserving the cross-mode count invariant (R3/FR-006a). BI-034 (spec branch 034-fix-unicode-lookups): decode line uses the shared UTF-8-safe `B64_PAYLOAD_DECODE_EXPR`; per ADR-014, all stages below the decode line are byte-identical pre/post-fix.
import { B64_PAYLOAD_DECODE_EXPR } from "../_shared.js";

export const JS_TEMPLATE = `(async()=>{
const a=JSON.parse(${B64_PAYLOAD_DECODE_EXPR});
const p=app.plugins.plugins['smart-connections'];
if(!p)return JSON.stringify({ok:false,code:'SMART_CONNECTIONS_NOT_INSTALLED',detail:'plugin not loaded in vault: '+app.vault.getName()});
const env=p.env;
if(!env||!env.smart_sources||typeof env.smart_sources.lookup!=='function'){
return JSON.stringify({ok:false,code:'SMART_CONNECTIONS_NOT_READY_API_MISSING',detail:'env.smart_sources.lookup unavailable'});
}
const r=await env.smart_sources.lookup({hypotheticals:[a.query],filter:{limit:a.limit},collection:'smart_blocks'});
if(r&&typeof r.error==='string'){
return JSON.stringify({ok:false,code:'SMART_CONNECTIONS_NOT_READY_EMBED_FAILED',detail:r.error});
}
const matches=(Array.isArray(r)?r:[])
.map(m=>{
const key=m.key||'';
const hashIdx=key.indexOf('#');
const path=hashIdx===-1?key:key.slice(0,hashIdx);
const headingPath=hashIdx===-1?[]:key.slice(hashIdx+1).split('#');
return {path,headingPath,score:m.score};
})
.filter(m=>Number.isFinite(m.score))
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
