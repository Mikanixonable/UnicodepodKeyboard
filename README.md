# Unicode 入力アプリ

Unicode 文字をコードチャート状に閲覧し、クリックで文字列を組み立ててコピーできる静的 Web アプリ。
要件の詳細は [unicode-app.md](unicode-app.md) を参照。

## 実行

`index.html` をブラウザで直接開くだけで動きます（サーバー不要）。ダブルクリック、または:

```sh
open index.html   # macOS
```

Chrome・Firefox の `file://` で動作確認済み。GitHub Pages などの静的ホスティングに置いても、もちろんそのまま動きます。

### file:// 対応の仕組み

ブラウザは `file://` から開いたページで ES モジュール（`import`/`export`）や `fetch()` によるローカルファイル読み込みをブロックします。そのため:

- 全 JS は `<script type="module">` ではなく **classic script**（`window.App.*` 名前空間で連携、`defer` で読み込み順を維持）
- Unicode データは JSON を `fetch` せず、`window.UNICODE_BLOCKS = [...]` のように代入する **`.js` ファイルとして `<script>` タグで読み込む**
- 大きい `names.js`（文字名、約800KB）は起動時に読み込まず、詳細モーダルを開いた時などに `<script>` タグを動的に挿入して遅延読み込みする

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
  blocks.js         ブロック定義（window.UNICODE_BLOCKS、初期ロード）
  categories.js     General Category を RLE 圧縮（window.UNICODE_CATEGORIES、初期ロード）
  names.js          文字名（window.UNICODE_NAMES、遅延ロード。CJK/ハングルは JS で算出し除外）
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

## お気に入りの永続化について

お気に入りは `localStorage` に保存されます。`file://` でも Chrome・Firefox では動作しますが、Safari は `file://` ページでの Web Storage を制限しており保存されない場合があります（[js/favorites.js](js/favorites.js) は `try/catch` で保護しているため、その場合もエラーにはならず「そのセッション中だけ有効」という穏やかな劣化になります）。

## 操作

- 文字をタップ／クリック → 出力部に挿入
- 右クリック／長押し → メニュー（お気に入り登録・詳細表示）
- ブロック名 → プルダウンで検索・ジャンプ
- タブでお気に入りキーボードに切替
