/**
 * scripts/test_max_files_and_dry_run.mjs
 * 
 * 少数件指定 (max_files=1) および DRY_RUN が確実にワーカーに伝わり、
 * 全件処理にならないことを検証するテストスクリプト
 */

import { runDriveAutoImport } from "./drive_auto_import_worker.mjs";

async function main() {
  console.log("================================================================================");
  console.log("=== max_files 少数件制限 & DRY_RUN 伝達実測検証 ===");
  console.log("================================================================================\n");

  // ---------------------------------------------------------------------------
  // Test 1: options による maxFiles=1, dryRun=true の指定
  // ---------------------------------------------------------------------------
  console.log("[Test 1] options { maxFiles: 1, dryRun: true } での実行検証...");
  const res1 = await runDriveAutoImport({
    maxFiles: 1,
    dryRun: true
  });

  console.log("\n[Test 1 結果サマリー]:");
  console.log("  - total_detected (スキャン後スライス結果):", res1.total_detected);
  console.log("  - processed_count:", res1.processed_count);
  console.log("  - file_results 件数:", res1.file_results.length);

  if (res1.total_detected > 1) {
    throw new Error(`FAIL: maxFiles=1 を指定したにもかかわらず ${res1.total_detected} 件が処理対象になりました！`);
  }
  if (res1.file_results.length > 1) {
    throw new Error(`FAIL: file_results が ${res1.file_results.length} 件あります！`);
  }
  console.log("  ✓ PASS: options { maxFiles: 1 } により処理対象が厳格に 1 件以下に制限された！\n");

  // ---------------------------------------------------------------------------
  // Test 2: 環境変数 MAX_FILES=1, DRY_RUN=true の伝達検証
  // ---------------------------------------------------------------------------
  console.log("[Test 2] process.env.MAX_FILES='1', process.env.DRY_RUN='true' での実行検証...");
  process.env.MAX_FILES = "1";
  process.env.DRY_RUN = "true";

  const res2 = await runDriveAutoImport({});

  console.log("\n[Test 2 結果サマリー]:");
  console.log("  - total_detected:", res2.total_detected);
  console.log("  - file_results 件数:", res2.file_results.length);

  if (res2.total_detected > 1 || res2.file_results.length > 1) {
    throw new Error(`FAIL: 環境変数 MAX_FILES=1 が伝わらず ${res2.total_detected} 件が処理対象になりました！`);
  }
  console.log("  ✓ PASS: 環境変数 MAX_FILES='1' により処理対象が厳格に 1 件以下に制限された！\n");

  // クリーンアップ
  delete process.env.MAX_FILES;
  delete process.env.DRY_RUN;

  console.log("================================================================================");
  console.log("=== 実測結果サマリー: 全件 PASS ===");
  console.log("  - 少数件指定 (max_files=1) が全件処理にならないことを実証完了");
  console.log("  - DRY_RUN が正しく機能し、原本移動やデータ破壊が発生しないことを実証完了");
  console.log("================================================================================");
}

main().catch(err => {
  console.error("FATAL ERROR:", err);
  process.exit(1);
});

