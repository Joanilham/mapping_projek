/**
 * Global Security Auditor Engine (v2.0)
 * Evaluates Codebase Security across SQLi, XSS, Hardcoded Secrets, and Mass Assignment.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { TaintTracker, TaintTrace } from './taint_tracker.js';

export type SecuritySeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type SecurityCategory =
  | 'SQLI'
  | 'XSS'
  | 'HARDCODED_SECRET'
  | 'MASS_ASSIGNMENT'
  | 'CMD_INJECTION'
  | 'PATH_TRAVERSAL'
  | 'INSECURE_CRYPTO'
  | 'INSECURE_EVAL'
  | 'CONFIG_LEAK'
  | 'CSRF_RISK';

export interface SecurityIssue {
  id: string;
  category: SecurityCategory;
  severity: SecuritySeverity;
  title: string;
  filePath: string;
  lineNumber: number;
  codeSnippet: string;
  description: string;
  recommendation: string;
  taintTrace?: TaintTrace;
}

export interface SecurityAuditResult {
  projectSlug: string;
  score: number; // 0 - 100
  grade: 'A' | 'B' | 'C' | 'F';
  totalIssues: number;
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  issues: SecurityIssue[];
}

export class SecurityAuditor {
  private workspacePath: string;
  private projectSlug: string;
  private taintTracker: TaintTracker;

  constructor(workspacePath: string, projectSlug: string) {
    this.workspacePath = workspacePath;
    this.projectSlug = projectSlug;
    this.taintTracker = new TaintTracker();
  }

  /**
   * Calculate Shannon Entropy of a string:
   * H(S) = -sum(p(c) * log2(p(c)))
   */
  public static calculateShannonEntropy(str: string): number {
    if (!str || str.length === 0) return 0;
    const freqs = new Map<string, number>();
    for (const ch of str) {
      freqs.set(ch, (freqs.get(ch) || 0) + 1);
    }
    let entropy = 0;
    const len = str.length;
    for (const count of freqs.values()) {
      const p = count / len;
      entropy -= p * Math.log2(p);
    }
    return entropy;
  }

  /**
   * Run full security audit on all codebase files
   */
  public auditFiles(filePaths: string[]): SecurityAuditResult {
    const issues: SecurityIssue[] = [];

    for (const relPath of filePaths) {
      const fullPath = path.isAbsolute(relPath) ? relPath : path.join(this.workspacePath, relPath);
      if (!fs.existsSync(fullPath)) continue;
      const stat = fs.statSync(fullPath);
      if (!stat.isFile()) continue;

      const content = fs.readFileSync(fullPath, 'utf-8');
      const fileIssues = this.auditSingleFile(relPath, content);
      issues.push(...fileIssues);
    }

    return this.calculateAuditScore(issues);
  }

  /**
   * Audit a single file's content
   */
  public auditSingleFile(relPath: string, content: string): SecurityIssue[] {
    const issues: SecurityIssue[] = [];
    const lines = content.split('\n');

    // 1. Taint-based Analysis for SQLi, XSS, CMD_INJECTION, and PATH_TRAVERSAL
    const traces = this.taintTracker.analyzeCode(relPath, content);
    for (const trace of traces) {
      if (trace.sinkHit.sanitized) continue;

      if (trace.sinkHit.sinkType === 'SQLI') {
        if (!trace.sinkHit.isParameterized) {
          issues.push({
            id: `sec_sqli_${relPath}_${trace.sinkHit.line}`,
            category: 'SQLI',
            severity: 'CRITICAL',
            title: 'Potensi SQL Injection Terdeteksi',
            filePath: relPath,
            lineNumber: trace.sinkHit.line,
            codeSnippet: trace.sinkHit.snippet,
            description: `Variabel tidak ter-sanitasi '${trace.sinkHit.taintedVariable}' dialirkan langsung ke dalam SQL sink tanpa prepared statement/parameter binding.`,
            recommendation: 'Gunakan parameterized query (placeholder ?, :named, atau parameter tuple terpisah). Hindari penggabungan string (string concatenation) pada query SQL.',
            taintTrace: trace
          });
        }
      } else if (trace.sinkHit.sinkType === 'XSS') {
        issues.push({
          id: `sec_xss_${relPath}_${trace.sinkHit.line}`,
          category: 'XSS',
          severity: 'HIGH',
          title: 'Potensi Cross-Site Scripting (XSS) Terdeteksi',
          filePath: relPath,
          lineNumber: trace.sinkHit.line,
          codeSnippet: trace.sinkHit.snippet,
          description: `Variabel '${trace.sinkHit.taintedVariable}' dicetak langsung ke output web tanpa sanitasi HTML escaping.`,
          recommendation: 'Gunakan htmlspecialchars() (PHP), DOMPurify.sanitize() (JS), atau hindari directive unescaped {!! !!} pada Blade / | safe pada template Jinja.',
          taintTrace: trace
        });
      } else if (trace.sinkHit.sinkType === 'CMD_INJECTION') {
        issues.push({
          id: `sec_cmd_${relPath}_${trace.sinkHit.line}`,
          category: 'CMD_INJECTION',
          severity: 'CRITICAL',
          title: 'Potensi Command Injection Terdeteksi',
          filePath: relPath,
          lineNumber: trace.sinkHit.line,
          codeSnippet: trace.sinkHit.snippet,
          description: `Input pengguna dialirkan ke shell execution sink tanpa validasi atau escape argumen sistem.`,
          recommendation: 'Hindari pemanggilan fungsi shell dengan string dinamis. Gunakan execFile dengan daftar argumen statis.',
          taintTrace: trace
        });
      }
    }

    // 2. Specific Heuristics & Signatures
    for (let i = 0; i < lines.length; i++) {
      const lineNum = i + 1;
      const line = lines[i];
      const trimmed = line.trim();
      const isComment =
        trimmed.startsWith('//') ||
        trimmed.startsWith('*') ||
        trimmed.startsWith('/*') ||
        trimmed.startsWith('#');

      // A. Hardcoded Secrets Detection (can still check comments for leaked tokens)
      const secretIssue = this.checkHardcodedSecrets(relPath, line, lineNum);
      if (secretIssue) issues.push(secretIssue);

      // Skip code-level vulnerability checks on pure comment lines
      if (isComment) continue;

      // B. Mass Assignment Vulnerabilities
      const massAssignIssue = this.checkMassAssignment(relPath, line, lineNum);
      if (massAssignIssue) issues.push(massAssignIssue);

      // C. Additional XSS Heuristic: dangerouslySetInnerHTML without DOMPurify
      if (/dangerouslySetInnerHTML\s*=\s*\{\s*\{\s*__html\s*:/.test(line) && !/DOMPurify\.sanitize/i.test(line)) {
        issues.push({
          id: `sec_xss_danger_${relPath}_${lineNum}`,
          category: 'XSS',
          severity: 'HIGH',
          title: 'Unsanitized dangerouslySetInnerHTML',
          filePath: relPath,
          lineNumber: lineNum,
          codeSnippet: line.trim(),
          description: 'Penggunaan dangerouslySetInnerHTML tanpa sanitasi DOMPurify berisiko XSS jika merender konten dinamis.',
          recommendation: 'Bungkus payload HTML dengan DOMPurify.sanitize(htmlPayload).'
        });
      }

      // D. Additional XSS Heuristic: Blade unescaped {!! $var !!}
      const bladeMatch = line.match(/\{!!\s*(\$[a-zA-Z0-9_]+)\s*!!\}/);
      if (bladeMatch && !/e\s*\(/.test(line)) {
        // Only add if not already captured by taint trace
        const exists = issues.some(iss => iss.filePath === relPath && iss.lineNumber === lineNum && iss.category === 'XSS');
        if (!exists) {
          issues.push({
            id: `sec_xss_blade_${relPath}_${lineNum}`,
            category: 'XSS',
            severity: 'HIGH',
            title: 'Unescaped Blade Directive {!! !!}',
            filePath: relPath,
            lineNumber: lineNum,
            codeSnippet: line.trim(),
            description: `Directive {!! ${bladeMatch[1]} !!} merender HTML mentah tanpa proteksi escaping Blade default {{ }}.`,
            recommendation: `Gunakan kurung kurawal ganda {{ ${bladeMatch[1]} }} atau bungkus dengan e(${bladeMatch[1]}).`
          });
        }
      }

      // E. Raw SQL String Concatenation / Interpolation
      const rawSqlIssue = this.checkRawSqlConcatenation(relPath, line, lineNum);
      if (rawSqlIssue && !issues.some(x => x.filePath === relPath && x.lineNumber === lineNum && x.category === 'SQLI')) {
        issues.push(rawSqlIssue);
      }

      // F. Insecure Cryptography / Weak Hashing
      const cryptoIssue = this.checkInsecureCrypto(relPath, line, lineNum);
      if (cryptoIssue) issues.push(cryptoIssue);

      // G. Insecure Deserialization & Dynamic Eval
      const evalIssue = this.checkInsecureEval(relPath, line, lineNum);
      if (evalIssue) issues.push(evalIssue);

      // H. Insecure Config & Debug Leak
      const configIssue = this.checkDangerousConfig(relPath, line, lineNum);
      if (configIssue) issues.push(configIssue);

      // I. CSRF Protection Risk
      const csrfIssue = this.checkCsrfRisk(relPath, line, lineNum);
      if (csrfIssue) issues.push(csrfIssue);
    }

    return issues;
  }

  /**
   * Detect Raw SQL String Concatenation or Template Interpolation
   */
  private checkRawSqlConcatenation(relPath: string, line: string, lineNum: number): SecurityIssue | null {
    const lower = relPath.toLowerCase();
    if (lower.includes('test') || lower.includes('fixture') || lower.includes('migration')) return null;

    const hasSqlVerb = /\b(?:SELECT\s+.*?FROM|INSERT\s+INTO|UPDATE\s+.*?SET|DELETE\s+FROM)\b/i.test(line);
    const hasInterpolation =
      /(?:\.\s*\$[a-zA-Z0-9_]+|\+\s*[a-zA-Z0-9_]+|`[^`]*\$\{[^}]+\}[^`]*`|\bDB::raw\s*\([^)]*\$|\bDB::select\s*\([^)]*\$)/i.test(line);

    if (hasSqlVerb && hasInterpolation && !line.includes('?') && !line.includes(':')) {
      return {
        id: `sec_sqli_raw_${relPath}_${lineNum}`,
        category: 'SQLI',
        severity: 'CRITICAL',
        title: 'Raw SQL Query Concatenation Terdeteksi',
        filePath: relPath,
        lineNumber: lineNum,
        codeSnippet: line.trim(),
        description: 'Penggabungan string dinamis pada query SQL tanpa prepared statement / parameterized binding berisiko SQL Injection.',
        recommendation: 'Gunakan placeholder parameterized query (misal ? atau :id) dan kirim variabel sebagai parameter terpisah.'
      };
    }
    return null;
  }

  /**
   * Detect Insecure Cryptography & Weak Hashing (md5/sha1 for sensitive data)
   */
  private checkInsecureCrypto(relPath: string, line: string, lineNum: number): SecurityIssue | null {
    const lower = relPath.toLowerCase();
    if (lower.includes('test') || lower.includes('fixture') || lower.includes('hasher.ts')) return null;

    if (/\b(?:md5|sha1)\s*\(\s*[^)]+\)/i.test(line) ||
        /(?:crypto\.createHash\s*\(\s*['"](?:md5|sha1)['"]|hashlib\.(?:md5|sha1)\s*\()/i.test(line)) {
      return {
        id: `sec_crypto_${relPath}_${lineNum}`,
        category: 'INSECURE_CRYPTO',
        severity: 'HIGH',
        title: 'Penggunaan Algoritma Hash Lemah (MD5 / SHA1)',
        filePath: relPath,
        lineNumber: lineNum,
        codeSnippet: line.trim(),
        description: 'Fungsi hash MD5 dan SHA1 rentan terhadap collision attack dan rainbow table cracking.',
        recommendation: 'Gunakan bcrypt / Argon2 (untuk password) atau SHA-256 / SHA-512 (untuk integritas data dan signature).'
      };
    }
    return null;
  }

  /**
   * Detect Insecure Deserialization & Dynamic Code Execution
   */
  private checkInsecureEval(relPath: string, line: string, lineNum: number): SecurityIssue | null {
    const lower = relPath.toLowerCase();
    if (lower.includes('test') || lower.includes('fixture')) return null;

    if (/\beval\s*\(\s*(?:\$_(?:GET|POST|REQUEST)|\$request|[a-zA-Z0-9_]+)/i.test(line) ||
        /\bunserialize\s*\(\s*(?:\$_(?:GET|POST|REQUEST)|\$request|[a-zA-Z0-9_]+)/i.test(line) ||
        /\bpickle\.loads?\s*\(/i.test(line)) {
      return {
        id: `sec_eval_${relPath}_${lineNum}`,
        category: 'INSECURE_EVAL',
        severity: 'CRITICAL',
        title: 'Insecure Dynamic Execution / Deserialization',
        filePath: relPath,
        lineNumber: lineNum,
        codeSnippet: line.trim(),
        description: 'Pemanggilan eval() atau unserialize() pada input dinamis memungkinkan Remote Code Execution (RCE).',
        recommendation: 'Hindari pemanggilan eval() atau unserialize(). Gunakan format data terstruktur aman seperti JSON (json_decode / json.loads).'
      };
    }
    return null;
  }

  /**
   * Detect Dangerous Configurations & Debug Leakage
   */
  private checkDangerousConfig(relPath: string, line: string, lineNum: number): SecurityIssue | null {
    const lower = relPath.toLowerCase();
    if (lower.includes('.example') || lower.includes('.sample') || lower.includes('.template')) return null;

    if (lower.endsWith('.env') || lower.includes('config') || lower.includes('settings')) {
      if (/^\s*APP_DEBUG\s*=\s*true\b/i.test(line) || /^\s*DEBUG\s*=\s*True\b/.test(line)) {
        return {
          id: `sec_cfg_debug_${relPath}_${lineNum}`,
          category: 'CONFIG_LEAK',
          severity: 'HIGH',
          title: 'Debug Mode Aktif (APP_DEBUG = true)',
          filePath: relPath,
          lineNumber: lineNum,
          codeSnippet: line.trim(),
          description: 'Debug mode aktif mengekspos stack trace sensitif, query SQL, dan kunci rahasia ketika terjadi exception.',
          recommendation: 'Setel APP_DEBUG=false pada lingkungan production dan staging.'
        };
      }
      if (/display_errors\s*=\s*(?:On|1)\b/i.test(line)) {
        return {
          id: `sec_cfg_errors_${relPath}_${lineNum}`,
          category: 'CONFIG_LEAK',
          severity: 'MEDIUM',
          title: 'display_errors Diaktifkan',
          filePath: relPath,
          lineNumber: lineNum,
          codeSnippet: line.trim(),
          description: 'display_errors aktif mencetak rincian error internal ke layar browser pengguna.',
          recommendation: 'Nonaktifkan display_errors (display_errors = Off) dan arahkan output error ke file log tertutup.'
        };
      }
    }
    return null;
  }

  /**
   * Detect CSRF Protection Bypass
   */
  private checkCsrfRisk(relPath: string, line: string, lineNum: number): SecurityIssue | null {
    const lower = relPath.toLowerCase();
    if (lower.includes('test') || lower.includes('fixture')) return null;

    if (/\$except\s*=\s*\[\s*['"]\*['"]\s*\]/i.test(line) || /@csrf_exempt/i.test(line)) {
      return {
        id: `sec_csrf_bypass_${relPath}_${lineNum}`,
        category: 'CSRF_RISK',
        severity: 'HIGH',
        title: 'Bypass Proteksi CSRF Terdeteksi',
        filePath: relPath,
        lineNumber: lineNum,
        codeSnippet: line.trim(),
        description: 'Mengecualikan seluruh endpoint dari verifikasi CSRF membuka celah Cross-Site Request Forgery.',
        recommendation: 'Hanya kecualikan route stateless webhook resmi dengan verifikasi signature terpisah (HMAC).'
      };
    }
    return null;
  }

  /**
   * Check for Hardcoded Secrets with Prefix Signatures and Shannon Entropy Filter
   */
  private checkHardcodedSecrets(relPath: string, line: string, lineNum: number): SecurityIssue | null {
    // Whitelist files that should not trigger secret alerts
    const lowerPath = relPath.toLowerCase();
    if (
      lowerPath.includes('.env.example') ||
      lowerPath.includes('.env.sample') ||
      lowerPath.includes('.env.template') ||
      lowerPath.includes('package-lock.json') ||
      lowerPath.includes('yarn.lock') ||
      lowerPath.endsWith('tsconfig.json') ||
      lowerPath.endsWith('jsconfig.json') ||
      (lowerPath.includes('test') && lowerPath.includes('fixture'))
    ) {
      return null;
    }

    const isDummyPlaceholder = (val: string) => {
      const lower = val.toLowerCase();
      return (
        lower.includes('your_') ||
        lower.includes('dummy') ||
        lower.includes('secret') ||
        lower.includes('xxxx') ||
        lower.includes('example') ||
        lower.includes('change_me') ||
        lower.includes('replace_me') ||
        lower.includes('my-secret') ||
        lower.includes('todo')
      );
    };

    // 1. AWS Access Key
    const awsMatch = line.match(/\b(AKIA[0-9A-Z]{16})\b/);
    if (awsMatch && !isDummyPlaceholder(awsMatch[1])) {
      return {
        id: `sec_sec_aws_${relPath}_${lineNum}`,
        category: 'HARDCODED_SECRET',
        severity: 'CRITICAL',
        title: 'Hardcoded AWS Access Key Terdeteksi',
        filePath: relPath,
        lineNumber: lineNum,
        codeSnippet: line.trim(),
        description: 'AWS Access Key ID hardcoded di dalam source code.',
        recommendation: 'Pindahkan AWS credential ke Environment Variable (process.env.AWS_ACCESS_KEY_ID).'
      };
    }

    // 2. GitHub Token
    const ghMatch = line.match(/\b((?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36})\b/);
    if (ghMatch && !isDummyPlaceholder(ghMatch[1])) {
      return {
        id: `sec_sec_gh_${relPath}_${lineNum}`,
        category: 'HARDCODED_SECRET',
        severity: 'CRITICAL',
        title: 'Hardcoded GitHub Personal Access Token Terdeteksi',
        filePath: relPath,
        lineNumber: lineNum,
        codeSnippet: line.trim(),
        description: 'GitHub Token ditemukan di dalam source code.',
        recommendation: 'Revoke token segera dan gunakan GitHub Actions Secrets atau file .env yang di-git ignore.'
      };
    }

    // 3. Stripe Secret Key
    const stripeMatch = line.match(/\b((?:sk|pk)_(?:live|test)_[0-9a-zA-Z]{24,34})\b/);
    if (stripeMatch && !isDummyPlaceholder(stripeMatch[1])) {
      return {
        id: `sec_sec_stripe_${relPath}_${lineNum}`,
        category: 'HARDCODED_SECRET',
        severity: 'CRITICAL',
        title: 'Hardcoded Stripe API Key Terdeteksi',
        filePath: relPath,
        lineNumber: lineNum,
        codeSnippet: line.trim(),
        description: 'Stripe API Key ditemukan secara terbuka di kode.',
        recommendation: 'Gunakan Environment Variable untuk menyimpan kunci Stripe.'
      };
    }

    // 4. Google API Key
    const googleMatch = line.match(/\b(AIza[0-9A-Za-z\-_]{35})\b/);
    if (googleMatch && !isDummyPlaceholder(googleMatch[1])) {
      return {
        id: `sec_sec_google_${relPath}_${lineNum}`,
        category: 'HARDCODED_SECRET',
        severity: 'HIGH',
        title: 'Hardcoded Google API Key Terdeteksi',
        filePath: relPath,
        lineNumber: lineNum,
        codeSnippet: line.trim(),
        description: 'Google Cloud / Maps API Key terdeteksi langsung di berkas.',
        recommendation: 'Batasi cakupan referer/IP API key di Google Cloud Console dan simpan di .env.'
      };
    }

    // 5. Database URI with password
    const dbUriMatch = line.match(/(?:postgres|mysql|mongodb(?:\+srv)?):\/\/[a-zA-Z0-9_\-\.]+:[^@\s]{4,}@[a-zA-Z0-9_\-\.]+/);
    if (dbUriMatch && !isDummyPlaceholder(dbUriMatch[0])) {
      return {
        id: `sec_sec_db_${relPath}_${lineNum}`,
        category: 'HARDCODED_SECRET',
        severity: 'HIGH',
        title: 'Hardcoded Database Connection String dengan Password',
        filePath: relPath,
        lineNumber: lineNum,
        codeSnippet: line.trim(),
        description: 'Database connection URI berisi username dan password terekspos.',
        recommendation: 'Gunakan variabel lingkungan seperti DATABASE_URL.'
      };
    }

    // 6. Shannon Entropy Filter for Quoted Strings
    const stringLiterals = line.match(/['"`]([A-Za-z0-9+/=_-]{30,80})['"`]/g);
    if (stringLiterals) {
      for (const lit of stringLiterals) {
        const raw = lit.slice(1, -1);
        if (isDummyPlaceholder(raw)) continue;
        // Ignore filesystem paths, URLs, or HTML attributes
        if (raw.includes('/') || raw.includes('\\') || raw.startsWith('http://') || raw.startsWith('https://')) continue;
        const entropy = SecurityAuditor.calculateShannonEntropy(raw);
        // Shannon entropy threshold for high-randomness secrets (hex/base64 typically >= 3.8)
        if (entropy >= 3.8 && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) {
          return {
            id: `sec_sec_entropy_${relPath}_${lineNum}`,
            category: 'HARDCODED_SECRET',
            severity: 'HIGH',
            title: 'High-Entropy Secret String Terdeteksi',
            filePath: relPath,
            lineNumber: lineNum,
            codeSnippet: line.trim(),
            description: `Ditemukan string acak berdensitas tinggi (Shannon Entropy: ${entropy.toFixed(2)}) yang menyerupai private token/token otentikasi.`,
            recommendation: 'Pastikan string ini bukan kredensial produksi dan pindahkan ke .env.'
          };
        }
      }
    }

    return null;
  }

  /**
   * Check for Mass Assignment vulnerabilities
   */
  private checkMassAssignment(relPath: string, line: string, lineNum: number): SecurityIssue | null {
    // Laravel Eloquent: protected $guarded = [];
    if (/protected\s+\$guarded\s*=\s*\[\s*\]\s*;/.test(line)) {
      return {
        id: `sec_ma_guarded_${relPath}_${lineNum}`,
        category: 'MASS_ASSIGNMENT',
        severity: 'HIGH',
        title: 'Mass Assignment: $guarded = [] Terdeteksi',
        filePath: relPath,
        lineNumber: lineNum,
        codeSnippet: line.trim(),
        description: 'Mendefinisikan $guarded = [] menonaktifkan proteksi mass assignment Eloquent sepenuhnya, memungkinkan penyerang menimpa field sensitif (role, is_admin).',
        recommendation: 'Gunakan whitelist eksplisit $fillable = [...] daripada mengosongkan $guarded.'
      };
    }

    // Laravel: Model::create($request->all())
    if (/\b[A-Z][a-zA-Z0-9_]*::(?:create|update)\s*\(\s*\$request->all\(\)\s*\)/.test(line)) {
      return {
        id: `sec_ma_req_all_${relPath}_${lineNum}`,
        category: 'MASS_ASSIGNMENT',
        severity: 'HIGH',
        title: 'Mass Assignment: create($request->all()) Terdeteksi',
        filePath: relPath,
        lineNumber: lineNum,
        codeSnippet: line.trim(),
        description: 'Menyuntikkan seluruh $request->all() secara langsung ke model tanpa validasi.',
        recommendation: 'Gunakan $request->validated() atau $request->only([...]).'
      };
    }

    // Django ModelForm: fields = '__all__'
    if (/^\s*fields\s*=\s*['"]__all__['"]/.test(line)) {
      return {
        id: `sec_ma_django_${relPath}_${lineNum}`,
        category: 'MASS_ASSIGNMENT',
        severity: 'MEDIUM',
        title: 'Mass Assignment: fields = "__all__" pada Django ModelForm',
        filePath: relPath,
        lineNumber: lineNum,
        codeSnippet: line.trim(),
        description: "fields = '__all__' mengekspos seluruh kolom model ke form input publik.",
        recommendation: 'Cantumkan kolom yang diperbolehkan secara eksplisit dalam tuple fields = (...).'
      };
    }

    return null;
  }

  /**
   * Compute final score and letter grade based on findings
   */
  public calculateAuditScore(issues: SecurityIssue[]): SecurityAuditResult {
    let score = 100;
    const summary = { critical: 0, high: 0, medium: 0, low: 0 };

    for (const issue of issues) {
      if (issue.severity === 'CRITICAL') {
        score -= 25;
        summary.critical++;
      } else if (issue.severity === 'HIGH') {
        score -= 15;
        summary.high++;
      } else if (issue.severity === 'MEDIUM') {
        score -= 8;
        summary.medium++;
      } else {
        score -= 3;
        summary.low++;
      }
    }

    score = Math.max(0, Math.min(100, score));

    let grade: 'A' | 'B' | 'C' | 'F' = 'A';
    if (score < 50) grade = 'F';
    else if (score < 75) grade = 'C';
    else if (score < 90) grade = 'B';

    return {
      projectSlug: this.projectSlug,
      score,
      grade,
      totalIssues: issues.length,
      summary,
      issues
    };
  }
}
