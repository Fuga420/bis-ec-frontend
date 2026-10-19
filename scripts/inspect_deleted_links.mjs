import { CONFIG } from "./drive_auto_import_worker.mjs";

async function main() {
  const url = `${CONFIG.supabaseUrl}/rest/v1/document_product_links?select=id,product_id,link_type,allocated_amount,is_deleted,deleted_at,created_at`;
  const res = await fetch(url, {
    headers: {
      "apikey": CONFIG.supabaseAnonKey,
      "Authorization": `Bearer ${CONFIG.supabaseAnonKey}`
    }
  });
  if (res.ok) {
    const all = await res.json();
    console.log(`全リンク件数: ${all.length} 件`);
    console.log("全リンク内訳:", all);
  }
}
main();
