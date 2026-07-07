# Unicode 入力アプリ

Unicode 文字をコードチャート状に閲覧し、クリックで文字列を組み立ててコピーできる静的 Web アプリ。
要件の詳細は [unicode-app.md](unicode-app.md) を参照。

## 実行

ES モジュール＋`fetch` を使うため、`file://` では動きません。任意の静的サーバーで配信してください。

```sh
python3 -m http.server 8000
# → http://localhost:8000/ を開く
```

GitHub Pages などの静的ホスティングにそのまま置けます。

## 構成

```
index.html          エントリ
css/styles.css      スタイル（ダーク基調・レスポンシブ）
js/
  data.js           Unicode データ読込＋コードポイント処理（名称の算出含む）
  output.js         出力部（挿入/削除/Undo/Redo/コピー/カウント）
  grid.js           入力部の仮想スクロールグリッド
  blocks.js         ブロック名ヘッダー＋検索プルダウン
  modal.js          文字詳細モーダル
  favorites.js      お気に入りストア（localStorage）
  menu.js           共通コンテキストメニュー
  app.js            結線・モード切替・お気に入りキーボード
data/
  blocks.json       ブロック定義（初期ロード）
  categories.json   General Category を RLE 圧縮（初期ロード）
  names.json        文字名（遅延ロード。CJK/ハングルは JS で算出し除外）
tools/gen_data.py   data/ を再生成するスクリプト
```

## 収録範囲

BMP 全体（U+0000–U+FFFF）＋ 補助面の記号・絵文字領域（U+1D000–U+1FBFF）。
未割り当て・制御・サロゲートは空セル表示。グリフ非対応文字はシステムフォント依存（豆腐許容）。

## データ再生成

Unicode バージョンを上げる等で再生成する場合（要ネットワーク。Blocks.txt のみ取得）:

```sh
python3 tools/gen_data.py
```

`js/data.js` の `SEGMENTS` と `tools/gen_data.py` の `SEGMENTS` は一致させること。

## 操作

- 文字をタップ／クリック → 出力部に挿入
- 右クリック／長押し → メニュー（お気に入り登録・詳細表示）
- ブロック名 → プルダウンで検索・ジャンプ
- タブでお気に入りキーボードに切替
