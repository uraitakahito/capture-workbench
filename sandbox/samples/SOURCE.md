# サンドボックスの WACZ の標本

[wacz-validator-corpus](https://github.com/uraitakahito/wacz-validator-corpus) の **v0.3.0** の
`fixtures/` から写した（corpus では Git LFS で持っている。ここには実物を置いた）。
corpus を更新しても、ここは自動では変わらない。上げるなら、写し直してこの表も直す。

| ファイル | corpus での期待（spec profile） | sha256 |
| --- | --- | --- |
| `good.wacz` | 全 rule を pass | `7596416ce2c551c61642ed95c0be1bad9e707125397f5bcac537121b9a512898` |
| `warc-payload-digest-bad.wacz` | 警告 1 | `cc48d98717cef0b260b7b9100035fa54b110d5bd565b0c0ec300c7cf413e7960` |
| `datapackage-bad-hash.wacz` | 失敗 1 | `8a59033a803cfa170cb0c3690b838e164a46626f268d4373e9c5af5062d25191` |
| `cdxj-length-mismatch.wacz` | 失敗 1 | `a4bb9ffab1d8aa315f25f2d9e03a26f9fb0b136b88579613feab473389ca887b` |
| `wacz-missing-indexes.wacz` | 失敗 2 | `c333c73c4b5db2ad489d2eb7565f6da22749900f618065a323bf381d5857664a` |

corpus の LFS の pointer と同じ中身かは、次で確かめられる（corpus を隣に置いて）:

```sh
for f in sandbox/samples/*.wacz; do
  want=$(git -C ../wacz-validator-corpus show "v0.3.0:fixtures/$(basename "$f")" | sed -n 's/^oid sha256://p')
  got=$(shasum -a 256 "$f" | cut -d' ' -f1)
  [ "$want" = "$got" ] && echo "ok  $f" || echo "NG  $f"
done
```

corpus は Unlicense（public domain）。
