// Original — no upstream. Frozen JS template for create_base's named-vault ITEM-FOLDER step (spec 083,
// research D5) — base64 payload anti-injection (composeEvalCode). The handler runs it in the named vault
// (invokeEval with vault=) before `base:create`, so the folder the item will land in can be
// containment-checked before anything is written (Clarifications Q1).
//
// Derivation rule: read the `.base` and take its top-level `filters` — a single scalar
// (`filters: '<expr>'`) or a block `and:` list whose direct string entries are the candidates. When
// exactly one candidate is `file.inFolder("<f>")` (single or double quotes) the folder is `<f>`.
// Otherwise the folder is the vault's new-note parent (`getNewFileParent`), with the root `/`
// normalised to "". A missing path or a folder yields {ok:false, code:'BASE_NOT_FOUND'}.
//
// The eval context has no YAML parser (T040: `parseYaml` and `require('obsidian')` are both
// unavailable), so the template scans the block-style YAML Obsidian itself writes; a shape it does
// not recognise (flow style, `or`/`not` groups) takes the new-note branch. The handler's
// post-creation check backstops anything this mirror gets wrong (Clarifications Q4).
//
// It uses only the shared decode expression; it must not import any sibling tool module (Principle I).
import { B64_PAYLOAD_DECODE_EXPR } from "../_shared.js";

export const ITEM_FOLDER_TEMPLATE = `(async()=>{
const a=JSON.parse(${B64_PAYLOAD_DECODE_EXPR});
const f=app.vault.getAbstractFileByPath(a.path);
if(!f||f.extension===undefined)return JSON.stringify({ok:false,code:'BASE_NOT_FOUND'});
let folder=null;
try{
const L=(await app.vault.cachedRead(f)).replace(/\\r/g,'').split('\\n');
const blank=l=>/^\\s*(#.*)?$/.test(l);
const str=v=>{v=v.trim();if(/^'.*'$/.test(v))return v.slice(1,-1).replace(/''/g,"'");if(/^".*"$/.test(v))return JSON.parse(v);return /^[[{]|:\\s|:$/.test(v)?null:v;};
const list=[];
const i=L.findIndex(l=>/^filters:/.test(l));
if(i>=0){const head=L[i].slice('filters:'.length).trim();
if(head&&!blank(head))list.push(str(head));
else{let j=i+1;while(j<L.length&&blank(L[j]))j++;const and=/^(\\s+)and:\\s*$/.exec(L[j]||'');
if(and){const top=and[1].length;let ind=-1;
for(let k=j+1;k<L.length;k++){if(blank(L[k]))continue;const m=/^(\\s*)(-\\s+)?(.*)$/.exec(L[k]);const n=m[1].length;
if(n<top||(n===top&&!m[2]))break;if(ind<0)ind=n;if(n===ind&&m[2])list.push(str(m[3]));}}}}
const m=list.filter(e=>typeof e==='string').map(e=>/^\\s*file\\.inFolder\\(\\s*(["'])(.*)\\1\\s*\\)\\s*$/.exec(e)).filter(Boolean);
if(m.length===1)folder=m[0][2];
}catch(e){}
if(folder===null){const p=app.fileManager.getNewFileParent(f.path).path;folder=p==='/'?'':p;}
return JSON.stringify({ok:true,folder});
})()`;
