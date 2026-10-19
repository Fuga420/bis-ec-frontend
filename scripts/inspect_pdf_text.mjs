import { getDriveAccessToken, downloadDriveFile } from "./drive_auto_import_worker.mjs";
import { PDFParse } from "pdf-parse";

const CANDIDATE_FILE_ID = "1If-OI_LGTyD67blgo-vEqH60mK_IjFN3";

async function main() {
  const token = await getDriveAccessToken();
  const buf = await downloadDriveFile(CANDIDATE_FILE_ID, token);
  const parser = new PDFParse(new Uint8Array(buf));
  await parser.load();
  const textObj = await parser.getText();
  console.log("Text preview (first 500 chars):");
  console.log(textObj.text.slice(0, 500));
}

main().catch(console.error);

