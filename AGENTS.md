# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## これは何か

Unicode 文字をコードチャートのように閲覧し、クリックして文字列を組み立ててコピーできる、ビルド不要の静的 Web アプリ（「Unicodepod Keyboard」）。フレームワークなし、バンドラなし、バックエンドなし。`index.html` を直接開く（`open index.html`）か `file://` で開ける必要があり、常にその状態で動作しなければならない。

## 最初に読むべきドキュメント

- `README.md` — 入口の説明と、各 `js/*.js` ファイルを層・役割にマッピングした「WebUIの構造メモ」がある。
- `SPEC.md` — 正本の仕様書。UI 構成、用語（出力部/入力部/符号表/マイリスト等）、各タブの挙動、コンテキストメニューの挙動、永続化ルールをまとめている。機能を追加するときは SPEC.md のどのセクションに属するかを先に決め、UI 名称を変えるときは SPEC.md の用語も更新すること。
- `dev.md` — 人間専用の開発メモ・チケット一覧。**このファイルには絶対に書き込まないこと** — 「このノートは人間のみが入力する。AIが書き加えてはならない。」と明記されている。

## コマンド

`package.json` は無く、ビルド/lint/テストの仕組みはない。検証はブラウザで `index.html` を開いて機能を実際に操作する手動確認のみ。

データ再生成（Unicode データ自体を更新する場合のみ必要）:
```sh
python3 tools/gen_data.py           # UCD ソースから data/*.js を再生成（要ネットワーク）
python3 tools/fetch_rare_fonts.py   # 希少スクリプト用 woff2 フォントを fonts/ に(再)取得
```

## アーキテクチャ

`index.html` 内のクラシックな `<script src>` タグ群（依存順に並んでいる — モジュールもバンドラもない）で構成され、各ファイルは共有の `window.App.*` 名前空間にぶら下がる。`index.html` の読み込み順は重要で、`window.App.Data` を参照するものより先に `js/data.js`（および `data/*.js` のグローバル）が読み込まれる必要がある。

4 つの概念的な層がある（正本は README.md の「WebUIの構造メモ」）:

1. **データ層** — `js/data.js`（`window.App.Data`）: コードポイントの範囲・分類判定、グリッド行計算、名称解決、属性による色分けを担当。`data/` 配下の生成済み静的データに支えられている: `segments.js`（収録している面・範囲の単一の真実）、`blocks.js`、`categories.js`、`age.js`、`names.js`（大きいため遅延読込）、`descriptions.js`、`block_names_ja.js`。これらは fetch する JSON ではなく素の `window.UNICODE_*` グローバル変数であり、これにより `file://` でもアプリが動作する。
2. **状態層** — `js/output.js`（`OutputArea`: 挿入/削除/undo/redo/コピー/貼り付け/文字数カウント）、`js/favorites.js`（`MyLists`/`MyList` — ファイル名に反してお気に入り1つではなく、ユーザーが管理する複数のリストを実装している）、`js/history.js`（`History`）、`js/artlists.js` / `js/art.js`（Unicode Art リスト）、`js/artpatterns.js`（`ArtPatterns`: パターン工房のパターン定義ストア＋純粋な展開エンジン。記法は SPEC.md §4.4）、`js/blockfavorites.js`、`js/urlstate.js`。永続化は `localStorage` のみで、対象は MyLists と Art データ（作品・パターン）に限定される（SPEC.md §9 参照）— 現在のタブ・スクロール位置は意図的にセッション限りとしている。
3. **表示層** — `js/grid.js`（`Grid`: 仮想スクロールする16列コードポイントグリッド、セル描画、長押し/右クリックメニュー）、`js/blocks.js`（`BlockHeader`、ブロック/面選択ポップアップ、凡例）、`js/modal.js`（`DetailModal`: 文字詳細、UTF-8/16、前後移動）、`js/menu.js`（共有コンテキストメニュー）、`js/favhighlight.js`、`js/colormode.js`（ライト/ダーク/フォントモード）。
4. **接続層** — `js/app.js`: 各モジュールの生成と結線、タブ切り替え、フォントモード切り替え、出力部と各ボードの同期を担当。DOM 生成と副作用は各コンポーネント内に閉じ、`app.js` は結線だけにとどめること。

### 命名規則（詳細は README.md §6 参照）
- 表示関数: `render*`。状態更新: `set*`/`update*`/`toggle*`/`move*`。
- `cp` = 単一コードポイント、`list` = コードポイント配列、`block` = Unicode ブロック、`group` = 面のグループ。
- `current` = 現在表示中/アクティブ、`top` = 上端のスクロール位置、`modal` = 詳細表示。

### 守るべき重要な制約
- **16列グリッドは固定** — 列数をレスポンシブにしてはならない。可変にしてよいのはセルサイズのみ。
- グリッドは**仮想スクロール必須**（BMP だけで4096行ある）— 全行を DOM に描画してはならない。
- 未割り当て・表示不能なコードポイントは省略せず空セルとして描画し、グリッド上の位置とコードポイントの 1:1 対応を保つ。
- `data/segments.js` は収録している面・範囲の単一の真実であり、範囲判定ロジックを他所で二重に持たないこと — 算出・出力するのは `tools/gen_data.py`。
- CJK 統合漢字・CJK 互換漢字・ハングル音節は名称をアルゴリズムで導出できる（`js/data.js` の `algorithmicName()`）ため、約9万件の冗長な名称を配信しないよう `names.js` から意図的に除外している。
- 希少・歴史的スクリプト用フォントは `fonts/*.woff2`（合計約7MB、`tools/fetch_rare_fonts.py` で取得）にあり、「拡張」フォントモード（`css/fonts-extended.css`）でオプトインする。CJK 統合漢字と絵文字は意図的に同梱フォントを使わずローカルにインストール済みの Noto フォントに依存している（理由は SPEC.md §4 と却下した代替案を参照）。
