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
export const CONFIG = {
  supabaseUrl: process.env.VITE_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "https://yg9qauzldubdo1ca5z0z.helloreaddy.com",
  supabaseAnonKey: process.env.VITE_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "",
  workerSecret: process.env.DOCUMENTS_WORKER_SECRET || "",
  gasWebAppUrl: process.env.GAS_WEB_APP_URL || "https://script.google.com/macros/s/AKfycbyxee-2phIQl2KPBgx0h0bHBaaQDybUxbODI06ZC7aHNJg4jHMoKqFBSlBEQA2CHKfX/exec",
  inboxFolderId: process.env.DRIVE_INBOX_FOLDER_ID || "1ctLRUQbwINARCDuGdYnpkrCkkK287HV5",
  processedFolderId: process.env.DRIVE_PROCESSED_FOLDER_ID || "1MUpsttOl2MY1Q8QAptSX_1vBGjl_aXY3",
  flaggedFolderId: process.env.DRIVE_FLAGGED_FOLDER_ID || "1kgnzKvslB0J2Mq8ZM8-PqsTjret1CQ3E",
};

// Google Drive トークン取得 (環境変数優先、GCPメタデータサーバー、自動リフレッシュ対応ローカルclasprcフォールバック)
export async function getDriveAccessToken() {
  if (process.env.GOOGLE_ACCESS_TOKEN) {
    return process.env.GOOGLE_ACCESS_TOKEN;
  }

  // 1. GCP メタデータサーバー (Cloud Run Jobs / Compute Engine 等のコンテナ実行環境)
  try {
    const metadataRes = await fetch(
      "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
      {
        headers: { "Metadata-Flavor": "Google" },
        signal: AbortSignal.timeout(1500)
      }
    );
    if (metadataRes.ok) {
      const metaData = await metadataRes.json();
      if (metaData.access_token) {
        return metaData.access_token;
      }
    }
  } catch {
    // ローカルPC環境等でメタデータサーバーに接続できない場合は無視して次へフォールバック
  }

  // 2. ローカル開発環境の ~/.clasprc.json (自動リフレッシュ対応)
  const clasprcPath = path.resolve(process.env.HOME || process.env.USERPROFILE || "", ".clasprc.json");
  if (fs.existsSync(clasprcPath)) {
    try {
      const rc = JSON.parse(fs.readFileSync(clasprcPath, "utf8"));
      const tokenObj = rc?.tokens?.default || rc?.tokens;
      if (!tokenObj) return null;

      const isExpired = tokenObj.expiry_date && Date.now() >= (tokenObj.expiry_date - 60000);
      if (isExpired && tokenObj.refresh_token && tokenObj.client_id && tokenObj.client_secret) {
        // リフレッシュトークンで新しいアクセストークンを取得
        const refreshParams = new URLSearchParams({
          client_id: tokenObj.client_id,
          client_secret: tokenObj.client_secret,
          refresh_token: tokenObj.refresh_token,
          grant_type: "refresh_token"
        });
        const refRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: refreshParams.toString()
        });
        if (refRes.ok) {
          const newTokens = await refRes.json();
          tokenObj.access_token = newTokens.access_token;
          tokenObj.expiry_date = Date.now() + (newTokens.expires_in * 1000);
          fs.writeFileSync(clasprcPath, JSON.stringify(rc, null, 2), "utf8");
          return tokenObj.access_token;
        }
      }
      return tokenObj.access_token || null;
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
export async function invokeRelay(payload) {
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

// Drive API: inbox内のPDF一覧取得 (ページネーション対応・50件上限撤廃)
async function listInboxFiles(token) {
  let allFiles = [];
  let pageToken = null;
  const q = encodeURIComponent(`'${CONFIG.inboxFolderId}' in parents and trashed = false and mimeType = 'application/pdf'`);
  do {
    const pageParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "";
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=nextPageToken,files(id,name,mimeType,size,md5Checksum,modifiedTime)&pageSize=100${pageParam}`;
    const res = await fetch(url, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (!res.ok) {
      throw new Error(`Drive list error: ${res.status} ${await res.text()}`);
    }
    const json = await res.json();
    if (json.files && json.files.length > 0) {
      allFiles.push(...json.files);
    }
    pageToken = json.nextPageToken || null;
  } while (pageToken);
  return allFiles;
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
export async function downloadDriveFile(fileId, token) {
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

// -----------------------------------------------------------------------------
// Drive 共有ストレージ: ジョブ状態の保存・取得 (個別 job_id ファイル + latest ファイル)
// -----------------------------------------------------------------------------
async function writeContentToDrive(fileName, content, token) {
  try {
    const q = encodeURIComponent(`name = '${fileName}' and trashed = false`);
    const listUrl = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`;
    const listRes = await fetch(listUrl, { headers: { "Authorization": `Bearer ${token}` } });
    if (!listRes.ok) return null;
    const listData = await listRes.json();
    const existingFile = listData.files && listData.files[0];

    if (existingFile) {
      const updateUrl = `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=media`;
      await fetch(updateUrl, {
        method: "PATCH",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: content
      });
      return existingFile.id;
    } else {
      const metadata = {
        name: fileName,
        mimeType: "application/json",
        parents: [CONFIG.inboxFolderId]
      };
      const boundary = "-------314159265358979323846";
      const delimiter = "\r\n--" + boundary + "\r\n";
      const closeDelim = "\r\n--" + boundary + "--";

      const multipartRequestBody =
        delimiter +
        "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
        JSON.stringify(metadata) +
        delimiter +
        "Content-Type: application/json\r\n\r\n" +
        content +
        closeDelim;

      const createUrl = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
      const createRes = await fetch(createUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": `multipart/related; boundary=${boundary}`
        },
        body: multipartRequestBody
      });
      const createData = await createRes.json();
      return createData.id;
    }
  } catch (err) {
    console.warn(`  [Warn] Drive共有ファイル (${fileName}) 保存失敗:`, err.message);
    return null;
  }
}

