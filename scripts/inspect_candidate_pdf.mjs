import { getDriveAccessToken, downloadDriveFile } from "./drive_auto_import_worker.mjs";
import { PDFParse } from "pdf-parse";
import { parseInvoiceDocument } from "./parsers/invoiceParsers.mjs";
import crypto from "crypto";

const CANDIDATE_FILE_ID = "1If-OI_LGTyD67blgo-vEqH60mK_IjFN3"; // 577-20260126-20260129-10773.pdf

async function main() {
  const token = await getDriveAccessToken();
  console.log(`Downloading candidate PDF: ${CANDIDATE_FILE_ID}...`);
  const buf = await downloadDriveFile(CANDIDATE_FILE_ID, token);
  const fingerprint = crypto.createHash("sha256").update(buf).digest("hex");
  console.log(`Downloaded ${buf.length} bytes, SHA-256: ${fingerprint}`);

  const parser = new PDFParse(new Uint8Array(buf));
  await parser.load();
  const textObj = await parser.getText();
  console.log(`Extracted text length: ${textObj.text.length}, pages: ${textObj.total}`);

  const parseResult = await parseInvoiceDocument(textObj.text);
  console.log("Parse result:", {
    supplier: parseResult.supplier_name,
    invoiceNumber: parseResult.document_number,
    issueDate: parseResult.issue_date,
    declaredTotal: parseResult.declared_net_amount,
    calculatedTotal: parseResult.calculated_total,
    discrepancy: parseResult.discrepancy,
    isBalanced: parseResult.is_balanced,
    linesCount: parseResult.lines?.length
  });

  if (parseResult.lines?.length > 0) {
    console.log("Sample lines:");
    for (const l of parseResult.lines.slice(0, 3)) {
      console.log(` - Line ${l.line_number}: ${l.item_name_raw} | Item: ${l.item_amount} | Fee: ${l.fee_amount} | Total: ${l.total_line_amount}`);
    }
  }
}

main().catch(console.error);

