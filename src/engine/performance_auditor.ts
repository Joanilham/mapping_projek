/**
 * Global Performance Auditor Engine (v2.0)
 * 3D N+1 Query Detection & Cross-File Schema Differ for Missing Indexes.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { MemoryDatabase } from '../db/database.js';

export interface NPlusOneFinding {
  id: string;
  dimension: 'DIRECT_QUERY_IN_LOOP' | 'INTERPROCEDURAL_CALL_IN_LOOP' | 'LAZY_LOADING_WITHOUT_EAGER';
  filePath: string;
  loopLineNumber: number;
  queryLineNumber: number;
  loopSnippet: string;
  querySnippet: string;
  description: string;
  recommendation: string;
  callChain?: string[];
}

export interface MissingIndexFinding {
  id: string;
  table: string;
  column: string;
  filePath: string;
  lineNumber: number;
  description: string;
  suggestedMigration: string;
  suggestedSql: string;
}

export interface PerformanceAuditResult {
  projectSlug: string;
  score: number; // 0 - 100
  health: 'OPTIMAL' | 'WARNING' | 'CRITICAL';
  totalFindings: number;
  nPlusOneCount: number;
  missingIndexCount: number;
  nPlusOneFindings: NPlusOneFinding[];
  missingIndexFindings: MissingIndexFinding[];
}

export class PerformanceAuditor {
  private workspacePath: string;
  private projectSlug: string;
  private db?: MemoryDatabase;

  constructor(workspacePath: string, projectSlug: string, db?: MemoryDatabase) {
    this.workspacePath = workspacePath;
    this.projectSlug = projectSlug;
    this.db = db;
  }

  // Regex patterns detecting query executions across languages
  private static readonly DB_QUERY_PATTERNS = [
    // PHP Laravel & PDO
    /\b(?:DB::|[A-Z][a-zA-Z0-9_]*::)(?:table|where|find|findOrFail|first|get|all|select|create)\s*\(/,
    /\$(?:pdo|db|conn)->(?:query|prepare|exec)\s*\(/,
    /->(?:where|find|get|all|first|select)\s*\(/,
    /\bmysqli_query\s*\(/,
    // Python SQLAlchemy / Django ORM
    /\b(?:session|db)\.(?:query|execute|add)\s*\(/,
    /\b[A-Z][a-zA-Z0-9_]*\.objects\.(?:filter|get|all|create)\s*\(/,
    // Go GORM / database/sql
    /\b(?:db|tx)\.(?:Query|QueryRow|Exec|Find|First|Where|Model|Table)\s*\(/,
    // JS/TS Prisma / TypeORM / Raw DB
    /\b(?:prisma|repo|repository)\.[a-zA-Z0-9_]+\.(?:findMany|findUnique|findFirst|create|update)\s*\(/,
    /\b(?:pool|client|db)\.(?:query|raw|\$queryRaw)\s*\(/
  ];

  // Regex detecting loop blocks
  private static readonly LOOP_PATTERNS = [
    /\bforeach\s*\(([\s\S]*?)\)/,
    /\bfor\s*\(([\s\S]*?)\)/,
    /\bwhile\s*\(([\s\S]*?)\)/,
    /\bfor\s+[a-zA-Z0-9_,\s]+\s+in\s+/,
    /\bfor\s+[a-zA-Z0-9_,\s]+:=\s*range\s+/,
    /\.(?:forEach|map)\s*\(\s*(?:async\s*)?(?:\([^)]*\)|[a-zA-Z0-9_]+)\s*=>/
  ];

  /**
   * Run full performance audit across files
   */
  public auditFiles(filePaths: string[]): PerformanceAuditResult {
    const nPlusOneFindings: NPlusOneFinding[] = [];
    const missingIndexFindings: MissingIndexFinding[] = [];

    // 1. Audit N+1 Queries
    for (const relPath of filePaths) {
      const fullPath = path.isAbsolute(relPath) ? relPath : path.join(this.workspacePath, relPath);
      if (!fs.existsSync(fullPath)) continue;
      const stat = fs.statSync(fullPath);
      if (!stat.isFile()) continue;

      const content = fs.readFileSync(fullPath, 'utf-8');
      const findings = this.detectNPlusOneInFile(relPath, content);
      nPlusOneFindings.push(...findings);
    }

    // 2. Cross-File Schema Differ for Missing Indexes
    const schemaFindings = this.detectMissingIndexes(filePaths);
    missingIndexFindings.push(...schemaFindings);

    // Calculate performance score
    let score = 100;
    // Each direct N+1 or interprocedural query in loop costs 20 pts
    score -= nPlusOneFindings.length * 20;
    // Each unindexed foreign key costs 10 pts
    score -= missingIndexFindings.length * 10;
    score = Math.max(0, Math.min(100, score));

    let health: 'OPTIMAL' | 'WARNING' | 'CRITICAL' = 'OPTIMAL';
    if (score < 60) health = 'CRITICAL';
    else if (score < 85) health = 'WARNING';

    return {
      projectSlug: this.projectSlug,
      score,
      health,
      totalFindings: nPlusOneFindings.length + missingIndexFindings.length,
      nPlusOneCount: nPlusOneFindings.length,
      missingIndexCount: missingIndexFindings.length,
      nPlusOneFindings,
      missingIndexFindings
    };
  }

  /**
   * Strip comments, regexes, and string literals to accurately compute code tokens & braces
   */
  public static stripNonCodeTokens(line: string): string {
    return line
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/, '')
      .replace(/#.*$/, '')
      .replace(/\/(?![*\/])(?:[^\/\\]|\\.)+\/[gimsuy]*/g, '')
      .replace(/"(?:[^"\\]|\\.)*"/g, '""')
      .replace(/'(?:[^'\\]|\\.)*'/g, "''")
      .replace(/`(?:[^`\\]|\\.)*`/g, '``');
  }

  /**
   * Detect 3D N+1 Queries in a single file
   */
  public detectNPlusOneInFile(relPath: string, content: string): NPlusOneFinding[] {
    const findings: NPlusOneFinding[] = [];
    const lines = content.split('\n');

    let currentLoopDepth = 0;
    let loopStartLine = 0;
    let loopSnippet = '';
    let loopBraceDepth = 0;

    for (let i = 0; i < lines.length; i++) {
      const lineNum = i + 1;
      const line = lines[i];
      const trimmed = line.trim();

      // Skip pure comment lines
      if (
        trimmed.startsWith('//') ||
        trimmed.startsWith('*') ||
        trimmed.startsWith('/*') ||
        trimmed.startsWith('#')
      ) {
        continue;
      }

      const codeTokens = PerformanceAuditor.stripNonCodeTokens(trimmed);

      // Check loop entry on code tokens
      let isLoopEntry = false;
      for (const loopPat of PerformanceAuditor.LOOP_PATTERNS) {
        if (loopPat.test(codeTokens)) {
          isLoopEntry = true;
          currentLoopDepth++;
          loopStartLine = lineNum;
          loopSnippet = trimmed;
          break;
        }
      }

      // Track curly braces using cleaned code tokens
      if (currentLoopDepth > 0) {
        const openBraces = (codeTokens.match(/\{/g) || []).length;
        const closeBraces = (codeTokens.match(/\}/g) || []).length;
        loopBraceDepth += (openBraces - closeBraces);

        // Check Dimension 1: Direct DB Query inside loop
        for (const qPat of PerformanceAuditor.DB_QUERY_PATTERNS) {
          if (qPat.test(codeTokens)) {
            findings.push({
              id: `perf_n1_${relPath}_${lineNum}`,
              dimension: 'DIRECT_QUERY_IN_LOOP',
              filePath: relPath,
              loopLineNumber: loopStartLine,
              queryLineNumber: lineNum,
              loopSnippet,
              querySnippet: trimmed,
              description: `Operasi Database Query terdeteksi langsung di dalam perulangan loop baris ${loopStartLine}. Ini memicu N+1 query yang membebani database per baris data.`,
              recommendation: 'Gunakan Eager Loading (contoh: with() di Laravel, select_related()/prefetch_related() di Django, Preload() di Go GORM, atau batch query WHERE IN).'
            });
            break;
          }
        }

        // Check Dimension 3: Lazy-Loaded ORM Relationship Property Access in Loop
        // e.g. $user->orders, user.orders, order.Customer.Name
        const lazyAccessMatch = codeTokens.match(/\b(?:\$?[a-zA-Z0-9_]+)->([a-zA-Z0-9_]+)->/);
        if (lazyAccessMatch && !codeTokens.includes('where') && !codeTokens.includes('with')) {
          findings.push({
            id: `perf_lazy_${relPath}_${lineNum}`,
            dimension: 'LAZY_LOADING_WITHOUT_EAGER',
            filePath: relPath,
            loopLineNumber: loopStartLine,
            queryLineNumber: lineNum,
            loopSnippet,
            querySnippet: trimmed,
            description: `Akses relasi ORM bertingkat '${lazyAccessMatch[0]}' di dalam loop tanpa eager-loading eksplisit.`,
            recommendation: `Muat relasi '${lazyAccessMatch[1]}' secara eager di level query utama sebelum loop.`
          });
        }

        // Check if loop exited
        if (loopBraceDepth <= 0 && isLoopEntry === false) {
          currentLoopDepth = 0;
          loopBraceDepth = 0;
        }
      }
    }

    return findings;
  }

  /**
   * Cross-File Schema Differ: Catalogs foreign keys and compares against defined indexes
   */
  public detectMissingIndexes(filePaths: string[]): MissingIndexFinding[] {
    const findings: MissingIndexFinding[] = [];
    const foreignKeys: Array<{ table: string; column: string; filePath: string; line: number }> = [];
    const definedIndexes = new Set<string>(); // "table:column"

    for (const relPath of filePaths) {
      const fullPath = path.isAbsolute(relPath) ? relPath : path.join(this.workspacePath, relPath);
      if (!fs.existsSync(fullPath)) continue;
      const stat = fs.statSync(fullPath);
      if (!stat.isFile()) continue;

      const content = fs.readFileSync(fullPath, 'utf-8');
      const lines = content.split('\n');

      let currentTable = '';

      for (let i = 0; i < lines.length; i++) {
        const lineNum = i + 1;
        const line = lines[i];
        const trimmed = line.trim();

        // Skip comments in schema files
        if (
          trimmed.startsWith('//') ||
          trimmed.startsWith('*') ||
          trimmed.startsWith('/*') ||
          trimmed.startsWith('#')
        ) {
          continue;
        }

        // 1. Detect Table Definition in Migrations or Schemas
        const tableMatch = line.match(/Schema::(?:create|table)\s*\(\s*['"]([a-zA-Z0-9_]+)['"]/);
        if (tableMatch) {
          currentTable = tableMatch[1];
        }

        const modelTableMatch = line.match(/(?:__tablename__|protected\s+\$table)\s*=\s*['"]([a-zA-Z0-9_]+)['"]/);
        if (modelTableMatch) {
          currentTable = modelTableMatch[1];
        }

        const createTableSqlMatch = line.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"']?([a-zA-Z0-9_]+)[`"']?/i);
        if (createTableSqlMatch) {
          currentTable = createTableSqlMatch[1];
        }

        // 2. Detect Foreign Keys
        // Laravel: $table->foreignId('user_id'), $table->unsignedBigInteger('order_id'), $table->foreign('product_id')
        const laravelFk = line.match(/\$table->(?:foreignId|foreign)\s*\(\s*['"]([a-zA-Z0-9_]+)['"]/);
        if (laravelFk) {
          foreignKeys.push({
            table: currentTable || 'unknown_table',
            column: laravelFk[1],
            filePath: relPath,
            line: lineNum
          });
        }

        // Python SQLAlchemy / Django ForeignKey
        const pyFk = line.match(/ForeignKey\s*\(\s*['"]([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)['"]/);
        if (pyFk) {
          foreignKeys.push({
            table: currentTable || 'unknown_table',
            column: pyFk[2].endsWith('_id') ? pyFk[2] : `${pyFk[1]}_id`,
            filePath: relPath,
            line: lineNum
          });
        }

        // Generic Foreign Key column convention: column name ending with _id
        const genericFk = line.match(/\b([a-zA-Z0-9_]+_id)\b/);
        if (genericFk && (line.includes('$table->') || line.includes('mapped_column') || line.includes('Column'))) {
          const col = genericFk[1];
          if (!foreignKeys.some(f => f.table === currentTable && f.column === col)) {
            foreignKeys.push({
              table: currentTable || 'unknown_table',
              column: col,
              filePath: relPath,
              line: lineNum
            });
          }
        }

        // 3. Detect Defined Indexes
        // Laravel: $table->index('user_id'), $table->unique('user_id')
        const laravelIndex = line.match(/\$table->(?:index|unique)\s*\(\s*(?:['"]([a-zA-Z0-9_]+)['"]|\[([^\]]+)\])/);
        if (laravelIndex) {
          if (laravelIndex[1]) {
            definedIndexes.add(`${currentTable}:${laravelIndex[1]}`);
          }
          if (laravelIndex[2]) {
            const cols = laravelIndex[2].split(',').map(c => c.replace(/['"\s]/g, ''));
            for (const col of cols) definedIndexes.add(`${currentTable}:${col}`);
          }
        }

        // SQL: CREATE INDEX ... ON table (col)
        const sqlIndex = line.match(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+[a-zA-Z0-9_]+\s+ON\s+[`"']?([a-zA-Z0-9_]+)[`"']?\s*\(\s*[`"']?([a-zA-Z0-9_]+)[`"']?\s*\)/i);
        if (sqlIndex) {
          definedIndexes.add(`${sqlIndex[1]}:${sqlIndex[2]}`);
        }

        // Django db_index=True
        if (/db_index\s*=\s*True/.test(line)) {
          const m = line.match(/([a-zA-Z0-9_]+)\s*=/);
          if (m) definedIndexes.add(`${currentTable}:${m[1]}`);
        }
      }
    }

    // Compare Foreign Keys against Indexes
    for (const fk of foreignKeys) {
      if (!definedIndexes.has(`${fk.table}:${fk.column}`)) {
        findings.push({
          id: `perf_idx_${fk.table}_${fk.column}`,
          table: fk.table,
          column: fk.column,
          filePath: fk.filePath,
          lineNumber: fk.line,
          description: `Foreign key '${fk.column}' pada tabel '${fk.table}' tidak memiliki index database. Ini memicu FULL TABLE SCAN setiap kali dilakukan query JOIN atau filter WHERE.`,
          suggestedMigration: `$table->index('${fk.column}');`,
          suggestedSql: `CREATE INDEX idx_${fk.table}_${fk.column} ON ${fk.table} (${fk.column});`
        });
      }
    }

    return findings;
  }
}
