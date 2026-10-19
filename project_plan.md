# 商品登録（商品吸い込み口）管理画面

## 1. プロジェクト概要
- 位置づけ：社内スタッフが高級商材（スニーカー・ジュエリー・その他）を1つの共通画面から効率的に登録するための業務用管理画面。
- 対象ユーザー：社内スタッフ（一般顧客向けECサイトではない）。
- コア価値：カテゴリに応じて入力項目が切り替わる「商品吸い込み口」を提供し、登録作業の手間を削減する。

## 2. ページ構成
- `/` - 商品登録画面（本MVPの唯一の画面）

## 3. コア機能（実装状況）

### 実装済み
- [x] 商品画像を複数アップロードできる（最大10枚・プレビュー・削除・メイン画像指定）
- [x] 商品カテゴリを選択できる（スニーカー / ジュエリー / その他）
- [x] 共通の商品情報を入力できる（商品名・ブランド・説明・価格・状態）
- [x] カテゴリが「スニーカー」の場合にスニーカー固有項目を表示
- [x] カテゴリが「ジュエリー」の場合にジュエリー固有項目を表示
- [x] 入力バリデーションと登録完了のフィードバック
- [x] Google Apps Script へ商品データを POST 送信
- [x] Google Sheets への商品情報保存（1商品1行、商品IDはApps Script側で採番）
- [x] Google Drive への商品画像保存（商品IDごとのフォルダを自動作成、1枚目をメイン画像として保存）
- [x] 商品画像の Base64 変換と `images` 配列での送信

### 商品一覧（/products）の UI/UX 改善 — フロントのみで実装済み
- 商品登録・管理の共通画面は `/products`（商品一覧）。`/register`（登録）と `/import`（取込）はいずれもこの一覧へ戻って商品を確認・操作する。
- [x] カテゴリフィルター＋キーワード検索（商品名・商品ID・ブランド）。一覧API（`GET ?mode=admin`）はページ分割なしで全件を一括返却するため、取得済み商品全件をクライアント側で絞り込む。サーバー絞り込みではないので「全商品検索」とは表示せず「該当 X / 全 Y 件」を併記する。
- [x] 商品一覧（/products）を GAS 商品一覧API v3（サーバー側検索・絞り込み・並び替え・ページ分割）へ対応（PRODUCT_LIST_PAGINATION_API_CONTRACT.md 準拠）
  - 稼働状況（訂正）: 商品一覧APIは GAS v90 で `admin-product-list-v3` の実通信を確認済み（サーバー側の検索・絞り込み・並び替え・ページ分割が有効）。
  - 一覧取得は通常 `mode=admin&page=1&page_size=50` のように `page` を送信してページ分割モードで取得する
  - 【暫定互換】GAS本番が未だ v2（`version:"admin-product-list-v2"`）の場合、v3向けパラメータを渡すと 0 件が返り商品が消えるため、応答に `total_pages` が無い（ページ分割非対応）かつ `products` が空のときだけ、旧形式（`?mode=admin` / `?mode=admin&record_status=archived`）で取り直して表示する。v3 が配信されると `total_pages` が返り、この分岐には入らず自動でページ分割モードになる（この暫定経路ではサーバー側の絞り込み・並び替え・ページ分割は v2 側に存在せず、v3 配信後に有効）
  - 検索語・カテゴリ・公開状態・在庫状態・台帳状態（通常/アーカイブ）・並び順をすべてGETパラメータでGASへ送り、ブラウザ側で取得済み商品だけを再検索・再ソートしない
  - 検索は契約どおり空白区切りのAND検索（商品名・商品ID・ブランドの部分一致）。検索入力はデバウンスし、古い応答が新しい結果を上書きしないよう通番で破棄する
  - `products` は現在ページの表示、`count`・`total_pages` は件数表示とページ操作に使う
  - 条件（検索/フィルター/並び順）変更時は1ページ目へ戻し、選択済みの商品を解除する。ページ変更時も選択を解除し、一括AI生成・公開・アーカイブは表示中ページの商品だけを対象にする
  - 商品詳細画面のフォールバック（詳細API失敗時の一覧参照）もページ分割モードのサーバー側検索（`page=1&page_size=100&search=<product_id>`）へ変更
