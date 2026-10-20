import assert from "assert";

console.log("=== save_document_lines ヘッダー更新・差額集計・ステータス保護ロジック 単体検証 ===");

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

// 2. 監査集計と検算差額計算ロジック (computeAuditSummary 相当)
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
    document_status: doc.status,
    declared_total_amount: doc.total_amount,
    extracted_total_amount: extractedTotal,
    active_lines_count: activeLines.length,
    confirmed_lines_count: activeLines.filter((l) => l.match_status === "confirmed").length,
    unlinked_lines_count: activeLines.filter((l) => l.match_status === "unlinked" && !l.is_canceled).length,
    discrepancy_amount: discrepancy,
    is_balanced: discrepancy !== null && discrepancy === 0
  };
}

// 3. refreshDocumentStatus 相当のステータス再判定ロジック
function determineNewStatus(audit) {
  const currentStatus = String(audit.document_status || "");
  const activeCount = Number(audit.active_lines_count) || 0;
  const confirmedCount = Number(audit.confirmed_lines_count) || 0;
  const unlinkedCount = Number(audit.unlinked_lines_count) || 0;
  const hasDiscrepancy =
    audit.discrepancy_amount !== null &&
    Number(audit.discrepancy_amount) !== 0;

  if (currentStatus === "processed") {
    // 既に取込完了 (processed) の書類は、ヘッダー更新や明細再計算だけで lines_registered 等に戻さない
    // 取込完了ステータスを維持し、商品への照合状況は既存の明細・リンク情報から個別に表示する
    return "processed";
  } else if (activeCount === 0) {
    return audit.declared_total_amount === null ? "pending_amount" : "pending";
  } else {
    if (unlinkedCount === 0 && confirmedCount > 0 && !hasDiscrepancy) {
      return "fully_matched";
    } else if (confirmedCount > 0) {
      return "partially_matched";
    } else if (hasDiscrepancy) {
      return "flagged";
    } else {
      return "lines_registered";
    }
  }
}

const testLines = [
  { total_line_amount: 287716, match_status: "unlinked" },
  { total_line_amount: 42328, match_status: "unlinked" },
  { total_line_amount: 283712, match_status: "unlinked" }
];

// --- テストケース 1: 修正前の挙動再現 (ヘッダー未保存) ---
console.log("\n[テスト 1] 修正前の挙動再現 (ヘッダー未保存)");
const preDoc = {
  id: "c7dae6ee-ee45-40d3-b37d-78eb3f37e680",
  supplier_name: "自動判別中",
  document_number: null,
  issue_date: null,
  total_amount: null,
  status: "pending_amount"
};
const preAudit = computeAudit(preDoc, testLines);
assert.strictEqual(preAudit.document_number, null);
assert.strictEqual(preAudit.supplier_name, "自動判別中");
assert.strictEqual(preAudit.declared_total_amount, null);
assert.strictEqual(preAudit.extracted_total_amount, 613756);
assert.strictEqual(preAudit.discrepancy_amount, null);
assert.strictEqual(preAudit.is_balanced, false);
console.log("  ✓ 修正前の状態 (ヘッダー欠損・差額未計算) を確認");

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
const postDoc = { ...preDoc, ...updatePayload };
const postAudit = computeAudit(postDoc, testLines);
assert.strictEqual(postAudit.document_number, "471123");
assert.strictEqual(postAudit.supplier_name, "オークネット");
assert.strictEqual(postAudit.issue_date, "2026-03-03");
assert.strictEqual(postAudit.declared_total_amount, 613756);
assert.strictEqual(postAudit.extracted_total_amount, 613756);
assert.strictEqual(postAudit.discrepancy_amount, 0);
assert.strictEqual(postAudit.is_balanced, true);
console.log("  ✓ 修正後の状態 (ヘッダー更新・原本額一致・検算差額0円) を確認");

// --- テストケース 3: 原本記載額と抽出明細合計の独立性検証 (不一致検知) ---
console.log("\n[テスト 3] 原本記載額と抽出明細合計の独立性検証 (不一致検知)");
const mismatchBody = {
  document_number: "471123",
  supplier_name: "オークネット",
  issue_date: "2026-03-03",
  total_amount: 700000
};
const mismatchUpdate = buildDocHeaderUpdate(mismatchBody);
const mismatchDoc = { ...preDoc, ...mismatchUpdate };
const mismatchAudit = computeAudit(mismatchDoc, testLines);
assert.strictEqual(mismatchAudit.declared_total_amount, 700000);
assert.strictEqual(mismatchAudit.extracted_total_amount, 613756);
assert.strictEqual(mismatchAudit.discrepancy_amount, 86244);
assert.strictEqual(mismatchAudit.is_balanced, false);
console.log("  ✓ 原本記載額と明細合計が独立保存され、正しく差額が検出されることを確認");

