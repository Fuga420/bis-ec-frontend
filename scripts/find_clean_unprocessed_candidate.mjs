import { getDriveAccessToken, downloadDriveFile } from "./drive_auto_import_worker.mjs";
import { parseInvoiceDocument } from "./parsers/invoiceParsers.mjs";
import { PDFParse } from "pdf-parse";
import crypto from "crypto";

const CANDIDATES = [
  { id: '1FJNZZayuGswfyp4fpIKghwbdnfSdKv5I', name: '20260303_計算書【請求】_K026021_2051.pdf' },
  { id: '1L2OCUrBMKjYdBW3yG0tejMqFLKInKgX7', name: '20260310_計算書【請求】_K026021_1941.pdf' },
  { id: '18T-mb-fVMbng8FhPKzOJrhZLvnvanTiy', name: '598-20260308-20260311-10773.pdf' },
  { id: '1QvgOgbYpv539JRSMWXTpvFWQmc85Odd0', name: '2764_ご精算書 26.2.11.pdf' },
];

async function main() {
  const token = await getDriveAccessToken();

  for (const c of CANDIDATES) {
    console.log(`\n========================================`);
    console.log(`Testing: ${c.name} (${c.id})`);
    try {
      const buf = await downloadDriveFile(c.id, token);
      const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
      console.log(`Downloaded ${buf.length} bytes, SHA-256: ${sha256}`);

      const parser = new PDFParse(new Uint8Array(buf));
      await parser.load();
      const textObj = await parser.getText();
      const parsed = await parseInvoiceDocument(textObj.text);

      console.log(`Supplier: ${parsed.supplier_name}`);
      console.log(`DocNumber: ${parsed.document_number}`);
      console.log(`IssueDate: ${parsed.issue_date}`);
      console.log(`DeclaredTotal: ${parsed.declared_net_amount}`);
      console.log(`CalculatedTotal: ${parsed.calculated_total}`);
      console.log(`Discrepancy: ${parsed.discrepancy}`);
      console.log(`IsBalanced: ${parsed.is_balanced}`);
      console.log(`LinesCount: ${parsed.lines?.length}`);
      if (parsed.lines?.length > 0) {
        console.log(`First Line:`, JSON.stringify(parsed.lines[0]));
      }
    } catch (err) {
      console.error(`Error testing ${c.name}:`, err.message);
    }
  }
}

main().catch(console.error);