- [x] 一括アーカイブ：既存の単品API `update_record_status`（`record_status:"archived"`）を1件ずつ直列実行する。新規の一括APIは作らず、GAS変更も不要。Square連携済み商品のSquare側停止・アーカイブは商品詳細と同じくGAS側の既存処理に委ねる。
  - 対象件数を示す確認ダイアログ、逐次実行、商品ごとの成功／失敗／スキップ／要確認表示、成功分の再送防止、失敗分のみ再試行、連打防止を実装。途中失敗を全件成功とは表示しない。
  - 成功した商品は「通常の商品一覧・公開サイトから消え、『アーカイブ済み』一覧に表示される」（確認手順はこの表現に統一）。
  - 通信断・タイムアウト・応答解析失敗など結果不明（uncertain）の商品は、既存の単品取得API（`GET ?mode=admin&product_id=...`）で現在の `record_status` を再取得して分類する。archived を確認できれば success（成功扱い）、未アーカイブ（active）を確認できれば failed（再試行対象）、状態を確認できなければ `unknown`（受付結果不明・要確認）として成功・確定失敗のどちらにも決めつけない。
  - 結果モーダルは成功／失敗／スキップ／要確認の4区分を独立表示する。確定失敗（failed）のみ「失敗のみ再試行」の対象、要確認（unknown）は「要確認分を再確認」で状態を再取得する（成功・スキップ・要確認分は再送しない）。
  - 削除・完全消去は行わず「アーカイブ」の既存の意味のみに従う。既存の商品登録・一括AI生成・公開・Square連携の動作は維持。

### 未実装（将来）
- [ ] 共通商品DB
- [ ] 他サイト（Curry Kicks / ジュエリーサイト）との商品データ連携
- [x] 認証は現行運用を維持（新規の管理画面ログインは追加しない）

