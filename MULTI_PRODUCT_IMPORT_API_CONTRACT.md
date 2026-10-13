# 複数商品・画像インポート (Multi-Product Image Import) API契約仕様書

本ドキュメントは、Readdyフロントエンド（管理画面SPA）および中継サーバーとGASバックエンド間の「画像による商品インポート（`import_attempt_id` による厳格な冪等性担保）」に関する連携仕様を定義したものです。

---

## 1. 背景と設計原則

### 1.1 逐次送信への統一（Sequential Execution Only）
- クライアント（Readdy）は、複数商品を取り扱う場合であっても、**商品セット（1商品＝画像1〜20枚＋属性）ごとに 1 リクエストとして逐次（Sequential）送信**します。
- 一括配列リクエストや同時並行リクエストは行いません。
  - **理由**: GAS Web App の POST ペイロード制限（数MB〜十数MB）、実行時間制限（最大6分、同期応答は数十秒推奨）、排他ロック待機競合、およびネットワーク瞬断時の局所再試行（失敗した商品セットのみピンポイント再送）を最も確実に行うため。

### 1.2 既存登録処理との共通化と後方互換性の保証範囲
- **現行登録処理（`action` なし・`import_attempt_id` なし）の互換性**:
  - `action` なし・`import_attempt_id` なしの従来リクエストは、既存の `handleCreateProduct` コア処理をそのまま通過し、従来のレスポンス形式（`version: "product-create-v2"`）を維持します。また、商品IDの採番や既存データ重複検知（例: ポケモンカード属性衝突時のエラー）も従来通りの挙動を保持します。
- **新ルート (`action: "import_product_by_images"` または `import_attempt_id` 指定)**:
  - `import_attempt_id` による台帳管理・指紋照合・リカバリ機構を通過した後、共通コア登録ロジックを呼び出し、インポート専用レスポンス（`version: "product-import-v1"`）を返します。
  - `action` が省略された場合でも、`import_attempt_id` が含まれていれば自動的に新インポートロジックが適用されます。
- **属性のフラット構造 & Base64 直接デコード**:
  - 現行コードと同様に、商品属性はネストせず**トップレベル**（`data.category`, `data.brand`, `data.product_name` 等）で受け付けます。
  - 画像の base64 は `Utilities.base64Decode` で直接デコードして Drive に保存します。

### 1.3 認証境界と下書き固定による保護範囲
- **ブラウザへのシークレット露出防止**:
  - ブラウザSPA（Readdy）に `ADMIN_API_KEY` を持たせることはセキュリティ上禁止します。
  - 本APIは、現行の商品登録画面（`handleCreateProduct`）と同様に、ブラウザから直接リクエストされる場合リクエストボディに `admin_key` を要求しません。
- **下書き固定による直接公開の防止**:
  - 本インポートルートで取り込まれる商品は、**入力値に関わらず常に `publish_status = "draft"` に固定**して登録されます。
  - 本API自体は下書き作成に特化しており、直接公開（`published`）する機能は持ちません。商品の公開や Square Production 決済URL生成・同期は、スタッフによる確認または管理者認証（`verifyAdminAccess_`）を伴う既存の公開処理（`assertProductPublishable_` 等）の管轄となります。

### 1.4 テスト用パラメータの外部遮断
- 開発・テスト用のステージ中断シミュレーション（`_testInterruptStage`）は、外部 POST の JSON ボディから指定されてもサーバー側で完全に無視されます。外部からの障害注入・例外誘発は不可能です。

---

## 2. API エンドポイント詳細

### 2.1 商品画像インポート (`import_product_by_images`)