export async function saveJobStateToDrive(jobState, token) {
  if (!token) return null;
  const content = JSON.stringify(jobState, null, 2);

  // 1. 最新ジョブへのショートカット (import_job_latest.json)
  await writeContentToDrive("import_job_latest.json", content, token);

  // 2. 特定ジョブIDの永続ファイル (import_job_<job_id>.json)
  if (jobState.job_id) {
    await writeContentToDrive(`import_job_${jobState.job_id}.json`, content, token);
  }
}

export async function getJobStateFromDrive(token, jobId = null) {
  if (!token) return null;
  const fileName = jobId ? `import_job_${jobId}.json` : "import_job_latest.json";
  try {
    const q = encodeURIComponent(`name = '${fileName}' and trashed = false`);
    const listUrl = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`;
    const listRes = await fetch(listUrl, { headers: { "Authorization": `Bearer ${token}` } });
    if (!listRes.ok) return null;
    const listData = await listRes.json();
    const file = listData.files && listData.files[0];
    if (!file) return null;

    const downloadUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;
    const dlRes = await fetch(downloadUrl, { headers: { "Authorization": `Bearer ${token}` } });
    if (!dlRes.ok) return null;
    return await dlRes.json();
  } catch (err) {
    console.warn(`  [Warn] Drive共有ストレージ (${fileName}) からのジョブ状態取得失敗:`, err.message);
    return null;
  }
}

// -----------------------------------------------------------------------------
// Readdy 内蔵 Backend Database: ジョブ状態 (documentsテーブル) の保存・取得
// -----------------------------------------------------------------------------
export async function saveJobStateToDatabase(jobState) {
  try {
    const payload = {
      action: "register_drive_document",
      drive_file_id: `job:${jobState.job_id}:${jobState.status}`,
      file_name: `import_job_${jobState.job_id}.json`,
      document_type: "batch_import_job",
      document_number: jobState.job_id,
      supplier_name: `SYSTEM_BATCH_JOB:${jobState.job_id}`,
      notes: JSON.stringify(jobState),
      confirmed_by: "cloud-run-job",
      status: jobState.status === "completed" ? "processed" : "pending"
    };
    const res = await invokeRelay(payload);
    return Boolean(res.ok && res.data?.success);
  } catch (err) {
    console.warn("  [Warn] Readdy内蔵DBへのジョブ状態保存失敗:", err.message);
    return false;
  }
}

export async function getJobStateFromDatabase(jobId = null) {
  try {
    // 書類台帳が100件を超えてもジョブ結果が埋没しないよう、supplier_name (SYSTEM_BATCH_JOB) で明示的にフィルタ
    const supplierFilter = jobId ? `SYSTEM_BATCH_JOB:${jobId}` : "SYSTEM_BATCH_JOB";
    const res = await invokeRelay({ action: "list_documents", supplier_name: supplierFilter, page_size: 100 });
    if (!res.ok || !res.data?.success) return null;
    const docs = res.data.documents || [];
    const jobDocs = docs.filter((d) => d.document_type === "batch_import_job");
    if (jobDocs.length === 0) return null;

    jobDocs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const latestDoc = jobDocs[0];
    if (latestDoc.notes) {
      try {
        return JSON.parse(latestDoc.notes);
      } catch {
        return {
          job_id: latestDoc.document_number,
          status: latestDoc.status === "processed" ? "completed" : latestDoc.status,
          raw_notes: latestDoc.notes
        };
      }
    }
    return null;
  } catch (err) {
    console.warn("  [Warn] Readdy内蔵DBからのジョブ状態取得失敗:", err.message);
    return null;
  }
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
  const isDryRun = Boolean(options.dryRun ?? options.dry_run ?? process.argv.includes("--dry-run"));
  const targetFileId = options.fileId || options.file_id || process.argv.find(a => a.startsWith("--file-id="))?.split("=")[1];

  console.log("================================================================================");
  console.log("=== B.I.S EC 仕入書類 Google Drive 自動取込パイプライン実行 ===");
  console.log("================================================================================");
  console.log(`実行日時: ${new Date().toISOString()}`);
  console.log(`ドライランモード: ${isDryRun ? "有効 (変更なし)" : "無効 (実処理)"}`);
  if (targetFileId) {
    console.log(`対象ファイル指定 (--file-id): ${targetFileId}`);
  }
  console.log(`監視 Inbox: ${CONFIG.inboxFolderId}`);
  console.log(`移動先 Processed: ${CONFIG.processedFolderId}`);
  console.log(`要確認 Flagged: ${CONFIG.flaggedFolderId}`);

  const driveToken = await getDriveAccessToken();
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
    if (files.length === 0) {
      console.log(`  [Info] 指定されたファイルID (${targetFileId}) はInbox内に見つかりません。Drive直接取得を試みます...`);
      const meta = await getDriveFileMetadata(targetFileId, driveToken);
      if (meta) {
        files = [meta];
      }
    }
  }
  console.log(`検出対象PDF: ${files.length} 件`);

  if (files.length === 0) {
    console.log("処理対象の新規PDFはありません。完了します。");
    return {
      total_detected: 0,
      processed_count: 0,
      flagged_count: 0,
      skipped_count: 0,
      error_count: 0,
      file_results: []
    };
  }

  let processedCount = 0;
  let flaggedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  const fileResults = [];

  for (const file of files) {
    const fileResult = {
      file_id: file.id,
      file_name: file.name,
      file_size: parseInt(file.size || 0, 10),
      status: "pending",
      document_id: null,
      supplier_name: null,
      document_number: null,
      declared_net_amount: null,
      calculated_total: null,
      discrepancy: null,
      lines_count: 0,
      is_balanced: false,
      needs_review_reasons: [],
      error: null
    };

    try {
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
        fileResult.document_id = docRecord.id;
        console.log(`    既存レコード検出: ID=${docRecord.id}, Status=${docRecord.status}`);
        if (docRecord.status === "processed" && docRecord.drive_folder_id === CONFIG.processedFolderId) {
          console.log("    => 既に取込・処理完了済みです。スキップします。");
          fileResult.status = "skipped";
          skippedCount++;
          fileResults.push(fileResult);
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
        if (options.job_id || options.jobId) {
          payload.notes = JSON.stringify({ job_id: options.job_id || options.jobId });
        }

        if (!isDryRun) {
          const regRes = await invokeRelay(payload);
          console.log(`    register_drive_document 応答: HTTP ${regRes.status}`, JSON.stringify(regRes.data));

          if (!regRes.ok || !regRes.data?.success) {
            console.error(`    ✗ サーバー側API register_drive_document 呼出失敗:`, regRes.data?.error || regRes.data?.message);
            console.error("    ※Fail-closed 原則に基づき、本原本をInboxに残し未完了として記録します。");
            fileResult.status = "error";
            fileResult.error = `register_drive_document failed: ${regRes.data?.error || regRes.data?.message || regRes.status}`;
            errorCount++;
            fileResults.push(fileResult);
            continue;
          }
          docRecord = regRes.data.document;
          fileResult.document_id = docRecord.id;
          console.log(`    ✓ DB原本登録完了: ID=${docRecord.id}`);
        } else {
          docRecord = { id: "dry-run-doc-id", status: "pending_amount" };
          fileResult.document_id = docRecord.id;
          console.log("    [Dry-run] DB原本登録をシミュレート");
        }
      }

      // 4. PDF文字層抽出
      console.log("  [Step 4] PDF文字層抽出...");
      const { text, totalPages, error: extractErr } = await extractTextFromPdf(pdfBuf);
      if (extractErr) {
        console.warn(`    [Warn] 文字層抽出警告: ${extractErr}`);
      }
      const textLength = text.trim().length;
      console.log(`    抽出文字数: ${textLength} 文字, ページ数: ${totalPages}`);

      // 5. パーサー実行・仕入先判別・金額検算
      console.log("  [Step 5] パーサー実行 & 明細抽出・金額検算...");
      const parsed = parseInvoiceDocument(text);
      fileResult.supplier_name = parsed.supplier_name;
      fileResult.document_number = parsed.document_number;
      fileResult.declared_net_amount = parsed.declared_net_amount;
      fileResult.calculated_total = parsed.calculated_total;
      fileResult.discrepancy = parsed.discrepancy;
      fileResult.lines_count = parsed.lines.length;
      fileResult.is_balanced = parsed.is_balanced;
      fileResult.needs_review_reasons = parsed.needs_review_reasons;

      console.log(`    判定仕入先: ${parsed.supplier_name}`);
      console.log(`    書類番号: ${parsed.document_number || "なし"}`);
      console.log(`    計上日: ${parsed.accounting_date || parsed.issue_date || "なし"}`);
      console.log(`    公称請求額: ${parsed.declared_total_claim?.toLocaleString()} 円`);
      console.log(`    公称支払額: ${parsed.declared_total_payment?.toLocaleString()} 円`);
      console.log(`    公称純請求額: ${parsed.declared_net_amount?.toLocaleString()} 円`);
      console.log(`    抽出明細行数: ${parsed.lines.length} 行`);

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
            fileResult.status = "error";
            fileResult.error = `save_document_lines failed: ${saveRes.data?.error || saveRes.data?.message || saveRes.status}`;
            errorCount++;
            fileResults.push(fileResult);
            continue;
          }
          console.log(`    ✓ 明細保存完了: lines_count=${saveRes.data.lines_count}, document_status=${saveRes.data.document_status}`);

          console.log(`    GAS v97経由で原本移動: ${file.id} -> 02_processed...`);
          const moveRes = await callGas({
            action: "move_drive_file",
            mode: "admin",
            file_id: file.id,
            target_folder_id: CONFIG.processedFolderId
          });

          if (!moveRes || !moveRes.success) {
            console.error(`    ✗ GAS move_drive_file 失敗:`, moveRes);
            fileResult.status = "error";
            fileResult.error = `GAS move_drive_file (02_processed) failed: ${JSON.stringify(moveRes)}`;
            errorCount++;
            fileResults.push(fileResult);
            continue;
          }
          console.log("    ✓ 原本移動成功 (02_processed)");

          const updateFolderRes = await invokeRelay({
            action: "update_document_folder",
            document_id: docRecord.id,
            drive_folder_id: CONFIG.processedFolderId,
            status: "processed",
            mark_processed: true
          });

          if (!updateFolderRes.ok || !updateFolderRes.data?.success) {
            console.error(`    ✗ update_document_folder 失敗: HTTP ${updateFolderRes.status}`, updateFolderRes.data);
            console.warn("    ※Drive原本の物理移動は完了しましたが、DBフォルダ更新が未完了です。未完了エラーとして記録します。次回実行時に自動同期されます。");
            fileResult.status = "error";
            fileResult.error = `update_document_folder failed: ${updateFolderRes.data?.error || updateFolderRes.status}`;
            errorCount++;
          } else {
            console.log("    ✓ DB状態更新完了: status=processed, folder=02_processed");
            fileResult.status = "processed";
            processedCount++;
          }
        } else {
          console.log("    [Dry-run] 明細保存および 02_processed 移動をシミュレート");
          fileResult.status = "processed";
          processedCount++;
        }
      } else {
        console.warn("\n  [Step 6B] 要確認原本 => 03_flagged への退避");
        const reasons = parsed.needs_review_reasons.length > 0 ? parsed.needs_review_reasons.join(", ") : "REASON_UNSPECIFIED";
        console.log(`    対象ファイル: ${file.name} (Drive ID: ${file.id})`);
        if (docRecord?.id) {
          console.log(`    書類レコードID: ${docRecord.id}`);
        }
        console.log(`    要確認理由 (needs_review_reasons): ${reasons}`);

        if (!isDryRun) {
          console.log(`    [1/2] GAS v97経由でDrive原本移動: ${file.id} -> 03_flagged...`);
          let driveMoveSuccess = false;
          try {
            const moveRes = await callGas({
              action: "move_drive_file",
              mode: "admin",
              file_id: file.id,
              target_folder_id: CONFIG.flaggedFolderId
            });
            driveMoveSuccess = Boolean(moveRes?.success);
            if (driveMoveSuccess) {
              console.log(`    ✓ GAS Drive原本移動成功: Drive ID=${file.id}, target=03_flagged`);
            } else {
              console.error(`    ✗ GAS Drive原本移動失敗:`, moveRes);
            }
          } catch (gasErr) {
            console.error(`    ✗ GAS Drive原本移動通信例外: ${gasErr.message}`);
          }

          if (!driveMoveSuccess) {
            fileResult.status = "error";
            fileResult.error = "GAS Drive move to 03_flagged failed";
            errorCount++;
            fileResults.push(fileResult);
            continue;
          }

          console.log(`    [2/2] relay経由でDB drive_folder_id 更新 (書類ID: ${docRecord.id})...`);
          const updateFolderRes = await invokeRelay({
            action: "update_document_folder",
            document_id: docRecord.id,
            drive_folder_id: CONFIG.flaggedFolderId
          });

          const dbFolderUpdateSuccess = Boolean(updateFolderRes.ok && updateFolderRes.data?.success);
          if (dbFolderUpdateSuccess) {
            console.log(`    ✓ relay DB drive_folder_id 更新成功: 書類ID=${docRecord.id}, folder=03_flagged`);
            console.log(`    ※現行契約により、DB status は登録初期値 (pending_amount) のまま保持され、needs_review_reasons はDBへ送信・保存されません。`);
            fileResult.status = "flagged";
            flaggedCount++;
          } else {
            console.error(`    ✗ relay DB drive_folder_id 更新失敗: HTTP ${updateFolderRes.status}`, updateFolderRes.data);
            console.warn(`    ※Drive原本移動は完了しましたが、DBフォルダIDの同期に失敗しました。未完了エラーとして記録します。`);
            fileResult.status = "error";
            fileResult.error = `relay update_document_folder (03_flagged) failed: ${updateFolderRes.data?.error || updateFolderRes.status}`;
            errorCount++;
          }
        } else {
          console.log(`    [Dry-run] 要確認退避シミュレーション:`);
          console.log(`      - Drive ID: ${file.id} -> 03_flagged`);
          console.log(`      - 書類ID: ${docRecord?.id} -> drive_folder_id を 03_flagged に更新`);
          console.log(`      - needs_review_reasons: ${reasons}`);
          fileResult.status = "flagged";
          flaggedCount++;
        }
      }

      fileResults.push(fileResult);
    } catch (fileErr) {
      console.error(`\n  ✗ [個別ファイル処理例外] ${file.name} (Drive ID: ${file.id}):`, fileErr.message);
      console.warn("  ※Fail-closed原則に基づき、本原本をInboxに残したまま後続ファイルの処理を継続します (再試行可能)。");
      fileResult.status = "error";
      fileResult.error = fileErr.message;
      errorCount++;
      fileResults.push(fileResult);
    }
  }

  console.log("\n================================================================================");
  console.log("=== 自動取込パイプライン実行サマリー ===");
  console.log(`  - 検出総件数: ${files.length} 件`);
  console.log(`  - 処理完了 (02_processed 移動 & 明細保存): ${processedCount} 件`);
  console.log(`  - 要確認退避 (03_flagged 移動 & DBフォルダ更新): ${flaggedCount} 件`);
  console.log(`  - スキップ (処理済): ${skippedCount} 件`);
  console.log(`  - エラー (未完了・Inbox残): ${errorCount} 件`);
  console.log("================================================================================\n");

  return {
    total_detected: files.length,
    processed_count: processedCount,
    flagged_count: flaggedCount,
    skipped_count: skippedCount,
    error_count: errorCount,
    file_results: fileResults
  };
}

// CLI直接実行時 (Cloud Run Jobs / ローカル実行)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const jobId = process.env.IMPORT_JOB_ID || `job_cli_${Date.now()}`;
  const confirmedBy = process.env.CONFIRMED_BY || "cli_runner";
  const startedAt = new Date().toISOString();

  const initialJobState = {
    job_id: jobId,
    status: "running",
    started_at: startedAt,
    finished_at: null,
    confirmed_by: confirmedBy,
    operator_user_id: process.env.OPERATOR_USER_ID || null,
    operator_email: process.env.OPERATOR_EMAIL || null,
    total_detected: 0,
    processed_count: 0,
    flagged_count: 0,
    skipped_count: 0,
    error_count: 0,
    file_results: [],
    error: null
  };

  (async () => {
    try {
      console.log(`[Worker CLI] ジョブ開始登録: ID=${jobId}, confirmed_by=${confirmedBy}`);
      await saveJobStateToDatabase(initialJobState).catch(err => {
        console.warn("[Worker CLI] ジョブ開始状態のDB保存警告:", err.message);
      });

      const result = await runDriveAutoImport();

      const finalJobState = {
        ...initialJobState,
        status: result.error_count > 0 && result.processed_count === 0 ? "failed" : "completed",
        finished_at: new Date().toISOString(),
        total_detected: result.total_detected,
        processed_count: result.processed_count,
        flagged_count: result.flagged_count,
        skipped_count: result.skipped_count,
        error_count: result.error_count,
        file_results: result.file_results,
        error: result.error_count > 0 ? `${result.error_count} 件の処理でエラーが発生しました。` : null
      };

      await saveJobStateToDatabase(finalJobState).catch(err => {
        console.warn("[Worker CLI] 完了状態のDB保存警告:", err.message);
      });

      const token = await getDriveAccessToken();
      if (token) {
        await saveJobStateToDrive(finalJobState, token).catch(err => {
          console.warn("[Worker CLI] 完了状態のDrive保存警告:", err.message);
        });
      }

      console.log(`[Worker CLI] ジョブ完了記録成功: ID=${jobId}, status=${finalJobState.status}`);
      if (finalJobState.status === "failed") {
        process.exit(1);
      }
    } catch (err) {
      console.error("FATAL PIPELINE ERROR:", err);
      const failedJobState = {
        ...initialJobState,
        status: "failed",
        finished_at: new Date().toISOString(),
        error: err.message
      };
      await saveJobStateToDatabase(failedJobState).catch(() => {});
      process.exit(1);
    }
  })();
}
