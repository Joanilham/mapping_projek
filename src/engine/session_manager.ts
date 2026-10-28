import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { MemoryDatabase } from '../db/database.js';
import { DeltaHasher } from './hasher.js';
import { ColdStartEngine } from './cold_start.js';
import { AstParser } from '../parser/ast_parser.js';
import { PolyglotAstAdapter } from '../parser/polyglot_adapter.js';
import { DataFlowTracer } from './data_flow.js';
import { DependencyInjectionResolver } from './di_resolver.js';
import { SecurityAuditor, SecurityAuditResult, SecurityIssue } from './security_auditor.js';
import { PerformanceAuditor, PerformanceAuditResult } from './performance_auditor.js';
import { ModuleCategory, ModuleMemory, SessionCheckpoint, ColdStartDigest, CodeNode, CodeEdge, DataFlowTrace } from '../types/index.js';

export interface ScanProgressInfo {
  phase: 'discovering' | 'checksumming' | 'parsing' | 'resolving' | 'complete' | 'error';
  currentFile?: string;
  currentIndex: number;
  totalFiles: number;
  errorCount: number;
  lastError?: { file: string; message: string };
  errors?: Array<{ file: string; message: string }>;
}

export class SessionManager {
  public workspacePath: string;
  public projectSlug: string;
  public db: MemoryDatabase;
  public hasher: DeltaHasher;
  public coldStart: ColdStartEngine;
  public parser: AstParser;
  public polyglotAdapter: PolyglotAstAdapter;
  public tracer: DataFlowTracer;

  constructor(workspacePath: string, projectSlug?: string) {
    this.workspacePath = path.resolve(workspacePath);
    // Derive project slug from folder name in lowercase-kebab-case if not provided
    this.projectSlug = projectSlug || path.basename(this.workspacePath).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    this.db = new MemoryDatabase(this.workspacePath);
    this.hasher = new DeltaHasher(this.workspacePath, this.projectSlug, this.db);
    this.coldStart = new ColdStartEngine(this.workspacePath, this.projectSlug, this.db);
    this.parser = new AstParser(this.workspacePath, this.projectSlug);
    this.polyglotAdapter = new PolyglotAstAdapter(this.workspacePath, this.projectSlug);
    this.tracer = new DataFlowTracer(this.projectSlug, this.db, this.workspacePath);
  }

  /**
   * Initialize or update project configuration & baseline checksums
   */
  public initProject(options?: { name?: string; overview?: string; rules?: string; onProgress?: (p: ScanProgressInfo) => void }): {
    projectSlug: string;
    totalFiles: number;
    dbPath: string;
    errors?: Array<{ file: string; message: string }>;
  } {
    const existing = this.db.getProjectMeta(this.projectSlug);

    let detectedName = options?.name ?? existing?.name;
    let detectedOverview = options?.overview ?? existing?.system_overview;

    if (!detectedName || !detectedOverview) {
      // 1. Check Node package.json
      const pkgPath = path.join(this.workspacePath, 'package.json');
      if (fs.existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
          if (!detectedName && pkg.name) detectedName = pkg.name;
          if (!detectedOverview && pkg.description) detectedOverview = pkg.description;
        } catch {}
      }

      // 2. Check Gradle settings.gradle.kts / build.gradle
      const gradleSettings = path.join(this.workspacePath, 'settings.gradle.kts');
      if (fs.existsSync(gradleSettings)) {
        try {
          const content = fs.readFileSync(gradleSettings, 'utf-8');
          const rootMatch = content.match(/rootProject\.name\s*=\s*["']([^"']+)["']/);
          if (!detectedName && rootMatch) detectedName = rootMatch[1];
        } catch {}
      }

      // 3. Check Go go.mod
      const goMod = path.join(this.workspacePath, 'go.mod');
      if (fs.existsSync(goMod)) {
        try {
          const content = fs.readFileSync(goMod, 'utf-8');
          const modMatch = content.match(/module\s+([^\s\n]+)/);
          if (!detectedName && modMatch) detectedName = path.basename(modMatch[1]);
        } catch {}
      }
    }

    this.db.saveProjectMeta({
      project_slug: this.projectSlug,
      name: detectedName ?? path.basename(this.workspacePath),
      root_path: this.workspacePath,
      system_overview: detectedOverview ?? 'Arsitektur dan sistem modul proyek.',
      rules_and_conventions: options?.rules ?? existing?.rules_and_conventions ?? 'Standar arsitektur & konvensi kode proyek.',
      last_active_task: existing?.last_active_task ?? 'Project initialized.'
    });

