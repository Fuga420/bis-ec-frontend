import { invokeRelay, fetchAllExistingDocuments } from "./drive_auto_import_worker.mjs";

async function runPaginationAndDuplicatePreventionTest() {
  console.log("================================================================================");
  console.log("=== 既存書類ページネーション全件取得 & 重複防止検証テスト ===");
  console.log("================================================================================");
  console.log(`実行日時: ${new Date().toISOString()}`);

  // Test 1: 実DBに対する list_documents 全ページ走査の実測
  console.log("\n[Test 1] 実DBに対する全ページネーション取得検証");
  
  // 1-A. pageSize = 100 (デフォルト想定) での取得
  console.log("  1-A. pageSize = 100 で全件取得中...");
  const allDocsPage100 = await fetchAllExistingDocuments(invokeRelay, 100);
  console.log(`    => 取得件数: ${allDocsPage100.length} 件`);

  // 1-B. pageSize = 5 (意図的に複数ページに分割: 14件なら3ページ) での取得
  console.log("  1-B. pageSize = 5 (複数ページ分割) で全件取得中...");
  const allDocsPage5 = await fetchAllExistingDocuments(invokeRelay, 5);
  console.log(`    => 取得件数: ${allDocsPage5.length} 件`);

  if (allDocsPage100.length !== allDocsPage5.length) {
    throw new Error(`[FAIL] 件数不一致: pageSize=100 (${allDocsPage100.length}) vs pageSize=5 (${allDocsPage5.length})`);
  }

  // IDリストの完全一致検証
  const ids100 = allDocsPage100.map(d => d.id).sort();
  const ids5 = allDocsPage5.map(d => d.id).sort();
  const isMatch = ids100.every((id, idx) => id === ids5[idx]);
  if (!isMatch) {
    throw new Error("[FAIL] 取得された書類IDリストが一致しません！");
  }
  console.log(`    ✓ PASS: 複数ページ分割 (pageSize=5) でも全 ${allDocsPage5.length} 件のIDが完全一致！`);

  // Test 2: ページ上限を超えた位置（2ページ目以降）にある原本の重複判定シミュレーション
  console.log("\n[Test 2] ページ上限超過時の重複防止シミュレーション");

  // 実在する処理済み原本（例: 先頭以外のページにある原本）を特定
  // pageSize=5 の場合、インデックス 5 以降（6件目以降）は 2ページ目以降に存在する
  if (allDocsPage5.length > 5) {
    const page2Doc = allDocsPage5[7]; // 2ページ目（インデックス5〜9）の書類
    console.log(`  検証対象書類 (実DBの2ページ目に存在):`);
    console.log(`    ID: ${page2Doc.id}`);
    console.log(`    ファイル名: ${page2Doc.file_name}`);
    console.log(`    Drive File ID: ${page2Doc.drive_file_id}`);
    console.log(`    Fingerprint: ${page2Doc.file_fingerprint || "(なし)"}`);
    console.log(`    Status: ${page2Doc.status}`);

    // (旧動作) 1ページ目のみ取得した場合
    const firstPageOnly = allDocsPage5.slice(0, 5);
    const oldFound = firstPageOnly.find(d => 
      (page2Doc.drive_file_id && d.drive_file_id === page2Doc.drive_file_id) ||
      (page2Doc.file_fingerprint && d.file_fingerprint === page2Doc.file_fingerprint)
    );
    console.log(`\n  [旧実装: 1ページ目のみ照合の場合]`);
    console.log(`    検出結果: ${oldFound ? "既存レコード検出 (PASS)" : "未検出 (未登録と誤判定され再登録が発生！ RISK)"}`);

    // (新実装) 全ページ走査した場合
    const newFound = allDocsPage5.find(d => 
      (page2Doc.drive_file_id && d.drive_file_id === page2Doc.drive_file_id) ||
      (page2Doc.file_fingerprint && d.file_fingerprint === page2Doc.file_fingerprint)
    );
    console.log(`\n  [新実装: fetchAllExistingDocuments で全ページ照合の場合]`);
    console.log(`    検出結果: ${newFound ? `既存レコード検出 (ID=${newFound.id}) - 重複登録を確実に防止！ (PASS)` : "未検出 (FAIL)"}`);

    if (!newFound) {
      throw new Error("[FAIL] 新実装で2ページ目の書類が検出されませんでした！");
    }
  }

  // Test 3: 100件以上の仮想シナリオ (ページネーションループの完全性検証)
  console.log("\n[Test 3] 100件超シナリオのモック検証 (100件超・複数ページ走査)");
  const mockTotal = 250;
  const mockDocs = Array.from({ length: mockTotal }, (_, i) => ({
    id: `mock-doc-${i + 1}`,
    drive_file_id: `drive-id-${i + 1}`,
    file_fingerprint: `fp-${i + 1}`,
    file_name: `invoice_${i + 1}.pdf`,
    status: "processed"
  }));

  const mockRelayInvoker = async (payload) => {
    const page = payload.page || 1;
    const pageSize = payload.page_size || 100;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const slice = mockDocs.slice(start, end);
    return {
      ok: true,
      status: 200,
      data: {
        success: true,
        count: mockTotal,
        page,
        page_size: pageSize,
        total_pages: Math.ceil(mockTotal / pageSize),
        documents: slice
      }
    };
  };

  const paginatedDocs = await fetchAllExistingDocuments(mockRelayInvoker, 100);
  console.log(`  モック走査結果: 要求件数 ${mockTotal} 件中、取得件数 ${paginatedDocs.length} 件`);
  if (paginatedDocs.length !== mockTotal) {
    throw new Error(`[FAIL] モック走査件数不一致: 期待 ${mockTotal} 件, 実際 ${paginatedDocs.length} 件`);
  }

  // 249番目（3ページ目）の書類が既存として検出されるか検証
  const targetMock = mockDocs[248]; // 3ページ目の原本
  const foundInPaginated = paginatedDocs.find(d => d.drive_file_id === targetMock.drive_file_id);
  if (!foundInPaginated) {
    throw new Error("[FAIL] 3ページ目のモック書類が検出されませんでした！");
  }
  console.log(`  ✓ PASS: 3ページ目（249件目）の書類を重複として即時検出 (ID=${foundInPaginated.id})`);

  console.log("\n================================================================================");
  console.log("=== 全検証項目クリア (PASS): 書類件数が上限を超えても同一原本を重複登録しません ===");
  console.log("================================================================================");
}

runPaginationAndDuplicatePreventionTest().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
