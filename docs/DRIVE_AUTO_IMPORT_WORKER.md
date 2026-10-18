# Google Drive 仕入書類 自動取込ワーカー仕様書 (DRIVE_AUTO_IMPORT_WORKER.md)

B.I.S EC における仕入書類（オークネット・KOMEHYO・ネットジャパン等）を Google Drive から一括検知し、書類DBへの登録・明細抽出・金額検算・完了フォルダへの原本移動を自律実行するワーカーの仕様および運用手順書です。

---

## 1. システム構成と責務分離

```mermaid
flowchart TD
    User["仕入担当者"] -->|"PDF配置"| Inbox["Google Drive: 01_inbox"]
    Worker["自動取込ワーカー<br/>(scripts/drive_auto_import_worker.mjs)"] -->|"1. 新着検出 & ダウンロード"| Inbox
    Worker -->|"2. SHA-256指紋 & 原本ID照合"| SupabaseDB[("Supabase PostgreSQL<br/>(documents / lines)")]
    Worker -->|"3. テキスト抽出 & パーサー解析"| Parsers["仕入書類パーサー群<br/>(オークネット / KOMEHYO / NJ)"]
    Parsers -->|"4. 金額検算 (差額0円照合)"| Worker
    Worker -->|"5-A. 成功: 原本移動"| GAS["GAS Web App v97<br/>(move_drive_file)"]
    GAS -->|"原本移動"| Processed["Google Drive: 02_processed"]
    Worker -->|"5-B. 差額・要確認: 原本移動"| GAS
    GAS -->|"原本退避"| Flagged["Google Drive: 03_flagged"]
    Worker -->|"6. DBステータス同期"| SupabaseDB
```

### コピーゼロ原本管理
- アップロード処理等で原本ファイルの複製（不要なコピー）を作成せず、**Google Drive上にアップロードされた既存原本ID（`drive_file_id`）** を直接 `documents` テーブルへ紐付けます。
- 原本の実態移動は GAS Web App v97（スクリプト所有者権限）経由で Drive フォルダ間を移動させます。

---

## 2. 実行環境と前提条件

- **ランタイム**: Node.js v18 以上 (ES Modules 対応)
- **依存モジュール**: `pdf-parse` (PDFテキスト層抽出用)
- **連携サービス**:
  - Google Drive API v3 (ファイル一覧取得・原本取得)
  - Google Apps Script Web App v97 (DriveAppによる権限昇格フォルダ移動)
  - Supabase PostgreSQL (PostgREST REST API / documents-relay Edge Function)

---

## 3. 使用フォルダ構成

| フォルダ名 | 役割 | フォルダID (本番管理用) |
| :--- | :--- | :--- |
| **01_inbox** | 担当者が仕入書類PDFを投入する監視対象フォルダ | `1ctLRUQbwINARCDuGdYnpkrCkkK287HV5` |
| **02_processed** | 金額検算が完全一致（差額0円）し、明細保存が完了した原本の保管先 | `1MUpsttOl2MY1Q8QAptSX_1vBGjl_aXY3` |
| **03_flagged** | 金額不一致、文字層なし（画像スキャン）、未知の書式等の要確認原本退避先 | `1kgnzKvslB0J2Mq8ZM8-PqsTjret1CQ3E` |

> ※商品画像用フォルダ（`1_kE1qM-rT2h4Ue9j9L8i5v7A_EXAMPLE`等）は本パイプラインの監視対象外です。

---

## 4. 必要な環境変数

本スクリプトは秘密情報をコードに含めず、環境変数（または `.env`）から動的に読み込みます。

| 環境変数名 | 必須 | 説明 | 設定例 |
| :--- | :---: | :--- | :--- |
| `GOOGLE_ACCESS_TOKEN` | 任意※ | Drive API 呼び出し用のOAuth2アクセストークン | `ya29.a0A...` (未設定時は `~/.clasprc.json` から自動ロード) |
| `GAS_WEB_APP_URL` | 必須 | GAS固定Web App URL (v97配信版) | `https://script.google.com/macros/s/AKfyc.../exec` |
| `VITE_PUBLIC_SUPABASE_URL` | 必須 | Supabase インスタンスURL | `https://yg9qauzldubdo1ca5z0z.helloreaddy.com` |
| `VITE_PUBLIC_SUPABASE_ANON_KEY` | 必須 | Supabase クライアントAPIキー | `sb_publishable_...` |
| `DRIVE_INBOX_FOLDER_ID` | 任意 | 監視対象 01_inbox フォルダID | `1ctLRUQbwINARCDuGdYnpkrCkkK287HV5` |
| `DRIVE_PROCESSED_FOLDER_ID` | 任意 | 移動先 02_processed フォルダID | `1MUpsttOl2MY1Q8QAptSX_1vBGjl_aXY3` |
| `DRIVE_FLAGGED_FOLDER_ID` | 任意 | 退避先 03_flagged フォルダID | `1kgnzKvslB0J2Mq8ZM8-PqsTjret1CQ3E` |

---

## 5. 起動方法

### 通常実行 (本番バッチ処理)
```bash
node scripts/drive_auto_import_worker.mjs
```

### ドライラン実行 (検証用・ファイル移動やDB更新を行わない)
```bash
node scripts/drive_auto_import_worker.mjs --dry-run
```

### 特定ファイルIDのピンポイント実行
```bash
node scripts/drive_auto_import_worker.mjs --file-id=<DRIVE_FILE_ID>
```

### 単体テスト (パーサー検算テスト) の実行
```bash
node scripts/test_parsers.mjs
```

---

## 6. 冪等性と再試行設計

1. **二重登録・増殖防止 (Idempotency)**:
   - ファイルの **SHA-256 指紋 (`file_fingerprint`)** および **Drive 原本ID (`drive_file_id`)** の二重チェックを実施。
   - 既に `documents` テーブルに存在し、`status: processed` かつ `drive_folder_id` が `02_processed` の場合は自動スキップ。
   - 途中で失敗した場合（`status: pending_amount` や `lines_registered`）、新規レコードを追加作成せず、同一書類レコードを更新・再開。
2. **途中失敗時の再試行フロー**:
   - **DB登録後にPDF抽出失敗**: DB上のステータスは `pending_amount` のまま維持され、原本は `01_inbox` に留まるため、次回実行時に再度抽出を試みる。
   - **金額検算不一致**: 自動で `03_flagged` フォルダに移動し、DB上のステータスを `flagged_for_review` に設定。人が画面から目視修正可能。
   - **GAS移動通信エラー**: DB更新前に移動が失敗した場合は次回実行時に再試行。DB更新のみ失敗した場合は、実Driveフォルダと突き合わせてDBを同期。

---

## 7. 書類受付番号と商品マスタの境界定義

### 現状の仕様と制約
- **商品本票 (40列)**:
  - 現行のスプレッドシート・商品DBには「受付番号（ロットNo. / 箱-枝）」専用の独立列が**未配備**です。
- **書類側の識別子保持**:
  - オークネットの「受付番号（`855-19157`等）」、ネットジャパンの「箱ー枝（`138-4`等）」は、`document_lines` の `reception_number_raw`, `lot_number`, `branch_number` に正確な原文のまま格納されます。
- **自動照合の境界**:
  - 本自動取込パイプラインでは「書類原本の登録・明細抽出・金額検算・保管」までを自動完走のスコープとします。
  - **商品マスタへの原価反映・商品自動紐付け**は、商品側に「受付番号」列が正式実装されるまで自動化せず、画面上の手動紐付けUI（`document_product_links`）を利用します。誤った自動推測による原価確定事故を防止します。
