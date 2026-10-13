# AI一括出品ドラフト生成 (Batch Draft) API契約仕様書

本ドキュメントは、ReaddyフロントエンドとGASバックエンド間の「一括AI出品ドラフト生成」に関する連携仕様を定義したものです。

---

## 1. 接続アーキテクチャ & 概要

### 1.1 概要
- クライアント（Readdy）が最大20件の商品IDを一括で受付リクエストします。
- GASバックエンドは即座に `batch_id` を発行し、HTTPレスポンスを返します（非同期受付）。
- ブラウザを閉じても、GASの時間主導型バックグラウンドワーカーが順次生成を継続します。
- 生成結果は既存の `product_ai_drafts` シートに保存されます。
  - v77以降（本番v79）のバッチワーカーは自動反映（`auto_apply`）を行い、本票・英文翻訳・ポケカ属性へ反映したうえで `review_status: "confirmed"`（`confirmed_by: "ai_batch_worker"`）として確定し、反映完了判定（`verifyProductDraftReflectionCompleted_`）を通過した場合のみ `completed` にします。
  - スタッフ入力済みの価格・サイズは上書きしません。スタッフ編集が検知された場合は反映せず `SOURCE_MODIFIED_DURING_GENERATION` で失敗します。
  - 公開・Square登録は行いません。公開時は従来どおり公開ゲート（`assertProductPublishable_`）で確定指紋・スニーカーサイズ等を検証します。
- クライアントは `batch_id` を用いて進捗・結果をポーリング取得します。
- 一部商品が失敗した場合は、成功分を再生成することなく失敗分のみを再試行できます。

### 1.2 共通認証パラメータ
既存のAIドラフトAPIと同様、管理者認証（`verifyAdminAccess_`）を適用します。
- **POST Body**:
  - `"mode": "admin"` （必須）
  - `"admin_key": "<ADMIN_API_KEY>"` （`token` または `key` でも可）
- **GET クエリ**:
  - `?mode=admin&admin_key=<ADMIN_API_KEY>`

---

## 2. API エンドポイント詳細

### 2.1 一括生成受付 (`create_ai_product_draft_batch`)
最大20件の商品IDを受け付け、バッチジョブを作成して `batch_id` を即時返却します。

- **Method**: `POST`
- **Path**: `/exec`
- **Request Body**:
  ```json
  {
    "action": "create_ai_product_draft_batch",
    "mode": "admin",
    "admin_key": "<ADMIN_API_KEY>",
    "request_id": "REQ_BATCH_20261005_001",
    "product_ids": [
      "TMP-000088",
      "TMP-000090",
      "TMP-000091"
    ],
    "force_regenerate": false,
    "model_name": "gemini-3.5-flash-lite"
  }
  ```
  - `request_id`: 必須（クライアントが生成するUUIDやユニーク文字列。冪等性キー）。
  - `product_ids`: 必須（配列。最大20件。重複IDはサーバー側で自動排除）。
  - `force_regenerate`: 任意（boolean、デフォルト `false`。既に確定済みドラフトが存在する場合に再生成を許可するか）。`false` で確定済みドラフトがある商品は `CONFIRMED_DRAFT_EXISTS` で失敗します。
  - `model_name`: 任意（モデル指定。省略時はシステムデフォルトの `gemini-3.5-flash-lite`）。英数字で始まり英数字・`.`・`_`・`-` のみ、64文字以内。
  - `force_regenerate` / `model_name` は `ai_batch_jobs` シートの同名列（既存12列の後ろに追加）へ保存され、ワーカーが各商品の生成時に使用します。列が無い既存シートは初回アクセス時に末尾へ列を追加し、旧ジョブは既定値（`false` / 空=デフォルトモデル）で処理します。
  - モデル指定時はフォールバックモデルへ自動切替しません（既存の単品生成と同じ挙動）。

