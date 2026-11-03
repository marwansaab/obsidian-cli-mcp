// Original — no upstream. Frozen JS template for write_note's note-name lookup (BI-0176, owner ruling scope (a)). One vault-targeted eval (`vault=` on the argv, ADR-031: an eval runs in the named vault, open or closed-but-registered) resolves the `file` name the way a wikilink resolves (`getFirstLinkpathDest(name, '')`, the resolution `obsidian file` gives — live parity probe 2026-11-03) and reports the name of the vault it ran in, so the handler can confirm the lookup ran in the named vault before trusting its answer. Base64 payload anti-injection (R12).
import { B64_PAYLOAD_DECODE_EXPR } from "../_shared.js";

export const NAME_LOOKUP_TEMPLATE = `(()=>{
const a=JSON.parse(${B64_PAYLOAD_DECODE_EXPR});
const f=app.metadataCache.getFirstLinkpathDest(a.file,'');
return JSON.stringify({vault:app.vault.getName(),path:f?f.path:null});
})()`;
