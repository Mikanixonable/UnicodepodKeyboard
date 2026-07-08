
## WebUIの構造メモ

このアプリは、`index.html` を入口にした classic script 構成で、`window.App.*` 名前空間に機能を分割している。大きくは「データ層」「状態層」「表示層」「接続層」に分けて考えると追いやすい。

### 1. データ層

- [js/data.js](js/data.js): Unicode の基礎データと共通ユーティリティ。コードポイントの範囲判定、分類、グリッド行計算、名称取得、属性色分けの判定を担当する中核。
- [data/segments.js](data/segments.js): 収録範囲の単一の真実。
- [data/blocks.js](data/blocks.js): Unicode ブロック定義。
- [data/categories.js](data/categories.js): General Category のランレングス圧縮データ。
- [data/names.js](data/names.js): 文字名の遅延ロード対象。
- [data/block_names_ja.js](data/block_names_ja.js): ブロック名の日本語訳。

### 2. 状態層

- [js/output.js](js/output.js): 出力欄の状態管理。挿入、削除、Undo/Redo、コピー、貼り付け、文字数カウントを扱う。
- [js/favorites.js](js/favorites.js): お気に入りの永続化と購読。
- [js/history.js](js/history.js): 入力履歴の永続化と購読。

### 3. 表示層

- [js/grid.js](js/grid.js): 「全 Unicode」タブの仮想スクロールグリッド。セル描画、長押し/右クリックメニュー、ブロックヘッダー連動、現在位置へのジャンプを担当する。
- [js/blocks.js](js/blocks.js): ブロックヘッダー。現在表示中のブロック名、ブロック検索、コードポイント入力によるジャンプを担当する。
- [js/modal.js](js/modal.js): 文字詳細モーダル。名称、分類、UTF-8/UTF-16、前後移動、お気に入り操作を担当する。
- [js/menu.js](js/menu.js): 共有コンテキストメニュー。

### 4. 接続層

- [js/app.js](js/app.js): 各モジュールの生成と結線、タブ切り替え、フォント切り替え、出力欄と各ボードの同期を担当する。
- [index.html](index.html): UI の骨格と script 読み込み順の定義。

### 5. 機能名の整理

今後の機能追加では、次の名前で考えると役割がぶれにくい。

- `OutputArea`: 出力編集と履歴管理
- `Grid`: 全 Unicode の可視化と選択
- `BlockHeader`: ブロック選択とジャンプ
- `DetailModal`: 文字の詳細表示と前後移動
- `Favorites`: お気に入りの保存
- `History`: 入力履歴の保存
- `Data`: Unicode データ参照と共通ロジック
- `App`: 画面同士の配線

### 6. 命名ルールの方針

- 表示部は `render*`、状態更新は `set*` / `update*` / `toggle*` / `move*` に寄せる
- 入力欄のコードポイントは `cp`、コードポイント配列は `list`、ブロックは `block`、グループは `group` を使う
- 「現在表示中」を表すものは `current`、「上端に来ている位置」は `top`、「詳細表示」は `modal` に寄せる
- DOM 生成と副作用は各コンポーネント内に閉じ、`app.js` は結線だけにする

この整理を基準にすると、今後の追加は「どの層の責務か」を先に決めてから実装しやすい。