# リファクタリング計画

このドキュメントは Unicodepod Keyboard のリファクタリング計画。**1ステップ = 1コミット**を原則とし、各ステップの後にブラウザ（`file://` で `index.html` を開く）での手動確認を行う。挙動を変えないことが全ステップの前提。

## 前提・進め方

- 現在ワーキングツリーに未コミットの変更が多数ある（`CLAUDE.md` / `README.md` / `SPEC.md` / `css/styles.css` / `index.html` / `js/app.js` / `sw.js` の修正、`js/artpatterns.js` 等の新規ファイル）。**リファクタリング開始前にこれらを先にコミットして作業ツリーをクリーンにする**こと。機能変更とリファクタリングが同一コミットに混ざると検証もレビューもできなくなる。
- 各ステップの検証は最低限「符号表スクロール／文字クリック挿入／コピー／マイリスト追加／タブ切替／ダークモード切替／Unicode Art 保存」を通す。可能なら Playwright での自動スクリーンショット確認（過去の開発でも使用実績あり）を併用。
- `data/*.js` は生成物（`tools/gen_data.py` の出力）なので**リファクタリング対象外**。
- `dev.md` は人間専用。書き込まない。

## 現状の観測（計画の根拠）

- `js/` 全体で約 3,900 行。最大は `js/app.js`（約 48KB / 1,100 行超）。CLAUDE.md の方針では app.js は「結線だけ」のはずだが、実際には `renderCharBoard` / `renderArtBoard` / `bindTileBoard` / `bindCharBoard` / `buildArtShareUrl` / トースト / フォント・テーマ切替などの実装が同居している。
- `escapeHtml()` が `js/app.js:888` / `js/grid.js:314` / `js/blocks.js:601` に**3重複**。
- localStorage の「キー定義＋`try { setItem } catch {}`＋JSON parse フォールバック」パターンが約10ファイル（output / history / grid / favorites / favhighlight / colormode / art / artlists / artpatterns / blockfavorites / app.js 内2箇所）に**ほぼ同型で散在**。
- タイマー系マジックナンバーが散在：長押し判定 450ms（`grid.js:259` / `blocks.js:132` / `app.js:990,1054` の4箇所）、デバウンス 400ms（`output.js:41,77`）、フラッシュ 1300ms（`grid.js:310`）、トースト 1800ms（`app.js:32`）。
- コメントアウトされた死にコードは JS には**ほぼ無い**（今回のグレップでは検出ゼロ）。この項目は軽い確認作業のみになる見込み。
- `css/styles.css` は約 80KB・単一ファイル。gap/padding 等の数値が直書きで、過去の UI 調整（dev.md 参照）のたびに全文グレップが必要になっている。
- `js/favorites.js` はファイル名と実体（MyLists 複数リスト）が乖離している（README にも注記あり）。

## ステップ一覧（実施順）

### フェーズ1: 無リスクの掃除

1. **未使用・死にコードの削除**
   - JS 内のコメントアウトコードは今回の調査ではほぼ検出されなかったため、CSS（`styles.css` / `fonts-extended.css`）と `index.html` を対象に、コメントアウトされたルール・未参照セレクタ・未参照 id/class を洗い出して削除。
   - 未参照判定は「JS からの `querySelector`/`classList` 動的付与」を必ずグレップで確認してから行う（動的に付くクラスが多い）。
   - リスク: 低。

2. **マジックナンバーの定数化**
   - 各ファイル先頭に意図の分かる名前で定義する（例: `LONG_PRESS_MS = 450`、`INPUT_COALESCE_MS = 400`、`FLASH_MS = 1300`、`TOAST_MS = 1800`）。
   - 複数ファイルにまたがる 450ms（長押し）は、後述のステップ5（共有ユーティリティ）に長押し検出ごと集約する布石として、まずは各所で同名定数にする。
   - Unicode 関連の数値（`0xAC00`、CJK 範囲、16列、4096行など）はすでに `data.js` に意味のある形でまとまっているため対象外。**16列固定・segments.js 単一真実の制約には触れない**。
   - リスク: 低。

### フェーズ2: 重複の集約

