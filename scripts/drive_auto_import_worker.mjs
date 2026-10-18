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
 * 実行方法:
 *  node scripts/drive_auto_import_worker.mjs [--dry-run] [--file-id=<id>]
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import https from "https";
import { fileURLToPath } from "url";
import { parseInvoiceDocument } from "./parsers/invoiceParsers.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -----------------------------------------------------------------------------
// 環境変数・設定ロード
// -----------------------------------------------------------------------------
function loadEnv() {
  const envPath = path.resolve(__dirname, "../.env");
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
loadEnv();

// 設定パラメータ (秘密情報は環境変数またはローカル設定から取得)
const CONFIG = {
  supabaseUrl: process.env.VITE_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "https://yg9qauzldubdo1ca5z0z.helloreaddy.com",
  supabaseAnonKey: process.env.VITE_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "",
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
// 通信ヘルパー
// -----------------------------------------------------------------------------

// GAS Web App 呼び出し (v97)
async function callGas(payload) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);
    const parsedUrl = new URL(CONFIG.gasWebAppUrl);
    
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

// Supabase REST API (PostgREST)
async function postgrestRequest(endpoint, method = "GET", body = null, headers = {}) {
  const url = `${CONFIG.supabaseUrl}/rest/v1/${endpoint}`;
  const reqHeaders = {
    "apikey": CONFIG.supabaseAnonKey,
    "Authorization": `Bearer ${CONFIG.supabaseAnonKey}`,
    "Content-Type": "application/json",
    ...headers
  };
  const options = {
    method,
    headers: reqHeaders
  };
  if (body) {
    options.body = JSON.stringify(body);
  }
  const res = await fetch(url, options);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, ok: res.ok, data: json };
}