### AI商品情報生成（フロント実装済み・認証付き中継に接続済み・中継デプロイ済み。GAS側の実機確認はスタッフが実施）
- [x] ① 共通登録画面の単品AI生成（画像から商品情報候補を生成・編集・反映）
- [x] ② 画像だけの商品取込（複数商品セット対応・/import。1商品＝1セット、逐次送信、`import_product_by_images` で下書きとして取り込み）
- [x] ② 取り込み成功商品を /import に一覧表示し、既存の一括AI生成（gas-ai-batch-relay・20件区切り）へ進む導線を追加
- [x] ③ 取込済み商品の一括AI生成（一覧で複数選択）— GAS背景処理方式へ切替（一括受付＋進捗取得＋失敗分のみ再実行）
- [x] AI_BATCH_API_CONTRACT.md（バッチ3action・応答階層・状態値）に準拠したフロント実装（型 / API層 / 進捗ポーリング / 再読込復帰）
- [x] AI_BATCH_API_CONTRACT.md をプロジェクト直下に保存（契約を唯一の根拠としてキー名・階層・状態値を一致）
- [x] フロント接続の最終確認：一括3actionは `gas-ai-batch-relay`、単品3actionは `gas-ai-relay` を呼ぶことをコードで確認（横流れゼロ）
- [x] 受付送信の前に request_id と選択商品ID一覧を永続保存（応答未受信の再読込では同じ request_id で再送、batch_id 取得後は batch_id で復帰）
- [x] 失敗分のみ再実行（retry）の request_id 冪等性対応：送信前に request_id を永続化。「成功応答」または「受付されなかったことが確定できるコード（NO_FAILED_ITEMS / BATCH_NOT_FOUND 等、明示リストに列挙したもの）」でのみ破棄し、タイムアウト・転送失敗・応答解析失敗（GAS_INVALID_RESPONSE）・HTTP 5xx・未知コードなど GASが受付済みか判断できない場合は同じ request_id を保持して再送する（allowlist方式。失敗商品が無い場合の success:false / NO_FAILED_ITEMS は成功表示にしない）
- [x] 一括専用の中継 `gas-ai-batch-relay` を新設し、3action（create_ai_product_draft_batch / get_ai_product_draft_batch / retry_ai_product_draft_batch）を実装・デプロイ（既存 `gas-ai-relay` は無変更）
- [x] 運用変更（Auto-Apply）対応：バッチ完了時にGAS側で同じ商品の下書き（商品マスター・英文翻訳・ポケカシート）へ生成内容を自動反映し、`review_status: "confirmed"` として確定する方式へ変更（商品ごとの「この内容で確定保存」は必須操作にしない）
- [x] ブラウザからの商品別 `confirm_ai_product_draft` の連続実行を撤去（自動反映はGASの処理として完結。フロントのAI生成候補セクション・再確定呼び出しを削除）
- [x] 商品詳細の修正は通常の「商品情報を編集」（update_product）で実施。編集後の確定指紋の同期はバックエンド側で行われる前提
- [x] バッチ完了時に商品一覧を自動再取得。表示中の商品詳細はタブ復帰時に再取得し、更新された商品名・説明・価格等を表示
- [x] 成功表示を「生成成功」ではなく「下書き反映完了」（契約の item.status=completed）として表示。再読込復帰・商品別の失敗理由表示・失敗分のみ再実行は維持
- [x] 一括AI生成の `model_name` は明示送信しない（旧 `gemini-3.5-flash-lite` を送ると検索付き生成のサーバー既定モデル指定を上書きするため）。中継 `gas-ai-batch-relay` も `model_name` を転送しないようホワイトリストから除外（クライアントからの上書きを防止）
- [x] 商品別に検索未実行・参照元なし・MAX_TOKENS・429 等で失敗した商品は成功表示せず、APIの `error_code` と分かりやすい説明を表示する。失敗分のみ再実行は既存の仕組みを維持
- [x] `status:"completed"` と `error_code` が同時に返る「GAS 契約外応答」は、成功表示を防ぐだけでなく `contract_violation`（要確認）として区別して表示し、フロント内で記録する。GAS側は completed のため「失敗のみ再実行」の対象に含まれない可能性がある旨を明示（成功カウントから除外）
- [x] 契約外応答の記録：`recordGasContractViolations` がポーリング検知時に商品ID・error_code・error_message を一度だけ記録（`/products`・`/import` 共通フックで実施）
- [x] 最終確認（フロント／中継）：一括 generate/create は `model_name` を送信せず、中継 `gas-ai-batch-relay` も転送しない（ホワイトリスト除外）。ブラウザ側コードに `admin_key` は存在せず、中継がサーバー側で `mode:"admin"` と `admin_key` を付与。中継は ACTIVE かつ `verify_jwt:true` を維持
- [x] バッチ結果の商品別応答に含まれる `draft_id` / `draft_version` を表示アイテムへ保持し、完了商品から商品詳細へ遷移できる導線を追加
- [x] ② 画像だけの商品取込（/import）を複数商品セット対応に改修（MULTI_PRODUCT_IMPORT_API_CONTRACT.md 準拠）
  - 1商品＝1セットとして区切り、セットごとに画像1〜20枚を準備（追加・並べ替え・メイン変更・削除、送信時はメイン画像を配列先頭にする）
  - 「商品セットを追加」「まとめて取り込む（下書き）」を提供。1セットにつきPOST 1回、複数セットは前の応答を待って必ず逐次送信（並列・一括配列はしない）
  - 新API `action: "import_product_by_images"`。セットごとに一意な `import_attempt_id` を発行し、`images` に base64 / file_name / mime_type を明示
  - 成功判定は HTTP ステータスではなく応答本文 `success === true`。`is_reused: true` も同じ商品IDの成功として表示
  - GAS は `publish_status: "draft"` 固定。画面上も「下書きとして取り込み」と表現（公開済みとは表示しない）
  - 成功セットは再送しない。通信断・タイムアウト・5xx・応答解析失敗など受付済みか不明なセットは、送信時ペイロードを保持し同一 `import_attempt_id`・同一内容で再送可能（再送前は編集ロック）
  - 明確な `success:false` はセットごとに error_code と説明を表示。`IMPORT_IDEMPOTENCY_PAYLOAD_MISMATCH` は新IDでの自動再送をせず、内容変更と再試行方法を明示
  - 状態はメモリ上のみ（ページ再読込で復元されない。新しいIDでの自動再送はしない。バックグラウンド継続を装う表示もしない）
  - 通信経路は既存の商品登録と同じ GAS Web App への直接POST（text/plain）。ブラウザに管理者キーを追加しない
  - 取り込みに成功した商品IDを /import 上で一覧表示し、既存の一括AI生成（gas-ai-batch-relay 経由。新しいAI生成APIは作らない）へ進む導線を設置。1回の受付は最大20件のため、20件超は画面上で20件ずつに区切ってグループ単位で実行
  - success:false（error）でも Drive保存・本票書込みの「途中」失敗の可能性があるため、送信時の同一ペイロード・同一 import_attempt_id を保持。再試行時は内容が変わっていなければ新IDを発行せず、保存した同一ペイロード・同一IDで再送（エラー表示だけを理由に新IDで自動再登録しない）
  - success:false の後にセット内容を変更して「新しい import_attempt_id」で取り込む操作は、前回の試行で商品が作成されている可能性（＝重複リスク）をカード上に表示し、スタッフが「前回の取込結果を確認した」と明示承認した場合のみ実行（自動での新規取込み・自動新ID再送はしない）
  - `IMPORT_IDEMPOTENCY_PAYLOAD_MISMATCH` と、Drive保存・本票書込みの途中失敗で商品作成の可能性がある success:false は「先の取込結果を確認する操作」として扱い、内容変更後の新ID取り込みは承認必須。内容が送信時と同一の明示再送は同一ID・同一ペイロードを維持
  - 「まとめて取り込む」は同期フラグ（ref）でガードし、連打しても逐次処理を二重起動しない
