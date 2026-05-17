// Original — no upstream. Frozen JS template for the pattern_search eval subcommand — base64 payload anti-injection (R12); ECMAScript-regex evaluation via Node RegExp in the Obsidian runtime (Q1 dialect lock); .md-only file enumeration via app.vault.getMarkdownFiles() with folder-prefix filter; per-line String.prototype.matchAll iteration with zero-length match skip (R8 / Q3); 500-UTF-16-code-unit line cap with `…` (U+2026) marker (R10 / Q2); in-template truncation detection (R9); discriminated envelope { ok: true | false } with FOLDER_NOT_FOUND failure branch (R5 / T0.3).
import { B64_PAYLOAD_DECODE_EXPR } from "../_shared.js";

export const JS_TEMPLATE = `(async()=>{
const a=JSON.parse(${B64_PAYLOAD_DECODE_EXPR});
const flags=a.case_sensitive?"g":"gi";
const re=new RegExp(a.pattern,flags);
if(a.folder!==null){const s=await app.vault.adapter.stat(a.folder);if(s===null)return JSON.stringify({ok:false,code:"FOLDER_NOT_FOUND",folder:a.folder});}
const files=app.vault.getMarkdownFiles().filter(f=>a.folder===null||f.path.startsWith(a.folder+"/"));
const cap=a.limit;
const out=[];
let truncated=false;
outer: for(const f of files){
const content=await app.vault.cachedRead(f);
const lines=content.split(/\\r?\\n/);
for(let i=0;i<lines.length;i++){
const line=lines[i];
re.lastIndex=0;
let m;
while((m=re.exec(line))!==null){
if(m.index===re.lastIndex){re.lastIndex++;continue;}
if(out.length>=cap){truncated=true;break outer;}
out.push({path:f.path,line:i+1,offset:m.index,match:m[0],text:line.length>500?line.slice(0,500)+"\\u2026":line});
}
}
}
return JSON.stringify({ok:true,count:out.length,matches:out,...(truncated?{truncated:true}:{})});
})()`;
