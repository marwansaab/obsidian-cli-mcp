// Original — no upstream. The one "did the open land?" wait, shared by the eval templates that open a file and
// then need it to be Obsidian's active file: views_base's `FOCUS_BASE_TEMPLATE` (BI-0179) and open_file's
// `JS_TEMPLATE` (BI-0189). Resolving `openLinkText` (or calling `setActiveLeaf`) proves nothing, so the template
// polls every 50 ms, up to 20 times (1 s, well inside the 10 s dispatch timeout), until the file is the active
// file by object identity, never by path text. It never retries the open. Each template writes its own miss
// envelope after it.

/**
 * In-eval JavaScript statements, interpolated in place inside a template's async IIFE. Expects the opened file
 * in `f`. Leaves the active file after the wait in `g` (`g!==f` means the open did not land).
 */
export const AWAIT_ACTIVE_FILE_JS = `for(let i=0;i<20&&app.workspace.getActiveFile()!==f;i++)await new Promise(r=>setTimeout(r,50));
const g=app.workspace.getActiveFile();`;