- **Success Response (HTTP 200)**:
  ```json
  {
    "success": true,
    "batch_id": "BAT_20261005_123456_abc",
    "request_id": "REQ_BATCH_20261005_001",
    "status": "queued",
    "total_count": 3,
    "is_reused": false,
    "created_at": "2026-10-05T10:00:00.000Z"
  }
  ```
  ※ 同一の `request_id` で再送された場合、新規バッチは作成せず既存のバッチ情報を返します（`is_reused: true`）。

- **主なエラー**:
  - `REQUEST_ID_REQUIRED`: `request_id` が未指定または空文字。
  - `EMPTY_PRODUCT_IDS`: `product_ids` が空配列。
  - `MAX_BATCH_SIZE_EXCEEDED`: `product_ids` の件数が20件を超過。
  - `UNAUTHORIZED_ADMIN_ACCESS`: 管理者キー不一致または未指定。

---

### 2.2 バッチ進捗・結果取得 (`get_ai_product_draft_batch`)
`batch_id` を指定して、バッチ全体の進捗と商品別の生成状態を取得します。

- **Method**: `GET` (または `POST`)
- **Path**: `/exec?mode=admin&admin_key=<ADMIN_API_KEY>&action=get_ai_product_draft_batch&batch_id=BAT_20261005_123456_abc`
- **POST時の Body**:
  ```json
  {
    "action": "get_ai_product_draft_batch",
    "mode": "admin",
    "admin_key": "<ADMIN_API_KEY>",
    "batch_id": "BAT_20261005_123456_abc"
  }
  ```

- **Success Response (HTTP 200)**:
  ```json
  {
    "success": true,
    "batch_id": "BAT_20261005_123456_abc",
    "request_id": "REQ_BATCH_20261005_001",
    "status": "processing",
    "total_count": 3,
    "completed_count": 1,
    "failed_count": 0,
    "processing_count": 1,
    "created_at": "2026-10-05T10:00:00.000Z",
    "updated_at": "2026-10-05T10:01:30.000Z",
    "completed_at": null,
    "items": [
      {
        "product_id": "TMP-000088",
        "status": "completed",
        "draft_id": "DRFT_TMP-000088_1728122490000",
        "draft_version": 1,
        "model_name": "gemini-3.5-flash-lite",
        "error_code": null,
        "error_message": null,
        "retry_count": 0
      },
      {
        "product_id": "TMP-000090",
        "status": "processing",
        "draft_id": null,
        "draft_version": null,
        "model_name": null,
        "error_code": null,
        "error_message": null,
        "retry_count": 0
      },
      {
        "product_id": "TMP-000091",
        "status": "pending",
        "draft_id": null,
        "draft_version": null,
        "model_name": null,
        "error_code": null,
        "error_message": null,
        "retry_count": 0
      }
    ]
  }
  ```

- **主なエラー**:
  - `BATCH_ID_REQUIRED`: `batch_id` が未指定。
  - `BATCH_NOT_FOUND`: 指定された `batch_id` が存在しない。

---

### 2.3 失敗商品のみ再試行 (`retry_ai_product_draft_batch`)
バッチ内で `failed` になった商品のみを `pending` に戻し、再処理を受け付けます。成功（`completed`）済み商品は再実行されません。

- **Method**: `POST`
- **Path**: `/exec`
- **Request Body**:
  ```json
  {
    "action": "retry_ai_product_draft_batch",
    "mode": "admin",
    "admin_key": "<ADMIN_API_KEY>",
    "batch_id": "BAT_20261005_123456_abc",
    "request_id": "REQ_RETRY_20261005_001"
  }
  ```
  - `batch_id`: 必須（再試行対象のバッチID）。
  - `request_id`: 必須（再試行リクエストの冪等性キー。未指定は `REQUEST_ID_REQUIRED`）。

