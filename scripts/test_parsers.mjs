/**
 * test_parsers.mjs
 * 3社（オークネット・KOMEHYO・NJ）パーサー単体テスト
 */

import fs from "fs";
import { parseAucnetInvoice, parseKomehyoInvoice, parseNjInvoice } from "./parsers/invoiceParsers.mjs";

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
const aucnetText = fs.readFileSync("/Users/terashimafuga/.gemini/antigravity/brain/25e15199-58f3-4dfb-a11a-c2c545fd98f1/scratch/audit_オークネット_20260217_計算書【請求】_K026021_2052_pdf.txt", "utf8");
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
const komehyoText = fs.readFileSync("/Users/terashimafuga/.gemini/antigravity/brain/25e15199-58f3-4dfb-a11a-c2c545fd98f1/scratch/audit_KOMEHYO_2764_ご精算書___26_8_5_pdf.txt", "utf8");
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
const njText = fs.readFileSync("/Users/terashimafuga/.gemini/antigravity/brain/25e15199-58f3-4dfb-a11a-c2c545fd98f1/scratch/audit_NJ_645_20260608_20260611_10773_pdf.txt", "utf8");
const njRes = parseNjInvoice(njText);

console.log("\n--- 3. ネットジャパン (NJ-20260612-10773) 検算結果 ---");
console.log(`  お客様コード: ${njRes.member_number}, 発行日: ${njRes.issue_date}`);
console.log(`  原本総合計金額: ${njRes.declared_net_amount} 円`);
console.log(`  抽出明細行数: ${njRes.lines.length} 行 (買上7件 + 雑費1件)`);
console.log(`  明細合計: ${njRes.calculated_total} 円, 差額: ${njRes.discrepancy} 円`);

assert("3-1. NJ: 原本総合計金額が1,673,518円", njRes.declared_net_amount === 1673518);
assert("3-2. NJ: 明細8件 (商品7件 + 雑費1件) が抽出される", njRes.lines.length === 8);
assert("3-3. NJ: 金額検算差額が0円 (is_balanced === true)", njRes.is_balanced === true && njRes.discrepancy === 0);

// 4. NJスキャン画像PDF (11.30.pdf) の文字層なし検出
const njScanText = fs.readFileSync("/Users/terashimafuga/.gemini/antigravity/brain/25e15199-58f3-4dfb-a11a-c2c545fd98f1/scratch/audit_NJ_11_30_pdf.txt", "utf8");
const njScanRes = parseNjInvoice(njScanText);

console.log("\n--- 4. NJスキャン画像PDF (11.30.pdf) 判定結果 ---");
console.log(`  文字層有無: ${njScanRes.has_text_layer}`);
console.log(`  要確認理由: ${JSON.stringify(njScanRes.needs_review_reasons)}`);

assert("4-1. NJスキャンPDF: has_text_layer が false と判定される", njScanRes.has_text_layer === false);
assert("4-2. NJスキャンPDF: TEXT_LAYER_MISSING_NEEDS_OCR が付与される", njScanRes.needs_review_reasons.includes("TEXT_LAYER_MISSING_NEEDS_OCR"));

console.log("\n==================================================");
console.log(`=== 全テスト結果: ${passed}/${passed + failed} PASS (失敗: ${failed}) ===`);
console.log("==================================================");

if (failed > 0) process.exit(1);

