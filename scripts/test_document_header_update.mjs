import assert from "assert";

console.log("=== save_document_lines ヘッダー更新・差額集計ロジック 単体検証 ===");

// 1. パラメータ受付とオブジェクト組み立て
function buildDocHeaderUpdate(body) {
  const asString = (v) => (v == null ? "" : String(v).trim());
  const toNumOrNull = (v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const docHeaderUpdate = {};
  if (body.document_number !== undefined) {
    docHeaderUpdate.document_number = asString(body.document_number) || null;
  }
  if (body.issue_date !== undefined) {
    docHeaderUpdate.issue_date = asString(body.issue_date) || null;
  }
  if (body.supplier_name !== undefined) {
    docHeaderUpdate.supplier_name = asString(body.supplier_name) || null;
  }
  if (body.total_amount !== undefined) {
    docHeaderUpdate.total_amount = toNumOrNull(body.total_amount);
  }
  return docHeaderUpdate;
}

// 2. 監査集計と検算差額計算ロジック (computeAuditSummary / refreshDocumentStatus 相当)
function computeAudit(doc, lines) {
  const activeLines = lines.filter((l) => !l.is_deleted && l.is_active !== false);
  const declaredTotal = doc.total_amount;
  const extractedTotal = activeLines.reduce((acc, l) => acc + (Number(l.total_line_amount) || 0), 0);
  const discrepancy = declaredTotal === null ? null : declaredTotal - extractedTotal;

  return {
    document_id: doc.id,
    document_number: doc.document_number,
    supplier_name: doc.supplier_name,
    issue_date: doc.issue_date,
    declared_total_amount: doc.total_amount,
    extracted_total_amount: extractedTotal,
    active_lines_count: activeLines.length,
    discrepancy_amount: discrepancy,
    is_balanced: discrepancy !== null && discrepancy === 0
  };
}

// --- テストケース 1: 修正前の挙動再現 (ヘッダー未更新時) ---
console.log("\n[テスト 1] 修正前の挙動再現 (ヘッダー未保存)");
const preDoc = {
  id: "c7dae6ee-ee45-40d3-b37d-78eb3f37e680",
  supplier_name: "自動判別中",
  document_number: null,
  issue_date: null,
  total_amount: null
};
const testLines = [
  { total_line_amount: 287716 },
  { total_line_amount: 42328 },
  { total_line_amount: 283712 }
];
const preAudit = computeAudit(preDoc, testLines);
console.log("  修正前 Audit:", preAudit);
assert.strictEqual(preAudit.document_number, null);
assert.strictEqual(preAudit.supplier_name, "自動判別中");
assert.strictEqual(preAudit.issue_date, null);
assert.strictEqual(preAudit.declared_total_amount, null);
assert.strictEqual(preAudit.extracted_total_amount, 613756);
assert.strictEqual(preAudit.discrepancy_amount, null);
assert.strictEqual(preAudit.is_balanced, false);
console.log("  ✓ 修正前の状態 (ヘッダー欠損・差額未計算) を完全再現確認");

// --- テストケース 2: 修正後の挙動検証 (ヘッダー更新・差額計算) ---
console.log("\n[テスト 2] 修正後の挙動検証 (ヘッダー更新・差額計算)");
const requestBody = {
  document_id: "c7dae6ee-ee45-40d3-b37d-78eb3f37e680",
  document_number: "471123",
  supplier_name: "オークネット",
  issue_date: "2026-03-03",
  total_amount: 613756,
  lines: testLines
};

const updatePayload = buildDocHeaderUpdate(requestBody);
console.log("  生成された UPDATE ペイロード:", updatePayload);
assert.strictEqual(updatePayload.document_number, "471123");
assert.strictEqual(updatePayload.supplier_name, "オークネット");
assert.strictEqual(updatePayload.issue_date, "2026-03-03");
assert.strictEqual(updatePayload.total_amount, 613756);

// DB レコード更新適用
const postDoc = {
  ...preDoc,
  ...updatePayload
};

const postAudit = computeAudit(postDoc, testLines);
console.log("  修正後 Audit:", postAudit);
assert.strictEqual(postAudit.document_number, "471123");
assert.strictEqual(postAudit.supplier_name, "オークネット");
assert.strictEqual(postAudit.issue_date, "2026-03-03");
assert.strictEqual(postAudit.declared_total_amount, 613756);
assert.strictEqual(postAudit.extracted_total_amount, 613756);
assert.strictEqual(postAudit.discrepancy_amount, 0);
assert.strictEqual(postAudit.is_balanced, true);
console.log("  ✓ 修正後の状態 (ヘッダー更新・原本記載額と明細合計一致・検算差額0円) を確認");

// --- テストケース 3: 原本記載額と抽出明細合計の混同防止 (不一致ケース) ---
console.log("\n[テスト 3] 原本記載額と抽出明細合計の独立性検証 (不一致検知)");
const mismatchBody = {
  document_number: "471123",
  supplier_name: "オークネット",
  issue_date: "2026-03-03",
  total_amount: 700000 // 原本記載額が 700,000 円の場合
};
const mismatchUpdate = buildDocHeaderUpdate(mismatchBody);
const mismatchDoc = { ...preDoc, ...mismatchUpdate };
const mismatchAudit = computeAudit(mismatchDoc, testLines);
console.log("  不一致時 Audit:", {
  declared: mismatchAudit.declared_total_amount,
  extracted: mismatchAudit.extracted_total_amount,
  discrepancy: mismatchAudit.discrepancy_amount,
  is_balanced: mismatchAudit.is_balanced
});
assert.strictEqual(mismatchAudit.declared_total_amount, 700000);
assert.strictEqual(mismatchAudit.extracted_total_amount, 613756);
assert.strictEqual(mismatchAudit.discrepancy_amount, 86244);
assert.strictEqual(mismatchAudit.is_balanced, false);
console.log("  ✓ 原本記載額と抽出明細合計が独立して保存され、正しく差額が検出されることを確認");

console.log("\n==========================================");
console.log("=== 全テストケース PASS (3/3) ===");
console.log("==========================================");