// --- テストケース 4: 既に processed の書類はヘッダー更新後も processed を維持 ---
console.log("\n[テスト 4] 既に processed の書類のステータス保護 (巻き戻り防止)");
const processedDoc = {
  ...postDoc,
  status: "processed"
};
const processedAudit = computeAudit(processedDoc, testLines);
const newStatusProcessed = determineNewStatus(processedAudit);
console.log("  processed 書類再判定結果:", newStatusProcessed);
assert.strictEqual(newStatusProcessed, "processed");
console.log("  ✓ 既に processed の書類は、未紐付け明細があっても lines_registered に戻らず processed を維持することを確認");

// --- テストケース 5: 未処理書類は従来通りの状態遷移が進むこと ---
console.log("\n[テスト 5] 未処理書類 (pending_amount / pending) の通常遷移検証");
// 5-1: 未処理・明細未登録
const emptyDoc = { ...preDoc, status: "pending_amount", total_amount: null };
const emptyAudit = computeAudit(emptyDoc, []);
assert.strictEqual(determineNewStatus(emptyAudit), "pending_amount");

// 5-2: 未処理・明細登録済み・未紐付け
const unlinkedDoc = { ...preDoc, status: "pending", total_amount: 613756 };
const unlinkedAudit = computeAudit(unlinkedDoc, testLines);
assert.strictEqual(determineNewStatus(unlinkedAudit), "lines_registered");

// 5-3: 未処理・一部紐付け済み
const partialLines = [
  { total_line_amount: 287716, match_status: "confirmed" },
  { total_line_amount: 42328, match_status: "unlinked" },
  { total_line_amount: 283712, match_status: "unlinked" }
];
const partialAudit = computeAudit(unlinkedDoc, partialLines);
assert.strictEqual(determineNewStatus(partialAudit), "partially_matched");

// 5-4: 未処理・全紐付け済み・差額0円
const fullLines = [
  { total_line_amount: 287716, match_status: "confirmed" },
  { total_line_amount: 42328, match_status: "confirmed" },
  { total_line_amount: 283712, match_status: "confirmed" }
];
const fullAudit = computeAudit(unlinkedDoc, fullLines);
assert.strictEqual(determineNewStatus(fullAudit), "fully_matched");

// 5-5: 差額あり (flagged)
const flaggedDoc = { ...unlinkedDoc, total_amount: 999999 };
const flaggedAudit = computeAudit(flaggedDoc, testLines);
assert.strictEqual(determineNewStatus(flaggedAudit), "flagged");
assert.strictEqual(flaggedAudit.discrepancy_amount, 999999 - 613756);
assert.strictEqual(flaggedAudit.is_balanced, false);

console.log("  ✓ 未処理書類の全通常遷移 (pending_amount -> lines_registered -> partially_matched -> fully_matched / flagged) が従来通り機能することを確認");

// --- テストケース 6: processed 書類でも差額があれば差額表示から確認可能 ---
console.log("\n[テスト 6] processed 書類での差額表示確認");
const processedDiscrepancyDoc = {
  ...processedDoc,
  total_amount: 700000 // 差額発生時
};
const processedDiscrepancyAudit = computeAudit(processedDiscrepancyDoc, testLines);
const statusForDiscrepancy = determineNewStatus(processedDiscrepancyAudit);
assert.strictEqual(statusForDiscrepancy, "processed"); // ステータスは取込済み維持
assert.strictEqual(processedDiscrepancyAudit.discrepancy_amount, 86244); // 差額は正確に算出
assert.strictEqual(processedDiscrepancyAudit.is_balanced, false);
console.log("  ✓ processed 書類で差額が発生した場合でも、status は processed を維持しつつ差額 (86,244円) が正確に表示されることを確認");

console.log("\n==========================================");
console.log("=== 全テストケース PASS (6/6) ===");
console.log("==========================================");
