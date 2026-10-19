import { execSync } from "child_process";

const buf = execSync(
  'gcloud logging read "resource.type=cloud_run_job AND labels.\\"run.googleapis.com/execution_name\\"=\\"drive-auto-import-worker-42zpc\\"" --limit=30 --format=json',
  { encoding: "buffer", maxBuffer: 10 * 1024 * 1024 }
);

const logs = JSON.parse(buf.toString("utf8"));
logs.reverse();
for (const log of logs) {
  if (log.textPayload) {
    console.log(log.textPayload);
  }
}
