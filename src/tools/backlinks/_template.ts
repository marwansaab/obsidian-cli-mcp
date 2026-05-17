// Original — no upstream. Frozen JS template for the eval subcommand — base64 payload anti-injection (R12); reads app.metadataCache.getBacklinksForFile(file) via the CustomArrayDict's `.keys()` / `.get(p)` method surface (the dict's `.data` property is empty at this Obsidian release — verified by T0 probe F3 2026-05-17, deviation noted in research.md § T0 Live-CLI Capture); .md-only source-corpus post-filter (R3 per the 2026-05-17 Q2 clarification); per-source aggregation length under with_counts; cap-and-truncated handling with total-mode cap-bypass per the 2026-05-17 Q1 clarification (R9); UTF-16 source-path sort (R10).
import { B64_PAYLOAD_DECODE_EXPR } from "../_shared.js";

export const JS_TEMPLATE = `(()=>{
const a=JSON.parse(${B64_PAYLOAD_DECODE_EXPR});
let f;
if(a.active){
f=app.workspace.getActiveFile();
if(!f)return JSON.stringify({ok:false,code:'NO_ACTIVE_FILE',detail:'No note focused; switch to specific mode or focus a note.'});
}else if(a.path){
f=app.vault.getFiles().find(x=>x.path===a.path);
if(!f)return JSON.stringify({ok:false,code:'FILE_NOT_FOUND',detail:'path: '+a.path});
}else{
f=app.metadataCache.getFirstLinkpathDest(a.file,'');
if(!f)return JSON.stringify({ok:false,code:'FILE_NOT_FOUND',detail:'wikilink: '+a.file});
}
if(f.extension!=='md')return JSON.stringify({ok:false,code:'NOT_MARKDOWN',detail:'path: '+f.path+' extension: '+f.extension});
const dict=app.metadataCache.getBacklinksForFile(f);
const allKeys=(dict&&typeof dict.keys==='function')?(dict.keys()||[]):[];
const sources=allKeys.filter(p=>typeof p==='string'&&p.toLowerCase().endsWith('.md')).sort();
const preCapCount=sources.length;
const cap=a.total?preCapCount:(a.limit||1000);
const slice=sources.slice(0,cap);
const entries=slice.map(p=>{const e={source:p};if(a.with_counts){const arr=(typeof dict.get==='function')?(dict.get(p)||[]):[];e.count=arr.length;}return e;});
const env={ok:true,count:a.total?preCapCount:entries.length,backlinks:a.total?[]:entries};
if(!a.total&&preCapCount>cap)env.truncated=true;
return JSON.stringify(env);
})()`;