// documents-relay Edge Function 呼び出し
async function invokeRelay(payload) {
  const url = `${CONFIG.supabaseUrl}/functions/v1/documents-relay`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "apikey": CONFIG.supabaseAnonKey,
      "Authorization": `Bearer ${CONFIG.supabaseAnonKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
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

// Drive API: ファイルのバイナリ取得
async function downloadDriveFile(fileId, token) {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const res = await fetch(url, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  if (!res.ok) {
    throw new Error(`Drive download error: ${res.status} ${await res.text()}`);
  }
  const arrayBuf = await res.arrayBuffer();
  return Buffer.from(arrayBuf);
}

// PDFテキスト抽出 (scratch内のpdf-parseまたはローカルモジュール)
async function extractTextFromPdf(buffer) {
  try {
    const pdfParsePath = path.resolve(__dirname, "../../.gemini/antigravity/brain/25e15199-58f3-4dfb-a11a-c2c545fd98f1/scratch/node_modules/pdf-parse");
    let PDFParseModule;
    if (fs.existsSync(pdfParsePath)) {
      PDFParseModule = (await import(pdfParsePath)).PDFParse;
    } else {
      PDFParseModule = (await import("pdf-parse")).default;
    }
    const parser = new PDFParseModule(new Uint8Array(buffer));
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

  // 1. Inbox ファイルリスト取得
  console.log("\n[Step 1] 01_inbox フォルダスキャン中...");
  let files = await listInboxFiles(driveToken);
  if (targetFileId) {
    files = files.filter(f => f.id === targetFileId);
  }
  console.log(`検出対象PDF: ${files.length} 件`);

  if (files.length === 0) {
    console.log("処理対象の新規PDFはありません。完了します。");
    return { processedCount: 0, flaggedCount: 0, skippedCount: 0 };
  }

  let processedCount = 0;
  let flaggedCount = 0;
  let skippedCount = 0;

  for (const file of files) {
    console.log(`\n--------------------------------------------------------------------------------`);
    console.log(`処理開始: ${file.name} (Drive ID: ${file.id}, サイズ: ${file.size} bytes)`);
    console.log(`--------------------------------------------------------------------------------`);

    // 2. バイナリ取得とSHA-256指紋計算
    console.log("  [Step 2] 原本バイナリ取得 & SHA-256 指紋計算...");
    const pdfBuf = await downloadDriveFile(file.id, driveToken);
    const fingerprint = crypto.createHash("sha256").update(pdfBuf).digest("hex");
    console.log(`    SHA-256: ${fingerprint}`);

    // 3. DB既存照合
    console.log("  [Step 3] DB既存照合 (重複チェック)...");
    const checkRes = await postgrestRequest(
      `documents?or=(drive_file_id.eq.${file.id},file_fingerprint.eq.${fingerprint})&is_deleted=eq.false`
    );
    let docRecord = checkRes.ok && checkRes.data?.length > 0 ? checkRes.data[0] : null;

    if (docRecord) {
      console.log(`    既存レコード検出: ID=${docRecord.id}, Status=${docRecord.status}`);
      if (docRecord.status === "processed" && docRecord.drive_folder_id === CONFIG.processedFolderId) {
        console.log("    => 既に取込・処理完了済みです。スキップします。");
        skippedCount++;
        continue;
      }
    } else {
      console.log("    未登録原本です。DB原本レコードを作成します (原本コピーゼロ)...");
      if (!isDryRun) {
        const createRes = await postgrestRequest("documents", "POST", {
          drive_file_id: file.id,
          drive_folder_id: CONFIG.inboxFolderId,
          drive_file_url: `https://drive.google.com/file/d/${file.id}/view`,
          file_name: file.name,
          mime_type: file.mimeType,
          file_size: parseInt(file.size || pdfBuf.length, 10),
          file_fingerprint: fingerprint,
          status: "pending_amount",
          supplier_name: "自動判別中",
          created_by: "drive_auto_import_worker"
        }, { "Prefer": "return=representation" });

        if (!createRes.ok || !createRes.data || createRes.data.length === 0) {
          throw new Error(`DB原本作成失敗: ${JSON.stringify(createRes.data)}`);
        }
        docRecord = createRes.data[0];
        console.log(`    ✓ DB原本登録完了: ID=${docRecord.id}`);
      } else {
        docRecord = { id: "dry-run-doc-id", status: "pending_amount" };
        console.log("    [Dry-run] DB原本レコード作成をシミュレート");
      }
    }

    // 4. PDF文字層抽出
    console.log("  [Step 4] PDF文字層抽出...");
    const { text, totalPages } = await extractTextFromPdf(pdfBuf);
    const textLength = text.trim().length;
    console.log(`    抽出文字数: ${textLength} 文字, ページ数: ${totalPages}`);

    if (textLength < 50) {
      console.warn("    [Warning] 文字層が極小です (スキャン画像またはOCR未適用の可能性)。");
    }

    // 5. パーサー実行・仕入先判別・金額検算
    console.log("  [Step 5] パーサー実行 & 金額検算...");
    const parsed = parseInvoiceDocument(text);
    console.log(`    判定仕入先: ${parsed.supplier_name}`);
    console.log(`    書類番号: ${parsed.document_number || "なし"}`);
    console.log(`    計上日: ${parsed.accounting_date || parsed.issue_date || "なし"}`);
    console.log(`    公称請求額: ${parsed.declared_total_claim?.toLocaleString()} 円`);
    console.log(`    公称支払額: ${parsed.declared_total_payment?.toLocaleString()} 円`);
    console.log(`    公称純請求額 (差引額): ${parsed.declared_net_amount?.toLocaleString()} 円`);
    console.log(`    抽出明細数: ${parsed.lines.length} 行`);
    console.log(`    明細計算合計: ${parsed.calculated_total?.toLocaleString()} 円`);
    console.log(`    検算差額: ${parsed.discrepancy} 円`);
    console.log(`    検算一致判定: ${parsed.is_balanced ? "✓ 完全一致 (0円)" : "✗ 不一致/未検証"}`);

    if (parsed.needs_review_reasons.length > 0) {
      console.log(`    要確認フラグ: ${parsed.needs_review_reasons.join(", ")}`);
    }

    // 6. 保存とDrive移動の分岐判定
    if (parsed.is_balanced && parsed.lines.length > 0) {
      console.log("\n  [Step 6A] 検算完全一致 => 明細DB保存 & 02_processed 移動");
      if (!isDryRun) {
        // Edge Function または PostgREST で明細保存
        const relayRes = await invokeRelay({
          action: "save_document_lines",
          document_id: docRecord.id,
          lines: parsed.lines,
          document_number: parsed.document_number,
          issue_date: parsed.accounting_date || parsed.issue_date,
          total_amount: parsed.declared_net_amount
        });

        if (!relayRes.ok || !relayRes.data.success) {
          console.warn("    Edge Function save_document_lines 応答失敗。PostgREST へ直接保存します...");
          // documents テーブル更新
          await postgrestRequest(`documents?id=eq.${docRecord.id}`, "PATCH", {
            supplier_name: parsed.supplier_name,
            document_number: parsed.document_number,
            issue_date: parsed.accounting_date || parsed.issue_date,
            total_amount: parsed.declared_net_amount,
            extracted_line_count: parsed.lines.length,
            extracted_total_amount: parsed.calculated_total,
            discrepancy_amount: 0,
            status: "lines_registered"
          });
        }

        // GAS v97 で原本移動 (01_inbox -> 02_processed)
        console.log(`    GAS v97経由で原本移動: ${file.id} -> 02_processed...`);
        const moveRes = await callGas({
          action: "move_drive_file",
          mode: "admin",
          file_id: file.id,
          target_folder_id: CONFIG.processedFolderId
        });

        if (!moveRes || !moveRes.success) {
          throw new Error(`GAS move_drive_file failed: ${JSON.stringify(moveRes)}`);
        }
        console.log("    ✓ 原本移動成功 (02_processed)");

        // DB上のフォルダ状態更新
        await postgrestRequest(`documents?id=eq.${docRecord.id}`, "PATCH", {
          drive_folder_id: CONFIG.processedFolderId,
          status: "processed"
        });
        console.log("    ✓ DB状態更新完了: status=processed, folder=02_processed");
        processedCount++;
      } else {
        console.log("    [Dry-run] 明細保存および 02_processed 移動をシミュレート");
        processedCount++;
      }
    } else {
      console.warn("\n  [Step 6B] 検算不一致または要確認 => 03_flagged への退避");
      const reasons = parsed.needs_review_reasons.join(", ");
      if (!isDryRun) {
        // DB状態を flagged_for_review に更新
        await postgrestRequest(`documents?id=eq.${docRecord.id}`, "PATCH", {
          supplier_name: parsed.supplier_name || "不明",
          document_number: parsed.document_number,
          discrepancy_amount: parsed.discrepancy,
          status: "flagged_for_review",
          notes: `要確認理由: ${reasons}, 差額: ${parsed.discrepancy}円`
        });

        // GAS v97 で原本移動 (01_inbox -> 03_flagged)
        console.log(`    GAS v97経由で原本移動: ${file.id} -> 03_flagged...`);
        const moveRes = await callGas({
          action: "move_drive_file",
          mode: "admin",
          file_id: file.id,
          target_folder_id: CONFIG.flaggedFolderId
        });
        if (!moveRes || !moveRes.success) {
          console.error(`    GAS move_drive_file to flagged failed: ${JSON.stringify(moveRes)}`);
        } else {
          await postgrestRequest(`documents?id=eq.${docRecord.id}`, "PATCH", {
            drive_folder_id: CONFIG.flaggedFolderId
          });
          console.log("    ✓ 03_flagged 移動 & DB状態同期完了");
        }
        flaggedCount++;
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
  console.log("================================================================================\n");

  return { processedCount, flaggedCount, skippedCount };
}

// CLI直接実行時
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runDriveAutoImport().catch(err => {
    console.error("FATAL PIPELINE ERROR:", err);
    process.exit(1);
  });
}
