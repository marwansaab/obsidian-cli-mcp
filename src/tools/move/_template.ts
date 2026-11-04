// Original — no upstream. Frozen JS template for move's blocked-destination lookup (BI-0177): base64 payload anti-injection; walks the destination folder's ancestor prefixes from the shortest through `app.vault.adapter.stat` (the disk, as the `paths` template's missing/file/folder check) and returns the first prefix that exists and is not a folder, or null as soon as a prefix is missing (no deeper one can exist) or when every prefix is a folder. JSON-stringified envelope `{ ok: true, blocker }`.
import { B64_PAYLOAD_DECODE_EXPR } from "../_shared.js";

export const BLOCKER_TEMPLATE = `(async()=>{
const p=JSON.parse(${B64_PAYLOAD_DECODE_EXPR});
let cur='';
for(const s of String(p.folder).split('/')){
cur=cur===''?s:cur+'/'+s;
let st=null;
try{st=await app.vault.adapter.stat(cur);}catch(e){st=null;}
if(st===null)return JSON.stringify({ok:true,blocker:null});
if(st.type!=='folder')return JSON.stringify({ok:true,blocker:cur});
}
return JSON.stringify({ok:true,blocker:null});
})()`;
