import { execSync } from "child_process";

const EXECUTION_NAME = process.argv[2] || "drive-auto-import-worker-h6ntg";

const buf = execSync(
  `gcloud logging read "resource.type=cloud_run_job AND labels.\\"run.googleapis.com/execution_name\\"=\\"${EXECUTION_NAME}\\"" --limit=100 --format=json`,
  { encoding: "buffer", maxBuffer: 10 * 1024 * 1024 }
);

const logs = JSON.parse(buf.toString("utf8"));
logs.reverse();
console.log(`=== Total logs: ${logs.length} ===`);
for (const log of logs) {
  if (log.textPayload) {
    console.log(`[${log.timestamp}] ${log.textPayload}`);
  }
}
