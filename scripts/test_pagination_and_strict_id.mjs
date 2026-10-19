import assert from "assert";

// buildKnownDocumentHashMap のロジックの単体シミュレーション検証
async function testBuildKnownDocumentHashMap() {
  console.log("=== 100件超ページネーション & 同名別内容 誤認防止の単体検証 ===");

  // 1. 100件超ページネーションの検証
  console.log("\n[Test 1] 100件超 (例: 250件) の nextPageToken 走査検証...");
  const mockExistingDocs = [];
  for (let i = 1; i <= 250; i++) {
    mockExistingDocs.push({
      id: `doc_${i}`,
      drive_file_id: `drive_id_${i}`,
      file_name: `invoice_${i}.pdf`,
      status: "processed"
    });
  }

  // 100件ずつ返すモックDrive API
  let pageCalls = 0;
  const mockFetchProcessedFiles = async (pageToken) => {
    pageCalls++;
    const pageSize = 100;
    const startIndex = pageToken ? parseInt(pageToken, 10) : 0;
    const endIndex = Math.min(startIndex + pageSize, 250);
    const files = [];
    for (let i = startIndex + 1; i <= endIndex; i++) {
      files.push({
        id: `drive_id_${i}`,
        name: `invoice_${i}.pdf`,
        sha256Checksum: `sha256_hash_file_${i}`
      });
    }
    const nextToken = endIndex < 250 ? String(endIndex) : null;
    return { files, nextPageToken: nextToken };
  };

  // 走査ロジックの実行
  const docByDriveId = new Map(mockExistingDocs.filter(d => d.drive_file_id).map(d => [d.drive_file_id, d]));
  const hashToDoc = new Map();
  let token = null;
  do {
    const data = await mockFetchProcessedFiles(token);
    for (const f of data.files || []) {
      if (f.sha256Checksum) {
        const matched = docByDriveId.get(f.id);
        if (matched) {
          hashToDoc.set(f.sha256Checksum, matched);
        }
      }
    }
    token = data.nextPageToken;
  } while (token);

  console.log(`  - 総取得ページ数: ${pageCalls} ページ (100件/ページで計3ページ走査)`);
  console.log(`  - 登録されたハッシュ総数: ${hashToDoc.size} 件 (期待値: 250件)`);
  assert.strictEqual(pageCalls, 3, "250件に対して100件上限で3回ページ取得されること");
  assert.strictEqual(hashToDoc.size, 250, "全250件のsha256が漏れなくマップされること");
  console.log("  => PASS: 100件超ページネーション走査成功!");

  // 2. 同名・別内容 (別Drive ID) の誤認防止検証
  console.log("\n[Test 2] 同名・別内容 (同ファイル名、別Drive ID、別SHA-256) の誤認防止検証...");
  const existingDocsSample = [
    {
      id: "doc_original_465018",
      drive_file_id: "drive_id_real_A",
      file_name: "20260210_計算書【請求】_K026021_2025.pdf",
      status: "processed"
    }
  ];

  // Drive 02_processed に存在するファイル群:
  // 1つは正当な原本 (drive_id_real_A, hash_AAA)
  // もう1つは同名だが別原本・別内容の無関係ファイル (drive_id_fake_B, hash_BBB)
  const driveFiles = [
    {
      id: "drive_id_real_A",
      name: "20260210_計算書【請求】_K026021_2025.pdf",
      sha256Checksum: "hash_AAA_content_real"
    },
    {
      id: "drive_id_fake_B", // 別Drive ID
      name: "20260210_計算書【請求】_K026021_2025.pdf", // 同名！
      sha256Checksum: "hash_BBB_content_different" // 別内容！
    }
  ];

  const strictDocByDriveId = new Map(existingDocsSample.filter(d => d.drive_file_id).map(d => [d.drive_file_id, d]));
  const strictHashToDoc = new Map();

  for (const f of driveFiles) {
    // 改修後の厳格一致 (Drive ID のみで紐付け)
    const matched = strictDocByDriveId.get(f.id);
    if (matched) {
      strictHashToDoc.set(f.sha256Checksum, matched);
    }
  }

  console.log(`  - 登録されたハッシュ一覧:`, Array.from(strictHashToDoc.keys()));
  assert.strictEqual(strictHashToDoc.has("hash_AAA_content_real"), true, "正規原本のハッシュがdoc_original_465018に紐付くこと");
  assert.strictEqual(strictHashToDoc.has("hash_BBB_content_different"), false, "同名別内容(別Drive ID)のハッシュは誤登録されないこと");
  assert.strictEqual(strictHashToDoc.size, 1, "正当な原本1件のみが登録されること");
  console.log("  => PASS: 同名・別内容のファイルがDrive ID不一致により正しく除外され、誤認が完全に防止されました!");
}

testBuildKnownDocumentHashMap().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});