3. **`escapeHtml` の一本化**
   - `js/util.js`（`window.App.Util`）を新設し、app.js / grid.js / blocks.js の3実装を1つに。`index.html` の script 順で最上流（`data.js` より前で可）に配置。
   - リスク: 低。3実装が完全に同一か先に diff 確認。

4. **localStorage アクセスの共通化**
   - `App.Util.storage` として「`load(key, fallback)` / `save(key, value)`（try/catch 込み、JSON 対応）」を提供し、約10ファイルの同型コードを置換。
   - 注意点: `favorites.js` のレガシーキー移行ロジック、`artpatterns.js` の初期シードなど、単純パターンでない箇所は無理に共通化せずキー名の定数化だけに留める。
   - SPEC.md §9 の永続化ルール（何を保存し何をセッション限りにするか）を変えないこと。
   - リスク: 中。ステップ後に localStorage の既存データ（マイリスト・Art）が壊れず読めることを必ず確認。

5. **長押し／コンテキストメニュー起動の共通化**
   - `grid.js` / `blocks.js` / `app.js`（2箇所）にある「setTimeout 450ms + suppress フラグ + openMenu」の同型コードを `App.Util` の長押しヘルパーに集約。
   - リスク: 中。タッチとマウスの両方で長押し・右クリック・通常タップを手動確認（dev.md にモバイルの長押し関連の不具合履歴が多いため慎重に）。

### フェーズ3: 構造の整理（app.js のダイエット）

6. **app.js から表示コンポーネントを分離**
   - CLAUDE.md の「app.js は結線だけ」に実態を合わせる。候補:
     - `renderCharBoard` / `bindCharBoard` / `renderArtBoard` / `bindTileBoard` → 新規 `js/boards.js`（表示層）
     - トースト（`showToast`）→ `js/toast.js` または `menu.js` 近傍
     - `setupFontToggle` / `setupThemeToggle` → `colormode.js` へ統合を検討
     - `buildArtShareUrl` → `urlstate.js` へ
   - `index.html` の script 読み込み順を依存に合わせて更新し、README「WebUIの構造メモ」も更新。
   - リスク: 中〜高。1候補ずつ別コミットで移動し、都度全機能を確認。

7. **ファイル名と実体の一致（任意・要相談）**
   - `js/favorites.js` → `js/mylists.js` へのリネーム。git 履歴は `git mv` で追える。README / CLAUDE.md / index.html の参照を同時更新。
   - 実施するかはユーザー判断（履歴・PWA キャッシュ `sw.js` のプリキャッシュリスト更新が必要になるため）。

### フェーズ4: CSS の整理

8. **styles.css のセクション整理と CSS 変数化**
   - まずファイル内をゾーン別（出力部／入力部グリッド／左右メニュー／モーダル／モバイル）にセクションコメントで区分け（並べ替えのみ、値は不変）。
   - 次に頻出のスペーシング値・影・角丸を `:root` のカスタムプロパティへ段階的に寄せる（既存の `--panel` 等の色変数と同じ流儀）。dev.md で頻発している「gap を一括で倍に」の類の調整が1箇所で済むようになる。
   - リスク: 中。並べ替えは詳細度・カスケード順が変わらないよう同一セレクタの重複定義に注意。ビフォー/アフターのスクリーンショット比較で検証。

### フェーズ5: 仕上げ

9. **ドキュメント同期**
   - README「WebUIの構造メモ」・CLAUDE.md のアーキテクチャ記述・SPEC.md を、新しいファイル構成に合わせて更新。
   - `sw.js` のキャッシュ対象リストに新規ファイル（util.js / boards.js 等）を追加し、キャッシュバージョンを上げる。**これを忘れると PWA でファイル欠落が起きる**ため、ファイルを増減した全ステップでチェックリスト化する。

## やらないこと（非目標）

- フレームワーク・バンドラ・モジュール（ESM）化 — `file://` 直開き要件と衝突するため。
- `data/*.js` の形式変更、`tools/` の Python 変更。
- 挙動・見た目の変更（それは dev.md のチケットの領分）。
- テスト基盤の導入 — 検証は従来通り手動＋Playwright スクリーンショットとする（導入したい場合は別途相談）。