- **Success Response (HTTP 200)**:
  ```json
  {
    "success": true,
    "batch_id": "BAT_20261005_123456_abc",
    "request_id": "REQ_RETRY_20261005_001",
    "status": "queued",
    "total_count": 3,
    "retried_count": 1,
    "completed_count": 2,
    "failed_count": 0,
    "is_reused": false,
    "updated_at": "2026-10-05T10:05:00.000Z"
  }
  ```
  - 失敗商品は `pending` に戻り、`error_code` / `error_message` / `retry_count` / `next_retry_at` / ワーカー情報をクリアします。`draft_id`（候補との対応付け）は保持し、回収時の照合に使います。
  - **冪等性**: 処理済みの `request_id` と応答は `ai_batch_jobs.retry_requests` 列（JSON、1バッチあたり直近50件）に記録されます。同一 `request_id` の再送（遅延再送を含む）は再試行を重複登録せず、初回応答に `is_reused: true` を付けて返します。新しい再試行には新しい `request_id` を使ってください。

- **失敗商品が0件の場合 (HTTP 200)**:
  ```json
  {
    "success": false,
    "error_code": "NO_FAILED_ITEMS",
    "message": "No failed items to retry in batch: BAT_20261005_123456_abc",
    "batch_id": "BAT_20261005_123456_abc",
    "request_id": "REQ_RETRY_20261005_002",
    "status": "completed",
    "retried_count": 0,
    "is_reused": false
  }
  ```
  バッチステータスは変更しません（実際の応答には `total_count` / `completed_count` / `failed_count` / `updated_at` も含みます）。この応答も `request_id` ごとに記録され、再送時は同一内容（`is_reused: true`）を返します。

- **主なエラー**:
  - `BATCH_ID_REQUIRED`: `batch_id` が未指定。
  - `REQUEST_ID_REQUIRED`: `request_id` が未指定または空文字。
  - `BATCH_NOT_FOUND`: 指定された `batch_id` が存在しない。
  - `NO_FAILED_ITEMS`: 失敗した商品がなく、再試行不要（`success: false`）。

---

## 3. 状態値とライフサイクル

### 3.1 バッチ全体ステータス (`batch.status`)
| ステータス | 説明 |
| :--- | :--- |
| `queued` | ジョブ登録完了、ワーカーによる処理開始待ち |
| `processing` | ワーカーが処理を実行中（一部完了または処理中商品あり） |
| `completed` | バッチ内の全商品が正常に生成完了 (`completed_count === total_count`) |
| `partially_failed` | 全商品の処理が終了したが、一部が失敗した状態 |
| `failed` | 全商品が失敗した状態 |

### 3.2 商品別ステータス (`item.status`)
| ステータス | 説明 |
| :--- | :--- |
| `pending` | ワーカーによる生成実行待ち（一時エラー後は `next_retry_at` 到達まで待機） |
| `processing` | 現在ワーカーが画像取得・LLM呼び出し・保存中 |
| `completed` | 生成・自動反映・確定が完了し、反映完了判定を通過（`draft_id` はこのアイテムで生成・予約した候補） |
| `failed` | リトライ上限超過または恒久的エラーにより失敗 |

---

## 4. ワーカー実行仕様

1. **時間主導型トリガー**:
   - システム全体で共有のトリガー `processAiBatchQueue`（1分間隔）を1つのみ設置。
   - 既存トリガーの存在確認を行い、多重作成を防止。
2. **実行リソース制約**:
   - 1回のトリガー実行あたり最大3件、最長約4分（240秒）を目安とする。
   - 次のLLM呼び出し（所要約30〜45秒）を開始する時間的余裕がない場合、残件は次回トリガーへ引き継ぐ。
3. **排他制御 (ScriptLock)**:
   - キューからのアイテム取得時および完了保存時の数ミリ秒〜数秒間のみ `ScriptLock` を使用。
   - Google Driveからの画像バイナリ取得およびGemini API通信中には **ScriptLockを保持しない**。
