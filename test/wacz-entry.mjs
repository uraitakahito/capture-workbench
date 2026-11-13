/**
 * 試験が、置き場の WACZ（ZIP）の中身を読む道具。workbench は ZIP を読まない（読むのは daemon）ので、試験の側にだけ在る。
 * 依存は足さない —— 目次（central directory）を読み、STORE と DEFLATE の entry を node の zlib で戻すだけ。
 * ZIP64 と暗号は読まない（置き場の標本には無い）。
 */
import { gunzipSync, inflateRawSync } from "node:zlib";

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;

/** ZIP の entry の名前と位置。 */
export const zipEntries = (zip) => {
  let at = zip.length - 22;
  while (at >= 0 && zip.readUInt32LE(at) !== EOCD) at -= 1;
  if (at < 0) throw new Error("ZIP の終わりの記録が無い");
  const count = zip.readUInt16LE(at + 10);
  let p = zip.readUInt32LE(at + 16);
  const out = [];
  for (let i = 0; i < count; i += 1) {
    if (zip.readUInt32LE(p) !== CENTRAL) throw new Error("ZIP の目次が壊れている");
    const nameLength = zip.readUInt16LE(p + 28);
    out.push({
      name: zip.subarray(p + 46, p + 46 + nameLength).toString("utf8"),
      method: zip.readUInt16LE(p + 10),
      compressedSize: zip.readUInt32LE(p + 20),
      localOffset: zip.readUInt32LE(p + 42),
    });
    p += 46 + nameLength + zip.readUInt16LE(p + 30) + zip.readUInt16LE(p + 32);
  }
  return out;
};

/** entry の中身（Buffer）。無ければ undefined。 */
export const zipEntry = (zip, name) => {
  const entry = zipEntries(zip).find((one) => one.name === name);
  if (entry === undefined) return undefined;
  const start = entry.localOffset + 30 + zip.readUInt16LE(entry.localOffset + 26) + zip.readUInt16LE(entry.localOffset + 28);
  const data = zip.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return data;
  if (entry.method === 8) return inflateRawSync(data);
  throw new Error(`読めない圧縮の方式: ${String(entry.method)}`);
};

/**
 * WARC の本（gzip のメンバの連結）の 1 メンバを、見出しと本文に分ける。`offset` と `length` は索引（CDXJ）の値。
 * 見出しは `名前: 値` の対（名前は小文字）。
 */
export const warcRecord = (warc, offset, length) => {
  const record = gunzipSync(warc.subarray(offset, offset + length));
  const end = record.indexOf("\r\n\r\n");
  const headers = new Map();
  for (const line of record.subarray(0, end).toString("utf8").split("\r\n").slice(1)) {
    const colon = line.indexOf(":");
    headers.set(line.slice(0, colon).toLowerCase(), line.slice(colon + 1).trim());
  }
  const body = record.subarray(end + 4, end + 4 + Number(headers.get("content-length")));
  return { headers, body };
};
