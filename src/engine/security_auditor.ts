/**
 * Global Security Auditor Engine (v2.0)
 * Evaluates Codebase Security across SQLi, XSS, Hardcoded Secrets, and Mass Assignment.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { TaintTracker, TaintTrace } from './taint_tracker.js';

export type SecuritySeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface SecurityIssue {
  id: string;
  category: 'SQLI' | 'XSS' | 'HARDCODED_SECRET' | 'MASS_ASSIGNMENT' | 'CMD_INJECTION' | 'PATH_TRAVERSAL';
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
    }

    return issues;
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
