// Original — no upstream. Shared by the two Smart Connections tools (smart_connections_query, smart_connections_similar), which publish one ordering contract (spec 085 contracts/ordering-contract.md): MAX_LIMIT is both the `limit` maximum and the fixed number of candidates each eval template asks the plugin for (FR-002), and SORT_SLICE_AND_EMIT is the eval-template tail that sorts, cuts to a.limit and emits the ok envelope. Each template interpolates the tail after its own transform and filters, so the rendered templates are byte-identical to the per-tool copies they replace.

// The `limit` maximum, and the number of candidates each eval template always asks the plugin for (spec 085 FR-002).
export const MAX_LIMIT = 100;

// Continues a `matches` array expression inside an eval template: sorts it score-desc / path byte-asc /
// headingPath.join('#') byte-asc (R8), then `.slice(0,a.limit)` — the only cut to a.limit, applied after
// the full sort, so a smaller limit is a leading slice of a larger one — and returns the ok envelope,
// with `matches: []` when a.total is true (R3/FR-006a cross-mode count invariant).
export const SORT_SLICE_AND_EMIT = `.sort((x,y)=>{
if(x.score!==y.score)return y.score-x.score;
if(x.path!==y.path)return x.path<y.path?-1:1;
const xh=x.headingPath.join('#'),yh=y.headingPath.join('#');
return xh<yh?-1:xh>yh?1:0;
})
.slice(0,a.limit);
const count=matches.length;
return JSON.stringify({ok:true,count,matches:a.total===true?[]:matches});`;
