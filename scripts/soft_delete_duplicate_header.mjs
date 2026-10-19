import { invokeRelay, CONFIG } from "./drive_auto_import_worker.mjs";

const TARGET_ID = "a53c27a2-6645-4467-a6bb-57b117081894";
const ORIGINAL_ID = "f20aeb19-cd78-4cc2-bafb-f3c6a93edc58";

async function fetchRestDoc(id) {
  const url = `${CONFIG.supabaseUrl}/rest/v1/documents?id=eq.${id}&select=*`;
  const res = await fetch(url, {
    headers: {
      apikey: CONFIG.supabaseAnonKey,
      Authorization: `Bearer ${CONFIG.supabaseAnonKey}`
    }
  });
  if (!res.ok) {
    throw new Error(`REST GET failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data[0] || null;
}

async function main() {
  console.log("=== 1. 実施前の対象ID・状態確認 ===");
  if (TARGET_ID === ORIGINAL_ID) {
    throw new Error("安全停止: TARGET_ID と ORIGINAL_ID が一致しています");
  }

  const preTarget = await fetchRestDoc(TARGET_ID);
  console.log("【実施前】重複ヘッダー (TARGET_ID):", {
    id: preTarget?.id,
    file_name: preTarget?.file_name,
    status: preTarget?.status,
    total_amount: preTarget?.total_amount,
    extracted_total_amount: preTarget?.extracted_total_amount,
    is_deleted: preTarget?.is_deleted,
    deleted_at: preTarget?.deleted_at,
    deleted_by: preTarget?.deleted_by,
    deletion_reason: preTarget?.deletion_reason
  });

  const preOrig = await fetchRestDoc(ORIGINAL_ID);
  console.log("【実施前】元書類 (ORIGINAL_ID):", {
    id: preOrig?.id,
    file_name: preOrig?.file_name,
    status: preOrig?.status,
    total_amount: preOrig?.total_amount,
    extracted_total_amount: preOrig?.extracted_total_amount,
    is_deleted: preOrig?.is_deleted
  });

  const preList = await invokeRelay({ action: "list_documents", page: 1, page_size: 50 });
  const preListDocs = preList.data?.documents || [];
  const preFoundTarget = preListDocs.some(d => d.id === TARGET_ID);
  const preFoundOrig = preListDocs.some(d => d.id === ORIGINAL_ID);
  console.log(`【実施前】list_documents 総件数: ${preList.data?.count} 件`);
  console.log(`  重複ヘッダー存在: ${preFoundTarget}`);
  console.log(`  元書類存在: ${preFoundOrig}`);

  console.log("\n=== 2. 重複ヘッダーの論理削除 (PATCH) 実行 ===");
  const now = new Date().toISOString();
  const patchUrl = `${CONFIG.supabaseUrl}/rest/v1/documents?id=eq.${TARGET_ID}`;
  const patchRes = await fetch(patchUrl, {
    method: "PATCH",
    headers: {
      apikey: CONFIG.supabaseAnonKey,
      Authorization: `Bearer ${CONFIG.supabaseAnonKey}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation"
    },
    body: JSON.stringify({
      is_deleted: true,
      deleted_at: now,
      deleted_by: "staff_operator",
      deletion_reason: "duplicate_test_header"
    })
  });

  console.log("PATCH レスポンスステータス:", patchRes.status);
  const patchText = await patchRes.text();
  console.log("PATCH レスポンス本文:", patchText);

  if (!patchRes.ok) {
    console.error("論理削除 PATCH が失敗しました。既存の手段では更新権限がありません。");
    return;
  }

  let patchData = [];
  try {
    patchData = JSON.parse(patchText);
  } catch {}

  console.log("\n=== 3. 実施後の対象ID・状態確認 ===");
  const postTarget = await fetchRestDoc(TARGET_ID);
  console.log("【実施後】重複ヘッダー (TARGET_ID):", {
    id: postTarget?.id,
    file_name: postTarget?.file_name,
    status: postTarget?.status,
    total_amount: postTarget?.total_amount,
    extracted_total_amount: postTarget?.extracted_total_amount,
    is_deleted: postTarget?.is_deleted,
    deleted_at: postTarget?.deleted_at,
    deleted_by: postTarget?.deleted_by,
    deletion_reason: postTarget?.deletion_reason
  });

  const postOrig = await fetchRestDoc(ORIGINAL_ID);
  console.log("【実施後】元書類 (ORIGINAL_ID):", {
    id: postOrig?.id,
    file_name: postOrig?.file_name,
    status: postOrig?.status,
    total_amount: postOrig?.total_amount,
    extracted_total_amount: postOrig?.extracted_total_amount,
    is_deleted: postOrig?.is_deleted
  });

  const postList = await invokeRelay({ action: "list_documents", page: 1, page_size: 50 });
  const postListDocs = postList.data?.documents || [];
  const postFoundTarget = postListDocs.some(d => d.id === TARGET_ID);
  const postFoundOrig = postListDocs.some(d => d.id === ORIGINAL_ID);
  console.log(`【実施後】list_documents 総件数: ${postList.data?.count} 件`);
  console.log(`  重複ヘッダー存在: ${postFoundTarget} (false であること)`);
  console.log(`  元書類存在: ${postFoundOrig} (true であること)`);
}

main().catch(console.error);

