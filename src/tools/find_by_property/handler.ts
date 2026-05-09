// Original — no upstream. find_by_property handler: single invokeCli wrapper around the eval subcommand with a frozen JS template + base64 payload (R6 anti-injection); two-stage response parse (=> prefix strip + JSON.parse + output schema validate); R4 target_mode mapping (vault undefined → active, vault set → specific); count/paths invariant defensive check.
import { findByPropertyOutputSchema, type FindByPropertyInput, type FindByPropertyOutput } from "./schema.js";
import { invokeCli, type SpawnLike } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../../errors.js";

import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";

export interface ExecuteDeps {
  logger: Logger;
  queue: Queue;
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
}

const JS_TEMPLATE = `(()=>{
const a=JSON.parse(atob('__PAYLOAD_B64__'));
const m=[];
const eq=(x,y)=>(typeof x==='string'&&typeof y==='string'&&!a.caseSensitive)?x.toLowerCase()===y.toLowerCase():x===y;
const arrEq=(x,y)=>Array.isArray(x)&&Array.isArray(y)&&x.length===y.length&&x.every((e,i)=>eq(e,y[i]));
const prefix=a.folder?a.folder.replace(/[/\\\\]+$/,'')+'/':'';
const fc=app.metadataCache.fileCache;
const mc=app.metadataCache.metadataCache;
for(const p in fc){
if(prefix&&!p.startsWith(prefix))continue;
const fm=mc[fc[p].hash]&&mc[fc[p].hash].frontmatter;
if(!fm||!(a.property in fm))continue;
const v=fm[a.property];
let hit=false;
if(Array.isArray(v)){
if(a.arrayMatch){hit=!Array.isArray(a.value)&&v.some(e=>eq(e,a.value));}
else{hit=Array.isArray(a.value)&&arrEq(v,a.value);}
}else{
hit=!Array.isArray(a.value)&&eq(v,a.value);
}
if(hit)m.push(p);
}
return JSON.stringify({count:m.length,paths:m});
})()`;

export async function executeFindByProperty(
  input: FindByPropertyInput,
  deps: ExecuteDeps,
): Promise<FindByPropertyOutput> {
  const payloadJson = JSON.stringify({
    property: input.property,
    value: input.value,
    folder: input.folder ?? "",
    arrayMatch: input.arrayMatch,
    caseSensitive: input.caseSensitive,
  });
  const payloadB64 = Buffer.from(payloadJson, "utf-8").toString("base64");
  const code = JS_TEMPLATE.replace("__PAYLOAD_B64__", payloadB64);

  const target_mode = input.vault === undefined ? "active" : "specific";
  const result = await invokeCli(
    {
      command: "eval",
      vault: input.vault,
      parameters: { code },
      flags: [],
      target_mode,
    },
    { spawnFn: deps.spawnFn, env: deps.env, logger: deps.logger, queue: deps.queue },
  );

  let stdout = result.stdout.trimStart();
  if (stdout.startsWith("=> ")) stdout = stdout.slice(3);

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(stdout);
  } catch (err) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: err,
      details: { stdout: result.stdout, stage: "json-parse" },
      message: `find_by_property: eval response is not JSON: ${result.stdout.slice(0, 200)}`,
    });
  }

  const validated = findByPropertyOutputSchema.safeParse(parsedJson);
  if (!validated.success) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: validated.error,
      details: { stdout: result.stdout, stage: "schema-parse" },
      message: "find_by_property: eval response shape unexpected",
    });
  }

  if (validated.data.count !== validated.data.paths.length) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: null,
      details: { stdout: result.stdout, stage: "count-paths-mismatch" },
      message: "find_by_property: count !== paths.length (JS template invariant violation)",
    });
  }

  return validated.data;
}
