import { getDriveAccessToken, downloadDriveFile, fetchAllExistingDocuments, invokeRelay } from "./drive_auto_import_worker.mjs";
import { PDFParse } from "pdf-parse";
import { parseInvoiceDocument } from "./parsers/invoiceParsers.mjs";

async function main() {
  const token = await getDriveAccessToken();
  const existingDocs = await fetchAllExistingDocuments(invokeRelay);
  const existingFileNames = new Set(existingDocs.map(d => d.file_name));

  const list = [
    { id: "1HJzzgBSe38wANn2NkRR3aDusgX2dDVm7", name: "811-36148 ３ピース　クラシック　ＯＴＪ　ベルト　バッ.pdf" },
    { id: "1bzz9RcaZxNkUlL3fA-RAkSsvfL1JTFdf", name: "AIS_Mercari_Invoice_20260824.pdf" },
    { id: "17gYPNFsA4gMCyvtIYQYgLK4xGMKRoilF", name: "AIS_AUCNET_Invoice_Payoneer.pdf" },
    { id: "1P2j55G0Q_fqRdy3BXjbnQlnOBOXBeTd2", name: "5416790196.pdf" },
    { id: "1OW6w9KkAgGUKDSbwtNSUWheKdXqTleIb", name: "corrupt_test_sample.pdf" }
  ];

  for (const c of list) {
    const isRegistered = existingFileNames.has(c.name);
    console.log(`\n--- 検証: ${c.name} [既登録: ${isRegistered}] ---`);
    try {
      const buf = await downloadDriveFile(c.id, token);
      const parser = new PDFParse(new Uint8Array(buf));
      await parser.load();
      const textObj = await parser.getText();
      const text = textObj.text || "";
      console.log(`  文字数: ${text.length}`);
      const parsed = await parseInvoiceDocument(text);
      console.log("  パース結果:", {
        supplier: parsed.supplier_name,
        invoiceNumber: parsed.document_number,
        isBalanced: parsed.is_balanced,
        discrepancy: parsed.discrepancy,
        linesCount: parsed.lines?.length
      });
    } catch (e) {
      console.log("  解析エラー/破損:", e.message);
    }
  }
}

main().catch(console.error);