4. **リースと実行ID保護（保存直前の所有権確認）**:
   - アイテム取得時に `worker_execution_id` と `lease_expires_at`（5分後）を記録。
   - 実行が異常中断（GASタイムアウト等）した場合でも、リース期限切れのアイテムは後続ワーカーが安全に回収・再実行。
   - 候補保存・本票/英文/ポケカ反映の直前に、短い ScriptLock 内で「アイテムが `processing`・自分の `worker_execution_id`・リース有効」と「商品のAI生成実行ロックが自分のもの」を確認します。満たさない場合は `BATCH_ITEM_OWNERSHIP_LOST` 等で書込みを行いません。
   - 所有権確認を通過した時点でアイテムの `draft_id` / `draft_version` / `model_name` を予約記録してから候補を保存します。
   - 古いワーカーは、新しいワーカーの結果・状態（`status` / `worker_execution_id` / `draft_id` / `error_code` 等）を変更しません。
5. **保存済み候補の自動回収（アイテム対応候補のみ）**:
   - 回収対象は、アイテムに予約記録された `draft_id` と一致する最新候補のみです。「最新ドラフトが存在する」だけで過去の候補（単品生成分や別バッチ分）を流用しません。
   - 予約 `draft_id` が最新候補と一致: 確定済みなら反映完了判定、未確定なら所有権・最新性・他生成中を確認したうえで反映・確定し、完了判定を通過すれば `completed`。
   - 予約 `draft_id` の候補が既により新しい候補に置き換わっている: `AI_DRAFT_SUPERSEDED` で失敗（古い候補で上書きしない）。
   - 予約のみで候補が未保存: 再生成します。
6. **一時エラーのリトライ制御（構造化エラーコードで判定）**:
   - 再試行対象は `LLM_HTTP_ERROR_429` / `500` / `502` / `503` / `504` と `LLM_COMMUNICATION_FAILED`（通信例外）のみ。メッセージ文字列では判定しません（`error_message` は安全な固定文言）。
   - 最大3回まで再試行（初回を含め最大4回実行）。待機は `60秒 × 再試行回数`。上限到達後は `failed`、`next_retry_at` は空にします。
   - ワーカー内で長時間スリープせず、`next_retry_at` に次回試行時刻を設定してトリガーを終了。次回ワーカーが期限到達後に処理。
   - `LLM_HTTP_ERROR_400` / `403`、`STRUCTURED_PARSE_FAILED`、`GENERATION_ALREADY_IN_PROGRESS` 等は再試行せず `failed`（失敗分のみ再試行APIで再投入可能）。
7. **独立障害耐性**:
   - 1件の商品が画像欠損やエラーで失敗しても、同一バッチ内の残りの商品の処理は停止せず継続。

---

## 5. Readdy・中継（gas-ai-batch-relay）・GAS 接続構成

本バッチ処理では、ブラウザ側に GAS URL や `ADMIN_API_KEY` を露出させないため、専用中継サービス `gas-ai-batch-relay` を経由して接続します。

### 5.1 役割分担
```text
Readdy (フロントエンド)
  │
  │  POST / GET (Bearer JWT / CORS 制御)
  │  ※ mode や admin_key の送信は不要
  ▼
gas-ai-batch-relay (中継サーバー)
  │
  ├─ CORS オリジン照合 (`ALLOWED_ORIGINS`)
  ├─ JWT 署名・期限検証 (`JWT_SECRET`, HS256)
  ├─ 対象3アクションの選別とクライアント入力バリデーション
  ├─ サーバー側環境変数より mode: "admin", admin_key: GAS_ADMIN_SECRET を付与
  ▼
Google Apps Script (GAS Web App)
  URL: /exec
```

### 5.2 Readdy 実装時の留意点
1. **認証情報の秘匿**:
   - Readdy は `mode` や `admin_key` をリクエストに含める必要はありません（リレー側で安全に注入されます）。
   - クライアント側から送信された場合でも、中継サーバー側で上書き破棄されます。
2. **受付前 request_id の永続化**:
   - `create_ai_product_draft_batch` 呼出し前にクライアント側で `request_id` をローカルDB/Storageへ保存し、通信切断時や再送時に同一 `request_id` を送信することで安全に冪等性を担保します。
3. **ポーリング間隔**:
   - `get_ai_product_draft_batch` のポーリング間隔は 3秒〜5秒 を推奨します。ワーカーは1分間隔のトリガーまたは手動起動で順次処理を進めます。

