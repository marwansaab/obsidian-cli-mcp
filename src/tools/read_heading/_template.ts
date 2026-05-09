// Original — no upstream. Frozen JS template for the eval subcommand — base64 payload anti-injection (R6); pre-parsed metadataCache headings array reuse (R7); ATX-only Setext defence-in-depth filter (R14); leading-line-terminator strip per FR-010.
export const JS_TEMPLATE = `(async()=>{
const a=JSON.parse(atob('__PAYLOAD_B64__'));
let resolvedPath;
if(a.active){
const f=app.workspace.getActiveFile();
if(!f)return JSON.stringify({ok:false,code:'NO_ACTIVE_FILE',detail:'No note focused; switch to specific mode or focus a note.'});
resolvedPath=f.path;
}else if(a.path){
resolvedPath=a.path;
}else{
const dest=app.metadataCache.getFirstLinkpathDest(a.file,'');
if(!dest)return JSON.stringify({ok:false,code:'FILE_NOT_FOUND',detail:'wikilink: '+a.file});
resolvedPath=dest.path;
}
const fc=app.metadataCache.fileCache[resolvedPath];
if(!fc)return JSON.stringify({ok:false,code:'FILE_NOT_FOUND',detail:'path: '+resolvedPath});
const mc=app.metadataCache.metadataCache[fc.hash];
const allHeadings=(mc&&mc.headings)||[];
const text=await app.vault.adapter.read(resolvedPath);
const headings=allHeadings.filter(h=>text.charAt(h.position.start.offset)==='#');
const stack=[];
let matchIdx=-1;
for(let i=0;i<headings.length;i++){
const h=headings[i];
stack.length=h.level-1;
stack[h.level-1]=h.heading;
if(stack.length===a.segments.length){
let allMatch=true;
for(let j=0;j<a.segments.length;j++){
if(stack[j]!==a.segments[j]){allMatch=false;break;}
}
if(allMatch){matchIdx=i;break;}
}
}
if(matchIdx===-1)return JSON.stringify({ok:false,code:'HEADING_NOT_FOUND',detail:'segments: '+a.segments.join('::')+' not found in '+resolvedPath});
const startOffset=headings[matchIdx].position.end.offset;
const endOffset=matchIdx+1<headings.length?headings[matchIdx+1].position.start.offset:text.length;
let body=text.slice(startOffset,endOffset);
if(body.startsWith('\\r\\n'))body=body.slice(2);
else if(body.startsWith('\\n'))body=body.slice(1);
return JSON.stringify({ok:true,content:body});
})()`;
