/* Probe upstream Obsidian CLI for file-based / stdin-based content input.
   Direct child_process.spawn — same shape the wrapper uses (shell:false, windowsHide:true). */
'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const OBS = 'C:\\Program Files\\Obsidian\\obsidian.exe';
const VAULT_NAME = 'TestVault-Obsidian-CLI-MCP';
const VAULT_ROOT = 'C:\\Marwan-Saab-ADO\\Marwan at Metcash\\Obsidian\\TestVault-Obsidian-CLI-MCP';
const SANDBOX_REL = 'Sandbox/upstream-file-input';
const SANDBOX_ABS = path.join(VAULT_ROOT, SANDBOX_REL.replace(/\//g, path.sep));
const PAYLOAD_REL = `${SANDBOX_REL}/payload.txt`;
const PAYLOAD_ABS = path.join(SANDBOX_ABS, 'payload.txt');
const PAYLOAD_TEXT = 'hello from temp file 12345';
const BASE_TEXT = 'BASE_CONTENT_MARKER\n';

fs.mkdirSync(SANDBOX_ABS, { recursive: true });
fs.writeFileSync(PAYLOAD_ABS, PAYLOAD_TEXT, 'utf8');

const ts = Date.now();
let probeId = 0;
const results = [];

function runProbe({ label, subcommand, args, stdinPayload }) {
  return new Promise((resolve) => {
    probeId += 1;
    const id = String(probeId).padStart(2, '0');
    const targetRel = `${SANDBOX_REL}/probe-${id}-${subcommand}-${ts}.md`;
    const targetAbs = path.join(SANDBOX_ABS, `probe-${id}-${subcommand}-${ts}.md`);

    // For prepend / append, pre-stage the target with BASE_TEXT.
    // For create, do NOT pre-stage (the cmd creates it). For create, the target uses name=/path= not path= for write target.
    if (subcommand === 'prepend' || subcommand === 'append') {
      fs.writeFileSync(targetAbs, BASE_TEXT, 'utf8');
    } else if (subcommand === 'create') {
      // Ensure absent
      try { fs.unlinkSync(targetAbs); } catch (_) {}
    }

    // Build argv: replace token __TARGET__ with the targetRel path.
    const resolvedArgs = args.map((a) => a.replace('__TARGET__', targetRel));

    const start = Date.now();
    const child = spawn(OBS, resolvedArgs, {
      shell: false,
      windowsHide: true,
      stdio: stdinPayload === undefined ? ['ignore', 'pipe', 'pipe'] : ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString('utf8'); });
    child.stderr.on('data', (d) => { stderr += d.toString('utf8'); });

    if (stdinPayload !== undefined) {
      child.stdin.write(stdinPayload, 'utf8');
      child.stdin.end();
    }

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
    }, 15000);

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      const duration = Date.now() - start;
      let postContent = null;
      let postSize = null;
      try {
        postContent = fs.readFileSync(targetAbs, 'utf8');
        postSize = fs.statSync(targetAbs).size;
      } catch (e) {
        postContent = `<file absent: ${e.code}>`;
      }
      results.push({
        id,
        label,
        subcommand,
        argv: resolvedArgs,
        stdinUsed: stdinPayload !== undefined,
        stdinPayload: stdinPayload ?? null,
        exitCode: code,
        signal,
        duration_ms: duration,
        stdout: stdout.slice(0, 400),
        stderr: stderr.slice(0, 400),
        postSize,
        postContent: postContent === null ? null : postContent.slice(0, 400),
      });
      resolve();
    });
  });
}

