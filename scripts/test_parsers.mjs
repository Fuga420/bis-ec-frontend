/**
 * test_parsers.mjs
 * 3社（オークネット・KOMEHYO・NJ）パーサー単体テスト
 *
 * 外部端末再現性:
 *  特定端末の絶対パスに依存せず、scripts/fixtures/ 配下の同梱テキストフィクスチャを使用。
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parseAucnetInvoice, parseKomehyoInvoice, parseNjInvoice } from "./parsers/invoiceParsers.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.resolve(__dirname, "./fixtures");

console.log("==================================================");
console.log("=== 3社仕入書類パーサー 単体テスト & 検算検証 ===");
console.log("==================================================\n");

let passed = 0;
let failed = 0;

function assert(title, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`✓ PASS: ${title}`);
  } else {
    failed++;
    console.error(`✗ FAIL: ${title} ${detail}`);
  }
}

// 1. オークネット (466935)
const aucnetPath = path.join(fixturesDir, "aucnet_466935_sample.txt");
const aucnetText = fs.readFileSync(aucnetPath, "utf8");
const aucnetRes = parseAucnetInvoice(aucnetText);

console.log("\n--- 1. オークネット (466935) 検算結果 ---");
console.log(`  計算書番号: ${aucnetRes.document_number}`);
console.log(`  原本公称額: 請求[B] ${aucnetRes.declared_total_claim} 円 - 支払[A] ${aucnetRes.declared_total_payment} 円 = 純額 ${aucnetRes.declared_net_amount} 円`);
console.log(`  抽出明細行数: ${aucnetRes.lines.length} 行`);
console.log(`  明細合計: ${aucnetRes.calculated_total} 円, 差額: ${aucnetRes.discrepancy} 円`);

assert("1-1. オークネット: 計算書番号が466935として抽出される", aucnetRes.document_number === "466935");
assert("1-2. オークネット: 原本公称額が157,245円", aucnetRes.declared_net_amount === 157245);
assert("1-3. オークネット: 明細5件が抽出される", aucnetRes.lines.length === 5);
assert("1-4. オークネット: 金額検算差額が0円 (is_balanced === true)", aucnetRes.is_balanced === true && aucnetRes.discrepancy === 0);

// 2. KOMEHYO (2764-20260805)
const komehyoPath = path.join(fixturesDir, "komehyo_2764_sample.txt");
const komehyoText = fs.readFileSync(komehyoPath, "utf8");
const komehyoRes = parseKomehyoInvoice(komehyoText);

console.log("\n--- 2. KOMEHYO (2764-20260805) 検算結果 ---");
console.log(`  会員番号: ${komehyoRes.member_number}, 発行日: ${komehyoRes.issue_date}`);
console.log(`  原本請求額: ${komehyoRes.declared_net_amount} 円`);
console.log(`  抽出明細行数: ${komehyoRes.lines.length} 行 (購入12件 + 事務諸費用1件)`);
console.log(`  明細合計: ${komehyoRes.calculated_total} 円, 差額: ${komehyoRes.discrepancy} 円`);

assert("2-1. KOMEHYO: 原本請求合計が2,186,360円", komehyoRes.declared_net_amount === 2186360);
assert("2-2. KOMEHYO: 明細13件 (商品12件 + 事務諸費用1件) が抽出される", komehyoRes.lines.length === 13);
assert("2-3. KOMEHYO: 金額検算差額が0円 (is_balanced === true)", komehyoRes.is_balanced === true && komehyoRes.discrepancy === 0);

// 3. ネットジャパン (NJ-20260612-10773)
const njPath = path.join(fixturesDir, "nj_10773_sample.txt");
const njText = fs.readFileSync(njPath, "utf8");
const njRes = parseNjInvoice(njText);

console.log("\n--- 3. ネットジャパン (NJ-20260612-10773) 検算結果 ---");
console.log(`  お客様コード: ${njRes.member_number}, 発行日: ${njRes.issue_date}`);
console.log(`  原本総合計金額: ${njRes.declared_net_amount} 円`);
console.log(`  抽出明細行数: ${njRes.lines.length} 行 (買上7件 + 雑費1件)`);
console.log(`  明細合計: ${njRes.calculated_total} 円, 差額: ${njRes.discrepancy} 円`);

assert("3-1. NJ: 原本総合計金額が1,673,518円", njRes.declared_net_amount === 1673518);
assert("3-2. NJ: 明細8件 (商品7件 + 雑費1件) が抽出される", njRes.lines.length === 8);
assert("3-3. NJ: 金額検算差額が0円 (is_balanced === true)", njRes.is_balanced === true && njRes.discrepancy === 0);
assert("3-4. NJ: 各明細の total_line_amount 合計が原本公称総合計と完全一致する", njRes.lines.reduce((s, l) => s + l.total_line_amount, 0) === njRes.declared_net_amount);
assert("3-5. NJ: 6月原本の各行ページ番号が正確 (買上=2P, 雑費=4P)",
  njRes.lines.slice(0, 7).every(l => l.page_number === 2) &&
  njRes.lines[7].page_number === 4
);

// 4. NJスキャン画像PDF (11.30.pdf) の文字層なし検出
const njScanPath = path.join(fixturesDir, "nj_scan_sample.txt");
const njScanText = fs.readFileSync(njScanPath, "utf8");
const njScanRes = parseNjInvoice(njScanText);

console.log("\n--- 4. NJスキャン画像PDF (11.30.pdf) 判定結果 ---");
console.log(`  文字層有無: ${njScanRes.has_text_layer}`);
console.log(`  要確認理由: ${JSON.stringify(njScanRes.needs_review_reasons)}`);

assert("4-1. NJスキャンPDF: has_text_layer が false と判定される", njScanRes.has_text_layer === false);
assert("4-2. NJスキャンPDF: TEXT_LAYER_MISSING_NEEDS_OCR が付与される", njScanRes.needs_review_reasons.includes("TEXT_LAYER_MISSING_NEEDS_OCR"));

// 5. ネットジャパン 複合票 (566-20260108-20260111-10773)
const njCompPath = path.join(fixturesDir, "nj_composite_sample.txt");
const njCompText = fs.readFileSync(njCompPath, "utf8");
const njCompRes = parseNjInvoice(njCompText);

console.log("\n--- 5. ネットジャパン 複合票 (566-20260108-20260111-10773) 検算結果 ---");
console.log(`  お客様コード: ${njCompRes.member_number}, 発行日: ${njCompRes.issue_date}`);
console.log(`  原本総合計金額: ${njCompRes.declared_net_amount} 円`);
console.log(`  抽出明細行数: ${njCompRes.lines.length} 行 (買上5件 + 売上相殺7件 + 手数料1件 + 雑費1件)`);
console.log(`  明細合計: ${njCompRes.calculated_total} 円, 差額: ${njCompRes.discrepancy} 円`);

const buyLines = njCompRes.lines.filter(l => l.transaction_type === "purchase");
const saleLines = njCompRes.lines.filter(l => l.transaction_type === "sale_settlement");
const feeLines = njCompRes.lines.filter(l => l.transaction_type === "commission");
const expLines = njCompRes.lines.filter(l => l.transaction_type === "other_expense");

const allLinesBalanced = njCompRes.lines.every(l => l.item_amount + l.tax_amount === l.total_line_amount);
const saleNegative = saleLines.every(l => l.item_amount < 0 && l.tax_amount < 0 && l.total_line_amount < 0);

assert("5-1. NJ複合票: 原本総合計金額が3,071,479円", njCompRes.declared_net_amount === 3071479);
assert("5-2. NJ複合票: 明細14件 (買上5件 + 売上相殺7件 + 手数料1件 + 雑費1件) が動的抽出される",
  njCompRes.lines.length === 14 &&
  buyLines.length === 5 &&
  saleLines.length === 7 &&
  feeLines.length === 1 &&
  expLines.length === 1
);
assert("5-3. NJ複合票: 金額検算差額が0円 (is_balanced === true)", njCompRes.is_balanced === true && njCompRes.discrepancy === 0);
assert("5-4. NJ複合票: 各明細の total_line_amount 合計が原本公称総合計と完全一致する", njCompRes.lines.reduce((s, l) => s + l.total_line_amount, 0) === njCompRes.declared_net_amount);
assert("5-5. NJ複合票: 全14行で item_amount + tax_amount === total_line_amount が成立する", allLinesBalanced);
assert("5-6. NJ複合票: 売上明細が相殺額として全て負数 (マイナス) で記録される", saleNegative);

// 各セクションの参照ページ番号検証
assert("5-7. NJ複合票: 各セクションのページ番号が原本から動的抽出される (売上=2P, 買上=3P, 手数料=4P, 雑費=5P)",
  saleLines.every(l => l.page_number === 2) &&
  buyLines.every(l => l.page_number === 3) &&
  feeLines.every(l => l.page_number === 4) &&
  expLines.every(l => l.page_number === 5)
);

// 原本原文との照合
const firstBuy = buyLines[0];
assert("5-8. NJ複合票: 買上1行目の受付番号(1-5)・本体額(385,764円)・税額配分(38,576円)・行総額(424,340円)が正確",
  firstBuy.reception_number_normalized === "1-5" &&
  firstBuy.item_amount === 385764 &&
  firstBuy.tax_amount === 38576 &&
  firstBuy.total_line_amount === 424340 &&
  firstBuy.item_name_raw.includes("1.037ct E VVS2")
);
const firstSale = saleLines[0];
assert("5-9. NJ複合票: 売上相殺1行目の受付番号(283-1)・品名・本体額(-23,779円)・税額配分(-2,378円)・行総額(-26,157円)が正確",
  firstSale.reception_number_normalized === "283-1" &&
  firstSale.item_amount === -23779 &&
  firstSale.tax_amount === -2378 &&
  firstSale.total_line_amount === -26157 &&
  firstSale.item_name_raw.includes("0.301ct E VS2")
);
// 6. オークネット 別日原本 (463027 - 2026/02/03)
const aucnet463027Path = path.join(fixturesDir, "aucnet_463027_sample.txt");
const aucnet463027Text = fs.readFileSync(aucnet463027Path, "utf8");
const aucnet463027Res = parseAucnetInvoice(aucnet463027Text);

console.log("\n--- 6. オークネット 別日原本 (463027) 検算結果 ---");
console.log(`  計算書番号: ${aucnet463027Res.document_number}, 原本公称額: ${aucnet463027Res.declared_net_amount} 円`);
console.log(`  抽出明細行数: ${aucnet463027Res.lines.length} 行, 明細合計: ${aucnet463027Res.calculated_total} 円, 差額: ${aucnet463027Res.discrepancy} 円`);

assert("6-1. オークネット別日: 計算書番号が463027として抽出される", aucnet463027Res.document_number === "463027");
assert("6-2. オークネット別日: 原本公称額が1,280,609円", aucnet463027Res.declared_net_amount === 1280609);
assert("6-3. オークネット別日: 明細2件 (落札1件 + 配送費1件) が動的抽出される", aucnet463027Res.lines.length === 2);
assert("6-4. オークネット別日: 金額検算差額が0円 (is_balanced === true)", aucnet463027Res.is_balanced === true && aucnet463027Res.discrepancy === 0);
assert("6-5. オークネット別日: 受付番号852-30191が抽出される", aucnet463027Res.lines[0].reception_number_normalized === "852-30191");

// 7. KOMEHYO 別日原本 (2764-20260128)
const komehyo260128Path = path.join(fixturesDir, "komehyo_260128_sample.txt");
const komehyo260128Text = fs.readFileSync(komehyo260128Path, "utf8");
const komehyo260128Res = parseKomehyoInvoice(komehyo260128Text);

console.log("\n--- 7. KOMEHYO 別日原本 (2764-20260128) 検算結果 ---");
console.log(`  書類番号: ${komehyo260128Res.document_number}, 原本請求額: ${komehyo260128Res.declared_net_amount} 円`);
console.log(`  抽出明細行数: ${komehyo260128Res.lines.length} 行, 明細合計: ${komehyo260128Res.calculated_total} 円, 差額: ${komehyo260128Res.discrepancy} 円`);

assert("7-1. KOMEHYO別日: 原本請求合計が2,767,820円", komehyo260128Res.declared_net_amount === 2767820);
assert("7-2. KOMEHYO別日: 明細6件 (諸経費3件 + 購入3件) が動的抽出される", komehyo260128Res.lines.length === 6);
assert("7-3. KOMEHYO別日: 金額検算差額が0円 (is_balanced === true)", komehyo260128Res.is_balanced === true && komehyo260128Res.discrepancy === 0);
assert("7-4. KOMEHYO別日: 各明細の受付番号が正確 (532-10, 577-5, 1456-6)",
  komehyo260128Res.lines[3].reception_number_normalized === "532-10" &&
  komehyo260128Res.lines[4].reception_number_normalized === "577-5" &&
  komehyo260128Res.lines[5].reception_number_normalized === "1456-6"
);

console.log("\n==================================================");
console.log(`=== 全テスト結果: ${passed}/${passed + failed} PASS (失敗: ${failed}) ===`);
console.log("==================================================");

if (failed > 0) process.exit(1);
