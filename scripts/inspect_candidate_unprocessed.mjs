import { getDriveAccessToken } from "./drive_auto_import_worker.mjs";
import { parseInvoiceDocument } from "./parsers/invoiceParsers.mjs";
import { PDFParse } from "pdf-parse";
import crypto from 'crypto';

const candidateIds = [
  { id: '1FJNZZayuGswfyp4fpIKghwbdnfSdKv5I', name: '20260303_計算書【請求】_K026021_2051.pdf' },
  { id: '1L2OCUrBMKjYdBW3yG0tejMqFLKInKgX7', name: '20260310_計算書【請求】_K026021_1941.pdf' },
  { id: '18T-mb-fVMbng8FhPKzOJrhZLvnvanTiy', name: '598-20260308-20260311-10773.pdf' },
  { id: '1QvgOgbYpv539JRSMWXTpvFWQmc85Odd0', name: '2764_ご精算書 26.2.11.pdf' },
];

async function main() {
  const token = await getDriveAccessToken();

  for (const c of candidateIds) {
    console.log(`\n========================================`);
    console.log(`検査対象: ${c.name} (${c.id})`);

    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${c.id}?alt=media&supportsAllDrives=true`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
      console.log(`取得失敗: HTTP ${res.status}`);
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
    console.log(`サイズ: ${buf.length} bytes, SHA-256: ${sha256}`);

    try {
      const parser = new PDFParse(new Uint8Array(buf));
      await parser.load();
      const textObj = await parser.getText();
      const text = textObj.text || '';
      console.log(`ページ数: ${textObj.total}, 抽出テキスト文字数: ${text.length}`);

      const parsed = parseInvoiceDocument(text);
      console.log(`仕入先: ${parsed.supplier_name}`);
      console.log(`書類番号: ${parsed.document_number}`);
      console.log(`発行日: ${parsed.issue_date}`);
      console.log(`公称請求額: ${parsed.declared_net_amount}`);
      console.log(`計算行数: ${parsed.lines.length}`);
      console.log(`計算合計: ${parsed.calculated_total}`);
      console.log(`検算差額: ${parsed.discrepancy}`);
      console.log(`検算一致 (is_balanced): ${parsed.is_balanced}`);
      console.log(`要確認理由: ${JSON.stringify(parsed.needs_review_reasons)}`);
      if (parsed.lines.length > 0) {
        console.log(`先頭行:`, JSON.stringify(parsed.lines[0], null, 2));
      }
    } catch (err) {
      console.log(`解析エラー: ${err.message}`);
    }
  }
}

main().catch(console.error);

