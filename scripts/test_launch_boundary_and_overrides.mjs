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
  console.log('=== documents-batch-relay 起動契約検証テスト ===\n');

  // Test 1: 公開anonキー、dry_run 未指定 -> 既定値 dry_run: true が適用されること
  {
    console.log('--- Test 1: 公開anonキーによるドライラン既定検証 (dry_run未指定, max_files: 1) ---');
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
      })
    });

    const res = await handleRequest(req);
    const body = await res.json();
    console.log('Status:', res.status);
    console.log('dry_run:', body.dry_run, 'max_files:', body.max_files, 'confirmed_by:', body.confirmed_by);

    if (res.status === 200 && body.success === true && body.dry_run === true && body.max_files === 1 && body.confirmed_by === 'staff') {
      console.log('✓ PASS: dry_run未指定時に既定値 dry_run: true が適用され起動成功\n');
    } else {
      console.error('✗ FAIL: Test 1 failed', body);
      process.exit(1);
    }
  }

  // Test 2: 公開anonキーで dry_run: false を明示 -> 403にならず通常取込として受付可能であること
  {
    console.log('--- Test 2: 公開anonキーによる通常取込検証 (dry_run: false 明示, max_files: 1) ---');
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
        max_files: 1,
        confirmed_by: 'staff_operator'
      })
    });

    const res = await handleRequest(req);
    const body = await res.json();
    console.log('Status:', res.status);
    console.log('dry_run:', body.dry_run, 'max_files:', body.max_files, 'confirmed_by:', body.confirmed_by);

    if (res.status === 200 && body.success === true && body.dry_run === false && body.max_files === 1 && body.confirmed_by === 'staff_operator') {
      console.log('✓ PASS: dry_run: false 明示時に通常取込ジョブとして受付・起動成功 (403制限解除確認)\n');
    } else {
      console.error('✗ FAIL: Test 2 failed', body);
      process.exit(1);
    }
  }

  console.log('==================================================');
  console.log('=== 全契約テスト合格 PASS ===');
  console.log('==================================================');
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
