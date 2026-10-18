# Readdy 配信引き継ぎ手順書 (READDY_DELIVERY_HANDOFF.md)

本手順書は、B.I.S EC 仕入書類自動取込パイプラインの本番完走に向け、Readdy 開発・運用チームへ引き継ぐ「本番DBのアクセス権限安全化手順」および「`documents-relay` Edge Function 追加APIの配信・確認手順」をまとめたものです。

---

## 1. 本番DBのアクセス権限現状とGit管理SQLとの差異

### (1) 実環境での実測調査結果
2026-10-18 に実施した実測調査において、Supabase PostgREST エンドポイント（公開用 anon key を使用）に対して以下の応答が確認されました。

- `documents`: `Allow: OPTIONS,GET,HEAD,POST,PUT,PATCH,DELETE` (anon key での直接 PATCH / UPDATE が成功)
- `document_lines`: `Allow: OPTIONS,GET,HEAD,POST,PUT,PATCH,DELETE` (anon key での直接書込み受付状態)
- `document_product_links`: `Allow: OPTIONS,GET,HEAD,POST,PUT,PATCH,DELETE` (anon key での直接書込み受付状態)
- `v_document_audit_summary`: 404 Not Found (ビュー未作成)

### (2) Git管理SQL（`20261013_independent_documents_ledger.sql`）との差異
Git管理のセキュリティ設計原則では以下が規定されています。
- ブラウザ（anon, authenticated）からの直接アクセス（INSERT/UPDATE/DELETE）は全拒絶。
- DB書込み・更新権限は、権限を持つサーバー側中継（`service_role` を付与した Edge Functions）のみに限定。
- したがって、実DB側で RLS が未有効化または anon に更新権限が付与されている現状は、セキュリティ設計と乖離しています。

---

## 2. Readdy側で実施可能なDB権限安全化手順

既存の管理画面の動作を維持し、かつ新しいスタッフログインを追加することなく、公開用 anon key からの直接書込みを遮断するための具体的手順です。

### 手順（Supabase SQL Editor / マイグレーションツールで実行）
以下の SQL を実行してください。

```sql
-- 1. documents テーブルの権限剥奪と RLS 有効化
REVOKE INSERT, UPDATE, DELETE ON public.documents FROM anon, authenticated;
GRANT ALL ON public.documents TO service_role;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_documents" ON public.documents;
CREATE POLICY "service_role_all_documents"
    ON public.documents FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 2. document_lines テーブルの権限剥奪と RLS 有効化
REVOKE INSERT, UPDATE, DELETE ON public.document_lines FROM anon, authenticated;
GRANT ALL ON public.document_lines TO service_role;
ALTER TABLE public.document_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_document_lines" ON public.document_lines;
CREATE POLICY "service_role_all_document_lines"
    ON public.document_lines FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 3. document_product_links テーブルの権限剥奪と RLS 有効化
REVOKE INSERT, UPDATE, DELETE ON public.document_product_links FROM anon, authenticated;
GRANT ALL ON public.document_product_links TO service_role;
ALTER TABLE public.document_product_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_document_product_links" ON public.document_product_links;
CREATE POLICY "service_role_all_document_product_links"
    ON public.document_product_links FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
```

### 影響範囲と互換性
- **管理画面への影響なし**: Readdy の管理画面は `documents-relay` Edge Function を経由してデータを取得・登録しています。Edge Function 内部では `SUPABASE_SERVICE_ROLE_KEY` を用いて Supabase クライアントを初期化（`getSupabaseAdmin()`）しているため、上記 RLS / 権限設定を適用しても、管理画面からの書類取込、明細編集、商品紐付けはすべて正常に動作します。
- **スタッフログイン不要**: 新規の認証プロバイダやスタッフ個別ログインの導入は不要です。

---

## 3. `documents-relay` Edge Function 配信引き継ぎ情報

Google Drive からの自動取込パイプライン（原本コピーゼロ・GAS移動後のフォルダ更新）を成立させるため、以下のコードを Readdy 本番環境へデプロイしてください。

### (1) 配信用メタデータ
- **対象リポジトリ**: `Fuga420/bis-ec-frontend`
- **対象ブランチ**: `feat/drive-auto-import-ledger`
- **最新コミットSHA**: `be87dce`（および後続のテストフィクスチャ追加コミット）
- **変更対象ファイル**: `supabase/functions/documents-relay/index.ts`

