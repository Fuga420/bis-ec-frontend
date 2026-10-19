import { execSync } from "child_process";

try {
  const jsonStr = execSync(
    'gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=drive-auto-import-worker" --limit=40 --freshness=10m --format=json',
    { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 }
  );
  const logs = JSON.parse(jsonStr);
  const targetLogs = logs.filter(l => l.labels?.["run.googleapis.com/execution_name"] === "drive-auto-import-worker-trhw6");
  targetLogs.reverse();
  for (const log of targetLogs) {
    if (log.textPayload) {
      console.log(JSON.stringify({ ts: log.timestamp, msg: log.textPayload }));
    }
  }
} catch (err) {
  console.error(err);
}