- **Method**: `POST`
- **Path**: `/exec`
- **送信方式**: 1商品セットごとに**逐次実行**（前のレスポンス受信後に次の商品を送信）
- **Request Body**:
  ```json
  {
    "action": "import_product_by_images",
    "import_attempt_id": "IMP_20261009_9f8b2a1c-4e3d-4c2b-a1b0-123456789abc",
    "images": [
      {
        "base64": "/9j/4AAQSkZJRg...",
        "file_name": "IMG_0001.jpg",
        "mime_type": "image/jpeg"
      },
      {
        "base64": "/9j/4AAQSkZJRg...",
        "file_name": "IMG_0002.jpg",
        "mime_type": "image/jpeg"
      }
    ],
    "category": "sneakers",
    "brand": "Nike",
    "product_name": "Air Jordan 1 High OG",
    "condition": "A",
    "purchase_price": 20000,
    "planned_sale_price": 35000,
    "storage_location": "A-01",
    "description": "2023年復刻モデル。黒タグ付属。",
    "notes": "Readdy逐次インポート",
    "sneaker_sku": "DZ5485-612",
    "sneaker_size": "27.5"
  }
  ```

#### リクエストパラメータ仕様
| パラメータ | 必須 | 型 | 説明 |
| :--- | :---: | :---: | :--- |
| `action` | 任意 | string | `"import_product_by_images"`（省略時は `import_attempt_id` 有無で自動判定） |
| `import_attempt_id` | **必須** | string | クライアントが商品セットごとに発行する一意な試行ID（UUID v4 等） |
| `images` | **必須** | array | 1〜20件の画像オブジェクト配列 |
| `images[].base64` | **必須** | string | 画像の Base64 文字列（data URI スキーム有無両対応） |
| `images[].file_name` | 任意 | string | ファイル名（省略時: `image.jpg`） |
| `images[].mime_type` | 任意 | string | MIMEタイプ（省略時: `image/jpeg`） |
| `category` | 任意 | string | カテゴリ（例: `"sneakers"`, `"jewelry"`, `"pokemon_card"`） |
| `brand` | 任意 | string | ブランド名 |
| `product_name` | 任意 | string | 商品名（AIドラフト生成前の初期仮称など） |
| `condition` | 任意 | string | 状態（S, A, B, C 等） |
| `purchase_price` | 任意 | number | 仕入価格 |
| `planned_sale_price` | 任意 | number | 予定販売価格 |
| `storage_location` | 任意 | string | 保管場所 |
| `description` | 任意 | string | 商品説明 |
| `notes` | 任意 | string | 社内備考 |
| `sneaker_*` / `jewelry_*` | 任意 | string/number | 各カテゴリ固有属性 |
| `pokemon_card` | 任意 | object | ポケモンカード用属性オブジェクト |
| `publish_status` | 任意 | string | **※指定値に関わらず常に `"draft"` 固定で登録されます** |

---

### 2.2 レスポンス仕様

#### ① 初回成功レスポンス (HTTP 200)
```json
{
  "success": true,
  "version": "product-import-v1",
  "import_attempt_id": "IMP_20261009_9f8b2a1c-4e3d-4c2b-a1b0-123456789abc",
  "product_id": "TMP-000100",
  "is_reused": false,
  "status": "completed",
  "publish_status": "draft",
  "inventory_status": "in_stock",
  "record_status": "active",
  "drive_folder_url": "https://drive.google.com/drive/folders/1abc...",
  "main_image_url": "https://drive.google.com/uc?id=...",
  "image_count": 2,
  "created_at": "2026-10-09T02:30:00.000Z"
}
```

#### ② 同一 `import_attempt_id` 再送（冪等性ヒット）レスポンス (HTTP 200)
同一の `import_attempt_id` かつ同一内容で再送された場合、新規採番やDrive作成を一切行わず、初回作成結果をそのまま返します（本票行重複ゼロ）。
```json
{
  "success": true,
  "version": "product-import-v1",
  "import_attempt_id": "IMP_20261009_9f8b2a1c-4e3d-4c2b-a1b0-123456789abc",
  "product_id": "TMP-000100",
  "is_reused": true,
  "status": "completed",
  "publish_status": "draft",
  "inventory_status": "in_stock",
  "record_status": "active",
  "drive_folder_url": "https://drive.google.com/drive/folders/1abc...",
  "main_image_url": "https://drive.google.com/uc?id=...",
  "image_count": 2,
  "created_at": "2026-10-09T02:30:00.000Z"
}
```

