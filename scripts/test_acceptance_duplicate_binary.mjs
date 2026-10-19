import { getDriveAccessToken, downloadDriveFile, fetchAllExistingDocuments, invokeRelay, runDriveAutoImport, CONFIG } from "./drive_auto_import_worker.mjs";

const SA_EMAIL = "bis-drive-worker-sa@bis-square-integration-507508.iam.gserviceaccount.com";
const SOURCE_FILE_ID = "1bX_DnjzEUQ61GsuAJN2bKQ1rC3JauWnX"; // 処理済み原本 (577-...)
const TEST_FILE_NAME = "DUPLICATE_TEST_577-20260126-20260129-10773.pdf";

async function uploadToInbox(buffer, fileName, token) {
  const metadata = {
    name: fileName,
    parents: [CONFIG.inboxFolderId],
    mimeType: "application/pdf"
  };

  const boundary = "-------314159265358979323846";
  const delimiter = "\r\n--" + boundary + "\r\n";
  const closeDelim = "\r\n--" + boundary + "--";

  const multipartRequestBody = Buffer.concat([
    Buffer.from(
      delimiter +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      JSON.stringify(metadata) +
      delimiter +
      "Content-Type: application/pdf\r\n\r\n"
    ),
    buffer,
    Buffer.from(closeDelim)
  ]);

  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
      "Content-Length": String(multipartRequestBody.length)
    },
    body: multipartRequestBody
  });

  if (!res.ok) {
    throw new Error(`Upload failed: ${res.status} ${await res.text()}`);
  }
  return await res.json();
}

async function grantFilePermission(fileId, token) {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}/permissions?supportsAllDrives=true`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      role: "writer",
      type: "user",
      emailAddress: SA_EMAIL
    })
  });
  return res.ok;
}

async function countDbLines() {
  const docs = await fetchAllExistingDocuments(invokeRelay);
  let totalActiveLines = 0;
  for (const d of docs) {
    if (d.document_type === "batch_import_job") continue;
    const res = await invokeRelay({ action: "get_document", document_id: d.id });
    if (res.ok && res.data?.lines) {
      totalActiveLines += res.data.lines.length;
    }
  }
  return { docCount: docs.length, lineCount: totalActiveLines };
}

async function main() {
  console.log("================================================================================");
  console.log("=== 受入条件実測: 同一バイナリを別Drive IDで投入時の二重登録防止検証 ===");
  console.log("================================================================================");

  const token = await getDriveAccessToken();

  // 1. 投入前のDB件数測定
  console.log("\n[Step 1] 投入前の DB 件数測定中...");
  const pre = await countDbLines();
  console.log(`- 投入前 documents 総件数: ${pre.docCount} 件`);
  console.log(`- 投入前 有効明細行総数: ${pre.lineCount} 行`);

  // 2. 元原本の同一バイナリを別Drive IDとしてInboxへ新規配置
  console.log(`\n[Step 2] 処理済み原本 (ID: ${SOURCE_FILE_ID}) のバイナリを取得中...`);
  const buf = await downloadDriveFile(SOURCE_FILE_ID, token);
  console.log(`  バイナリ取得完了: ${buf.length} bytes`);

  console.log(`- 新規ファイルとして 01_inbox へアップロード (${TEST_FILE_NAME})...`);
  const uploaded = await uploadToInbox(buf, TEST_FILE_NAME, token);
  console.log(`  -> 新規別Drive ID 発行完了: ${uploaded.id}`);

  console.log(`- SA 権限付与...`);
  await grantFilePermission(uploaded.id, token);

  // 3. ワーカー実処理実行 (DRY_RUN=false, MAX_FILES=1)
  console.log("\n[Step 3] ワーカー実行 (DRY_RUN=false, MAX_FILES=1)...");
  let testRunResult = null;
  try {
    testRunResult = await runDriveAutoImport({
      dryRun: false,
      max_files: 1,
      targetFileId: uploaded.id
    });
  } catch (err) {
    console.error("ワーカー実行時エラー:", err);
  }

  console.log("\nワーカー実行結果:", {
    detected: testRunResult?.total_detected,
    processed: testRunResult?.processed_count,
    flagged: testRunResult?.flagged_count,
    skipped: testRunResult?.skipped_count,
    errors: testRunResult?.error_count
  });

  // 4. 実行後のDB件数測定
  console.log("\n[Step 4] 実行後の DB 件数測定中...");
  const post = await countDbLines();
  console.log(`- 実行後 documents 総件数: ${post.docCount} 件 (増分: ${post.docCount - pre.docCount} 件)`);
  console.log(`- 実行後 有効明細行総数: ${post.lineCount} 行 (増分: ${post.lineCount - pre.lineCount} 行)`);

  const docPassed = post.docCount === pre.docCount;
  const linePassed = post.lineCount === pre.lineCount;
  const skipPassed = testRunResult?.skipped_count === 1 && testRunResult?.processed_count === 0;

  console.log("\n================================================================================");
  console.log(`受入条件判定:`);
  console.log(`  1. 同一バイナリ検知 & スキップ: ${skipPassed ? "PASS (スキップ成功)" : "FAIL"}`);
  console.log(`  2. documents 書類増加ゼロ (0件): ${docPassed ? "PASS (増分 0件)" : "FAIL"}`);
  console.log(`  3. document_lines 明細増加ゼロ (0行): ${linePassed ? "PASS (増分 0行)" : "FAIL"}`);
  console.log(`総合合否: ${docPassed && linePassed && skipPassed ? "合格 (SUCCESS)" : "不合格 (FAILED)"}`);
  console.log("================================================================================");

  // 5. テストファイルのクリーンアップ (除外)
  console.log("\n[Step 5] テスト配置ファイル (ID: " + uploaded.id + ") をゴミ箱へ除外中...");
  await fetch(`https://www.googleapis.com/drive/v3/files/${uploaded.id}?supportsAllDrives=true`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ trashed: true })
  });
  console.log("除外完了。");
}

main().catch(console.error);
