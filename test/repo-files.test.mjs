/**
 * 検査が読むファイル（`scripts/repo-files.mjs`）。check:terms と check:test-hosts が使う。
 *
 * CI はまっさらに checkout するので未追跡のファイルが無く、追跡だけを読んでも CI は緑のまま —— 手元で、
 * commit の前に新しいファイルを読むかどうかは、ここでしか確かめられない。
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { repoFiles } from "../scripts/repo-files.mjs";

let root;
const git = (...args) =>
  execFileSync("git", ["-C", root, "-c", "user.email=t@t.test", "-c", "user.name=t", ...args], { encoding: "utf8" });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "repo-files-"));
  git("init", "-q");
  // CI の runner と同じ既定（ASCII でない名前を引用符つきで出す）。手元の global の設定に左右されないよう、ここで置く
  git("config", "core.quotepath", "true");
  writeFileSync(join(root, ".gitignore"), "*.log\n");
  writeFileSync(join(root, "tracked.txt"), "a\n");
  writeFileSync(join(root, "gone.txt"), "b\n");
  mkdirSync(join(root, "test"));
  writeFileSync(join(root, "test", "old.test.mjs"), "c\n");
  git("add", ".gitignore", "tracked.txt", "gone.txt", "test/old.test.mjs");
  git("commit", "-q", "-m", "first");
  // まだ add していない新しいファイル・ignore される物・消した物
  writeFileSync(join(root, "new.txt"), "d\n");
  writeFileSync(join(root, "test", "new.test.mjs"), "e\n");
  writeFileSync(join(root, "noise.log"), "f\n");
  rmSync(join(root, "gone.txt"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

test("追跡している物と、まだ add していない新しい物を読む（ignore される物と、消した物は読まない）", () => {
  assert.deepEqual(
    repoFiles(root).sort(),
    [".gitignore", "new.txt", "test/new.test.mjs", "test/old.test.mjs", "tracked.txt"].sort(),
  );
});

test("場所を絞っても、新しいファイルを読む", () => {
  assert.deepEqual(repoFiles(root, ["test"]).sort(), ["test/new.test.mjs", "test/old.test.mjs"]);
});

test("ASCII でない名前の新しいファイルも読む（引用符つきの名前で黙って飛ばさない）", () => {
  writeFileSync(join(root, "test", "日本語.test.mjs"), "g\n");
  assert.ok(repoFiles(root, ["test"]).includes("test/日本語.test.mjs"));
});

test("当たる物が無い場所は空", () => {
  assert.deepEqual(repoFiles(root, ["nowhere"]), []);
});
