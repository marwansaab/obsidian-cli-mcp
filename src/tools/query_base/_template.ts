// Original — no upstream. Frozen read-only eval templates for query_base's grouped views (BI-0207, owner ruling 2026-11-07). The handler sends a batch of row paths, grouped by folder as [folder, [names]] (the context_search read-back pattern), and each template returns, per path in order, the row's group value as Obsidian 1.15's Bases code builds it, typed so the handler can apply Obsidian's grouping and ordering in TypeScript, plus the locale of the collator Obsidian orders groups with.
//
// Value forms (mirrors of Obsidian's Value classes; see groups.ts): null (NullValue); {s} string-like (String, URL, Tag);
// {n} Number; {b} Boolean; {d, t, s, o} Date (epoch ms, has-time flag, Obsidian's toString, the date-only ms);
// {l, y, r} Link (target, display or null, resolved file path or null); {a: [{v, w?}]} List, `w` the raw element when
// it was a primitive or null (Obsidian compares raw elements first and prints them raw); {u} a value the handler
// cannot mirror, or 'note-not-found'.
//
// NOTE_GROUP_TEMPLATE mirrors Bi.fromFrontMatter: the frontmatter key is matched exactly, else case-insensitively; a
// `tags` key holding a string or a list of strings becomes a tag list ('#'-prefixed); a string "[[...]]" is a link, a
// date or date-time string (Obsidian's two patterns) a date, and any other string a string. FILE_GROUP_TEMPLATE
// mirrors the file properties folder (parent path, "/" at the root), ext, ctime / mtime (dates with time) and tags
// (inline tags, then the frontmatter tags trimmed, spaceless and '#'-prefixed, without repeats).
//
// Both stay short so a batch keeps a useful share of the 2,900-character eval budget (spec 088 F10). They use only the
// shared decode expression; they must not import any sibling tool module (Principle I).
import { B64_PAYLOAD_DECODE_EXPR } from "../_shared.js";

const HEAD = `const a=JSON.parse(${B64_PAYLOAD_DECODE_EXPR}),M=app.metadataCache,P=a.p;
const z=n=>String(n).padStart(2,'0'),Y=x=>String(x.getFullYear()).padStart(4,'0')+'-'+z(x.getMonth()+1)+'-'+z(x.getDate());
const D=(x,t)=>{const m=x.getTime();return m!==m?{u:'invalid-date'}:{d:m,t:!!t,s:t?Y(x)+'T'+z(x.getHours())+':'+z(x.getMinutes())+':'+z(x.getSeconds()):Y(x),o:t?new Date(Y(x)+'T00:00:00').getTime():m}};
const T=l=>({a:l.map(t=>({v:{s:t[0]==='#'?t:'#'+t}}))});`;

const TAIL = `const o=[];for(const[d,ns]of a.f)for(const n of ns){const f=app.vault.getAbstractFileByPath(d?d+'/'+n:n);o.push(!f||f.children?{u:'note-not-found'}:G(f))}
return JSON.stringify({locale:new Intl.Collator(void 0,{usage:'sort',sensitivity:'base',numeric:!0}).resolvedOptions().locale,values:o});`;

export const NOTE_GROUP_TEMPLATE = `(()=>{
${HEAD}
const S=(v,p)=>{if(v.startsWith('[[')&&v.endsWith(']]')){let n=v.slice(2,-2),y=null;const i=n.lastIndexOf('|');if(i>=0){y=n.slice(i+1);n=n.slice(0,i)}const f=M.getFirstLinkpathDest(n.split('#')[0],p);return{l:n,y,r:f?f.path:null}}
if(/^\\d{4}-\\d{2}-\\d{2}[ T]\\d{2}:\\d{2}(:\\d{2}(?:\\.\\d{1,9})?)?(Z|[+-]\\d{2}(:?\\d{2})?)?$/.test(v))return D(new Date(v),1);
return /^\\d{4}-\\d{2}-\\d{2}$/.test(v)?D(new Date(v+'T00:00:00')):{s:v}};
const V=(v,p)=>v==null?null:typeof v=='string'?S(v,p):typeof v=='number'?(isFinite(v)?{n:v}:{u:'non-finite-number'}):typeof v=='boolean'?{b:v}:Array.isArray(v)?{a:v.map(e=>e===null||/^[sbn]/.test(typeof e)?{v:V(e,p),w:e}:{v:V(e,p)})}:{u:'object'};
const G=f=>{const m=(M.getFileCache(f)||{}).frontmatter||{},k=Object.hasOwn(m,P)?P:Object.keys(m).find(x=>x.toLowerCase()===P.toLowerCase());if(k===void 0)return null;const v=m[k];
if(k.toLowerCase()==='tags'){if(typeof v=='string')return T([v]);if(Array.isArray(v)&&v.every(e=>e==null||typeof e=='string'))return v.some(e=>e==null)?{u:'tag-list-null'}:T(v)}return V(v,f.path)};
${TAIL}
})()`;

export const FILE_GROUP_TEMPLATE = `(()=>{
${HEAD}
const G=f=>{if(P==='folder')return{s:f.parent.path};if(P==='ext')return{s:f.extension};if(P==='ctime'||P==='mtime')return D(new Date(f.stat[P]),1);
const c=M.getFileCache(f),r=[];if(c){for(const t of c.tags||[])r.push(t.tag);const m=c.frontmatter;let v=null;if(m)for(const k in m)if(Object.hasOwn(m,k)&&/^tags$/i.test(k)){v=m[k];break}
const q=v?typeof v=='string'?[v.trim()]:Array.isArray(v)?v.filter(i=>typeof i=='string').map(i=>i.trim()):[]:[];for(const t of q)if(t&&!t.includes(' '))r.push(t[0]==='#'?t:'#'+t)}return T([...new Set(r)])};
${TAIL}
})()`;
