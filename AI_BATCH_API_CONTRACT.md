# AI一括出品ドラフト生成 (Batch Draft) API契約仕様書

本ドキュメントは、ReaddyフロントエンドとGASバックエンド間の「一括AI出品ドラフト生成」に関する連携仕様を定義したものです。

---

## 1. 接続アーキテクチャ & 概要

### 1.1 概要
- クライアント（Readdy）が最大20件の商品IDを一括で受付リクエストします。
- GASバックエンドは即座に `batch_id` を発行し、HTTPレスポンスを返します（非同期受付）。
- ブラウザを閉じても、GASの時間主導型バックグラウンドワーカーが順次生成を継続します。
- 生成結果は既存の `product_ai_drafts` シートに `review_status: "pending_review"` として保存されます（自動確定・公開・Square登録は行われません）。
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
  - `force_regenerate`: 任意（boolean、デフォルト `false`。既に確定済みドラフトが存在する場合に再生成を許可するか）。
  - `model_name`: 任意（モデル指定。省略時はシステムデフォルトの `gemini-3.5-flash-lite`）。

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
  - `request_id`: 必須（再試行リクエストの冪等性キー）。

- **Success Response (HTTP 200)**:
  ```json
  {
    "success": true,
    "batch_id": "BAT_20261005_123456_abc",
    "status": "queued",
    "total_count": 3,
    "retried_count": 1,
    "completed_count": 2,
    "failed_count": 0,
    "updated_at": "2026-10-05T10:05:00.000Z"
  }
  ```
  ※ 失敗商品が0件の場合は `retried_count: 0` でバッチステータスは変化しません。

- **主なエラー**:
  - `BATCH_NOT_FOUND`: 指定された `batch_id` が存在しない。
  - `NO_FAILED_ITEMS`: 失敗した商品がなく、再試行不要。

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
| `pending` | ワーカーによる生成実行待ち |
| `processing` | 現在ワーカーが画像取得・LLM呼び出し・保存中 |
| `completed` | 生成完了。`product_ai_drafts` に `pending_review` で保存済み |
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
4. **リースと実行ID保護**:
   - アイテム取得時に `worker_execution_id` と `lease_expires_at`（5分後）を記録。
   - 実行が異常中断（GASタイムアウト等）した場合でも、リース期限切れのアイテムは後続ワーカーが安全に回収・再実行。
   - 古いワーカーが遅れて完了しても、現在の実行IDと不一致の場合は結果の上書きを破棄（Fencing）。
5. **保存済み候補の自動回収**:
   - `product_ai_drafts` への保存後にワーカーが中断した場合、次回実行時に既存候補の有無を確認し、二重生成を回避してステータスを `completed` に復帰。
6. **一時エラーのリトライ制御**:
   - HTTP 429（Rate Limit）や 503（Overloaded）、一時通信エラー時は最大3回まで再試行。
   - ワーカー内で長時間スリープせず、`next_retry_at` に次回試行時刻を設定してトリガーを終了。次回ワーカーが期限到達後に処理。
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