- [x] ~~② 画像だけの取込に、商品セットごとの任意の「書類（請求書・領収書）」添付を追加~~ → **撤去済み（本セクション末尾の方針変更を参照）**
  - MVP: PDF / JPG / PNG を1商品につき1件。未添付でも商品登録は従来どおり完了
  - 画像取込が成功して product_id を取得した後、**別リクエスト** `action: "attach_product_document"` で同じ商品へ書類のみ送信（商品の再登録はしない）
  - セットごとに書類用の再送識別子 `idempotency_key` を保持し、通信失敗・受付不明時は同じ product_id へ書類だけ再送（冪等）
  - 画面では「商品登録」と「書類添付」の結果を別々に表示（状態バッジ・対象/添付済み/添付待ち/未添付/競合の集計）
  - 別書類の競合エラー時は勝手に上書きせず、既存書類を提示
  - 商品詳細・商品編集画面では管理APIレスポンスの `product.document` を用い、添付済みなら元ファイル名と「書類を開く」リンクを表示。未添付は何も表示しない（添付導線は撤去済み）。**公開ページには表示しない**
  - 書類（JPG/PNG含む）は商品画像のサムネイル・AI生成対象画像として扱わない。書類の金額を仕入原価へ反映しない。OCR・複数明細は対象外
  - [x] 商品詳細・編集画面（BIS）の後付け添付機能は**撤去済み**。既存添付がある商品はリンクのみ表示し、無い商品は何も表示しない
  - 稼働状況: GAS側の `attach_product_document` は残置（フロントからは呼ばない）。フロントの商品単位添付UIは撤去済み
- [x] ポケモンカードの状態 A/B/C（商品詳細・編集画面）
  - 商品詳細レスポンスの `product.pokemon_card.card_condition` を状態欄の値として表示。未鑑定は `"A"/"B"/"C"`、鑑定済みは空文字
  - 編集は既存の `update_product` に `pokemon_card.card_condition` を載せて保存（新規API・新規フィールドは追加しない）。保存後に再取得して同じ値を表示
  - 共通 `product.condition` はポケカ画面では表示・編集しない（専用の `card_condition` と両方を状態として見せて矛盾させない）。ポケカ以外の共通状態欄は変更しない
  - 鑑定済みカードは従来どおり `pokemon_card.grader` / `pokemon_card.grade` の専用項目で表示・編集し、A/B/C（未鑑定）と混ぜない
  - AI一括生成の初期値AはGASが `pokemon_cards.card_condition` に保存するため、フロントでAを補完する処理は追加しない。Aは「確認前のドラフト値」として表示し、確認済みと誤解させる表示はしない
  - GAS側の実装は作業ブランチ（`feat/pokemon-card-condition-abc` / commit `683f0f5`）上の報告。本番APIでの実画面確認はバックエンド反映後に実施
