import { invokeRelay, fetchAllExistingDocuments } from "./drive_auto_import_worker.mjs";

async function main() {
  const docs = await fetchAllExistingDocuments(invokeRelay);
  console.log(`Total documents in DB: ${docs.length}`);
  for (const d of docs) {
    console.log(`- ID: ${d.id}, Supplier: ${d.supplier_name}, File: ${d.file_name}, Fingerprint: ${d.file_fingerprint?.slice(0, 16)}..., Status: ${d.status}`);
  }
}

main().catch(console.error);
