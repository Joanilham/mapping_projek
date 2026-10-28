import { test, describe } from 'node:test';
import * as assert from 'node:assert';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { TaintTracker } from '../src/engine/taint_tracker.js';
import { SecurityAuditor } from '../src/engine/security_auditor.js';
import { PerformanceAuditor } from '../src/engine/performance_auditor.js';
import { startDashboardServer } from '../src/server/dashboard_server.js';
import { SessionManager } from '../src/engine/session_manager.js';

describe('Global Security & Performance Auditor Unit & Integration Tests (Fase 3)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-test-'));
  const tracker = new TaintTracker();
  const secAuditor = new SecurityAuditor(tmpDir, 'test-project');
  const perfAuditor = new PerformanceAuditor(tmpDir, 'test-project');

  test('TaintTracker should trace variable taint from HTTP sources to sinks', () => {
    const phpVulnerable = `<?php
    $userId = $_GET['id'];
    $query = "SELECT * FROM users WHERE id = " . $userId;
    mysqli_query($conn, $query);
    `;

    const traces = tracker.analyzeCode('vulnerable.php', phpVulnerable);
    assert.strictEqual(traces.length >= 1, true, 'Should detect tainted sink hit');
    const hit = traces[0].sinkHit;
    assert.strictEqual(hit.sinkType, 'SQLI');
    assert.strictEqual(hit.sanitized, false);
    assert.strictEqual(hit.isParameterized, false);
  });

  test('TaintTracker should detect sanitizers and mark taint as sanitized', () => {
    const phpSanitized = `<?php
    $rawId = $_GET['id'];
    $safeId = intval($rawId);
    $query = "SELECT * FROM users WHERE id = " . $safeId;
    mysqli_query($conn, $query);
    `;

    const traces = tracker.analyzeCode('sanitized.php', phpSanitized);
    assert.strictEqual(traces.length >= 1, true);
    assert.strictEqual(traces.some(t => t.sinkHit.sanitized === true), true);
  });

  test('TaintTracker negative filter should recognize parameterized queries', () => {
    const parameterizedSql = `cursor.execute("SELECT * FROM users WHERE email = %s", (email,))`;
    assert.strictEqual(tracker.isParameterizedQuery(parameterizedSql), true);

    const laravelParam = `DB::select("SELECT * FROM users WHERE id = ?", [$id])`;
    assert.strictEqual(tracker.isParameterizedQuery(laravelParam), true);

    const rawConcat = `DB::raw("SELECT * FROM users WHERE id = " + $id)`;
    assert.strictEqual(tracker.isParameterizedQuery(rawConcat), false);
  });

  test('SecurityAuditor should detect SQLi, XSS, and Mass Assignment', () => {
    const vulnerableFile = `<?php
    namespace App\\Http\\Controllers;

    class UserController extends Controller {
        protected $guarded = [];

        public function store(Request $request) {
            User::create($request->all());
            echo $_GET['name'];
        }
    }
    `;

    const issues = secAuditor.auditSingleFile('app/Controllers/UserController.php', vulnerableFile);

    // Assert Mass Assignment detection
    assert.ok(issues.some(i => i.category === 'MASS_ASSIGNMENT' && i.title.includes('$guarded = []')));
    assert.ok(issues.some(i => i.category === 'MASS_ASSIGNMENT' && i.title.includes('create($request->all())')));

    // Assert XSS detection for echo $_GET
    assert.ok(issues.some(i => i.category === 'XSS'));
  });

  test('SecurityAuditor should detect Hardcoded Secrets with Shannon entropy while ignoring placeholders', () => {
    // 1. AWS Key
    const awsCode = `const AWS_KEY = "AKIA1234567890ABCDEF";`;
    const awsIssues = secAuditor.auditSingleFile('config/aws.ts', awsCode);
    assert.ok(awsIssues.some(i => i.category === 'HARDCODED_SECRET' && i.title.includes('AWS Access Key')));

    // 2. Placeholder whitelist filter: your_api_key_here should NOT alert
    const placeholderCode = `const AWS_KEY = "AKIA_YOUR_API_KEY_HERE"; const DUMMY = "dummy_secret_value";`;
    const dummyIssues = secAuditor.auditSingleFile('config/dummy.ts', placeholderCode);
    assert.strictEqual(dummyIssues.length, 0, 'Dummy placeholders must be ignored');

    // 3. Shannon Entropy computation
    const highEntropy = SecurityAuditor.calculateShannonEntropy('7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069');
    assert.ok(highEntropy >= 3.7, `Entropy should be >= 3.7, got ${highEntropy}`);
  });

  test('PerformanceAuditor should detect Direct N+1 queries in loops', () => {
    const loopCode = `<?php
    foreach ($orders as $order) {
        $items = DB::table('order_items')->where('order_id', $order->id)->get();
    }
    `;

    const findings = perfAuditor.detectNPlusOneInFile('app/Services/OrderService.php', loopCode);
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0].dimension, 'DIRECT_QUERY_IN_LOOP');
    assert.strictEqual(findings[0].loopLineNumber, 2);
    assert.strictEqual(findings[0].queryLineNumber, 3);
  });

  test('PerformanceAuditor should catalog unindexed foreign keys in schema differ', () => {
    const migrationFile = path.join(tmpDir, 'migration.php');
    fs.writeFileSync(migrationFile, `<?php
    Schema::create('orders', function ($table) {
        $table->id();
        $table->foreignId('user_id');
        $table->foreignId('product_id');
        $table->index('user_id');
    });
    `);

    const missing = perfAuditor.detectMissingIndexes(['migration.php']);
    assert.ok(missing.some(m => m.column === 'product_id'), 'product_id lacks index');
    assert.ok(!missing.some(m => m.column === 'user_id'), 'user_id has index, should not be flagged');
  });

  test('Dashboard Server should serve /api/security_audit and /api/performance_audit', async () => {
    const manager = new SessionManager(tmpDir);
    manager.initProject();

    const { server, url: serverUrl } = await startDashboardServer(manager, { port: 0 });

    try {
      // 1. GET /api/security_audit
      const secRes = await fetch(`${serverUrl}/api/security_audit`);
      assert.strictEqual(secRes.status, 200);
      const secData = await secRes.json();
      assert.ok(typeof secData.score === 'number');
      assert.ok(['A', 'B', 'C', 'F'].includes(secData.grade));
      assert.ok(Array.isArray(secData.issues));

      // 2. GET /api/performance_audit
      const perfRes = await fetch(`${serverUrl}/api/performance_audit`);
      assert.strictEqual(perfRes.status, 200);
      const perfData = await perfRes.json();
      assert.ok(typeof perfData.score === 'number');
      assert.ok(['OPTIMAL', 'WARNING', 'CRITICAL'].includes(perfData.health));
      assert.ok(Array.isArray(perfData.nPlusOneFindings));
      assert.ok(Array.isArray(perfData.missingIndexFindings));
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
});
