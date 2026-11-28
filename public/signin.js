/**
 * サインインしていない時に `/` を開いたら、ここを通る（`public/signin.html`）。server は URL の hash を見られないので、
 * 古い hash の URL（`/#trace/…`。v0.61.0 まで）を画面の path に替えて、`/login?back=` で server に渡す ——
 * IdP のフォームの POST で hash が落ちても、server が state と一緒に戻り先を覚えている。
 */
import { loginHref, pathFromHash } from "/paths.js";

location.replace(loginHref(pathFromHash(location.hash)));
