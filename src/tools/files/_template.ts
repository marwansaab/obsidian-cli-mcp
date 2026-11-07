// Original — no upstream. Frozen JS template for `files`' folder check (BI-0205): run only when the CLI listed nothing for a named folder, it tells a missing folder apart from an empty one. The folder arrives in the base64 payload (anti-injection, UTF-8-safe `B64_PAYLOAD_DECODE_EXPR`), one trailing `/` is stripped (as `paths` does), and the shared `FOLDER_STAT_KIND_JS` fragment classifies it. A missing folder answers `{ok:false, code:"FOLDER_NOT_FOUND", folder}`; any existing path (a folder, or a file, which keeps today's empty answer) answers `{ok:true}`.
import { FOLDER_STAT_KIND_JS } from "../_folder-stat.js";
import { B64_PAYLOAD_DECODE_EXPR } from "../_shared.js";

export const FOLDER_CHECK_TEMPLATE = `(async()=>{
const p=JSON.parse(${B64_PAYLOAD_DECODE_EXPR});
const folder=String(p.folder).replace(/\\/$/,'');
const kind=await ${FOLDER_STAT_KIND_JS}(folder);
if(kind==='missing')return JSON.stringify({ok:false,code:'FOLDER_NOT_FOUND',folder});
return JSON.stringify({ok:true});
})()`;