- ブラウザから共有秘密キーを排除（VITE_PUBLIC_ADMIN_SHARED_KEY / X-Admin-Secret は使わない）
- [x] 認証付き中継（Readdy Backend Edge Function `gas-ai-relay` / `gas-ai-batch-relay`）へ接続するフロント実装
- [x] Readdy Backend 接続 + 一括専用 Edge Function `gas-ai-batch-relay` デプロイ + 既存 Secrets（GAS_WEBHOOK_URL / GAS_ADMIN_SECRET）流用
- [ ] 接続環境で利用可能な呼出し元制限の確定（ALLOWED_ORIGINS など。新規ログイン画面は追加しない）
- [ ] GAS Web App の新API（検索付き生成・実効モデル）の実機確認（スタッフが安全なテスト商品で実施。フロント／中継からは確認不可）

## 4. データ保存方針（現行v0.5）
- 商品情報 → Google Sheets
- 商品画像 → Google Drive
- 紐付け：Google Sheets 上の商品IDと Google Drive 上の商品フォルダ名を同一にする
- Google Sheets には商品情報と Drive 参照URLを保存

## 5. バックエンド / 外部連携
- Google Apps Script Web App：実装済み（商品データ受信・商品ID採番・Sheets保存・Drive保存）
- Google Sheets：実装済み（商品情報保存）
- Google Drive：実装済み（商品画像保存）
- Readdy Backend（認証付き中継）：接続済み・デプロイ済み
  - 単品系中継 `gas-ai-relay`（既存・無変更）：generate_ai_product_draft / confirm_ai_product_draft / get_ai_product_draft
  - 一括専用中継 `gas-ai-batch-relay`（新設・デプロイ済み）：create_ai_product_draft_batch / get_ai_product_draft_batch / retry_ai_product_draft_batch
  - スタッフJWT + staff_members 方式は必須にしない（新規ログイン画面は追加しない）
  - 接続環境で利用可能な呼出し元制限（ALLOWED_ORIGINS＝Origin/Referer検証、Supabase verify_jwt）へ切替可能
  - GAS へはサーバー側で mode:"admin" と admin_key:GAS_ADMIN_SECRET を付与
  - 接続先URL・認証キーはブラウザから受け取らない（Secrets の GAS_WEBHOOK_URL / GAS_ADMIN_SECRET 固定）
  - 一括createは単品用 product_id を要求せず product_ids（最大20件）を受け取る
- AI解析：フロント接続済み（GAS `generate_ai_product_draft` は中継経由）
- 他サイト連携：未実装
- 決済（Stripe/Shopifyなど）：不要

## 6. 開発フェーズ計画

### フェーズ1：商品登録画面（MVP） — 完了
- 目標：上から順に入力しやすいシンプルな業務用UIを構築する
- 成果物：
  - 複数画像アップロード（最大10枚・プレビュー・削除・メイン指定）
  - カテゴリ選択（セグメント切替）
  - 共通項目入力
  - カテゴリ別の固有項目（スニーカー / ジュエリー）
  - 登録ボタン + バリデーション + 完了モーダル

### フェーズ2：データ保存の接続 — 完了
- 目標：登録した商品を永続保存できるようにする
- 成果物：
  - Google Sheets への商品情報保存（実装済み）
  - Google Drive への商品画像保存（実装済み）
  - Google Apps Script 連携（実装済み）

### フェーズ3（将来）：登録商品の一覧・編集
- 目標：登録済み商品の確認・編集・削除ができるようにする