async function main() {
  // ---------- prepend probes ----------

  // 1: content-file=<rel-path>
  await runProbe({
    label: 'content-file=<path>',
    subcommand: 'prepend',
    args: [`vault=${VAULT_NAME}`, 'prepend', `path=__TARGET__`, `content-file=${PAYLOAD_REL}`],
  });

  // 2: content_file=<path>
  await runProbe({
    label: 'content_file=<path>',
    subcommand: 'prepend',
    args: [`vault=${VAULT_NAME}`, 'prepend', `path=__TARGET__`, `content_file=${PAYLOAD_REL}`],
  });

  // 3: contentFile=<path>
  await runProbe({
    label: 'contentFile=<path>',
    subcommand: 'prepend',
    args: [`vault=${VAULT_NAME}`, 'prepend', `path=__TARGET__`, `contentFile=${PAYLOAD_REL}`],
  });

  // 4: --content-file=<path>
  await runProbe({
    label: '--content-file=<path>',
    subcommand: 'prepend',
    args: [`vault=${VAULT_NAME}`, 'prepend', `path=__TARGET__`, `--content-file=${PAYLOAD_REL}`],
  });

  // 5: --content-file <path> (two-arg)
  await runProbe({
    label: '--content-file <path>',
    subcommand: 'prepend',
    args: [`vault=${VAULT_NAME}`, 'prepend', `path=__TARGET__`, `--content-file`, PAYLOAD_REL],
  });

  // 6: @filename syntax
  await runProbe({
    label: 'content=@<path>',
    subcommand: 'prepend',
    args: [`vault=${VAULT_NAME}`, 'prepend', `path=__TARGET__`, `content=@${PAYLOAD_REL}`],
  });

  // 7: stdin, no content arg
  await runProbe({
    label: 'stdin (no content arg)',
    subcommand: 'prepend',
    args: [`vault=${VAULT_NAME}`, 'prepend', `path=__TARGET__`],
    stdinPayload: PAYLOAD_TEXT,
  });

  // 8: content=- with stdin
  await runProbe({
    label: 'content=- + stdin',
    subcommand: 'prepend',
    args: [`vault=${VAULT_NAME}`, 'prepend', `path=__TARGET__`, `content=-`],
    stdinPayload: PAYLOAD_TEXT,
  });

  // 9: content= empty with stdin
  await runProbe({
    label: 'content= (empty) + stdin',
    subcommand: 'prepend',
    args: [`vault=${VAULT_NAME}`, 'prepend', `path=__TARGET__`, `content=`],
    stdinPayload: PAYLOAD_TEXT,
  });

  // 10: file=<wikilink-name> + content-file=<path>
  // First create a probe target by wikilink name
  const wikilinkName = `probe-wikilink-${ts}`;
  const wikilinkAbs = path.join(SANDBOX_ABS, `${wikilinkName}.md`);
  fs.writeFileSync(wikilinkAbs, BASE_TEXT, 'utf8');
  await runProbe({
    label: 'file=<wikilink> + content-file=<path>',
    subcommand: 'prepend',
    args: [`vault=${VAULT_NAME}`, 'prepend', `file=${wikilinkName}`, `content-file=${PAYLOAD_REL}`],
  });

  // ---------- append probes ----------

  await runProbe({
    label: 'content-file=<path>',
    subcommand: 'append',
    args: [`vault=${VAULT_NAME}`, 'append', `path=__TARGET__`, `content-file=${PAYLOAD_REL}`],
  });

  await runProbe({
    label: 'content=@<path>',
    subcommand: 'append',
    args: [`vault=${VAULT_NAME}`, 'append', `path=__TARGET__`, `content=@${PAYLOAD_REL}`],
  });

  await runProbe({
    label: 'stdin (no content arg)',
    subcommand: 'append',
    args: [`vault=${VAULT_NAME}`, 'append', `path=__TARGET__`],
    stdinPayload: PAYLOAD_TEXT,
  });

  await runProbe({
    label: 'content=- + stdin',
    subcommand: 'append',
    args: [`vault=${VAULT_NAME}`, 'append', `path=__TARGET__`, `content=-`],
    stdinPayload: PAYLOAD_TEXT,
  });

  // ---------- create probes ----------
  // create uses name=/path= for target — content goes via content=<text>
  await runProbe({
    label: 'content-file=<path>',
    subcommand: 'create',
    args: [`vault=${VAULT_NAME}`, 'create', `path=__TARGET__`, `content-file=${PAYLOAD_REL}`],
  });

  await runProbe({
    label: 'content=@<path>',
    subcommand: 'create',
    args: [`vault=${VAULT_NAME}`, 'create', `path=__TARGET__`, `content=@${PAYLOAD_REL}`],
  });

  await runProbe({
    label: 'stdin (no content arg)',
    subcommand: 'create',
    args: [`vault=${VAULT_NAME}`, 'create', `path=__TARGET__`],
    stdinPayload: PAYLOAD_TEXT,
  });

  await runProbe({
    label: 'content=- + stdin',
    subcommand: 'create',
    args: [`vault=${VAULT_NAME}`, 'create', `path=__TARGET__`, `content=-`],
    stdinPayload: PAYLOAD_TEXT,
  });

  // ---------- baseline sanity: content=<text> works ----------
  await runProbe({
    label: 'BASELINE content=<text>',
    subcommand: 'prepend',
    args: [`vault=${VAULT_NAME}`, 'prepend', `path=__TARGET__`, `content=BASELINE_PREPEND_OK\n`],
  });

  // Emit JSON
  process.stdout.write(JSON.stringify(results, null, 2));
}

main().catch((e) => {
  process.stderr.write(`FATAL: ${e.stack || e.message}\n`);
  process.exit(2);
});