### (2) 追加・拡張された Action

1. **`register_drive_document` (Drive原本の直接登録・コピーゼロ取込)**:
   - **目的**: 担当者が Google Drive に置いた既存原本のファイルID・指紋・属性を直接 `documents` テーブルへ登録。不要な再送・原本コピー作成を防止。
   - **入力**:
     - `drive_file_id` (必須, string)
     - `idempotency_key` (必須, string)
     - `document_type` (必須, string: "invoice" | "receipt" 等)
     - `supplier_name` (必須, string)
     - `file_name` (必須, string)
     - `mime_type` (必須, string)
     - `file_size` (必須, number)
     - `file_fingerprint` (必須, string: SHA-256)
     - `drive_folder_id` (任意, string)
     - `status` (任意, string: "pending_amount")
   - **戻り値**: HTTP 201 Created (`{ success: true, document: { ... } }`) または HTTP 200 OK (同一キー/指紋再送時: `{ success: true, is_reused: true, document: { ... } }`)

2. **`update_document_folder` (原本Drive移動後のDB状態同期)**:
   - **目的**: GAS v97 経由で原本が `02_processed` または `03_flagged` へ物理移動された後、DB上の `drive_folder_id` および `status` を更新。
   - **入力**:
     - `document_id` (必須, UUID)
     - `drive_folder_id` (必須, string)
     - `status` (任意, string: "processed" | "flagged_for_review")
   - **戻り値**: HTTP 200 OK (`{ success: true, document: { ... } }`)

### (3) 必要な環境変数一覧
Edge Function の実行に必要な環境変数です（既存の `documents-relay` に設定済みのものを維持）。

| 環境変数名 | 役割 | 設定値の種別 |
| :--- | :--- | :--- |
| `SUPABASE_URL` | Supabase プロジェクトURL | `https://yg9qauzldubdo1ca5z0z.helloreaddy.com` |
| `SUPABASE_SERVICE_ROLE_KEY` | サービスロールキー (DBフル権限) | 秘密値 |
| `GAS_WEBHOOK_URL` | GAS Web App の /exec URL | `https://script.google.com/macros/s/AKfyc.../exec` |
| `GAS_ADMIN_SECRET` | GAS 管理者キー (Drive操作・保存用) | 秘密値 |
| `ALLOWED_ORIGINS` | 許可オリジン | カンマ区切りオリジン (任意) |

---

## 4. 配信後の確認リクエスト (実測検証コマンド)

配信完了後、以下の curl コマンドを実行して正常応答を確認してください。

### ① `register_drive_document` の確認リクエスト
```bash
curl -X POST "https://yg9qauzldubdo1ca5z0z.helloreaddy.com/functions/v1/documents-relay" \
  -H "apikey: <VITE_PUBLIC_SUPABASE_ANON_KEY>" \
  -H "Authorization: Bearer <VITE_PUBLIC_SUPABASE_ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "register_drive_document",
    "idempotency_key": "test_ping_20261018",
    "document_type": "invoice",
    "supplier_name": "テスト仕入先",
    "file_name": "test_invoice.pdf",
    "mime_type": "application/pdf",
    "file_size": 1024,
    "file_fingerprint": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "drive_file_id": "test_drive_file_id_ping",
    "drive_folder_id": "1ctLRUQbwINARCDuGdYnpkrCkkK287HV5",
    "status": "pending_amount"
  }'
```
**期待される応答**: HTTP 201 Created (`{"success":true,"is_reused":false,"document":{"id":"..."},...}`)
※再実行時は HTTP 200 OK (`{"success":true,"is_reused":true,...}`)

### ② `update_document_folder` の確認リクエスト
```bash
curl -X POST "https://yg9qauzldubdo1ca5z0z.helloreaddy.com/functions/v1/documents-relay" \
  -H "apikey: <VITE_PUBLIC_SUPABASE_ANON_KEY>" \
  -H "Authorization: Bearer <VITE_PUBLIC_SUPABASE_ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "update_document_folder",
    "document_id": "<①で作成されたdocument_id>",
    "drive_folder_id": "1MUpsttOl2MY1Q8QAptSX_1vBGjl_aXY3",
    "status": "processed"
  }'
```
**期待される応答**: HTTP 200 OK (`{"success":true,"document":{"status":"processed","drive_folder_id":"1MUpsttOl2MY1Q8QAptSX_1vBGjl_aXY3",...}}`)
