/**
 * scripts/test_max_files_slice_unit.mjs
 * 
 * 検出ファイルが多数存在する場合に、maxFiles=1 および MAX_FILES=1 が
 * 確実に1件のみにスライスされ、全件処理にならないことを厳密に検証する単体テスト
 */

function applyMaxFilesLimit(detectedFiles, options = {}, env = {}) {
  const maxFiles = Number.isFinite(options.maxFiles)
    ? options.maxFiles
    : Number.isFinite(options.max_files)
    ? options.max_files
    : env.MAX_FILES
    ? parseInt(env.MAX_FILES, 10)
    : undefined;

  let files = [...detectedFiles];
  if (Number.isFinite(maxFiles) && maxFiles > 0 && files.length > maxFiles) {
    files = files.slice(0, maxFiles);
  }
  return files;
}

const mockFiles = Array.from({ length: 55 }, (_, i) => ({
  id: `file_mock_${i + 1}`,
  name: `invoice_${i + 1}.pdf`
}));

console.log("================================================================================");
console.log("=== max_files スライス単体検証 (55件検出シミュレーション) ===");
console.log("================================================================================\n");

// Case 1: options.maxFiles = 1
const res1 = applyMaxFilesLimit(mockFiles, { maxFiles: 1 });
console.log(`[Case 1] options.maxFiles = 1: 検出 55 件 -> 対象 ${res1.length} 件`);
if (res1.length !== 1 || res1[0].id !== "file_mock_1") {
  throw new Error(`FAIL: Case 1 想定外の件数 ${res1.length}`);
}
console.log("  ✓ PASS: 正確に 1 件 (先頭ファイル) のみに制限された！\n");

// Case 2: options.max_files = 3
const res2 = applyMaxFilesLimit(mockFiles, { max_files: 3 });
console.log(`[Case 2] options.max_files = 3: 検出 55 件 -> 対象 ${res2.length} 件`);
if (res2.length !== 3) {
  throw new Error(`FAIL: Case 2 想定外の件数 ${res2.length}`);
}
console.log("  ✓ PASS: 正確に 3 件に制限された！\n");

// Case 3: env.MAX_FILES = "2"
const res3 = applyMaxFilesLimit(mockFiles, {}, { MAX_FILES: "2" });
console.log(`[Case 3] env.MAX_FILES = '2': 検出 55 件 -> 対象 ${res3.length} 件`);
if (res3.length !== 2) {
  throw new Error(`FAIL: Case 3 想定外の件数 ${res3.length}`);
}
console.log("  ✓ PASS: 環境変数から正確に 2 件に制限された！\n");

// Case 4: 指定なし (全件)
const res4 = applyMaxFilesLimit(mockFiles, {}, {});
console.log(`[Case 4] 指定なし: 検出 55 件 -> 対象 ${res4.length} 件`);
if (res4.length !== 55) {
  throw new Error(`FAIL: Case 4 想定外の件数 ${res4.length}`);
}
console.log("  ✓ PASS: 上限なしの場合は全 55 件が維持された！\n");

console.log("================================================================================");
console.log("=== スライス検証 全ケース PASS ===");
console.log("================================================================================");
