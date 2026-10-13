# 商品書類（請求書・領収書）添付 API契約仕様書

本ドキュメントは、Readdyフロントエンド（画像だけ取込 `/import`）とGASバックエンド間の
「商品セットごとの任意の書類（請求書・領収書）添付」に関する連携仕様を定義します。

> 注: 本GAS変更はまだ本番未反映です。フロントは本契約に合わせて実装済みです。
> GAS側の実装完了・本番反映後に実API/実画面で確認が必要です。

---

## 1. 概要

- 1商品につき書類は **1件**（MVP）。受け付ける形式は **PDF / JPG / PNG**。10MBまで。
- 書類は **任意**。未添付でも商品登録は従来どおり完了する。
- 書類は **商品画像の取込（`import_product_by_images`）とは別リクエスト**で送信する。
- 画像取込が成功して `product_id` を取得した後、その **同じ `product_id`** に対して
  書類だけを送る（商品の再登録は行わない）。
- **既存商品にも後から書類を1件だけ添付できる**（商品詳細・編集画面）。この場合も
  同じ `attach_product_document` へ、既存商品の `product_id` を使って別リクエストで送る。
  既に書類が1件ある商品では添付欄を出さず、登録済み書類のリンクを表示する（差し替えなし）。
- 通信失敗時は **商品を再登録せず、同じ `product_id` へ書類だけを再送**する。
  そのためリクエストに **書類用の再送識別子（`idempotency_key`）** を含める。
- 添付済みの書類がある場合は状態を表示し、**別書類の競合時は勝手に上書きしない**。
- 書類の金額を仕入原価へ反映しない。OCRや複数明細への対応も行わない。
- 書類（JPG/PNG）を商品画像のサムネイルやAI生成対象画像として扱わない。

---

## 2. API エンドポイント詳細

### 2.1 書類添付 (`attach_product_document`)

- **Method**: `POST`
- **Path**: `/exec`
- **Content-Type**: `text/plain;charset=utf-8`（既存の画像取込と同じ直接POST方式。
  ブラウザには管理者キーを置かない）
- **Request Body**:
  ```json
  {
    "action": "attach_product_document",
    "product_id": "TMP-000115",
    "idempotency_key": "DOC_20261012_3f2c...",
    "document_type": "invoice",
    "file_name": "invoice_2026-10-12.pdf",
    "mime_type": "application/pdf",
    "base64": "<base64 body>"
  }
  ```
  - `product_id`: 必須（画像取込で得た、または既存商品のID）。
  - `idempotency_key`: 必須（クライアント生成の再送識別子／冪等性キー）。
    同一キー・同一内容の再送は、同一書類として扱い二重添付しないこと（`is_reused: true` を推奨）。
  - `document_type`: 必須（`invoice`（請求書）/ `receipt`（領収書））。
  - `file_name` / `mime_type` / `base64`: 必須（書類1件）。

- **Success Response (HTTP 200)**:
  ```json
  {
    "success": true,
    "version": "1.0",
    "product_id": "TMP-000115",
    "is_reused": false,
    "document": {
      "file_name": "invoice_2026-10-12.pdf",
      "mime_type": "application/pdf",
      "view_url": "https://drive.google.com/file/d/xxxx/view",
      "display_url": "https://drive.google.com/file/d/xxxx/view",
      "size": 182344,
      "attached_at": "2026-10-12T10:00:00.000Z"
    }
  }
  ```
  - `is_reused: true`（同一 `idempotency_key` の再送ヒット）も成功として扱う。
  - `document.file_name` は **元のファイル名** を返すこと（表示に使う）。

- **競合 Error Response（既に別書類が添付済み）**:
  ```json
  {
    "success": false,
    "error_code": "DOCUMENT_ALREADY_ATTACHED",
    "message": "既に別の書類が添付されています。上書きはできません。",
    "document": {
      "file_name": "existing_invoice.pdf",
      "mime_type": "application/pdf",
      "view_url": "https://drive.google.com/file/d/yyyy/view"
    }
  }
  ```
  - フロントは競合として表示し、**上書きしない**。既存書類（`document`）があれば表示する。

- **主なエラー**:
  - `DOCUMENT_ALREADY_ATTACHED` / `DOCUMENT_CONFLICT`: 別書類が既に添付済み。
  - `PRODUCT_NOT_FOUND`: 対象 `product_id` が存在しない。
  - `INVALID_DOCUMENT_TYPE`: PDF / JPG / PNG 以外。
  - `DOCUMENT_TOO_LARGE`: サイズ超過。

---

## 3. 商品詳細レスポンスへの書類情報の追加

管理画面向け商品詳細（`GET /exec?mode=admin&product_id=...`）の `product` に
`document` を含める（未添付は `null`）:

```json
{
  "success": true,
  "product": {
    "product_id": "TMP-000115",
    "document": {
      "file_name": "invoice_2026-10-12.pdf",
      "mime_type": "application/pdf",
      "view_url": "https://drive.google.com/file/d/xxxx/view",
      "size": 182344,
      "attached_at": "2026-10-12T10:00:00.000Z"
    }
  }
}
```

- フロントは添付済みなら **元ファイル名** と「書類を開く」リンクを表示する。
- 未添付なら「未添付」を表示する。
- `product.document` は管理画面（商品詳細・商品編集）でのみ表示し、
  **公開ページには表示しない**。

---

## 4. 実装上の留意点

1. **別リクエスト・別識別子**:
   - 画像取込は `import_attempt_id`、書類添付は `idempotency_key` と、
     識別子を分けて管理する。書類送信時に商品を再登録しない。
2. **再送**:
   - 書類送信が「受付済みか不明（通信断・解析不可）」の場合、同じ `product_id`・
     同じ `idempotency_key`・同じ書類で再送する。商品は再登録しない。
3. **競合時は上書きしない**:
   - 別書類が添付済みの場合は競合として扱い、既存書類を表示するに留める。
4. **画像との分離**:
   - 書類（JPG/PNG含む）は商品画像配列（`images`）に含めない。
     AI生成（`generate_ai_product_draft`）の対象画像にも使わない。
5. **金額・OCRは対象外**:
   - 書類の金額を仕入原価へ反映しない。OCR・複数明細には対応しない。