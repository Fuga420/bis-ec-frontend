import {
  CONFIG,
  getDriveAccessToken,
  saveJobStateToDatabase,
  getJobStateFromDatabase,
  saveJobStateToDrive,
  getJobStateFromDrive
} from "./drive_auto_import_worker.mjs";

async function main() {
  console.log("================================================================================");
  console.log("=== 特定の job_id 再取得 & 100件超え対策 実測検証 ===");
  console.log("================================================================================\n");

  const token = await getDriveAccessToken();

  // テスト用ジョブデータ作成 (特定の job_id)
  const targetJobId = "job_test_isolation_20261019_specific";
  const dummyJobState = {
    job_id: targetJobId,
    status: "completed",
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
    total_detected: 3,
    processed_count: 2,
    flagged_count: 1,
    skipped_count: 0,
    error_count: 0,
    file_results: [
      {
        file_id: "test-file-01",
        file_name: "test_invoice_01.pdf",
        status: "processed",
        supplier_name: "オークネット",
        document_number: "463027",
        calculated_total: 1280609,
        is_balanced: true
      },
      {
        file_id: "test-file-02",
        file_name: "test_invoice_02.pdf",
        status: "flagged",
        supplier_name: "UNKNOWN",
        needs_review_reasons: ["TEXT_LAYER_MISSING_NEEDS_OCR"]
      }
    ],
    error: null
  };

  // 1. DB (documentsテーブル) への永続化保存
  console.log(`[Step 1] DB (documentsテーブル) へジョブ (${targetJobId}) を保存...`);
  const dbSaveOk = await saveJobStateToDatabase(dummyJobState);
  console.log("  DB保存結果:", dbSaveOk);

  // 2. Drive (import_job_<job_id>.json) への永続化保存
  console.log(`\n[Step 2] Google Drive へ特定ジョブファイル (import_job_${targetJobId}.json) を保存...`);
  await saveJobStateToDrive(dummyJobState, token);

  // 3. DBから特定 job_id を指定して再取得 (supplier_name フィルタにより100件超え耐性を担保)
  console.log(`\n[Step 3] DBから特定 job_id (${targetJobId}) を指定して再取得...`);
  const dbJob = await getJobStateFromDatabase(targetJobId);
  console.log("  DB取得ジョブ:", {
    job_id: dbJob?.job_id,
    status: dbJob?.status,
    total_detected: dbJob?.total_detected,
    processed_count: dbJob?.processed_count,
    flagged_count: dbJob?.flagged_count,
    file_results_count: dbJob?.file_results?.length
  });

  // 4. Driveから特定 job_id を指定して再取得
  console.log(`\n[Step 4] Driveから特定 job_id (${targetJobId}) を指定して再取得...`);
  const driveJob = await getJobStateFromDrive(token, targetJobId);
  console.log("  Drive取得ジョブ:", {
    job_id: driveJob?.job_id,
    status: driveJob?.status,
    total_detected: driveJob?.total_detected,
    processed_count: driveJob?.processed_count,
    flagged_count: driveJob?.flagged_count
  });

  // 5. 判定
  console.log("\n================================================================================");
  console.log("=== 判定サマリー ===");
  const isDbMatched = dbJob?.job_id === targetJobId && dbJob?.status === "completed" && dbJob?.flagged_count === 1;
  const isDriveMatched = driveJob?.job_id === targetJobId && driveJob?.status === "completed";
  console.log(`  - DB特定job_id取得 (100件耐性フィルタ): ${isDbMatched ? "✓ PASS" : "✗ FAIL"}`);
  console.log(`  - Drive特定job_id独立ファイル取得:      ${isDriveMatched ? "✓ PASS" : "✗ FAIL"}`);
  console.log(`  - 要確認理由/失敗理由保持:             ${dbJob?.file_results[1]?.needs_review_reasons[0] === "TEXT_LAYER_MISSING_NEEDS_OCR" ? "✓ PASS" : "✗ FAIL"}`);
  console.log("================================================================================");
}

main().catch(console.error);