### フェーズ4：AI解析・自動入力 — フロント実装済み（認証付き中継に接続・バックエンド接続待ち）
- 目標：商品画像を解析し、日本語・英語の商品情報（タイトル/説明/ハッシュタグ/状態/カテゴリ/ブランド/SKU/サイズ）を自動生成する
- 成果物：
  - ① 共通登録画面の単品AI生成（画像最大20枚保持・先頭3枚を使用・候補の編集/反映・上書き確認）
  - ② 画像だけの商品取込（商品ID付き仮draft作成）
  - ③ 取込済み商品の一括AI生成（一覧で複数選択）— GAS背景処理（一括受付 create_ai_product_draft_batch / 進捗取得 get_ai_product_draft_batch / 失敗再実行 retry_ai_product_draft_batch）。約5秒間隔で進捗取得し、終了状態で停止。再読込後は batch_id から復帰。失敗分のみ再実行。
  - 契約ファイル：AI_BATCH_API_CONTRACT.md（プロジェクト直下に保存済み）を唯一の根拠とし、応答フィールド・階層・状態値は推測せず一致させる
  - 認証付き中継（Readdy Backend Edge Function）経由でGASの3actionを呼び出す構成
  - 残課題：ALLOWED_ORIGINS（呼出し元制限）の値の確定・GAS Web App の3action実機確認（スタッフ実施）

### フェーズ5（将来）：他サイト連携・共通DB
- 目標：Curry Kicks / ジュエリーサイトとの商品データ連携、共通商品DBの導入

### フェーズ6：書類台帳（BIS）— DBマイグレーション適用済み（2ビューはアプリ層集計で代替）
- 背景：書類原本は Drive に保管し、構造化データ（明細・紐付け・照合状態）は PostgreSQL の書類台帳で管理する。
- 方針（会長決定）：外部Supabaseへの切替は行わず、現行 Readdy Backend の PostgreSQL 内に独立した書類台帳を新設する（Notion の「新設Supabase」は MVP ではこの意味に読み替える）。Connects の切替・切断、外向きDB通信の検証は行わない。
- 認証：現行水準を維持（新規スタッフログイン・権限管理は追加しない。既存の functions.invoke / JWT検証 / CORS を流用。service_role・GAS管理秘密鍵はブラウザに置かない）。
- 今回の位置づけ：GAS 独立書類アップロードAPI（本番 Web App v91）配信済みを受け、Readdy Backend 内に独立した書類台帳を新設する。中継 `documents-relay` を `verify_jwt:true` で配信済み。DBマイグレーション `20261013_independent_documents_ledger.sql` を適用し、テーブル `documents` / `document_lines` / `document_product_links` を作成済み。ただし現行 Readdy Backend の SQL エディタは `CREATE VIEW` 非対応（公式制約）のため、ビュー `v_document_audit_summary` / `v_product_cost_breakdown` は作成できず、中継側のアプリ層集計（`computeAuditSummary` / `computeProductCostBreakdown`）で代替する。2026-10-18 の実測では RLS は 3 テーブルとも無効で、`anon` / `authenticated` に INSERT/UPDATE/DELETE が付与されていた（公開キーのみの PostgREST 直接書込が可能な状態）。対策として 3 テーブルすべてで RLS を有効化し、SELECT のみ許可するポリシー（`documents_read_only` / `document_lines_read_only` / `document_product_links_read_only`）を新設。書込ポリシーは作成せず、書込は `documents-relay` の service_role 経由に一本化した。外部APIの8 Action・レスポンス項目は不変。
- 画面構成（実装済み・表示のみ）
  - `/documents` 書類一覧（ファイル名・書類ID検索、照合状態の絞り込み）
  - 書類アップロード欄（PDF / JPG / PNG・1回1ファイル。既存の `validateDocumentFile` を再利用）
  - `/documents/:id` 書類詳細
  - 手動明細行の追加・修正
  - 商品ID検索と手動紐付け（既存の商品一覧APIを再利用。新しいAPIは追加しない）
  - 原本合計・明細合計・差額の表示
  - Drive原本を開くリンク
  - 未照合・一部照合・照合済みの状態表示
