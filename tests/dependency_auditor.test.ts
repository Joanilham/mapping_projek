import { test, describe, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { DependencyAuditor } from '../src/engine/dependency_auditor.js';
import { SecurityAuditor } from '../src/engine/security_auditor.js';
import { PerformanceAuditor } from '../src/engine/performance_auditor.js';
import { SessionManager } from '../src/engine/session_manager.js';

describe('Universal Dependency Auditor & Enhanced Security/Performance Audit Tests', () => {
  let tmpDir: string;
  const slug = 'test-dep-proj';

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dep-audit-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('SemVer helper should compare versions accurately', () => {
    assert.strictEqual(DependencyAuditor.cleanVersionString('^4.17.21'), '4.17.21');
    assert.strictEqual(DependencyAuditor.cleanVersionString('~1.2.3-alpha'), '1.2.3');
    assert.strictEqual(DependencyAuditor.cleanVersionString('v2.0.0'), '2.0.0');

    assert.strictEqual(DependencyAuditor.compareSemVer('4.17.0', '5.0.0'), 'MAJOR');
    assert.strictEqual(DependencyAuditor.compareSemVer('4.17.0', '4.18.0'), 'MINOR');
    assert.strictEqual(DependencyAuditor.compareSemVer('4.17.1', '4.17.5'), 'PATCH');
    assert.strictEqual(DependencyAuditor.compareSemVer('4.18.0', '4.18.0'), 'NONE');
  });

  test('Vulnerability helper should identify vulnerable version ranges', () => {
    assert.strictEqual(DependencyAuditor.isVulnerable('4.17.15', '4.17.20'), true);
    assert.strictEqual(DependencyAuditor.isVulnerable('4.17.21', '4.17.20'), false);
    assert.strictEqual(DependencyAuditor.isVulnerable('0.21.0', '0.21.1'), true);
    assert.strictEqual(DependencyAuditor.isVulnerable('0.22.0', '0.21.1'), false);
  });

  test('should parse Node.js package.json with dev/prod dependencies and flag vulnerable packages', async () => {
    const pkgJson = {
      name: 'sample-app',
      dependencies: {
        'express': '^4.17.1',
        'lodash': '4.17.15' // Known vulnerable to CVE-2021-23337
      },
      devDependencies: {
        'typescript': '^5.0.0'
      }
    };
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify(pkgJson, null, 2));

    const auditor = new DependencyAuditor(tmpDir, slug);
    const result = await auditor.audit();

    assert.strictEqual(result.totalDependencies, 3);
    assert.strictEqual(result.ecosystems.includes('npm'), true);
    assert.strictEqual(result.manifestPath, 'package.json');

    const lodashItem = result.dependencies.find(d => d.name === 'lodash');
    assert.ok(lodashItem);
    assert.strictEqual(lodashItem.status, 'SECURITY_VULNERABLE');
    assert.ok(lodashItem.vulnerabilities && lodashItem.vulnerabilities.length > 0);
    assert.strictEqual(lodashItem.suggestedCommand, 'npm install lodash@latest');

    const tsItem = result.dependencies.find(d => d.name === 'typescript');
    assert.ok(tsItem);
    assert.strictEqual(tsItem.isDev, true);
    assert.strictEqual(tsItem.suggestedCommand, 'npm install -D typescript@latest');
  });

  test('should parse PHP composer.json and composer.lock accurately', async () => {
    const compJson = {
      name: 'test/laravel-app',
      require: {
        'php': '^8.1',
        'laravel/framework': '^9.0.0'
      },
      'require-dev': {
        'pestphp/pest': '^2.0'
      }
    };
    fs.writeFileSync(path.join(tmpDir, 'composer.json'), JSON.stringify(compJson, null, 2));

    const auditor = new DependencyAuditor(tmpDir, slug);
    const result = await auditor.audit();

    assert.strictEqual(result.ecosystems.includes('composer'), true);
    const laravelItem = result.dependencies.find(d => d.name === 'laravel/framework');
    assert.ok(laravelItem);
    assert.strictEqual(laravelItem.status, 'SECURITY_VULNERABLE'); // 9.0.0 is < 9.52.15
  });

  test('should parse Python requirements.txt', async () => {
    const reqContent = `
# Core web
django==4.2.0
requests>=2.25.0
pydantic==1.10.0
`;
    fs.writeFileSync(path.join(tmpDir, 'requirements.txt'), reqContent);

    const auditor = new DependencyAuditor(tmpDir, slug);
    const result = await auditor.audit();

    assert.strictEqual(result.ecosystems.includes('pypi'), true);
    assert.strictEqual(result.totalDependencies, 3);
    const djangoItem = result.dependencies.find(d => d.name === 'django');
    assert.ok(djangoItem);
    assert.strictEqual(djangoItem.status, 'SECURITY_VULNERABLE'); // 4.2.0 is vulnerable
  });

  test('Enhanced SecurityAuditor should detect raw SQL concatenation and weak hashing', () => {
    const testCode = `
<?php
// Raw SQL Concatenation
$sql = "SELECT * FROM users WHERE id = " . $userId;
DB::select($sql);

// Weak crypto
$hashed = md5($userPassword);

// Insecure eval
eval($_POST['command']);

// Dangerous config
`;
    const auditor = new SecurityAuditor(tmpDir, slug);
    const issues = auditor.auditSingleFile('app/Http/UserController.php', testCode);

    const sqli = issues.find(i => i.category === 'SQLI');
    assert.ok(sqli, 'Should detect raw SQL string concatenation');

    const crypto = issues.find(i => i.category === 'INSECURE_CRYPTO');
    assert.ok(crypto, 'Should detect md5 password hashing');

    const evalIssue = issues.find(i => i.category === 'INSECURE_EVAL');
    assert.ok(evalIssue, 'Should detect eval on user input');
  });

  test('Enhanced SecurityAuditor should flag APP_DEBUG = true in non-example .env', () => {
    const envContent = `
APP_NAME=Laravel
APP_ENV=production
APP_DEBUG=true
APP_URL=https://example.com
`;
    const auditor = new SecurityAuditor(tmpDir, slug);
    const issues = auditor.auditSingleFile('.env', envContent);

    const configLeak = issues.find(i => i.category === 'CONFIG_LEAK');
    assert.ok(configLeak, 'Should detect APP_DEBUG=true in .env');
    assert.strictEqual(configLeak.severity, 'HIGH');
  });

  test('Enhanced PerformanceAuditor should detect SYNC_IO_IN_LOOP and UNBOUNDED_COLLECTION_FETCH', () => {
    const perfCode = `
<?php
class ProductController {
  public function list() {
    $products = Product::all();
    foreach ($products as $p) {
      $extData = file_get_contents("https://api.example.com/items/" . $p->id);
    }
  }
}
`;
    const auditor = new PerformanceAuditor(tmpDir, slug);
    const findings = auditor.detectNPlusOneInFile('app/Controllers/ProductController.php', perfCode);

    const unbounded = findings.find(f => f.dimension === 'UNBOUNDED_COLLECTION_FETCH');
    assert.ok(unbounded, 'Should detect Product::all() without pagination');

    const syncIo = findings.find(f => f.dimension === 'SYNC_IO_IN_LOOP');
    assert.ok(syncIo, 'Should detect file_get_contents inside foreach');
  });

  test('SessionManager auditDependencies should resolve physical project files', async () => {
    const pkgJson = {
      name: 'workspace-app',
      dependencies: {
        'zod': '^3.20.0'
      }
    };
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify(pkgJson));

    const sm = new SessionManager(tmpDir, slug);
    const result = await sm.auditDependencies();

    assert.strictEqual(result.projectSlug, slug);
    assert.strictEqual(result.totalDependencies, 1);
    assert.strictEqual(result.dependencies[0].name, 'zod');
  });
});
