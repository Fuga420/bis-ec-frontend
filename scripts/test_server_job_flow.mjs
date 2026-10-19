import http from "http";

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: options.method || "GET",
      headers: options.headers || {}
    }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try {
          resolve({ status: res.status, headers: res.headers, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.status, headers: res.headers, data });
        }
      });
    });
    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function main() {
  console.log("================================================================================");
  console.log("=== サーバー側結合試験: POST /start -> 接続切断 -> GET /status ===");
  console.log("================================================================================");

  // 対象代表PDF: NJ代表原本 614-20260408-20260411-10773.pdf (Drive ID: 1fpIVNCi1jDwmzrP_XryD6ZHBy2EL0Sqs)
  const targetFileId = "1fpIVNCi1jDwmzrP_XryD6ZHBy2EL0Sqs";

  console.log("\n[Step 1] POST /start : 代表原本を指定して非同期ジョブを起動...");
  const startRes = await request("http://localhost:8080/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_id: targetFileId, dry_run: true })
  });
  console.log("  HTTPステータス:", startRes.status);
  console.log("  レスポンス本文:", startRes.data);
  const jobId = startRes.data?.job_id;

  console.log("\n[Step 2] クライアント接続切断 (タブ閉じ相当: 6秒待機してサーバー完走を待つ)...");
  await sleep(6000);

  console.log("\n[Step 3] GET /status : 接続切断後にジョブID・進捗・ファイル別結果を再取得...");
  const statusRes = await request("http://localhost:8080/status");
  console.log("  HTTPステータス:", statusRes.status);
  console.log("  ジョブ実行結果:", JSON.stringify(statusRes.data, null, 2));

  console.log("\n=== 判定 ===");
  const job = statusRes.data?.current_job;
  const isJobMatched = job?.job_id === jobId;
  const isCompleted = job?.status === "completed";
  const hasFiles = job?.file_results && job.file_results.length > 0;
  console.log(`  - ジョブID一致: ${isJobMatched ? "OK" : "NG"} (${job?.job_id})`);
  console.log(`  - 完了ステータス: ${isCompleted ? "OK" : "NG"} (${job?.status})`);
  console.log(`  - ファイル別結果保持: ${hasFiles ? "OK" : "NG"} (検出: ${job?.total_detected}件, 処理結果: ${job?.file_results?.length}件)`);

  if (hasFiles) {
    const f = job.file_results[0];
    console.log(`    - ファイル名: ${f.file_name}`);
    console.log(`    - ファイルStatus: ${f.status}`);
    console.log(`    - 受付番号/書類番号: ${f.document_number || "(なし)"}`);
  }
}

main().catch(console.error);
