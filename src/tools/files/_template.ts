// Original — no upstream. Frozen JS template for `files`' folder check (BI-0205): run only when the CLI listed nothing for a named folder, it tells a missing folder apart from an empty one. The folder arrives in the base64 payload (anti-injection, UTF-8-safe `B64_PAYLOAD_DECODE_EXPR`), already normalised by the handler, and the template answers the shared `FOLDER_STAT_KIND_JS` fragment's fact as `{kind: "missing" | "file" | "folder"}`; the handler decides what each kind means.
import { FOLDER_STAT_KIND_JS } from "../_folder-stat.js";
import { B64_PAYLOAD_DECODE_EXPR } from "../_shared.js";

export const FOLDER_CHECK_TEMPLATE = `(async()=>{
const p=JSON.parse(${B64_PAYLOAD_DECODE_EXPR});
return JSON.stringify({kind:await ${FOLDER_STAT_KIND_JS}(p.folder)});
})()`;
