import { handleRequest } from "./batch_relay_core.mjs";

async function runTest() {
  console.log("================================================================================");
  console.log("【検証 1】通常取込の execution_name (drive-auto-import-worker-hd2wr) を明示指定して再照会");
  console.log("================================================================================");
  const req1 = new Request("http://localhost/functions/v1/documents-batch-relay", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "get_inbox_import_status",
      execution_name: "drive-auto-import-worker-hd2wr"
    })
  });
  const res1 = await handleRequest(req1);
  const data1 = await res1.json();
  const job1 = data1.current_job;
  console.log("HTTP Status:", res1.status);
  console.log("execution_name:", job1?.execution_name);
  console.log("dry_run:", job1?.dry_run);
  console.log("status:", job1?.status);
  console.log("result_status:", job1?.result_status);
  console.log("message:", job1?.message);
  console.log("summary:", JSON.stringify(job1?.summary));
  console.log("file_results count:", job1?.file_results?.length);
  if (job1?.file_results?.[0]) {
    console.log("first file_result:", {
      file_name: job1.file_results[0].file_name,
      document_id: job1.file_results[0].document_id,
      status: job1.file_results[0].status,
      dry_run: job1.file_results[0].dry_run
    });
  }

  if (job1?.execution_name !== "drive-auto-import-worker-hd2wr" || job1?.dry_run !== false) {
    throw new Error("TEST 1 FAILED: execution_name または dry_run が一致しません");
  }
  console.log("-> TEST 1 PASS: 通常取込の execution_name で指定した結果が正確に再照会されました (dry_run: false)。");

  console.log("\n================================================================================");
  console.log("【検証 2】ドライランの execution_name (drive-auto-import-worker-h6ntg) を明示指定して再照会");
  console.log("================================================================================");
  const req2 = new Request("http://localhost/functions/v1/documents-batch-relay", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "get_inbox_import_status",
      execution_name: "drive-auto-import-worker-h6ntg"
    })
  });
  const res2 = await handleRequest(req2);
  const data2 = await res2.json();
  const job2 = data2.current_job;
  console.log("HTTP Status:", res2.status);
  console.log("execution_name:", job2?.execution_name);
  console.log("dry_run:", job2?.dry_run);
  console.log("status:", job2?.status);
  console.log("result_status:", job2?.result_status);
  console.log("message:", job2?.message);
  console.log("summary:", JSON.stringify(job2?.summary));
  if (job2?.file_results?.[0]) {
    console.log("first file_result:", {
      file_name: job2.file_results[0].file_name,
      document_id: job2.file_results[0].document_id,
      status: job2.file_results[0].status,
      dry_run: job2.file_results[0].dry_run,
      dry_run_note: job2.file_results[0].dry_run_note
    });
  }

  if (job2?.execution_name !== "drive-auto-import-worker-h6ntg" || job2?.dry_run !== true) {
    throw new Error("TEST 2 FAILED: ドライラン execution_name または dry_run が一致しません");
  }
  if (!job2?.message?.includes("ドライラン完了")) {
    throw new Error("TEST 2 FAILED: メッセージがドライラン用になっていません");
  }
  console.log("-> TEST 2 PASS: ドライランの execution_name で指定した結果が正確に再照会され、実保存済みと誤表示されない契約を確認しました (dry_run: true)。");

  console.log("\n================================================================================");
  console.log("【検証 3】架空の execution_name を指定した場合、たまたま最新が返らないことの検証");
  console.log("================================================================================");
  const req3 = new Request("http://localhost/functions/v1/documents-batch-relay", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "get_inbox_import_status",
      execution_name: "drive-auto-import-worker-nonexistent999"
    })
  });
  const res3 = await handleRequest(req3);
  const data3 = await res3.json();
  console.log("HTTP Status:", res3.status);
  console.log("current_job:", data3.current_job);
  if (data3.current_job !== null) {
    throw new Error("TEST 3 FAILED: 存在しない execution_name に対して最新ジョブが返ってしまいました");
  }
  console.log("-> TEST 3 PASS: 存在しない execution_name の場合、たまたま最新の別ジョブを返すことなく安全に null を返却しました。");

  console.log("\n================================================================================");
  console.log("【検証 4】存在しない架空の job_id を指定した場合、たまたま最新が返らないことの検証");
  console.log("================================================================================");
  const req4 = new Request("http://localhost/functions/v1/documents-batch-relay", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "get_inbox_import_status",
      job_id: "job_dummy_nonexistent_random_12345"
    })
  });
  const res4 = await handleRequest(req4);
  const data4 = await res4.json();
  console.log("HTTP Status:", res4.status);
  console.log("current_job:", data4.current_job);
  if (data4.current_job !== null) {
    throw new Error("TEST 4 FAILED: 存在しない job_id に対して最新ジョブが返ってしまいました");
  }
  console.log("-> TEST 4 PASS: 存在しない job_id の場合、たまたま最新の別ジョブを返すことなく安全に null を返却しました。");

  console.log("\n================================================================================");
  console.log("【検証 5】実在する job_id (job_20261020013955_k8z7) を指定して環境変数IMPORT_JOB_IDで正確に照合されること");
  console.log("================================================================================");
  const req5 = new Request("http://localhost/functions/v1/documents-batch-relay", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "get_inbox_import_status",
      job_id: "job_20261020013955_k8z7"
    })
  });
  const res5 = await handleRequest(req5);
  const data5 = await res5.json();
  console.log("HTTP Status:", res5.status);
  console.log("execution_name:", data5.current_job?.execution_name);
  console.log("dry_run:", data5.current_job?.dry_run);
  if (data5.current_job?.execution_name !== "drive-auto-import-worker-hd2wr") {
    throw new Error("TEST 5 FAILED: job_id で該当する execution_name が特定されませんでした");
  }
  console.log("-> TEST 5 PASS: job_id から対応する Execution (drive-auto-import-worker-hd2wr) が厳密に特定され再照会されました。");

  console.log("\n================================================================================");
  console.log("全検証 1〜5 完全合格！");
  console.log("================================================================================");
}

runTest().catch(console.error);
