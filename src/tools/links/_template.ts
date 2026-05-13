// Original — no upstream. Frozen JS template for the eval subcommand — base64 payload anti-injection (R6); reads app.metadataCache.getFileCache(file).{links,embeds,frontmatterLinks} (R2/F2); three load-bearing transforms — kind synthesis from origin-array + `original` prefix (F4), 0-based-to-1-based line conversion with synthetic line=1 for frontmatter entries (F3/F5), displayText omit-when-equal (F6/Q1); source-order sort with intra-line `_col`-ascending tiebreak, `_col` stripped before emission (Q5); in-eval `f.extension==='md'` rejection guard for non-Markdown targets (F9); `a.total` branch at envelope-emission preserves cross-mode invariant (R3/R11/FR-005a).
export const JS_TEMPLATE = `(()=>{
const a=JSON.parse(atob('__PAYLOAD_B64__'));
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
const c=app.metadataCache.getFileCache(f)||{};
const wrap=function(e,kindOf,lineOf){
const o={target:e.link,line:lineOf(e),_col:(e.position&&e.position.start.col)||0,kind:kindOf(e)};
if(e.displayText!==e.link)o.displayText=e.displayText;
return o;
};
const entries=[]
.concat((c.frontmatterLinks||[]).map(e=>wrap(e,()=>'wikilink',()=>1)))
.concat((c.links||[]).map(e=>wrap(e,x=>x.original.startsWith('[[')?'wikilink':'markdown',x=>x.position.start.line+1)))
.concat((c.embeds||[]).map(e=>wrap(e,()=>'embed',x=>x.position.start.line+1)));
entries.sort((x,y)=>x.line-y.line||x._col-y._col);
const out=entries.map(({_col,...rest})=>rest);
return JSON.stringify({ok:true,count:out.length,links:a.total?[]:out});
})()`;
