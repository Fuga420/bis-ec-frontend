# 管理画面商品一覧 サーバー側検索・フィルター・ソート・ページネーション API契約仕様書

本ドキュメントは、Readdyフロントエンド（管理画面商品一覧 `/products`）とGASバックエンド間の「サーバー側検索・絞り込み・並び替え・ページ分割」に関するAPI契約仕様を定義します。

---

## 1. 概要

- **対象API**: 管理画面商品一覧取得（`GET /exec?mode=admin`）
- **方式**: ブラウザへ全商品を返してから絞り込む方式ではなく、GASバックエンドで **「検索・フィルター → 並び替え → ページ切り出し」** を行い、指定ページの `products` のみを返却します。
- **パフォーマンス最適化**: シート走査時は行配列のまま検索・フィルター・ソート・ページスライスを行い、**ページ外商品のオブジェクト構築（`buildAdminProductSummary`）およびHTTP応答への全件載せは行いません**。
- **決定論的タイブレーク**: 同値商品（同価格・同登録日時・同名など）の表示順がページ間で揺れたり重複したりしないよう、最終キーに一意な `product_id` 昇順（自然順）を用いて順序を固定します。
- **既存互換性**: `page` や新検索/ソートパラメータを一切指定しない従来の呼び出しは、従来通り `admin-product-list-v2` として全件配列を返却し、既存機能・既存テストとの100%後方互換性を維持します。

---

## 2. GET リクエストパラメータ

| パラメータ名 | 型 | 既定値 | 許容値 / 説明 |
| :--- | :--- | :--- | :--- |
| `mode` | string | (必須) | `"admin"`（管理画面モード） |
| `page` | number / string | `1` | ページ番号（1-indexed）。1未満は `1` に補正されます。 |
| `page_size` (または `pageSize`) | number / string | `50` | 1ページあたりの件数。MVP既定値は `50`、上限値は `100`、1未満は `50` に補正されます。 |
| `search` (または `q`) | string | `""` | 検索キーワード。**商品名・商品ID・ブランドの部分一致**（大文字小文字無視、スペース区切り複数語AND検索）。 |
| `category` | string | `"all"` | カテゴリ絞り込み (`"sneaker"`, `"jewelry"`, `"pokemon_card"`, `"other"`, `"all"`)。 |
| `publish_status` (または `publishStatus`) | string | `"all"` | 公開状態絞り込み (`"draft"`, `"published"`, `"hidden"`, `"all"`)。 |
| `inventory_status` (または `inventoryStatus`) | string | `"all"` | 在庫状態絞り込み (`"in_stock"`, `"out_of_stock"`, `"all"`)。 |
| `record_status` (または `recordStatus`) | string | `"active"` | 台帳状態 (`"active"`, `"archived"`, `"all"`)。省略時は通常一覧用として `"active"` が既定です。 |
| `sort` (または `sortBy`) | string | `"default"` | 並び順キー（下記参照）。 |

### ソートキー (`sort`) 一覧
- `"default"`: 既定の順序（シート追加の新しい順）
- `"created_desc"`: 登録日時：新しい順（同日時は `product_id` 昇順で固定）
- `"created_asc"`: 登録日時：古い順（同日時は `product_id` 昇順で固定）
- `"price_desc"`: 価格：高い順（同額は `product_id` 昇順で固定）
- `"price_asc"`: 価格：安い順（同額は `product_id` 昇順で固定）
- `"name_asc"`: 商品名：昇順（同名は `product_id` 昇順で固定）
- `"name_desc"`: 商品名：降順（同名は `product_id` 昇順で固定）

---

## 3. レスポンス仕様

### 3.1 ページ分割モード（新契約）

`page` または `page_size`、`search`、`publish_status`、`inventory_status`、`sort` が指定された場合に適用されます。

```json
{
  "success": true,
  "version": "admin-product-list-v3",
  "category": "all",
  "record_status": "active",
  "publish_status": "all",
  "inventory_status": "all",
  "search": "Nike",
  "sort": "price_desc",
  "count": 75,
  "page": 1,
  "page_size": 50,
  "total_pages": 2,
  "products": [
    {
      "created_at": "2026-10-06T10:00:00.000Z",
      "product_id": "TMP-000106",
      "category": "sneaker",
      "brand": "Nike",
      "product_name": "Dunk Low Retro Panda",
      "condition": "目立った傷や汚れなし",
      "purchase_price": 10500,
      "planned_sale_price": 15000,
      "storage_location": "A-1",
      "sneaker_sku": "DD1391-100",
      "sneaker_size": "27.5",
      "drive_folder_url": "https://drive.google.com/drive/folders/TMP-000106",
      "inventory_status": "in_stock",
      "main_image_url": "https://drive.google.com/file/d/xxx/view",
      "main_image_display_url": "https://drive.google.com/thumbnail?id=xxx",
      "publish_status": "published",
      "record_status": "active",
      "square_item_id": "",
      "square_variation_id": "",
      "square_payment_link_id": "",
      "square_checkout_url": ""
    }
  ]
}
```

### 3.2 特殊ケースの挙動

#### ① 0件ヒット（検索・フィルターに一致する商品がない場合）
- エラーではなく正常応答（HTTP 200）を返却します。
- `count`: `0`
- `total_pages`: `0`
- `page`: リクエストされたページ番号（例: `1`）
- `page_size`: `50`
- `products`: `[]`（空配列）

#### ② 最終ページ（例: count=75, page_size=50, page=2）
- `count`: `75`
- `total_pages`: `2`
- `page`: `2`
- `page_size`: `50`
- `products`: 残りの25件の商品配列

#### ③ 範囲外ページ（例: count=75, total_pages=2 のとき page=3 や page=999）
- エラーではなく正常応答（HTTP 200）を返却します。
- `count`: `75`
- `total_pages`: `2`
- `page`: リクエストされたページ番号（例: `3` または `999`）
- `page_size`: `50`
- `products`: `[]`（空配列）

---

### 3.3 従来互換モード（旧契約）

`page`, `page_size`, `search`, `publish_status`, `inventory_status`, `sort` を一切指定しない呼び出し（例: `GET ?mode=admin` や `GET ?mode=admin&category=sneaker`）:

```json
{
  "success": true,
  "version": "admin-product-list-v2",
  "category": "all",
  "record_status": "active",
  "count": 75,
  "products": [ ...全75件... ]
}
```
従来通り全件を返却し、既存の未更新クライアントを破損させません。
