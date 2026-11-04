// Original — no upstream. Frozen JS template for move's blocked-destination lookup (BI-0177): base64 payload anti-injection; walks the destination folder's ancestor prefixes from the shortest and returns the first that `app.vault.getAbstractFileByPath` resolves to a file (an entry without `children`), or null. JSON-stringified envelope `{ ok: true, blocker }`.
import { B64_PAYLOAD_DECODE_EXPR } from "../_shared.js";

export const BLOCKER_TEMPLATE = `(()=>{
const p=JSON.parse(${B64_PAYLOAD_DECODE_EXPR});
let cur='';
for(const s of String(p.folder).split('/')){
cur=cur===''?s:cur+'/'+s;
const f=app.vault.getAbstractFileByPath(cur);
if(f!==null&&!('children' in f))return JSON.stringify({ok:true,blocker:cur});
}
return JSON.stringify({ok:true,blocker:null});
})()`;
