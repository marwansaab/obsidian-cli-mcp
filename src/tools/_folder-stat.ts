// Original — no upstream. The one in-eval rule for "is this vault path missing, a file, or a folder?" (refactor rule: folder-type questions are answered from `app.vault.adapter.stat` → `type`, as `paths` and `pattern_search` do). A `stat` that answers `null` or throws counts as missing, `type: "folder"` is a folder, any other type is a file. `files`' folder check (BI-0205) interpolates it; `paths/_template.ts` and `pattern_search/_template.ts` still carry their own inline checks (the BI-0204 follow-up moves them onto this fragment).

/**
 * In-eval JavaScript source: an async function expression `(path) => Promise<"missing" | "file" | "folder">`.
 * Reads the `app` global, so it runs only inside an eval template (or a vm context that supplies `app`).
 */
export const FOLDER_STAT_KIND_JS =
  "(async p=>{let s=null;try{s=await app.vault.adapter.stat(p);}catch(e){s=null;}return s===null?'missing':s.type==='folder'?'folder':'file';})";
