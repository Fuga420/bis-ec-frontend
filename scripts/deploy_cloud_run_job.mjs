import fs from "fs";
import { spawnSync } from "child_process";

// 1. 環境設定の準備
let anonKey = "";
for (const f of [".env.local", ".env"]) {
  if (fs.existsSync(f)) {
    const lines = fs.readFileSync(f, "utf8").split("\n");
    for (const l of lines) {
      if (l.startsWith("VITE_PUBLIC_SUPABASE_ANON_KEY=")) {
        anonKey = l.slice("VITE_PUBLIC_SUPABASE_ANON_KEY=".length).trim().replace(/^['"]|['"]$/g, "");
        break;
      }
    }
  }
  if (anonKey) break;
}

const envVars = [
  "DRY_RUN=true",
  "MAX_FILES=1",
  "DRIVE_INBOX_FOLDER_ID=1ctLRUQbwINARCDuGdYnpkrCkkK287HV5",
  "DRIVE_PROCESSED_FOLDER_ID=1MUpsttOl2MY1Q8QAptSX_1vBGjl_aXY3",
  "DRIVE_FLAGGED_FOLDER_ID=1kgnzKvslB0J2Mq8ZM8-PqsTjret1CQ3E",
  "GAS_WEB_APP_URL=https://script.google.com/macros/s/AKfycbyxee-2phIQl2KPBgx0h0bHBaaQDybUxbODI06ZC7aHNJg4jHMoKqFBSlBEQA2CHKfX/exec",
  "VITE_PUBLIC_SUPABASE_URL=https://yg9qauzldubdo1ca5z0z.helloreaddy.com",
  `VITE_PUBLIC_SUPABASE_ANON_KEY=${anonKey}`
].join(",");

const args = [
  "run", "jobs", "create", "drive-auto-import-worker",
  "--image=asia-northeast1-docker.pkg.dev/bis-square-integration-507508/cloud-run-source-deploy/drive-auto-import-worker:c3b8420",
  "--region=asia-northeast1",
  "--service-account=bis-drive-worker-sa@bis-square-integration-507508.iam.gserviceaccount.com",
  `--set-env-vars=${envVars}`,
  "--set-secrets=DOCUMENTS_WORKER_SECRET=DOCUMENTS_WORKER_SECRET:latest",
  "--tasks=1",
  "--max-retries=0",
  "--memory=1Gi",
  "--cpu=1"
];

console.log("Creating Cloud Run Job: drive-auto-import-worker (region: asia-northeast1)...");
const res = spawnSync("gcloud", args, { encoding: "utf8", shell: true });

if (res.status === 0) {
  console.log("SUCCESS: Cloud Run Job created successfully.");
  console.log(res.stdout);
} else {
  // すでに存在する場合は update を試行
  if (res.stderr && res.stderr.includes("already exists")) {
    console.log("Job already exists. Updating job instead...");
    const updateArgs = [
      "run", "jobs", "update", "drive-auto-import-worker",
      "--image=asia-northeast1-docker.pkg.dev/bis-square-integration-507508/cloud-run-source-deploy/drive-auto-import-worker:c3b8420",
      "--region=asia-northeast1",
      "--service-account=bis-drive-worker-sa@bis-square-integration-507508.iam.gserviceaccount.com",
      `--set-env-vars=${envVars}`,
      "--set-secrets=DOCUMENTS_WORKER_SECRET=DOCUMENTS_WORKER_SECRET:latest",
      "--tasks=1",
      "--max-retries=0",
      "--memory=1Gi",
      "--cpu=1"
    ];
    const updateRes = spawnSync("gcloud", updateArgs, { encoding: "utf8", shell: true });
    if (updateRes.status === 0) {
      console.log("SUCCESS: Cloud Run Job updated successfully.");
      console.log(updateRes.stdout);
    } else {
      console.error("FAIL on update:", updateRes.stderr);
      process.exit(1);
    }
  } else {
    console.error("FAIL:", res.stderr);
    process.exit(1);
  }
}