#### ③ エラーレスポンス仕様
| エラーコード | 契機 | 説明 |
| :--- | :--- | :--- |
| `IMPORT_ATTEMPT_ID_REQUIRED` | `import_attempt_id` 未指定 | 必須ID不足 |
| `EMPTY_IMAGES` | 画像配列が空または未指定 | 登録画像なし |
| `MAX_IMAGE_COUNT_EXCEEDED` | 画像が20枚を超過 | 1商品あたり上限20枚 |
| `EMPTY_IMAGE_BASE64` | 画像配列内に空の base64 が存在 | 台帳作成・採番前の事前検証拒絶 |
| `INVALID_IMAGE_BASE64` | 不正な base64 データ | Base64デコード失敗・バイト長0による拒絶 |
| `IMPORT_IDEMPOTENCY_PAYLOAD_MISMATCH` | 同一IDで異なる画像や属性を送信 | ペイロード不整合（フェイルクローズで即時拒絶） |
| `IMPORT_DRIVE_FOLDER_NOT_FOUND` | 本票行ありだがDriveフォルダ欠損 | データ不整合検知による中断（フェイルクローズ） |
| `IMPORT_DRIVE_IMAGES_NOT_FOUND` | 本票行ありだがDriveフォルダ内の画像が欠損 | 登録対象画像欠損による中断（フェイルクローズ） |
| `IMPORT_DRIVE_IMAGE_CONTENT_MISMATCH` | Drive内に同名で内容が異なる画像が存在 | 画像改ざん・競合検知による中断（フェイルクローズ） |
| `DRIVE_FOLDER_CREATE_FAILED` | Driveフォルダ作成失敗 | Driveアクセス権・障害 |
| `DRIVE_IMAGE_SAVE_FAILED` | 画像デコード・保存失敗 | 不正Base64等 |
| `SHEET_APPEND_FAILED` | スプレッドシート保存失敗 | 本票書き込み例外 |

---

## 3. 冪等性と障害リカバリの厳格設計

### 3.1 ペイロード指紋（Payload Fingerprint）の計算
同じ `import_attempt_id` が送られた場合、サーバー側で受信ペイロードの SHA-256 ハッシュを計算し、台帳に保存された値と完全一致するか照合します。
- **事前検証**: 指紋計算および台帳行作成・商品ID採番に先立ち、全画像の有効な base64 データを事前検証します。空または不正な base64 が1枚でも含まれる場合は台帳や採番を汚染することなく即時拒絶（`EMPTY_IMAGE_BASE64` / `INVALID_IMAGE_BASE64`）します。
- **対象要素**:
  1. **画像群の内容と順序**: 各画像の `index`、`file_name`、`mime_type`、および `base64` 文字列
  2. **登録に影響する属性**: `category`, `brand`, `product_name`, `condition`, `purchase_price`, `planned_sale_price`, `storage_location`, `description`, `notes`, `sneaker_*`, `jewelry_*`, `pokemon_card`
  3. **公開状態**: 常に `"draft"` 固定として指紋を算出
- **判定**: 画像順序の入れ替え、画像データの改変、属性値の1文字の変更でも指紋が不一致となり、`IMPORT_IDEMPOTENCY_PAYLOAD_MISMATCH` で即時拒絶（Fail-Closed）します。

### 3.2 台帳・本票行・Driveフォルダの実体照合と安全な回復（Fail-Closed 原則）
同一 `import_attempt_id` の再送時には、台帳のステータスフラグのみを信頼せず、実体データ（本票行、Driveフォルダ、フォルダ内画像）の存在と内容整合性を直接確認します。本票行の有無によって回復方法を明確に区別します：

1. **本票行が存在する場合 (`existingRowIndex !== null`)【完了済み再送・行追加後の回収】**:
   - 本票に行が既に作成されているため、登録対象画像群（`01_main_...`, `02_...` 等）の全件がDriveフォルダ内に実在することを必須とします。
   - **画像欠損時のフェイルクローズ**: 1枚でも画像が欠損（削除・ゴミ箱移動）している場合は成功を返さず、`IMPORT_DRIVE_IMAGES_NOT_FOUND` エラーで即時中断します。
   - **内容不一致時のフェイルクローズ**: フォルダ内の画像内容がリクエストの画像と一致しない場合は、`IMPORT_DRIVE_IMAGE_CONTENT_MISMATCH` エラーで即時中断します。
   - 本票行の重複追加（`appendRow`）は絶対に実行しません。

