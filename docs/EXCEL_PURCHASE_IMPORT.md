# 統合仕入台帳（Excel）採用済み購入明細 一括取込スクリプト

## 1. 概要

[`scripts/excel_purchase_import.mjs`](../scripts/excel_purchase_import.mjs) は、`AIS_BIS_統合在庫台帳.xlsx` の「仕入明細」シートにある採用済み購入明細（`区分 = 購入` かつ `採用 = TRUE`）を、既存の `documents-relay` Edge Function API 経由で Readdy 内蔵 Backend Database（`documents` / `document_lines`）へ安全に一括取込する CLI スクリプトです。

---

## 2. 安全ルール・設計原則

1. **既存データの完全保護（非上書き）**:
   - 既存明細行（`document_lines`）の UUID、商品金額（`item_amount`）、手数料（`fee_amount`）、配分済み税額（`tax_amount`, `fee_tax_amount`）、税込行合計（`total_line_amount`）、商品リンク（`document_item_matches`）は一切上書き・削除しません。
2. **既存原本への不足明細の安全な追記**:
   - 既に DB に登録されている原本で明細が 0 行のケース（例: スキャン PDF の `11.30.pdf`）、または既存明細が台帳の先頭行と完全一致し後続行のみ未登録のケースでは、既存の `(page_number, line_number)` と衝突しない行番号で `save_document_lines` を呼び出し、既存明細行を一切変更せずに不足行のみを追加します。
3. **税額未確認行の厳格な区別**:
   - Excel で行別税額（商品消費税・手数料消費税）が空欄の行は、`0` 円や推定 10% 税額へ変換せず `null` のまま保持します。
   - 税額が未確認の行では、税抜金額を税込の `total_line_amount` として保存せず、`total_line_amount = null` として保存します。
4. **曖昧な行の安全保留（Fail-closed）**:
   - ファイル名や受付番号だけで同一明細と断定せず、`drive_file_id` や既存明細の識別子（`reception_number_raw`）が不一致・欠落しており同一性を確定できない原本・明細は自動登録せず保留（レポート出力）します。
5. **請求書精算額の非改ざん**:
   - 請求書全体の精算額を購入明細のみの合計と一致する金額として偽装登録しません（`declared_net_amount: null`, `extracted_total_amount: null`）。

---

## 3. 必要な環境変数

実行ディレクトリ（`bis-ec-frontend` ルート）の `.env` および `.env.local`（Git 管理外）から以下の環境変数を自動で読み込みます（秘密値はリポジトリへ含めません）。

| 環境変数名 | 用途 |
| :--- | :--- |
| `VITE_PUBLIC_SUPABASE_URL` | Readdy 内蔵 Backend Database (Supabase) URL |
| `VITE_PUBLIC_SUPABASE_ANON_KEY` | Supabase Anon Key（PostgREST 読み取りスナップショット・Relay 呼び出し用） |
| `DOCUMENTS_WORKER_SECRET` | `documents-relay` ワーカー認証トークン (`x-bis-worker-token`) |

---

## 4. 実行・再実行コマンド

### ドライラン（DB 書込なし・突合と分類結果のみ確認）

デフォルト（引数なし、または `--dry-run` 指定時）はドライランとして動作し、DB への書き込みは一切行いません。

```bash
node scripts/excel_purchase_import.mjs --dry-run
```

台帳ファイルのパスを明示指定する場合：

```bash
node scripts/excel_purchase_import.mjs --dry-run --excel="../ais-ec-gas-drive-import/AIS_BIS_統合在庫台帳.xlsx"
```

### 本番取込の実行（差分のみ追加）

ドライランで新規追加対象・既存原本追記対象を確認した上で、`--execute` を指定して実行します。冪等設計のため、取込完了後に再実行しても既存データは変更されません。

```bash
node scripts/excel_purchase_import.mjs --execute
```

---

## 5. 初回取込実績および再実行ドライラン結果 (2026-10-26)

### 対象台帳集計
- **仕入明細シート全行**: `1,256` 行
- **採用済み購入明細（`区分 = 購入` かつ `採用 = TRUE`）**: `1,105` 行（`122` 原本）

