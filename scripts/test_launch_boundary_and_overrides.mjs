// scripts/test_launch_boundary_and_overrides.mjs
import fs from 'fs';
import { handleRequest } from './batch_relay_core.mjs';

// .env と .env.local から環境変数を読み込む
for (const envFile of ['.env', '.env.local']) {
  if (fs.existsSync(envFile)) {
    const envContent = fs.readFileSync(envFile, 'utf8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const idx = trimmed.indexOf('=');
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
        process.env[key] = val;
      }
    }
  }
}

if (fs.existsSync('sa_key.json')) {
  process.env.GCP_SERVICE_ACCOUNT_KEY = fs.readFileSync('sa_key.json', 'utf8');
}

const ANON_KEY = 'sb_publishable_nxzkup046upZPNCAmh0qdgG3dJ3mr9ZJ';

async function runTests() {
  console.log('=== documents-batch-relay 起動条件・境界・環境変数実証テスト ===\n');

  // Step 1: 公開anonキーのみで通常取込 (dry_run: false) を要求 -> 403 LIVE_IMPORT_RESTRICTED で確実に遮断されることを実証
  {
    console.log('--- Step 1: 公開anonキーによる通常取込 (dry_run: false) の遮断検証 ---');
    const req = new Request('http://localhost/functions/v1/documents-batch-relay', {
      method: 'POST',
      headers: {
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${ANON_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'start_inbox_import',
        dry_run: false,
        confirmed_by: 'unauthorized_staff'
      })
    });

    const res = await handleRequest(req);
    const body = await res.json();
    console.log('Status:', res.status);
    console.log('Response body:', JSON.stringify(body, null, 2));

    if (res.status === 403 && body.error_code === 'LIVE_IMPORT_RESTRICTED') {
      console.log('✓ PASS: 公開anonキーによる通常取込は 403 LIVE_IMPORT_RESTRICTED で安全に拒絶された\n');
    } else {
      console.error('✗ FAIL: Step 1 failed');
      process.exit(1);
    }
  }

  // Step 2: 画面同等の公開anonキーでドライラン試験起動 (dry_run 未指定 / max_files: 1) -> DRY_RUN=true, MAX_FILES=1 が適用
  {
    console.log('--- Step 2: 画面同等の公開anonキーによるドライラン試験起動 (dry_run未指定, max_files: 1) ---');
    const req = new Request('http://localhost/functions/v1/documents-batch-relay', {
      method: 'POST',
      headers: {
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${ANON_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'start_inbox_import',
        max_files: 1
        // dry_run 未指定 -> 既定値 true が自動適用される
      })
    });

    const res = await handleRequest(req);
    const body = await res.json();
    console.log('Status:', res.status);
    console.log('Response body:', JSON.stringify(body, null, 2));

    if (res.status === 200 && body.success === true && body.dry_run === true && body.max_files === 1) {
      console.log('✓ PASS: 起動応答で dry_run: true, max_files: 1 が確認された');
      console.log('Execution Name:', body.execution_name);
      return body.execution_name;
    } else {
      console.error('✗ FAIL: Step 2 failed');
      process.exit(1);
    }
  }
}

runTests().then(execName => {
  if (execName) {
    console.log(`\n次ステップ: gcloud run jobs executions describe ${execName} で環境変数を照合`);
  }
}).catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