2. **本票行が存在しない場合 (`existingRowIndex === null`)【地点1: 部分アップロードからの回復】**:
   - 画像保存途中で中断した状態からの安全な復旧を行います。
   - **内容照合による安全な流用**: フォルダ内に同名ファイルが存在する場合、ファイル名だけでなく画像内容（Base64バイト列）が完全一致するか検証します。内容が一致する画像のみを前回の保存済みファイルとして安全に流用し、未保存の残りの画像のみを新規保存します。
   - **競合検知と自動ゴミ箱移動の禁止**: 同名で内容が異なるファイルが存在する場合、既存ファイルを自動でゴミ箱に移したり誤流用したりせず、`IMPORT_DRIVE_IMAGE_CONTENT_MISMATCH` エラーで即時中断します。
   - 全画像が正常に揃った後にはじめて本票への行追加（`appendRow`）を 1 回だけ行います。

### 3.3 各障害地点における途中失敗と再送時の動作（商品行重複ゼロ）

| 失敗地点 | 状態 | 再送時のリカバリ挙動 | 本票行の重複 |
| :--- | :--- | :--- | :---: |
| **地点1: 画像保存途中**<br>(フォルダ作成後、画像保存中に失敗) | 台帳: `failed`<br>本票行: 未作成<br>Drive: 一部画像のみ | 本票行が存在しないことを確認。予約済み `product_id` を維持し、既存Drive画像を流用・未保存分のみ追加して本票に 1 回だけ行追加。 | **重複なし**<br>(1行のみ) |
| **地点2: 行追加後**<br>(`appendRow` 直後、状態列AF〜AH書込み前に失敗) | 台帳: `sheet_appended`<br>本票行: 実在<br>Drive: 完全保存済 | 本票行およびDriveフォルダの実在を検知。新規行追加（`appendRow`）は絶対に実行せず、既存行の状態列（AF: draft, AG: in_stock, AH: active）を補完更新して完了。 | **重複なし**<br>(既存行のみ) |
| **地点3: 状態列書込み途中**<br>(AF書込み後、AG/AH前に失敗) | 台帳: `sheet_appended`<br>本票行: 実在<br>Drive: 完全保存済 | 地点2と同様に本票行およびDriveフォルダの実在を検知。新規行追加は行わず、不足している状態セルのみを安全に更新して完了。 | **重複なし**<br>(既存行のみ) |
| **地点4: 応答喪失**<br>(全完了後、HTTPレスポンス通信断) | 台帳: `completed`<br>本票行: 完全実在<br>Drive: 完全保存済 | 台帳・本票行・Driveフォルダの実体照合を通過。一切の追加書き込みを行わず、保存済み情報を `is_reused: true` で即時返却。 | **重複なし**<br>(既存行のみ) |

---

## 4. 台帳シート (`import_attempts`) 定義

スプレッドシート内に専用シート `import_attempts` を自動生成し、状態を管理します。

| 列番号 | カラム名 | 型 | 説明 |
| :---: | :--- | :--- | :--- |
| 1 | `attempt_id` | string | `import_attempt_id` (PK) |
| 2 | `status` | string | `initiated` / `drive_saved` / `sheet_appended` / `completed` / `failed` |
| 3 | `payload_fingerprint` | string | SHA-256 指紋 (hex) |
| 4 | `product_id` | string | 発行された商品ID (`TMP-XXXXXX`) |
| 5 | `drive_folder_id` | string | Drive フォルダ ID |
| 6 | `drive_folder_url` | string | Drive フォルダ URL |
| 7 | `main_image_url` | string | メイン画像 URL |
| 8 | `image_count` | number | 登録画像枚数 |
| 9 | `error_message` | string | 失敗時エラー |
| 10 | `created_at` | string | 初回受付日時 (ISO 8601) |
| 11 | `updated_at` | string | 最終更新日時 (ISO 8601) |
