/**
 * Universal Polyglot Dependency Auditor Engine (v1.0)
 * Evaluates declared and installed dependencies across NPM, Composer, PyPI, and Go Modules.
 * Computes SemVer diff (Major/Minor/Patch), detects known CVE vulnerabilities, and generates upgrade CLI commands.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { DependencyItem, DependencyAuditResult, DependencyEcosystem, DependencyStatus } from '../types/index.js';
import { MemoryDatabase } from '../db/database.js';

interface KnownVulnerability {
  package: string;
  ecosystem: DependencyEcosystem;
  vulnerableRangeMax: string;
  id: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string;
  advisoryUrl: string;
}

const KNOWN_VULNERABILITIES: KnownVulnerability[] = [
  // NPM
  { package: 'lodash', ecosystem: 'npm', vulnerableRangeMax: '4.17.20', id: 'CVE-2021-23337', severity: 'HIGH', title: 'Prototype Pollution in template', advisoryUrl: 'https://nvd.nist.gov/vuln/detail/CVE-2021-23337' },
  { package: 'axios', ecosystem: 'npm', vulnerableRangeMax: '0.21.1', id: 'CVE-2021-3749', severity: 'HIGH', title: 'Regular Expression Denial of Service (ReDoS)', advisoryUrl: 'https://nvd.nist.gov/vuln/detail/CVE-2021-3749' },
  { package: 'express', ecosystem: 'npm', vulnerableRangeMax: '4.19.1', id: 'CVE-2024-29041', severity: 'MEDIUM', title: 'Open Redirect via Malformed URLs', advisoryUrl: 'https://nvd.nist.gov/vuln/detail/CVE-2024-29041' },
  { package: 'moment', ecosystem: 'npm', vulnerableRangeMax: '2.29.3', id: 'CVE-2022-31129', severity: 'HIGH', title: 'Inefficient Regular Expression Complexity', advisoryUrl: 'https://nvd.nist.gov/vuln/detail/CVE-2022-31129' },
  { package: 'minimist', ecosystem: 'npm', vulnerableRangeMax: '1.2.5', id: 'CVE-2021-44906', severity: 'CRITICAL', title: 'Prototype Pollution vulnerability', advisoryUrl: 'https://nvd.nist.gov/vuln/detail/CVE-2021-44906' },
  { package: 'json5', ecosystem: 'npm', vulnerableRangeMax: '2.2.1', id: 'CVE-2022-46175', severity: 'HIGH', title: 'Prototype Pollution in JSON5 parse', advisoryUrl: 'https://nvd.nist.gov/vuln/detail/CVE-2022-46175' },
  { package: 'tar', ecosystem: 'npm', vulnerableRangeMax: '6.1.10', id: 'CVE-2021-37712', severity: 'HIGH', title: 'Arbitrary File Overwrite via Hardlink Path', advisoryUrl: 'https://nvd.nist.gov/vuln/detail/CVE-2021-37712' },
  // PHP / Composer
  { package: 'laravel/framework', ecosystem: 'composer', vulnerableRangeMax: '9.52.15', id: 'CVE-2023-35147', severity: 'HIGH', title: 'SQL Injection in Eloquent order query', advisoryUrl: 'https://nvd.nist.gov/vuln/detail/CVE-2023-35147' },
  { package: 'guzzlehttp/guzzle', ecosystem: 'composer', vulnerableRangeMax: '7.4.4', id: 'CVE-2022-31090', severity: 'MEDIUM', title: 'HTTP Header Injection via forward slash', advisoryUrl: 'https://nvd.nist.gov/vuln/detail/CVE-2022-31090' },
  // Python / PyPI
  { package: 'django', ecosystem: 'pypi', vulnerableRangeMax: '4.2.13', id: 'CVE-2024-39614', severity: 'HIGH', title: 'Denial of service in django.utils.translation', advisoryUrl: 'https://nvd.nist.gov/vuln/detail/CVE-2024-39614' },
  { package: 'requests', ecosystem: 'pypi', vulnerableRangeMax: '2.30.0', id: 'CVE-2023-32681', severity: 'MEDIUM', title: 'Unintended leak of Proxy-Authorization header', advisoryUrl: 'https://nvd.nist.gov/vuln/detail/CVE-2023-32681' },
  { package: 'pydantic', ecosystem: 'pypi', vulnerableRangeMax: '1.10.12', id: 'CVE-2023-45137', severity: 'HIGH', title: 'ReDoS in email-validator integration', advisoryUrl: 'https://nvd.nist.gov/vuln/detail/CVE-2023-45137' },
  // Go
  { package: 'github.com/gin-gonic/gin', ecosystem: 'gomod', vulnerableRangeMax: '1.9.0', id: 'CVE-2023-29401', severity: 'MEDIUM', title: 'Panic on malformed query paths in Router', advisoryUrl: 'https://nvd.nist.gov/vuln/detail/CVE-2023-29401' }
];

// In-memory cache for online registry lookups (TTL 1 hour)
const REGISTRY_CACHE = new Map<string, { version: string; timestamp: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000;

export class DependencyAuditor {
  private workspacePath: string;
  private projectSlug: string;
  private db?: MemoryDatabase;

  constructor(workspacePath: string, projectSlug: string, db?: MemoryDatabase) {
    this.workspacePath = workspacePath;
    this.projectSlug = projectSlug;
    this.db = db;
  }

  /**
   * Run full dependency audit across all discovered manifests
   */
  public async audit(): Promise<DependencyAuditResult> {
    const dependencies: DependencyItem[] = [];
    const ecosystems: Set<DependencyEcosystem> = new Set();
    let manifestPath = '';

    // 1. Audit Node.js package.json
    const pkgJsonPath = path.join(this.workspacePath, 'package.json');
    if (fs.existsSync(pkgJsonPath)) {
      ecosystems.add('npm');
      manifestPath = 'package.json';
      const npmDeps = await this.auditNpm(pkgJsonPath);
      dependencies.push(...npmDeps);
    }

    // 2. Audit PHP composer.json
    const composerJsonPath = path.join(this.workspacePath, 'composer.json');
    if (fs.existsSync(composerJsonPath)) {
      ecosystems.add('composer');
      if (!manifestPath) manifestPath = 'composer.json';
      const compDeps = await this.auditComposer(composerJsonPath);
      dependencies.push(...compDeps);
    }

    // 3. Audit Python requirements.txt or pyproject.toml
    const reqTxtPath = path.join(this.workspacePath, 'requirements.txt');
    const pyprojectPath = path.join(this.workspacePath, 'pyproject.toml');
    if (fs.existsSync(reqTxtPath)) {
      ecosystems.add('pypi');
      if (!manifestPath) manifestPath = 'requirements.txt';
      const pyDeps = await this.auditPythonRequirements(reqTxtPath);
      dependencies.push(...pyDeps);
    } else if (fs.existsSync(pyprojectPath)) {
      ecosystems.add('pypi');
      if (!manifestPath) manifestPath = 'pyproject.toml';
      const pyDeps = await this.auditPyproject(pyprojectPath);
      dependencies.push(...pyDeps);
    }

    // 4. Audit Go go.mod
    const goModPath = path.join(this.workspacePath, 'go.mod');
    if (fs.existsSync(goModPath)) {
      ecosystems.add('gomod');
      if (!manifestPath) manifestPath = 'go.mod';
      const goDeps = await this.auditGoMod(goModPath);
      dependencies.push(...goDeps);
    }

    // Calculate score & statistics
    let score = 100;
    let upToDateCount = 0;
    let outdatedCount = 0;
    let vulnerableCount = 0;
    const summary = { major: 0, minor: 0, patch: 0, vulnerable: 0 };

    for (const dep of dependencies) {
      if (dep.status === 'SECURITY_VULNERABLE') {
        score -= 25;
        vulnerableCount++;
        summary.vulnerable++;
      } else if (dep.status === 'MAJOR_UPDATE') {
        score -= 10;
        outdatedCount++;
        summary.major++;
      } else if (dep.status === 'MINOR_UPDATE') {
        score -= 4;
        outdatedCount++;
        summary.minor++;
      } else if (dep.status === 'PATCH_UPDATE') {
        score -= 1;
        outdatedCount++;
        summary.patch++;
      } else {
        upToDateCount++;
      }
    }

    score = Math.max(0, Math.min(100, score));

    let health: 'OPTIMAL' | 'WARNING' | 'CRITICAL' = 'OPTIMAL';
    if (score < 60 || vulnerableCount > 0) health = 'CRITICAL';
    else if (score < 85 || summary.major > 2) health = 'WARNING';

    return {
      projectSlug: this.projectSlug,
      manifestPath: manifestPath || 'no-manifest-found',
      ecosystems: Array.from(ecosystems),
      score,
      health,
      totalDependencies: dependencies.length,
      upToDateCount,
      outdatedCount,
      vulnerableCount,
      summary,
      dependencies
    };
  }

  // --------------------------------------------------------------------------
  // PARSERS FOR MANIFESTS
  // --------------------------------------------------------------------------

  private async auditNpm(pkgJsonPath: string): Promise<DependencyItem[]> {
    const items: DependencyItem[] = [];
    try {
      const raw = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
      const deps = raw.dependencies || {};
      const devDeps = raw.devDependencies || {};

      // Optional lockfile reading for exact resolved versions
      const lockPath = path.join(this.workspacePath, 'package-lock.json');
      let lockPackages: Record<string, string> = {};
      if (fs.existsSync(lockPath)) {
        try {
          const lockRaw = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
          if (lockRaw.packages) {
            for (const [k, v] of Object.entries<any>(lockRaw.packages)) {
              const cleanName = k.replace(/^node_modules\//, '');
              if (v.version) lockPackages[cleanName] = v.version;
            }
          } else if (lockRaw.dependencies) {
            for (const [k, v] of Object.entries<any>(lockRaw.dependencies)) {
              if (v.version) lockPackages[k] = v.version;
            }
          }
        } catch {}
      }

      for (const [name, rawVersion] of Object.entries(deps)) {
        const item = await this.buildDependencyItem(name, String(rawVersion), false, 'npm', lockPackages[name]);
        items.push(item);
      }

      for (const [name, rawVersion] of Object.entries(devDeps)) {
        const item = await this.buildDependencyItem(name, String(rawVersion), true, 'npm', lockPackages[name]);
        items.push(item);
      }
    } catch {}
    return items;
  }

  private async auditComposer(composerPath: string): Promise<DependencyItem[]> {
    const items: DependencyItem[] = [];
    try {
      const raw = JSON.parse(fs.readFileSync(composerPath, 'utf-8'));
      const req = raw.require || {};
      const reqDev = raw['require-dev'] || {};

      // Optional composer.lock reading
      const lockPath = path.join(this.workspacePath, 'composer.lock');
      let lockPackages: Record<string, string> = {};
      if (fs.existsSync(lockPath)) {
        try {
          const lockRaw = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
          const allPkgs = [...(lockRaw.packages || []), ...(lockRaw['packages-dev'] || [])];
          for (const p of allPkgs) {
            if (p.name && p.version) {
              lockPackages[p.name] = p.version.replace(/^v/i, '');
            }
          }
        } catch {}
      }

      for (const [name, rawVersion] of Object.entries(req)) {
        if (name === 'php' || name.startsWith('ext-')) continue;
        const item = await this.buildDependencyItem(name, String(rawVersion), false, 'composer', lockPackages[name]);
        items.push(item);
      }

      for (const [name, rawVersion] of Object.entries(reqDev)) {
        if (name === 'php' || name.startsWith('ext-')) continue;
        const item = await this.buildDependencyItem(name, String(rawVersion), true, 'composer', lockPackages[name]);
        items.push(item);
      }
    } catch {}
    return items;
  }

  private async auditPythonRequirements(reqPath: string): Promise<DependencyItem[]> {
    const items: DependencyItem[] = [];
    try {
      const content = fs.readFileSync(reqPath, 'utf-8');
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('-r')) continue;

        const match = trimmed.match(/^([a-zA-Z0-9_.-]+)\s*(?:==|>=|<=|~=|>|<)?\s*([0-9a-zA-Z_.-]+)?/);
        if (match) {
          const name = match[1];
          const ver = match[2] || 'latest';
          const item = await this.buildDependencyItem(name, ver, false, 'pypi');
          items.push(item);
        }
      }
    } catch {}
    return items;
  }

  private async auditPyproject(pyprojectPath: string): Promise<DependencyItem[]> {
    const items: DependencyItem[] = [];
    try {
      const content = fs.readFileSync(pyprojectPath, 'utf-8');
      const lines = content.split('\n');
      let inDeps = false;
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('[tool.poetry.dependencies]') || trimmed.startsWith('dependencies = [')) {
          inDeps = true;
          continue;
        }
        if (trimmed.startsWith('[') && inDeps) {
          inDeps = false;
          continue;
        }

        if (inDeps && trimmed.includes('=')) {
          const parts = trimmed.split('=');
          const name = parts[0].trim().replace(/['"]/g, '');
          const ver = parts[1].trim().replace(/['",]/g, '');
          if (name && name !== 'python') {
            const item = await this.buildDependencyItem(name, ver, false, 'pypi');
            items.push(item);
          }
        }
      }
    } catch {}
    return items;
  }

  private async auditGoMod(goModPath: string): Promise<DependencyItem[]> {
    const items: DependencyItem[] = [];
    try {
      const content = fs.readFileSync(goModPath, 'utf-8');
      const lines = content.split('\n');
      let inRequire = false;

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('require (')) {
          inRequire = true;
          continue;
        }
        if (trimmed === ')' && inRequire) {
          inRequire = false;
          continue;
        }

        if (inRequire || trimmed.startsWith('require ')) {
          const cleanLine = trimmed.replace(/^require\s+/, '');
          const parts = cleanLine.split(/\s+/);
          if (parts.length >= 2) {
            const name = parts[0];
            const ver = parts[1].replace(/^v/i, '');
            const item = await this.buildDependencyItem(name, ver, false, 'gomod');
            items.push(item);
          }
        }
      }
    } catch {}
    return items;
  }

  // --------------------------------------------------------------------------
  // SEMVER EVALUATOR & REGISTRY LOOKUP
  // --------------------------------------------------------------------------

  public static cleanVersionString(v: string): string {
    if (!v) return '0.0.0';
    return v
      .replace(/^[\^~>=<v\s]+/i, '')
      .split(/[\s-]/)[0]
      .trim();
  }

  public static parseSemVer(v: string): { major: number; minor: number; patch: number } | null {
    const clean = DependencyAuditor.cleanVersionString(v);
    const parts = clean.split('.').map(n => parseInt(n, 10));
    if (parts.length === 0 || isNaN(parts[0])) return null;
    return {
      major: parts[0] || 0,
      minor: parts[1] || 0,
      patch: parts[2] || 0
    };
  }

  public static compareSemVer(current: string, latest: string): 'MAJOR' | 'MINOR' | 'PATCH' | 'NONE' {
    const cur = DependencyAuditor.parseSemVer(current);
    const lat = DependencyAuditor.parseSemVer(latest);
    if (!cur || !lat) return 'NONE';

    if (lat.major > cur.major) return 'MAJOR';
    if (lat.major === cur.major && lat.minor > cur.minor) return 'MINOR';
    if (lat.major === cur.major && lat.minor === cur.minor && lat.patch > cur.patch) return 'PATCH';
    return 'NONE';
  }

  public static isVulnerable(current: string, vulnerableMax: string): boolean {
    const cur = DependencyAuditor.parseSemVer(current);
    const max = DependencyAuditor.parseSemVer(vulnerableMax);
    if (!cur || !max) return false;

    if (cur.major < max.major) return true;
    if (cur.major === max.major && cur.minor < max.minor) return true;
    if (cur.major === max.major && cur.minor === max.minor && cur.patch <= max.patch) return true;
    return false;
  }

  private async fetchLatestVersion(name: string, ecosystem: DependencyEcosystem): Promise<string | null> {
    const cacheKey = `${ecosystem}:${name}`;
    const cached = REGISTRY_CACHE.get(cacheKey);
    const now = Date.now();
    if (cached && (now - cached.timestamp) < CACHE_TTL_MS) {
      return cached.version;
    }

    let latest: string | null = null;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1400);

      if (ecosystem === 'npm') {
        const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/latest`, {
          signal: controller.signal,
          headers: { 'User-Agent': 'mapping-projek/1.0.0-auditor' }
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          const data: any = await res.json();
          if (data && data.version) latest = data.version;
        }
      } else if (ecosystem === 'pypi') {
        const res = await fetch(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`, {
          signal: controller.signal,
          headers: { 'User-Agent': 'mapping-projek/1.0.0-auditor' }
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          const data: any = await res.json();
          if (data && data.info && data.info.version) latest = data.info.version;
        }
      } else if (ecosystem === 'composer') {
        const res = await fetch(`https://repo.packagist.org/p2/${encodeURIComponent(name)}.json`, {
          signal: controller.signal,
          headers: { 'User-Agent': 'mapping-projek/1.0.0-auditor' }
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          const data: any = await res.json();
          const pkgs = data?.packages?.[name];
          if (Array.isArray(pkgs) && pkgs.length > 0 && pkgs[0].version) {
            latest = pkgs[0].version.replace(/^v/i, '');
          }
        }
      }
    } catch {
      // Offline / sandbox mode: gracefully fall back to null
    }

    if (latest) {
      REGISTRY_CACHE.set(cacheKey, { version: latest, timestamp: now });
    }
    return latest;
  }

  private async buildDependencyItem(
    name: string,
    rawVersion: string,
    isDev: boolean,
    ecosystem: DependencyEcosystem,
    resolvedVersion?: string
  ): Promise<DependencyItem> {
    const currentVersion = DependencyAuditor.cleanVersionString(resolvedVersion || rawVersion);
    const latestVersion = (await this.fetchLatestVersion(name, ecosystem)) || currentVersion;

    // 1. Check known vulnerability catalog
    const matchingVulns = KNOWN_VULNERABILITIES.filter(v =>
      v.ecosystem === ecosystem &&
      v.package.toLowerCase() === name.toLowerCase() &&
      DependencyAuditor.isVulnerable(currentVersion, v.vulnerableRangeMax)
    );

    const hasVulnerability = matchingVulns.length > 0;
    const updateType = DependencyAuditor.compareSemVer(currentVersion, latestVersion);

    let status: DependencyStatus = 'UP_TO_DATE';
    if (hasVulnerability) {
      status = 'SECURITY_VULNERABLE';
    } else if (updateType === 'MAJOR') {
      status = 'MAJOR_UPDATE';
    } else if (updateType === 'MINOR') {
      status = 'MINOR_UPDATE';
    } else if (updateType === 'PATCH') {
      status = 'PATCH_UPDATE';
    }

    // 2. Generate copyable upgrade CLI command
    let suggestedCommand = '';
    if (ecosystem === 'npm') {
      suggestedCommand = isDev ? `npm install -D ${name}@latest` : `npm install ${name}@latest`;
    } else if (ecosystem === 'composer') {
      suggestedCommand = isDev ? `composer require --dev ${name}:^${latestVersion}` : `composer require ${name}:^${latestVersion}`;
    } else if (ecosystem === 'pypi') {
      suggestedCommand = `pip install --upgrade ${name}`;
    } else if (ecosystem === 'gomod') {
      suggestedCommand = `go get ${name}@latest`;
    }

    return {
      name,
      ecosystem,
      currentVersion,
      wantedVersion: rawVersion,
      latestVersion,
      isDev,
      status,
      updateType,
      vulnerabilities: matchingVulns.map(v => ({
        id: v.id,
        severity: v.severity,
        title: v.title,
        advisoryUrl: v.advisoryUrl
      })),
      suggestedCommand
    };
  }
}
