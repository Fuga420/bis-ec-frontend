import { execSync } from "child_process";

const PROJECT_ID = "bis-square-integration-507508";
const REGION = "asia-northeast1";
const JOB_NAME = "drive-auto-import-worker";

// GCP Access Token 取得
function getGcpToken() {
  return execSync("gcloud auth print-access-token", { encoding: "utf8" }).trim();
}

// 1. Cloud Run Job 起動 API (POST jobs:run)
async function triggerCloudRunJob(options = {}) {
  const token = getGcpToken();
  const jobId = options.jobId || `job_${new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14)}_${Math.random().toString(36).slice(2, 6)}`;
  const maxFiles = options.maxFiles ?? 1;
  const dryRun = options.dryRun !== false;
  const confirmedBy = options.confirmedBy || "staff_readdy";

  const url = `https://run.googleapis.com/v2/projects/${PROJECT_ID}/locations/${REGION}/jobs/${JOB_NAME}:run`;
  const body = {
    overrides: {
      containerOverrides: [
        {
          env: [
            { name: "IMPORT_JOB_ID", value: jobId },
            { name: "CONFIRMED_BY", value: confirmedBy },
            { name: "MAX_FILES", value: String(maxFiles) },
            { name: "DRY_RUN", value: dryRun ? "true" : "false" }
          ]
        }
      ]
    }
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Cloud Run API error (${res.status}): ${JSON.stringify(data)}`);
  }

  // data.name は "projects/345911340347/locations/asia-northeast1/jobs/drive-auto-import-worker/executions/drive-auto-import-worker-xxxxx"
  const executionName = data.name.split("/").pop();
  return {
    success: true,
    job_id: jobId,
    execution_name: executionName,
    full_name: data.name,
    status: "running",
    operator: confirmedBy,
    max_files: maxFiles,
    dry_run: dryRun,
    message: "Cloud Run Job の実行を開始しました。"
  };
}

// 2. Cloud Run Execution 状態照会 API (GET executions/{name})
async function getExecutionStatus(executionName) {
  const token = getGcpToken();
  const url = `https://run.googleapis.com/v2/projects/${PROJECT_ID}/locations/${REGION}/jobs/${JOB_NAME}/executions/${executionName}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Cloud Run Execution error (${res.status}): ${JSON.stringify(data)}`);
  }

  const conditions = data.conditions || [];
  const completedCond = conditions.find(c => c.type === "Completed");
  const isCompleted = completedCond && completedCond.status === "True";
  const isFailed = completedCond && completedCond.status === "False";
  const isRunning = !completedCond || completedCond.status === "Unknown";

  let status = "running";
  if (isCompleted) status = "completed";
  else if (isFailed) status = "failed";

  return {
    execution_name: executionName,
    status,
    completion_time: data.completionTime || null,
    start_time: data.startTime || null,
    succeeded_count: data.succeededCount || 0,
    failed_count: data.failedCount || 0,
    log_uri: data.logUri || null,
    raw_conditions: conditions
  };
}

// 3. Execution のログからサマリーを抽出
function getExecutionJobSummary(executionName) {
  try {
    const filter = `resource.type=cloud_run_job AND labels."run.googleapis.com/execution_name"="${executionName}"`;
    const cmd = `gcloud logging read "${filter}" --limit=50 --format=json`;
    const buf = execSync(cmd, { encoding: "buffer", maxBuffer: 10 * 1024 * 1024 });
    const logs = JSON.parse(buf.toString("utf8"));
    logs.reverse();

    // ログ内からサマリー行または完了行を探す
    let summary = null;
    for (const log of logs) {
      const text = log.textPayload || "";
      if (text.includes("[Worker CLI] ジョブ完了記録:") || text.includes("[Worker CLI] ジョブ実行完了:")) {
        // 例: ID=drive-auto-import-worker-42zpc, status=completed, detected=1, processed=0, flagged=0, skipped=1, errors=0
        const m = text.match(/status=([a-z_]+),\s*detected=(\d+),\s*processed=(\d+),\s*flagged=(\d+),\s*skipped=(\d+),\s*errors=(\d+)/);
        if (m) {
          summary = {
            status: m[1],
            total_detected: parseInt(m[2], 10),
            processed_count: parseInt(m[3], 10),
            flagged_count: parseInt(m[4], 10),
            skipped_count: parseInt(m[5], 10),
            error_count: parseInt(m[6], 10)
          };
        }
      }
    }
    return summary;
  } catch (err) {
    console.warn("ログ取得エラー:", err.message);
    return null;
  }
}

async function main() {
  console.log("=== Cloud Run Job 起動 & 状態取得 API クライアント検証 ===");

  // 1. 起動テスト
  console.log("\n[1] ジョブ起動テスト (max_files=1, dry_run=true)...");
  const startResult = await triggerCloudRunJob({ maxFiles: 1, dryRun: true });
  console.log("起動応答 (start_inbox_import):", JSON.stringify(startResult, null, 2));

  // 2. 状態ポーリング
  console.log(`\n[2] Execution (${startResult.execution_name}) 状態ポーリング...`);
  let execStatus = null;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 3000));
    execStatus = await getExecutionStatus(startResult.execution_name);
    console.log(`  [Poll #${i + 1}] status: ${execStatus.status}, completionTime: ${execStatus.completion_time}`);
    if (execStatus.status !== "running") break;
  }

  // 3. 完了後のサマリー確認
  console.log(`\n[3] Execution 完了確認 (最終ステータス: ${execStatus.status})`);
  const summary = getExecutionJobSummary(startResult.execution_name);
  console.log("ログ抽出サマリー:", summary);

  // 4. Readdy画面向け統合応答の組み立て
  const readdyStatusResponse = {
    success: true,
    action: "get_inbox_import_status",
    status: execStatus.status,
    job_id: startResult.job_id,
    execution_name: startResult.execution_name,
    started_at: execStatus.start_time,
    finished_at: execStatus.completion_time,
    operator: startResult.operator,
    summary: summary ? {
      total_detected: summary.total_detected,
      processed_count: summary.processed_count,
      flagged_count: summary.flagged_count,
      skipped_count: summary.skipped_count,
      error_count: summary.error_count
    } : null
  };
  console.log("\n[4] Readdy向けステータス応答 (get_inbox_import_status):", JSON.stringify(readdyStatusResponse, null, 2));
}

main().catch(console.error);

