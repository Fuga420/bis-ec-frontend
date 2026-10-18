/**
 * drive_auto_import_worker.mjs
 * B.I.S EC 仕入書類 Google Drive 自動一括取込ワーカー
 *
 * 概要:
 *  Google Drive の 01_inbox フォルダに配置された仕入書類（PDF）を検出し、
 *  原本コピーを作らず既存Drive原本IDとSHA-256指紋を用いて書類DBに登録、
 *  文字層抽出とパーサー（オークネット、KOMEHYO、ネットジャパン）による明細抽出・金額検算を行い、
 *  検算完全一致した書類は 02_processed フォルダへ、不一致・OCR要書類は 03_flagged フォルダへ
 *  GAS v97経由で移動させ、DB状態を同期する。
 *
 * セキュリティ・アーキテクチャ原則:
 *  ・ブラウザ/ワーカーからのPostgREST直接書込(anon key)は一切行わず、
 *    権限を持つサーバー側API (documents-relay / GAS Web App v97) に統一する。
 *  ・新規原本登録時は idempotency_key, document_type を含む全必須列を確実に送信する。
 *  ・update_document_folder 失敗時は処理完了と判定せず未完了(エラー)として記録。
 *  ・Drive移動後にDB更新だけ失敗した中断レコードを次回実行時に検知し、同一書類レコードで自動同期・回収する。
 *  ・pdf-parse は package.json に登録された正規依存関係を使用する。
 *
 * 実行方法:
 *  node scripts/drive_auto_import_worker.mjs [--dry-run] [--file-id=<id>]
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import https from "https";
import { fileURLToPath } from "url";
import { PDFParse } from "pdf-parse";
import { parseInvoiceDocument } from "./parsers/invoiceParsers.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -----------------------------------------------------------------------------
// 環境変数・設定ロード
// -----------------------------------------------------------------------------
function loadEnv() {
  const envFiles = [
    path.resolve(__dirname, "../.env"),
    path.resolve(__dirname, "../.env.local")
  ];
  for (const envPath of envFiles) {
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, "utf8").split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  }
}
loadEnv();

// 設定パラメータ
const CONFIG = {
  supabaseUrl: process.env.VITE_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "https://yg9qauzldubdo1ca5z0z.helloreaddy.com",
  supabaseAnonKey: process.env.VITE_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "",
  workerSecret: process.env.DOCUMENTS_WORKER_SECRET || "",
  gasWebAppUrl: process.env.GAS_WEB_APP_URL || "https://script.google.com/macros/s/AKfycbyxee-2phIQl2KPBgx0h0bHBaaQDybUxbODI06ZC7aHNJg4jHMoKqFBSlBEQA2CHKfX/exec",
  inboxFolderId: process.env.DRIVE_INBOX_FOLDER_ID || "1ctLRUQbwINARCDuGdYnpkrCkkK287HV5",
  processedFolderId: process.env.DRIVE_PROCESSED_FOLDER_ID || "1MUpsttOl2MY1Q8QAptSX_1vBGjl_aXY3",
  flaggedFolderId: process.env.DRIVE_FLAGGED_FOLDER_ID || "1kgnzKvslB0J2Mq8ZM8-PqsTjret1CQ3E",
};

// Google Drive トークン取得 (環境変数優先、ローカルclasprcフォールバック)
function getDriveAccessToken() {
  if (process.env.GOOGLE_ACCESS_TOKEN) {
    return process.env.GOOGLE_ACCESS_TOKEN;
  }
  const clasprcPath = path.resolve(process.env.HOME || "", ".clasprc.json");
  if (fs.existsSync(clasprcPath)) {
    try {
      const rc = JSON.parse(fs.readFileSync(clasprcPath, "utf8"));
      return rc?.tokens?.default?.access_token || null;
    } catch {
      return null;
    }
  }
  return null;
}

// -----------------------------------------------------------------------------
// サーバー側API 通信ヘルパー
// -----------------------------------------------------------------------------

// GAS Web App 呼び出し (v97)
async function callGas(payload) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);
    
    function makeReq(url) {
      const u = new URL(url);
      const req = https.request({
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8",
          "Content-Length": Buffer.byteLength(postData)
        }
      }, (res) => {
        if (res.headers.location) {
          https.get(res.headers.location, (r2) => {
            let d = "";
            r2.on("data", c => d += c);
            r2.on("end", () => {
              try { resolve(JSON.parse(d)); } catch { resolve(d); }
            });
          }).on("error", reject);
        } else {
          let d = "";
          res.on("data", c => d += c);
          res.on("end", () => {
            try { resolve(JSON.parse(d)); } catch { resolve(d); }
          });
        }
      });
      req.on("error", reject);
      req.write(postData);
      req.end();
    }

    makeReq(CONFIG.gasWebAppUrl);
  });
}

// documents-relay Edge Function 呼び出し (サーバー側権限API)
async function invokeRelay(payload) {
  const url = `${CONFIG.supabaseUrl}/functions/v1/documents-relay`;
  const headers = {
    "apikey": CONFIG.supabaseAnonKey,
    "Authorization": `Bearer ${CONFIG.supabaseAnonKey}`,
    "Content-Type": "application/json"
  };
  if (CONFIG.workerSecret) {
    headers["x-bis-worker-token"] = CONFIG.workerSecret;
  }
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });
  let data = null;
  const text = await res.text();
  try {
    data = JSON.parse(text);
  } catch {
    data = { success: false, error: text };
  }
  return { status: res.status, ok: res.ok, data };
}

// Drive API: inbox内のPDF一覧取得
async function listInboxFiles(token) {
  const q = encodeURIComponent(`'${CONFIG.inboxFolderId}' in parents and trashed = false and mimeType = 'application/pdf'`);
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,size,md5Checksum,modifiedTime)&pageSize=50`;
  const res = await fetch(url, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  if (!res.ok) {
    throw new Error(`Drive list error: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  return json.files || [];
}

// Drive API: ファイルメタデータ取得 (親フォルダ確認用)
async function getDriveFileMetadata(fileId, token) {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,parents,trashed`;
  const res = await fetch(url, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`Drive get file error: ${res.status} ${await res.text()}`);
  }
  return await res.json();
}

// Drive ファイルのバイナリ取得 (Drive API直接 -> GAS v97 get_drive_file_content フォールバック)
async function downloadDriveFile(fileId, token) {
  try {
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    const res = await fetch(url, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (res.ok) {
      const arrayBuf = await res.arrayBuffer();
      return Buffer.from(arrayBuf);
    }
    console.warn(`  [Info] Drive API 直接ダウンロード失敗 (HTTP ${res.status}): GAS v97 get_drive_file_content にフォールバックします...`);
  } catch (err) {
    console.warn(`  [Info] Drive API 通信エラー: ${err.message}. GAS v97 get_drive_file_content にフォールバックします...`);
  }

  const gasRes = await callGas({
    action: "get_drive_file_content",
    mode: "admin",
    file_id: fileId
  });

  if (gasRes && gasRes.success && gasRes.base64) {
    return Buffer.from(gasRes.base64, "base64");
  }

  throw new Error(`Drive download failed via both Drive API and GAS v97: ${JSON.stringify(gasRes)}`);
}

// PDFテキスト抽出 (package.json に登録された pdf-parse を使用)
async function extractTextFromPdf(buffer) {
  try {
    const parser = new PDFParse(new Uint8Array(buffer));
    await parser.load();
    const textObj = await parser.getText();
    return {
      text: textObj.text || "",
      totalPages: textObj.total || 1
    };
  } catch (err) {
    console.warn("  [Warn] PDF text extraction error:", err.message);
    return { text: "", totalPages: 1, error: err.message };
  }
}

// -----------------------------------------------------------------------------
// 中断・不整合レコードの自動同期リカバリ
// -----------------------------------------------------------------------------
async function reconcileIncompleteDocuments(existingDocs, driveToken, isDryRun) {
  console.log("\n[Reconcile] 中断・不整合レコードの照合リカバリ実行中...");
  let reconciledCount = 0;

  for (const doc of existingDocs) {
    // 明細登録済みだが、status が processed でない、または drive_folder_id が processed でないものを対象
    const isIncomplete = doc.status !== "processed" || doc.drive_folder_id !== CONFIG.processedFolderId;
    if (!isIncomplete || !doc.drive_file_id) continue;

    // Drive上の実ファイル親フォルダを調査
    try {
      const meta = await getDriveFileMetadata(doc.drive_file_id, driveToken);
      if (!meta || meta.trashed) continue;

      const isActuallyInProcessed = meta.parents && meta.parents.includes(CONFIG.processedFolderId);
      if (isActuallyInProcessed) {
        console.log(`  [リカバリ検知] 書類ID ${doc.id} (ファイル: ${doc.file_name}): Drive原本は既に 02_processed に移動済みですがDB状態が未完了です。`);
        console.log(`    現在のDB status=${doc.status}, drive_folder_id=${doc.drive_folder_id}`);
        console.log(`    => 同一書類レコードを使って update_document_folder を再試行します (増殖ゼロ)...`);

        if (!isDryRun) {
          const updateRes = await invokeRelay({
            action: "update_document_folder",
            document_id: doc.id,
            drive_folder_id: CONFIG.processedFolderId,
            status: "processed",
            mark_processed: true
          });
          if (updateRes.ok && updateRes.data?.success) {
            console.log(`    ✓ DB状態同期成功: status=processed, folder=02_processed`);
            doc.status = "processed";
            doc.drive_folder_id = CONFIG.processedFolderId;
            reconciledCount++;
          } else {
            console.warn(`    ✗ update_document_folder 再試行失敗: ${updateRes.data?.error || updateRes.data?.message}`);
          }
        } else {
          console.log(`    [Dry-run] update_document_folder 再試行をシミュレート`);
          reconciledCount++;
        }
      }
    } catch (err) {
      console.warn(`  [リカバリ調査エラー] 書類ID ${doc.id}: ${err.message}`);
    }
  }

  if (reconciledCount > 0) {
    console.log(`  ✓ 不整合レコード同期完了: ${reconciledCount} 件回復`);
  } else {
    console.log("  不整合レコードはありませんでした。");
  }
  return reconciledCount;
}

// -----------------------------------------------------------------------------
// メインパイプライン処理
// -----------------------------------------------------------------------------
export async function runDriveAutoImport(options = {}) {
  const isDryRun = options.dryRun || process.argv.includes("--dry-run");
  const targetFileId = options.fileId || process.argv.find(a => a.startsWith("--file-id="))?.split("=")[1];

  console.log("================================================================================");
  console.log("=== B.I.S EC 仕入書類 Google Drive 自動取込パイプライン実行 ===");
  console.log("================================================================================");
  console.log(`実行日時: ${new Date().toISOString()}`);
  console.log(`ドライランモード: ${isDryRun ? "有効 (変更なし)" : "無効 (実処理)"}`);
  console.log(`監視 Inbox: ${CONFIG.inboxFolderId}`);
  console.log(`移動先 Processed: ${CONFIG.processedFolderId}`);
  console.log(`要確認 Flagged: ${CONFIG.flaggedFolderId}`);

  const driveToken = getDriveAccessToken();
  if (!driveToken) {
    throw new Error("Google Drive Access Token is missing. Provide GOOGLE_ACCESS_TOKEN or configure .clasprc.json.");
  }

  // 既存書類一覧をサーバー側API (list_documents) 経由で取得
  console.log("  サーバー側API (list_documents) より既存書類一覧を取得中...");
  const listRes = await invokeRelay({ action: "list_documents" });
  if (!listRes.ok || !listRes.data?.success) {
    throw new Error(`list_documents API 呼出失敗: HTTP ${listRes.status} ${JSON.stringify(listRes.data)}`);
  }
  const existingDocs = listRes.data.documents || [];
  console.log(`  取得済み既存書類件数: ${existingDocs.length} 件`);

  // 不整合リカバリの実行 (Drive移動後DB更新失敗分の自動回復)
  await reconcileIncompleteDocuments(existingDocs, driveToken, isDryRun);

  // 1. Inbox ファイルリスト取得
  console.log("\n[Step 1] 01_inbox フォルダスキャン中...");
  let files = await listInboxFiles(driveToken);
  if (targetFileId) {
    files = files.filter(f => f.id === targetFileId);
  }
  console.log(`検出対象PDF: ${files.length} 件`);

  if (files.length === 0) {
    console.log("処理対象の新規PDFはありません。完了します。");
    return { processedCount: 0, flaggedCount: 0, skippedCount: 0, errorCount: 0 };
  }

  let processedCount = 0;
  let flaggedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const file of files) {
    console.log(`\n--------------------------------------------------------------------------------`);
    console.log(`処理開始: ${file.name} (Drive ID: ${file.id}, サイズ: ${file.size} bytes)`);
    console.log(`--------------------------------------------------------------------------------`);

    // 2. バイナリ取得とSHA-256指紋計算
    console.log("  [Step 2] 原本バイナリ取得 & SHA-256 指紋計算...");
    const pdfBuf = await downloadDriveFile(file.id, driveToken);
    const fingerprint = crypto.createHash("sha256").update(pdfBuf).digest("hex");
    console.log(`    SHA-256: ${fingerprint}`);

    // 3. DB既存照合 (list_documents 結果から照合)
    console.log("  [Step 3] 既存書類照合 (重複チェック)...");
    let docRecord = existingDocs.find(d => d.drive_file_id === file.id || d.file_fingerprint === fingerprint);

    if (docRecord) {
      console.log(`    既存レコード検出: ID=${docRecord.id}, Status=${docRecord.status}`);
      if (docRecord.status === "processed" && docRecord.drive_folder_id === CONFIG.processedFolderId) {
        console.log("    => 既に取込・処理完了済みです。スキップします。");
        skippedCount++;
        continue;
      }
    } else {
      console.log("    未登録原本です。サーバー側API (register_drive_document) 経由でDB原本レコードを作成します...");
      const idempotencyKey = `drive_${file.id}_${Date.now()}`;
      const payload = {
        action: "register_drive_document",
        idempotency_key: idempotencyKey,
        document_type: "invoice",
        supplier_name: "自動判別中",
        file_name: file.name,
        mime_type: file.mimeType || "application/pdf",
        file_size: parseInt(file.size || pdfBuf.length, 10),
        file_fingerprint: fingerprint,
        drive_file_id: file.id,
        drive_folder_id: CONFIG.inboxFolderId,
        drive_file_url: `https://drive.google.com/file/d/${file.id}/view`,
        status: "pending_amount"
      };

      if (!isDryRun) {
        const regRes = await invokeRelay(payload);
        console.log(`    register_drive_document 応答: HTTP ${regRes.status}`, JSON.stringify(regRes.data));

        if (!regRes.ok || !regRes.data?.success) {
          console.error(`    ✗ サーバー側API register_drive_document 呼出失敗:`, regRes.data?.error || regRes.data?.message);
          console.error("    ※Fail-closed 原則に基づき、本原本の処理を安全に中断・未完了として記録します。");
          errorCount++;
          continue;
        }
        docRecord = regRes.data.document;
        console.log(`    ✓ DB原本登録完了: ID=${docRecord.id}`);
      } else {
        docRecord = { id: "dry-run-doc-id", status: "pending_amount" };
        console.log("    [Dry-run] DB原本登録をシミュレート");
      }
    }

    // 4. PDF文字層抽出
    console.log("  [Step 4] PDF文字層抽出...");
    const { text, totalPages } = await extractTextFromPdf(pdfBuf);
    const textLength = text.trim().length;
    console.log(`    抽出文字数: ${textLength} 文字, ページ数: ${totalPages}`);

    // 5. パーサー実行・仕入先判別・金額検算
    console.log("  [Step 5] パーサー実行 & 明細抽出・金額検算...");
    const parsed = parseInvoiceDocument(text);
    console.log(`    判定仕入先: ${parsed.supplier_name}`);
    console.log(`    書類番号: ${parsed.document_number || "なし"}`);
    console.log(`    計上日: ${parsed.accounting_date || parsed.issue_date || "なし"}`);
    console.log(`    公称請求額: ${parsed.declared_total_claim?.toLocaleString()} 円`);
    console.log(`    公称支払額: ${parsed.declared_total_payment?.toLocaleString()} 円`);
    console.log(`    公称純請求額: ${parsed.declared_net_amount?.toLocaleString()} 円`);
    console.log(`    抽出明細行数: ${parsed.lines.length} 行`);

    // 各商品行の原文と内訳を表示
    parsed.lines.forEach((l, idx) => {
      const typeLabel = l.transaction_type === "purchase" ? "商品" :
                        l.transaction_type === "shipping_cost" ? "配送費" :
                        l.transaction_type === "other_expense" ? "諸費用" :
                        l.transaction_type === "sale_settlement" ? "売却相殺" : l.transaction_type;
      console.log(`      [行 ${idx + 1}] (${typeLabel}) 受付/識別:${l.reception_number_raw || 'なし'} 品名:${l.item_name_raw} 本体:${l.item_amount?.toLocaleString()} 手数料:${l.fee_amount_tax_included?.toLocaleString() || 0} 行総額:${l.total_line_amount?.toLocaleString()} 円`);
    });

    console.log(`    全明細合計: ${parsed.calculated_total?.toLocaleString()} 円`);
    console.log(`    検算差額: ${parsed.discrepancy} 円`);
    console.log(`    検算判定: ${parsed.is_balanced ? "✓ 完全一致 (0円)" : "✗ 差額あり/要確認"}`);

    if (parsed.needs_review_reasons.length > 0) {
      console.log(`    要確認フラグ: ${parsed.needs_review_reasons.join(", ")}`);
    }

    // 6. 保存とDrive移動の分岐判定
    if (parsed.is_balanced && parsed.lines.length > 0) {
      console.log("\n  [Step 6A] 検算完全一致 => 明細DB保存 & 02_processed 移動");
      if (!isDryRun) {
        // サーバー側API (save_document_lines) で明細保存
        const saveRes = await invokeRelay({
          action: "save_document_lines",
          document_id: docRecord.id,
          lines: parsed.lines,
          document_number: parsed.document_number,
          issue_date: parsed.accounting_date || parsed.issue_date,
          total_amount: parsed.declared_net_amount
        });

        if (!saveRes.ok || !saveRes.data?.success) {
          console.error(`    ✗ save_document_lines 失敗: HTTP ${saveRes.status}`, saveRes.data);
          errorCount++;
          continue;
        }
        console.log(`    ✓ 明細保存完了: lines_count=${saveRes.data.lines_count}, document_status=${saveRes.data.document_status}`);

        // GAS v97 で原本移動 (01_inbox -> 02_processed)
        console.log(`    GAS v97経由で原本移動: ${file.id} -> 02_processed...`);
        const moveRes = await callGas({
          action: "move_drive_file",
          mode: "admin",
          file_id: file.id,
          target_folder_id: CONFIG.processedFolderId
        });

        if (!moveRes || !moveRes.success) {
          console.error(`    ✗ GAS move_drive_file 失敗:`, moveRes);
          errorCount++;
          continue;
        }
        console.log("    ✓ 原本移動成功 (02_processed)");

        // サーバー側API (update_document_folder) でDB上のフォルダ状態更新
        const updateFolderRes = await invokeRelay({
          action: "update_document_folder",
          document_id: docRecord.id,
          drive_folder_id: CONFIG.processedFolderId,
          status: "processed",
          mark_processed: true
        });
        console.log(`    update_document_folder 応答: HTTP ${updateFolderRes.status}`, JSON.stringify(updateFolderRes.data));

        // update_document_folder が失敗した場合は処理完了に含めず errorCount に計上
        if (!updateFolderRes.ok || !updateFolderRes.data?.success) {
          console.error(`    ✗ update_document_folder 失敗: HTTP ${updateFolderRes.status}`, updateFolderRes.data);
          console.warn("    ※Drive原本の物理移動は完了しましたが、DBフォルダ更新が未完了です。処理完了とは判定せず未完了として記録します。次回実行時に自動同期されます。");
          errorCount++;
        } else {
          console.log("    ✓ DB状態更新完了: status=processed, folder=02_processed");
          processedCount++;
        }
      } else {
        console.log("    [Dry-run] 明細保存および 02_processed 移動をシミュレート");
        processedCount++;
      }
    } else {
      console.warn("\n  [Step 6B] 要確認原本 => 03_flagged への退避");
      const reasons = parsed.needs_review_reasons.join(", ");
      if (!isDryRun) {
        // GAS v97 で原本移動 (01_inbox -> 03_flagged)
        console.log(`    GAS v97経由で原本移動: ${file.id} -> 03_flagged...`);
        const moveRes = await callGas({
          action: "move_drive_file",
          mode: "admin",
          file_id: file.id,
          target_folder_id: CONFIG.flaggedFolderId
        });
        if (moveRes?.success) {
          console.log("    ✓ 原本退避成功 (03_flagged)");
          const updateFlaggedRes = await invokeRelay({
            action: "update_document_folder",
            document_id: docRecord.id,
            drive_folder_id: CONFIG.flaggedFolderId,
            status: "flagged_for_review"
          });
          if (!updateFlaggedRes.ok || !updateFlaggedRes.data?.success) {
            console.warn(`    [Notice] 03_flagged DBフォルダ更新API未配信または失敗:`, updateFlaggedRes.data);
            errorCount++;
          } else {
            flaggedCount++;
          }
        } else {
          errorCount++;
        }
      } else {
        console.log(`    [Dry-run] 03_flagged 移動 (${reasons}) をシミュレート`);
        flaggedCount++;
      }
    }
  }

  console.log("\n================================================================================");
  console.log("=== 自動取込パイプライン実行サマリー ===");
  console.log(`  - 処理完了 (02_processed): ${processedCount} 件`);
  console.log(`  - 要確認退避 (03_flagged): ${flaggedCount} 件`);
  console.log(`  - スキップ (処理済): ${skippedCount} 件`);
  console.log(`  - エラー (未完了): ${errorCount} 件`);
  console.log("================================================================================\n");

  return { processedCount, flaggedCount, skippedCount, errorCount };
}

// CLI直接実行時
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runDriveAutoImport().catch(err => {
    console.error("FATAL PIPELINE ERROR:", err);
    process.exit(1);
  });
}
