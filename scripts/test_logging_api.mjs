import { getAccessTokenFromServiceAccount } from "./test_sa_token.mjs";

async function test() {
  const sa = await getAccessTokenFromServiceAccount("sa_key.json");
  const res = await fetch("https://logging.googleapis.com/v2/entries:list", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sa.access_token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      resourceNames: ["projects/bis-square-integration-507508"],
      filter: 'resource.type="cloud_run_job" AND labels."run.googleapis.com/execution_name"="drive-auto-import-worker-gwksw"',
      orderBy: "timestamp desc",
      pageSize: 20
    })
  });
  console.log("Status:", res.status);
  const data = await res.json();
  const entries = data.entries || [];
  console.log("Entries count:", entries.length);
  for (const e of entries) {
    if (e.textPayload) {
      console.log(`[${e.severity}] ${e.textPayload.slice(0, 80)}`);
    }
  }
}

test().catch(console.error);

