import fs from "fs";

const content = fs.readFileSync("supabase/functions/documents-relay/index.ts", "utf8");
const regex = /case\s+["']([^"']+)["']|action\s*===\s*["']([^"']+)["']/g;
let m;
const actions = new Set();
while ((m = regex.exec(content)) !== null) {
  actions.add(m[1] || m[2]);
}
console.log("Available actions in documents-relay:", Array.from(actions));

