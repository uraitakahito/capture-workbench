/**
 * 検査が読むファイル —— **git が repo の中身と見なす物全部**: 追跡しているファイルと、まだ add して
 * いない新しいファイル（ignore されている物は除く）。
 *
 * 以前の検査は `git ls-files`（追跡している物だけ）で読んでいた。CI は毎回まっさらに checkout するので
 * 未追跡のファイルは在らず、この穴は CI には出ない —— **手元では緑、commit した後の CI で赤**の形で出る。
 * CAPTURE-49 で、新しい試験の注記の語が commit するまで `check:terms` を素通りした（2026-09-13 の教訓で
 * 「走査は `--cached --others --exclude-standard`」と決めてあり、ほかの repo でも 2 度落ちていた）。
 *
 * **`-z` で読む。** git の既定（`core.quotepath=true`。CI の runner も）は ASCII でない名前を引用符つきで
 * 出すので、改行で切ると手元に無いファイルとして黙って飛ばしてしまう。消したファイル（追跡していて手元に
 * 無い物）は返さない。capture-ledger の src/tools/repo-files.ts と同じ形。
 */
import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import { join } from "node:path";

/** `root` からの相対の path。`pathspecs` を渡せば、その中だけ。重なりは 1 つに。 */
export const repoFiles = (root, pathspecs = []) => {
  const listed = execFileSync(
    "git",
    [
      "-C",
      root,
      "ls-files",
      "-z",
      "--cached",
      "--others",
      "--exclude-standard",
      ...(pathspecs.length > 0 ? ["--", ...pathspecs] : []),
    ],
    { encoding: "utf8" },
  )
    .split("\0")
    .filter((path) => path !== "");
  // 衝突の途中の path は、段ごとに何度も出る
  return [...new Set(listed)].filter(
    (path) => statSync(join(root, path), { throwIfNoEntry: false })?.isFile() === true,
  );
};