    options?.onProgress?.({
      phase: 'discovering',
      currentIndex: 0,
      totalFiles: 0,
      errorCount: 0
    });

    // Take initial baseline checksum snapshot
    const delta = this.hasher.syncChecksums();

    // Map initial codebase AST
    const mapRes = this.mapCodebase({ forceAll: true, onProgress: options?.onProgress });

    return {
      projectSlug: this.projectSlug,
      totalFiles: delta.totalCount,
      dbPath: this.db.dbPath,
      errors: mapRes.errors
    };
  }

  /**
   * Scan and parse codebase into AST Nodes and Edges incrementally
   */
  public mapCodebase(options?: { forceAll?: boolean; onProgress?: (p: ScanProgressInfo) => void }): {
    scannedFiles: number;
    totalNodes: number;
    totalEdges: number;
    errors: Array<{ file: string; message: string }>;
  } {
    const { delta } = this.hasher.computeDelta();
    const allFiles = this.hasher.scanFiles();

    // Filter parseable source files (.php, .phtml, .blade.php, .py, .go, .ts, .tsx, .js, .jsx, .mjs, .cjs)
    const parseableExts = new Set(['.php', '.phtml', '.py', '.go', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
    const isParseable = (f: string) => f.endsWith('.blade.php') || parseableExts.has(path.extname(f));

    let filesToParse: string[];
    if (options?.forceAll) {
      filesToParse = allFiles.filter(isParseable);
      this.db.clearProjectGraph(this.projectSlug);
    } else {
      // Incremental parsing: only changed (added or modified) files
      filesToParse = [...delta.addedFiles, ...delta.modifiedFiles].filter(isParseable);

      // Clean up deleted files from graph
      for (const del of delta.deletedFiles) {
        this.db.clearFileGraph(this.projectSlug, del);
      }
    }

    const errors: Array<{ file: string; message: string }> = [];
    const totalCount = filesToParse.length;

    options?.onProgress?.({
      phase: 'parsing',
      currentIndex: 0,
      totalFiles: totalCount,
      errorCount: 0
    });

    let currentIdx = 0;
    for (const relPath of filesToParse) {
      currentIdx++;
      options?.onProgress?.({
        phase: 'parsing',
        currentFile: relPath,
        currentIndex: currentIdx,
        totalFiles: totalCount,
        errorCount: errors.length
      });

      try {
        this.db.clearFileGraph(this.projectSlug, relPath);
        const { nodes, edges } = this.polyglotAdapter.parse(relPath);
        this.db.saveCodeNodes(nodes);
        this.db.saveCodeEdges(edges);
      } catch (err: any) {
        const msg = err?.message || String(err);
        errors.push({ file: relPath, message: msg });
        options?.onProgress?.({
          phase: 'parsing',
          currentFile: relPath,
          currentIndex: currentIdx,
          totalFiles: totalCount,
          errorCount: errors.length,
          lastError: { file: relPath, message: msg }
        });
        console.warn(`[project-mapper] Warning: failed to parse ${relPath}:`, msg);
      }
    }

    // Cross-file Dependency Injection & Interface resolution pass
    options?.onProgress?.({
      phase: 'resolving',
      currentFile: 'Menyusun relasi ketergantungan arsitektur...',
      currentIndex: totalCount,
      totalFiles: totalCount,
      errorCount: errors.length
    });

    const allCurrentNodes = this.db.findNodes(this.projectSlug);
    const allCurrentEdges = this.db.getAllEdges(this.projectSlug);
    const diResolver = new DependencyInjectionResolver(this.projectSlug);
    const { edges: resolvedEdges } = diResolver.resolve(allCurrentNodes, allCurrentEdges);
    this.db.saveCodeEdges(resolvedEdges);

    // Sync file checksums to match newly parsed state
    this.hasher.syncChecksums();

    const totalNodes = allCurrentNodes.length;
    const allEdges = this.db.getAllEdges(this.projectSlug);

    options?.onProgress?.({
      phase: 'complete',
      currentIndex: totalCount,
      totalFiles: totalCount,
      errorCount: errors.length,
      errors
    });

    return {
      scannedFiles: filesToParse.length,
      totalNodes,
      totalEdges: allEdges.length,
      errors
    };
  }

  /**
   * Trace data flow starting from an endpoint or function symbol
   */
  public traceDataFlow(query?: string): DataFlowTrace | null {
    const entryPoints = this.tracer.findEntryPoints(query);
    if (entryPoints.length === 0) return null;

    return this.tracer.trace(entryPoints[0]);
  }

  /**
   * List symbols in project or specific file
   */
  public getSymbols(filePath?: string): CodeNode[] {
    return this.db.findNodes(this.projectSlug, filePath ? { file_path: filePath } : undefined);
  }

  /**
   * List all detected HTTP endpoints
   */
  public getEndpoints(): CodeNode[] {
    return this.db.getEndpoints(this.projectSlug);
  }

  /**
   * Save a session checkpoint before leaving the project
   */
  public saveCheckpoint(
    taskSummary: string,
    nextSteps: string = '',
    activeFiles: string[] = []
  ): SessionCheckpoint {
    // 1. Save checkpoint entry
    const cp = this.db.saveCheckpoint({
      project_slug: this.projectSlug,
      task_summary: taskSummary,
      next_steps: nextSteps,
      active_files: activeFiles
    });

    // 2. Incremental AST re-parse on modified files
    this.mapCodebase();

    return cp;
  }

  /**
   * Sync current disk changes as the new baseline
   */
  public syncBaseline(): { added: number; modified: number; deleted: number; total: number } {
    const delta = this.hasher.syncChecksums();
    return {
      added: delta.addedFiles.length,
      modified: delta.modifiedFiles.length,
      deleted: delta.deletedFiles.length,
      total: delta.totalCount
    };
  }

  /**
   * Get cold-start digest
   */
  public getColdStartDigest(): ColdStartDigest {
    return this.coldStart.generateDigest();
  }

  /**
   * Save or update a module specification
   */
  public saveModule(
    moduleName: string,
    category: ModuleCategory,
    summary: string,
    keyFiles: string[] = [],
    dependencies: string[] = []
  ): void {
    this.db.saveModule({
      project_slug: this.projectSlug,
      module_name: moduleName,
      category,
      summary,
      key_files: keyFiles,
      dependencies,
      content_hash: ''
    });
  }

  /**
   * List all stored modules
   */
  public getModules(category?: string): ModuleMemory[] {
    return this.db.getModules(this.projectSlug, category);
  }

  /**
   * Synchronize project memory modules from global MCP Vault (~/.local/share/mcp-memory/projects_vault.db)
   * with SQLite transaction (BEGIN IMMEDIATE ... COMMIT) and composite upsert (project_slug, category, module_name).
   */
  public syncFromMcpVault(projectSlug: string, vaultDbPath?: string): {
    ok: boolean;
    projectSlug: string;
    syncedCount: number;
    modules: Array<{
      project_slug: string;
      category: string;
      module_name: string;
      content: string;
      updated_at: string;
      dependencies: string[];
    }>;
  } {
    const vaultPath = vaultDbPath || process.env.MCP_VAULT_DB_PATH || path.join(os.homedir(), '.local/share/mcp-memory/projects_vault.db');
    if (!fs.existsSync(vaultPath)) {
      throw new Error(`MCP Vault database not found at ${vaultPath}`);
    }

    const vaultDb = new DatabaseSync(vaultPath, { readOnly: true });
    let rows: any[] = [];
    try {
      const stmt = vaultDb.prepare(`
        SELECT project_slug, category, module_name, content, updated_at, dependencies
        FROM project_memory
        WHERE project_slug = ?
        ORDER BY category ASC, module_name ASC
      `);
      rows = stmt.all(projectSlug) as any[];
    } finally {
      vaultDb.close();
    }

    const localDb = this.db.getRawDb();
    localDb.exec('BEGIN IMMEDIATE;');
    try {
      localDb.exec(`
        CREATE TABLE IF NOT EXISTS project_memory (
          project_slug TEXT NOT NULL,
          category TEXT NOT NULL,
          module_name TEXT NOT NULL,
          content TEXT NOT NULL,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          dependencies TEXT DEFAULT '[]',
          PRIMARY KEY (project_slug, category, module_name)
        );
      `);

      const insertPm = localDb.prepare(`
        INSERT INTO project_memory (project_slug, category, module_name, content, updated_at, dependencies)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_slug, category, module_name) DO UPDATE SET
          content = excluded.content,
          updated_at = excluded.updated_at,
          dependencies = excluded.dependencies;
      `);

      const insertMm = localDb.prepare(`
        INSERT INTO module_memory (id, project_slug, module_name, category, summary, key_files, dependencies, content_hash, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_slug, category, module_name) DO UPDATE SET
          summary = excluded.summary,
          key_files = excluded.key_files,
          dependencies = excluded.dependencies,
          content_hash = excluded.content_hash,
          updated_at = excluded.updated_at;
      `);

      for (const r of rows) {
        let depsStr = '[]';
        if (typeof r.dependencies === 'string') {
          depsStr = r.dependencies;
        } else if (Array.isArray(r.dependencies)) {
          depsStr = JSON.stringify(r.dependencies);
        }

        insertPm.run(
          r.project_slug,
          r.category,
          r.module_name,
          r.content || '',
          r.updated_at || new Date().toISOString(),
          depsStr
        );

        const modId = `${r.project_slug}:${r.category}:${r.module_name}`;
        insertMm.run(
          modId,
          r.project_slug,
          r.module_name,
          r.category,
          r.content || '',
          '[]',
          depsStr,
          '',
          r.updated_at || new Date().toISOString()
        );
      }

      localDb.exec('COMMIT;');
    } catch (err) {
      try { localDb.exec('ROLLBACK;'); } catch {}
      throw err;
    }

    // Build code nodes and edges for graph representation with Anti-Crash Invariant
    this.db.clearProjectGraph(projectSlug);
    if (rows.length > 0) {
      const graphNodes: CodeNode[] = [];
      const graphEdges: CodeEdge[] = [];
      const nodeIds = new Set<string>();

      for (const r of rows) {
        let deps: string[] = [];
        try {
          deps = typeof r.dependencies === 'string' ? JSON.parse(r.dependencies || '[]') : (Array.isArray(r.dependencies) ? r.dependencies : []);
        } catch {
          deps = [];
        }

        if (!nodeIds.has(r.module_name)) {
          graphNodes.push({
            id: r.module_name,
            project_slug: projectSlug,
            file_path: `modules/${r.category}/${r.module_name}`,
            node_type: r.category === 'api' ? 'endpoint' : (r.category === 'database' ? 'model' : (r.category === 'rules' ? 'interface' : 'class')),
            name: r.module_name,
            line_start: 1,
            line_end: 1,
            signature: `${r.category}:${r.module_name}`,
            metadata: { category: r.category, content: r.content }
          });
          nodeIds.add(r.module_name);
        }

        for (const dep of deps) {
          graphEdges.push({
            id: `${projectSlug}:${r.module_name}->${dep}`,
            project_slug: projectSlug,
            source_id: r.module_name,
            target_id: dep,
            relation_type: 'CALLS',
            metadata: { type: 'dependency' }
          });
        }
      }

      // Rule 5: Graph Anti-Crash Invariant - resolve any dangling edge
      for (const edge of graphEdges) {
        if (!nodeIds.has(edge.source_id)) {
          graphNodes.push({
            id: edge.source_id,
            project_slug: projectSlug,
            file_path: 'external',
            node_type: 'class',
            name: edge.source_id,
            line_start: 1,
            line_end: 1,
            signature: `external:${edge.source_id}`,
            metadata: { stub: true }
          });
          nodeIds.add(edge.source_id);
        }
        if (!nodeIds.has(edge.target_id)) {
          graphNodes.push({
            id: edge.target_id,
            project_slug: projectSlug,
            file_path: 'external',
            node_type: 'class',
            name: edge.target_id,
            line_start: 1,
            line_end: 1,
            signature: `external:${edge.target_id}`,
            metadata: { stub: true }
          });
          nodeIds.add(edge.target_id);
        }
      }

      this.db.saveCodeNodes(graphNodes);
      this.db.saveCodeEdges(graphEdges);
    }

    // Save project meta
    this.db.saveProjectMeta({
      project_slug: projectSlug,
      name: projectSlug,
      system_overview: `Synced from MCP Vault with ${rows.length} modules.`,
      rules_and_conventions: 'MCP Vault Isolation Rules.'
    });

    const parsedModules = rows.map(r => {
      let deps: string[] = [];
      try {
        deps = typeof r.dependencies === 'string' ? JSON.parse(r.dependencies || '[]') : (Array.isArray(r.dependencies) ? r.dependencies : []);
      } catch {
        deps = [];
      }
      return {
        project_slug: r.project_slug,
        category: r.category,
        module_name: r.module_name,
        content: r.content,
        updated_at: r.updated_at,
        dependencies: deps
      };
    });

    return {
      ok: true,
      projectSlug,
      syncedCount: rows.length,
      modules: parsedModules
    };
  }

  /**
   * Run full security audit on project files or stored modules
   */
  public auditSecurity(projectSlug?: string): SecurityAuditResult {
    const slug = projectSlug || this.projectSlug;
    if (slug === this.projectSlug) {
      const allFiles = this.hasher.scanFiles();
      const targetFiles = allFiles.filter(f => {
        const lf = f.toLowerCase();
        return !lf.startsWith('tests/') &&
               !lf.startsWith('test/') &&
               !lf.includes('/tests/') &&
               !lf.includes('/fixtures/') &&
               !lf.endsWith('.test.ts') &&
               !lf.endsWith('.spec.ts');
      });
      const filesToAudit = targetFiles.length > 0 ? targetFiles : allFiles;
      const auditor = new SecurityAuditor(this.workspacePath, this.projectSlug);
      return auditor.auditFiles(filesToAudit);
    }

    // For non-active project (e.g. synced from MCP vault or other stored projects in DB)
    const auditor = new SecurityAuditor('', slug);
    const rawDb = this.db.getRawDb();
    const issues: SecurityIssue[] = [];

    // 1. Audit modules in project_memory
    try {
      const modules = rawDb.prepare(`
        SELECT module_name, category, content
        FROM project_memory
        WHERE project_slug = ?
      `).all(slug) as any[];

      for (const m of modules) {
        const fakePath = `modules/${m.category}/${m.module_name}`;
        const fIssues = auditor.auditSingleFile(fakePath, m.content || '');
        issues.push(...fIssues);
      }
    } catch {}

    // 2. Audit code_nodes if any
    try {
      const nodes = this.db.findNodes(slug);
      for (const node of nodes) {
        if (node.metadata && typeof node.metadata === 'object' && (node.metadata as any).content) {
          const content = (node.metadata as any).content as string;
          const fIssues = auditor.auditSingleFile(node.file_path, content);
          for (const iss of fIssues) {
            if (!issues.some(x => x.id === iss.id)) {
              issues.push(iss);
            }
          }
        }
      }
    } catch {}

    return auditor.calculateAuditScore(issues);
  }

  /**
   * Run full performance audit (N+1 queries and missing foreign key indexes)
   */
  public auditPerformance(projectSlug?: string): PerformanceAuditResult {
    const slug = projectSlug || this.projectSlug;
    if (slug === this.projectSlug) {
      const allFiles = this.hasher.scanFiles();
      const targetFiles = allFiles.filter(f => {
        const lf = f.toLowerCase();
        return !lf.startsWith('tests/') &&
               !lf.startsWith('test/') &&
               !lf.includes('/tests/') &&
               !lf.includes('/fixtures/') &&
               !lf.endsWith('.test.ts') &&
               !lf.endsWith('.spec.ts');
      });
      const filesToAudit = targetFiles.length > 0 ? targetFiles : allFiles;
      const auditor = new PerformanceAuditor(this.workspacePath, this.projectSlug, this.db);
      return auditor.auditFiles(filesToAudit);
    }

    // For non-active project (e.g. synced from MCP vault or other stored projects in DB)
    const auditor = new PerformanceAuditor('', slug, this.db);
    const rawDb = this.db.getRawDb();
    const nPlusOneFindings: any[] = [];
    const missingIndexFindings: any[] = [];

    try {
      const modules = rawDb.prepare(`
        SELECT module_name, category, content
        FROM project_memory
        WHERE project_slug = ?
      `).all(slug) as any[];

      for (const m of modules) {
        const fakePath = `modules/${m.category}/${m.module_name}`;
        const findings = auditor.detectNPlusOneInFile(fakePath, m.content || '');
        nPlusOneFindings.push(...findings);
      }
    } catch {}

    let score = 100;
    score -= nPlusOneFindings.length * 20;
    score -= missingIndexFindings.length * 10;
    score = Math.max(0, Math.min(100, score));

    let health: 'OPTIMAL' | 'WARNING' | 'CRITICAL' = 'OPTIMAL';
    if (score < 60) health = 'CRITICAL';
    else if (score < 85) health = 'WARNING';

    return {
      projectSlug: slug,
      score,
      health,
      totalFindings: nPlusOneFindings.length + missingIndexFindings.length,
      nPlusOneCount: nPlusOneFindings.length,
      missingIndexCount: missingIndexFindings.length,
      nPlusOneFindings,
      missingIndexFindings
    };
  }
}