- API接続箇所：`src/pages/documents/lib/documentLedgerApi.ts` に集約し、`documents-relay` の8 Action（`import_document` / `list_documents` / `get_document` / `save_document_lines` / `delete_document_line` / `link_product_manual` / `unlink_product_manual` / `get_product_cost`）へ接続済み。`link_product_manual` は明細金額・割当金額の両方が未入力の場合 `ALLOCATED_AMOUNT_REQUIRED` を受け取り「割当金額を入力してください」と表示する。金額未入力は `null`、明示的な0円のみ `0` を送信する。
- フロント接続：一覧 `list_documents` / 詳細 `get_document` / アップロード `import_document`（仕入先名必須） / 明細保存 `save_document_lines` / 明細削除 `delete_document_line` / 紐付け `link_product_manual` / 解除 `unlink_product_manual`。商品ID検索は既存の商品一覧APIを再利用。
- 対象外（今回実装しない）：OCR、受付番号の自動照合、自動按分、利益計算、スタッフ認証、既存商品データの移行。
- 独立書類取込API：中継 `documents-relay` を配信済み（`verify_jwt:true`、`GAS_WEBHOOK_URL` / `GAS_ADMIN_SECRET` を既存中継と共用）。`list_documents` は DB 層で 0 件応答を確認済み。HTTP 実通信の最終確認はプレビューで実施（実機未確認）。
- 【2026-10-18 訂正】先行報告時点では、上記2 Action は**実際には配信されていなかった**（ワークスペースの `documents-relay/index.ts` に `ACTIONS` 追加・ハンドラ・ワーカートークン検証が存在せず、稼働中の関数は旧8 Action のまま）。ワーカーからの `register_drive_document` が `HTTP 400 UNSUPPORTED_ACTION` を返したのはこのため。`UNSUPPORTED_ACTION` は関数内の `KNOWN_ACTIONS` 判定でしか発生しないため、原因の特定はこれで確定。2 Action・`WORKER_ONLY_ACTIONS`・`requireWorkerToken`（`DOCUMENTS_WORKER_SECRET`、未設定 503 / 不一致 401、本文バリデーションより前に判定）・`x-bis-worker-token` の CORS 許可をファイルへ実装し、`documents-relay` を再配信した。
- Drive自動取込向けに `register_drive_document` / `update_document_folder` の 2 Action を追加（中継 v1.0.0）。両 Action は `x-bis-worker-token` ヘッダ（Backend Secret `DOCUMENTS_WORKER_SECRET`）必須で、未設定なら 503、不一致なら 401 を返す。ブラウザには秘密値を渡さない。`validate_only:true` で DB 書込なしの検証応答に対応。`register_drive_document` は既存 `drive_file_id` を再利用し `status` は pending / pending_amount のみ、`update_document_folder` は `drive_folder_id`（必要時 `drive_file_url`）と明示指定時のみ `status='processed'` を更新する。既存 8 Action の認証・挙動は不変。
- 表示確認データ：テスト書類1件（オークネット / 原本363,000 / 明細3行 / 差額0 / 確定紐付け1件）を登録。実取込ではなく表示確認用（論理削除で一覧から除外可能）。
- [x] **② 商品単位の書類添付UIは撤去済み（方針変更）** — 今後の仕入書類は独立した書類台帳（フェーズ6）で取り込み、商品との照合を行う
  - 撤去：商品詳細・商品編集の書類種別選択／ファイル選択／「書類を添付」ボタン／「未添付」表示（`ProductDocumentPanel`）、画像一括取込画面のセットごとの書類欄（`ImportSetDocumentField`）と、登録成功後の自動添付呼び出し（`useMultiSetImport` の document 状態・集計）
  - 維持：既に商品へ添付された書類の**閲覧リンクのみ**（管理APIレスポンスの `product.document` を使用。存在する場合だけ表示し、無ければ何も描画しない）。既存ファイル・商品との関連付けは削除しない
  - 不変更：GAS / Sheets / Drive のデータ・API（`attach_product_document` はGAS側に残置し、フロントからは呼ばない）、`productDocument.ts` の検証ヘルパ（書類台帳が再利用）、書類台帳の画面・アップロード・照合機能、公開状態・商品編集などの周辺操作
  - 実装状況：フロント撤去・ビルド成功。プレビューでの最終確認はスタッフが実施