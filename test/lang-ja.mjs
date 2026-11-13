/**
 * 試験の間、画面の文言の言語を日本語に固定する（`package.json` の `test` が `--import` で読む）。
 * 日本語を期待する assert が、流す機械の言語の設定に左右されないようにする。英語の試験は、その試験の中で
 * `setLang("en")` を呼び、終わりに `"ja"` へ戻す。
 */
import { setLang } from "../public/i18n.js";

setLang("ja");
