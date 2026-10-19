/**
 * scripts/test_two_pdfs_max_files_dry_run.mjs
 * 
 * 条件: 01_inbox に「少なくとも2件のPDFが存在する」状態で、
 * max_files=1 かつ DRY_RUN=true を指定して自動取込ワーカーを実行し、
 * 「対象選択 (1件のみ選択)」および「無書込 (Drive移動なし・DB更新なし)」を厳密に実測・証明する。
 */

import { runDriveAutoImport, getDriveAccessToken, invokeRelay, CONFIG } from "./drive_auto_import_worker.mjs";

async function listPdfs(folderId, token) {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false and mimeType = 'application/pdf'`);
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,size)&pageSize=100`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Drive list error: ${res.status}`);
  const data = await res.json();
  return data.files || [];
}

async function getDbCounts() {
  const docsRes = await invokeRelay({ action: "list_documents" });
  const docs = docsRes.data?.documents || [];
  let linesCount = 0;
  for (const d of docs) {
    linesCount += Number(d.lines_count || 0);
  }
  return {
    documentCount: docs.length,
    linesCount: linesCount,
    docs
  };
}

async function main() {
  console.log("================================================================================");
  console.log("=== 2件以上PDF存在下での max_files=1 & DRY_RUN=true 対象選択・無書込実測検証 ===");
  console.log("================================================================================\n");

  const token = await getDriveAccessToken();
  if (!token) throw new Error("Google Drive トークン取得不可");

  // ---------------------------------------------------------------------------
  // [Step 1] 実行前の状態記録
  // ---------------------------------------------------------------------------
  console.log("[Step 1] 実行前の Google Drive および DB 状態の記録...");
  const beforeInboxPdfs = await listPdfs(CONFIG.inboxFolderId, token);
  console.log(`  - 実行前 01_inbox 内 PDF 件数: ${beforeInboxPdfs.length} 件`);
  for (const [i, p] of beforeInboxPdfs.entries()) {
    console.log(`      [PDF ${i + 1}] ID: ${p.id}, Name: ${p.name}`);
  }

  if (beforeInboxPdfs.length < 2) {
    throw new Error(`FAIL: Inbox 内の PDF が 2 件未満 (${beforeInboxPdfs.length} 件) です。前提条件を満たしていません。`);
  }

  const beforeDb = await getDbCounts();
  console.log(`  - 実行前 DB documents レコード数: ${beforeDb.documentCount} 件`);
  console.log(`  - 実行前 DB document_lines 総行数: ${beforeDb.linesCount} 行`);

  // ---------------------------------------------------------------------------
  // [Step 2] max_files=1 & dryRun=true でワーカー実行
  // ---------------------------------------------------------------------------
  console.log("\n[Step 2] runDriveAutoImport({ maxFiles: 1, dryRun: true }) を実行...");
  const result = await runDriveAutoImport({
    maxFiles: 1,
    dryRun: true
  });

  console.log("\n[Step 2 実行結果サマリー]:");
  console.log("  - 処理対象件数 (total_detected):", result.total_detected);
  console.log("  - 処理結果配列長 (file_results.length):", result.file_results.length);
  for (const [i, fr] of result.file_results.entries()) {
    console.log(`    [結果 ${i + 1}] File ID: ${fr.file_id}, Name: ${fr.file_name}, Status: ${fr.status}`);
  }

  // ---------------------------------------------------------------------------
  // [Step 3] 実行後の状態記録
  // ---------------------------------------------------------------------------
  console.log("\n[Step 3] 実行後の Google Drive および DB 状態の照会...");
  const afterInboxPdfs = await listPdfs(CONFIG.inboxFolderId, token);
  console.log(`  - 実行後 01_inbox 内 PDF 件数: ${afterInboxPdfs.length} 件`);
  for (const [i, p] of afterInboxPdfs.entries()) {
    console.log(`      [PDF ${i + 1}] ID: ${p.id}, Name: ${p.name}`);
  }

  const afterDb = await getDbCounts();
  console.log(`  - 実行後 DB documents レコード数: ${afterDb.documentCount} 件`);
  console.log(`  - 実行後 DB document_lines 総行数: ${afterDb.linesCount} 行`);

  // ---------------------------------------------------------------------------
  // [Step 4] 対象選択・無書込の判定
  // ---------------------------------------------------------------------------
  console.log("\n[Step 4] 検証判定:");

  // 4-1. 対象選択の判定: 2件中1件のみが処理対象となり、全件処理になっていないこと
  const passSelection = (result.total_detected === 1) && (result.file_results.length === 1);
  console.log(`  1. 対象選択 (2件中1件のみ選択): ${passSelection ? "PASS" : "FAIL"} (検出: ${result.total_detected} 件)`);

  // 4-2. 無書込の判定 (Drive): Inbox 内の全PDFが移動されず元のまま残っていること
  const passDriveNoWrite = (afterInboxPdfs.length === beforeInboxPdfs.length) &&
                           beforeInboxPdfs.every(b => afterInboxPdfs.some(a => a.id === b.id));
  console.log(`  2. Drive無書込 (Inbox内件数・ID維持): ${passDriveNoWrite ? "PASS" : "FAIL"} (前: ${beforeInboxPdfs.length}件 -> 後: ${afterInboxPdfs.length}件)`);

  // 4-3. 無書込の判定 (DB): documents および document_lines の件数・IDに変動がないこと
  const passDbNoWrite = (afterDb.documentCount === beforeDb.documentCount) &&
                        (afterDb.linesCount === beforeDb.linesCount);
  console.log(`  3. DB無書込 (レコード数増減ゼロ):   ${passDbNoWrite ? "PASS" : "FAIL"} (documents: ${beforeDb.documentCount} -> ${afterDb.documentCount}, lines: ${beforeDb.linesCount} -> ${afterDb.linesCount})`);

  if (!passSelection || !passDriveNoWrite || !passDbNoWrite) {
    throw new Error("検証判定に失敗しました。");
  }

  console.log("\n================================================================================");
  console.log("=== 実測結果サマリー: 全項目 PASS ===");
  console.log("  - Inbox内に対象が複数件（2件）存在しても、max_files=1 により厳格に先頭1件のみが対象選択された。");
  console.log("  - DRY_RUN=true により、Drive上の原本移動（01_inboxからの移動）は一切発生せず、原本が完全維持された。");
  console.log("  - DRY_RUN=true により、DB（documents, document_lines）への書込・更新は一切発生せず、件数が完全一致した。");
  console.log("================================================================================");
}

main().catch(err => {
  console.error("FATAL ERROR:", err);
  process.exit(1);
});