### Readdy 内蔵 DB への反映範囲
- **投入・反映済み合計**: **`1,102` 行**（`121` 原本）
  - **① 新規原本＋新規明細として追加**: **`112` 原本 / `1,062` 明細行**（`created_by = 'excel-purchase-importer'`）
  - **② 既存原本（明細 0 行）への不足明細追加**: **`1` 原本 / `3` 明細行**
    - 対象原本: `11.30.pdf`（DB Document ID: `443dcbd8-605a-4c64-9496-5dc85d5be6a2`, `drive_file_id`: `1HMtorGUBaUdTafhiYswWxywtGcZKkVsl`）
    - 取込前後の行数: **取込前 `0` 行 → 取込後 `3` 行**（`line_number = 1, 2, 3` として新規追加、既存行の変更 0 件）
    - 追加した管理 ID: **`仕入-01205`, `仕入-01206`, `仕入-01207`**
  - **③ 既存 DB 明細として無変更で維持**: **`8` 原本 / `37` 明細行**
    - `3fa2e613-c021-46a2-b9d8-a1ce86c8c115` (`2764_ご精算書 - 26.8.5.pdf`): 12 行 (`仕入-00001〜00012`)
    - `74cf47fd-de78-4013-9743-ce0d9ef40cb3` (`20260217_計算書【請求】_K026021_2052.pdf`): 1 行 (`仕入-00401`)
    - `5a61fe8b-ed56-41b9-b7f5-262108fc3c52` (`20260210_計算書【請求】_K026021_2025.pdf`): 1 行 (`仕入-00406`)
    - `6114a142-02f9-4c56-9b34-4b7619aaac6f` (`20260203_計算書【請求】_K026021_2017.pdf`): 1 行 (`仕入-00408`)
    - `7adabb05-12ab-4668-9de7-38d113a90936` (`645-20260608-20260611-10773.pdf`): 7 行 (`仕入-01140〜01146`)
    - `872065ca-0f65-47ac-a76d-ec7ee788a050` (`614-20260408-20260411-10773.pdf`): 5 行 (`仕入-01148〜01152`)
    - `f20aeb19-cd78-4cc2-bafb-f3c6a93edc58` (`577-20260126-20260129-10773.pdf`): 5 行 (`仕入-01180〜01184`)
    - `6d0c89dd-ff24-4194-91d0-4eb674bc7437` (`566-20260108-20260111-10773.pdf`): 5 行 (`仕入-01185〜01189`)
- **今回 DB へ新規追加された明細数**: **`1,065` 行**（新規 `112` 原本の `1,062` 行 ＋ 既存 `11.30.pdf` への補完 `3` 行；実 DB 明細総数 `62` 行 → `1,127` 行）
- **既存明細の上書き・消失**: **`0` 件**（取込前に存在した全 `62` 明細行の ID・金額・手数料・税額・税込行合計および商品リンクの不変をスナップショット比較で確認）

### 安全上保留した 3 行（未取込）
- **対象原本**: `20260303_計算書【請求】_K026021_2051.pdf`
  - Excel 側 `drive_file_id`: `1FJNZZayuGswfyp4fpIKghwbdnfSdKv5I`
  - 既存 DB 側 Document ID: `c7dae6ee-ee45-40d3-b37d-78eb3f37e680`（DB 側 `drive_file_id`: `1pO-KdUEzBjGE40Aj4fa2pCLTCTCddQZ4`）
- **保留した管理 ID（3 行）**:
  - `仕入-00398`（受付番号: `857-37501`, 税抜商品金額: `251,500` 円）
  - `仕入-00399`（受付番号: `858-23508`, 税抜商品金額: `37,000` 円）
  - `仕入-00400`（受付番号: `858-28552`, 税抜商品金額: `248,000` 円）
- **保留理由**: 既存 DB 上の同名原本は `drive_file_id` が台帳と異なり、かつ既存 DB 明細（購入明細 3 行）に `reception_number_raw`・`auction_bid_number` が保存されておらずファイル名・金額のみで同一と断定しないルールのため、自動統合・上書きを行わず安全上保留。

### 再実行ドライラン結果 (`node scripts/excel_purchase_import.mjs --dry-run`)
```text
[Step 1] Excel読込完了: 仕入明細全行=1256行, 採用済み購入明細=1105行
[Step 2] 既存DB取得完了: 書類=138件, 明細=1127行, 商品リンク=2件

[Step 3] 突合・分類結果サマリー:
  1. 新規追加対象 (完全新規原本): 0 原本 / 0 明細行
  2. 既存原本への不足明細追加 (既存行変更なし): 0 原本 / 0 明細行
  3. 既存維持 (上書き・変更なし): 121 原本 (完了分) / 1102 明細行
  4. 判定が曖昧な行 (安全上保留・未取込): 1 原本 / 3 明細行
     - DB Document ID: c7dae6ee-ee45-40d3-b37d-78eb3f37e680 (20260303_計算書【請求】_K026021_2051.pdf, Excel drive_file_id=1FJNZZayuGswfyp4fpIKghwbdnfSdKv5I, DB drive_file_id=1pO-KdUEzBjGE40Aj4fa2pCLTCTCddQZ4)
       保留対象管理ID: 仕入-00398(受付:857-37501, 税抜:251500), 仕入-00399(受付:858-23508, 税抜:37000), 仕入-00400(受付:858-28552, 税抜:248000)
       保留理由: EXISTING_DB_LINES_LACK_RECEPTION_NUMBER_OR_DRIVE_ID_DIFFERS_CANNOT_CONFIRM_IDENTITY
```

