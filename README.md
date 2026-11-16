# capture-workbench

Web Capture を開発するときに手元で開く Web アプリ。
始める（[capture-ledger](https://github.com/uraitakahito/capture-ledger)）・走らせる（[capture-scheduler](https://github.com/uraitakahito/capture-scheduler) の Windmill）・保存する（[seaweedfs](https://github.com/uraitakahito/seaweedfs)）・再生する（[replayweb-server](https://github.com/uraitakahito/replayweb-server)）の画面を、capture-ledger の API から組み立てる。

## Documentation

- **English** — <https://uraitakahito.github.io/capture-workbench/>
- **日本語** — <https://uraitakahito.github.io/capture-workbench/ja/>

## Related Projects

- [capture-ledger](https://github.com/uraitakahito/capture-ledger) — 読む API の持ち主。`dev:up` が workbench を起こす
- [wacz-validator](https://github.com/uraitakahito/wacz-validator) — 「検証」と WACZ の画面に答える daemon
- [capture-scheduler](https://github.com/uraitakahito/capture-scheduler) — クロールの run（Windmill）への行き先
- [replayweb-server](https://github.com/uraitakahito/replayweb-server) — アーカイブを開く行き先（改変していない ReplayWeb.page。「ReplayWeb.page ↗」）
- [capture-player](https://github.com/uraitakahito/capture-player) — アーカイブを開くもう 1 つの行き先（ReplayWeb.page を改変した Web Capture のビューア。「Web Capture ↗」）

## License

Unlicense。

ただし、
`public/vendor/shiki.js` はMIT（`public/vendor/shiki.LICENSES.txt`）。
`public/vendor/intl-messageformat.js` は intl-messageformat の BSD-3-Clause と、それが使う parser の MIT（`public/vendor/intl-messageformat.LICENSES.txt`）。
