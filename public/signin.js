/**
 * サインインしていない時に `/` を開いたら、ここを通る（`public/signin.html`）。server は URL の hash を見られないので、
 * 古い hash の URL（`/#trace/…`。v0.61.0 まで）を画面の path に替えて、`/login?back=` で server に渡す ——
 * IdP のフォームの POST で hash が落ちても、server が state と一緒に戻り先を覚えている。
 */
import { loginHref, pathFromHash } from "/paths.js";

// hash も付けたまま回す。IdP がフォームを出さずに戻す時（IdP のサインインが生きている時・sandbox の代役）は、ブラウザが
// hash を /callback の後まで持ち越すので、画面がまだ hash で開く版でも同じ画面に着く（path で開く版では、起動の橋が
// 同じ path に置き換えるだけ）
location.replace(loginHref(pathFromHash(location.hash)) + location.hash);
