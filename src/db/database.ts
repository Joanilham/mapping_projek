import { DatabaseSync } from 'node:sqlite';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { ProjectMeta, ModuleMemory, SessionCheckpoint, FileChecksum, ModuleCategory, CodeNode, CodeEdge, NodeType, RelationType } from '../types/index.js';

export class MemoryDatabase {
  private db: DatabaseSync;
  public dbPath: string;

  constructor(workspacePath: string, customDbPath?: string) {
    if (customDbPath) {
      this.dbPath = customDbPath;
    } else {
      const memoryDir = path.join(workspacePath, '.project-memory');
      if (!fs.existsSync(memoryDir)) {
        fs.mkdirSync(memoryDir, { recursive: true });
        // Auto create .gitignore inside .project-memory
        fs.writeFileSync(path.join(memoryDir, '.gitignore'), '# Ignore memory sqlite db\n*.db\n*.db-journal\n');
      }
      this.dbPath = path.join(memoryDir, 'memory.db');
    }

    this.db = new DatabaseSync(this.dbPath);
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;

      CREATE TABLE IF NOT EXISTS project_meta (
        project_slug TEXT PRIMARY KEY,
        name TEXT,
        root_path TEXT,
        system_overview TEXT DEFAULT '',
        rules_and_conventions TEXT DEFAULT '',
        last_active_task TEXT DEFAULT '',
        last_commit_hash TEXT DEFAULT '',
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS project_memory (
        project_slug TEXT NOT NULL,
        category TEXT NOT NULL,
        module_name TEXT NOT NULL,
        content TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        dependencies TEXT DEFAULT '[]',
        PRIMARY KEY (project_slug, category, module_name)
      );

      CREATE TABLE IF NOT EXISTS module_memory (
        id TEXT PRIMARY KEY,
        project_slug TEXT,
        module_name TEXT,
        category TEXT,
        summary TEXT,
        key_files TEXT,
        dependencies TEXT,
        content_hash TEXT DEFAULT '',
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(project_slug, category, module_name)
      );

      CREATE TABLE IF NOT EXISTS session_checkpoints (
        id TEXT PRIMARY KEY,
        project_slug TEXT,
        task_summary TEXT,
        next_steps TEXT,
        active_files TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS file_checksums (
        project_slug TEXT,
        file_path TEXT,
        hash TEXT,
        last_modified INTEGER,
        updated_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY(project_slug, file_path)
      );

      CREATE TABLE IF NOT EXISTS decision_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_slug TEXT,
        decision_title TEXT,
        reason TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS code_nodes (
        id TEXT PRIMARY KEY,
        project_slug TEXT,
        file_path TEXT,
        node_type TEXT,
        name TEXT,
        line_start INTEGER,
        line_end INTEGER,
        signature TEXT,
        metadata TEXT DEFAULT '{}',
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_code_nodes_lookup ON code_nodes(project_slug, file_path);
      CREATE INDEX IF NOT EXISTS idx_code_nodes_type_name ON code_nodes(project_slug, node_type, name);

      CREATE TABLE IF NOT EXISTS code_edges (
        id TEXT PRIMARY KEY,
        project_slug TEXT,
        source_id TEXT,
        target_id TEXT,
        relation_type TEXT,
        metadata TEXT DEFAULT '{}',
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_code_edges_source ON code_edges(project_slug, source_id);
      CREATE INDEX IF NOT EXISTS idx_code_edges_target ON code_edges(project_slug, target_id);
    `);

    // Migration for module_memory to support composite key (project_slug, category, module_name)
    try {
      const tableInfo = this.db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='module_memory'").get() as any;
      if (tableInfo && tableInfo.sql && !tableInfo.sql.includes('category, module_name')) {
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS module_memory_temp (
            id TEXT PRIMARY KEY,
            project_slug TEXT,
            module_name TEXT,
            category TEXT,
            summary TEXT,
            key_files TEXT,
            dependencies TEXT,
            content_hash TEXT DEFAULT '',
            updated_at TEXT DEFAULT (datetime('now')),
            UNIQUE(project_slug, category, module_name)
          );
          INSERT OR IGNORE INTO module_memory_temp SELECT id, project_slug, module_name, category, summary, key_files, dependencies, content_hash, updated_at FROM module_memory;
          DROP TABLE module_memory;
          ALTER TABLE module_memory_temp RENAME TO module_memory;
        `);
      }
    } catch {}
  }

  public getRawDb(): DatabaseSync {
    return this.db;
  }

  // --- Project Meta ---
  public getProjectMeta(projectSlug: string): ProjectMeta | null {
    const stmt = this.db.prepare('SELECT * FROM project_meta WHERE project_slug = ?');
    const row = stmt.get(projectSlug) as any;
    if (!row) return null;
    return {
      project_slug: row.project_slug,
      name: row.name || row.project_slug,
      root_path: row.root_path || '',
      system_overview: row.system_overview || '',
      rules_and_conventions: row.rules_and_conventions || '',
      last_active_task: row.last_active_task || '',
      last_commit_hash: row.last_commit_hash || '',
      updated_at: row.updated_at
    };
  }

  public saveProjectMeta(meta: Partial<ProjectMeta> & { project_slug: string }): void {
    const existing = this.getProjectMeta(meta.project_slug);
    const now = new Date().toISOString();

    if (existing) {
      const stmt = this.db.prepare(`
        UPDATE project_meta
        SET name = ?, root_path = ?, system_overview = ?, rules_and_conventions = ?,
            last_active_task = ?, last_commit_hash = ?, updated_at = ?
        WHERE project_slug = ?
      `);
      stmt.run(
        meta.name ?? existing.name,
        meta.root_path ?? existing.root_path,
        meta.system_overview ?? existing.system_overview,
        meta.rules_and_conventions ?? existing.rules_and_conventions,
        meta.last_active_task ?? existing.last_active_task,
        meta.last_commit_hash ?? existing.last_commit_hash ?? '',
        now,
        meta.project_slug
      );
    } else {
      const stmt = this.db.prepare(`
        INSERT INTO project_meta (project_slug, name, root_path, system_overview, rules_and_conventions, last_active_task, last_commit_hash, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        meta.project_slug,
        meta.name ?? meta.project_slug,
        meta.root_path ?? '',
        meta.system_overview ?? '',
        meta.rules_and_conventions ?? '',
        meta.last_active_task ?? '',
        meta.last_commit_hash ?? '',
        now
      );
    }
  }

  // --- Module Memory ---
  public getModules(projectSlug: string, category?: string): ModuleMemory[] {
    let query = 'SELECT * FROM module_memory WHERE project_slug = ?';
    const params: any[] = [projectSlug];

    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }
    query += ' ORDER BY module_name ASC';

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as any[];

    return rows.map((r) => ({
      id: r.id,
      project_slug: r.project_slug,
      module_name: r.module_name,
      category: r.category as ModuleCategory,
      summary: r.summary,
      key_files: JSON.parse(r.key_files || '[]'),
      dependencies: JSON.parse(r.dependencies || '[]'),
      content_hash: r.content_hash || '',
      updated_at: r.updated_at
    }));
  }

  public getModule(projectSlug: string, moduleName: string, category?: string): ModuleMemory | null {
    let stmt;
    let r: any;
    if (category) {
      stmt = this.db.prepare('SELECT * FROM module_memory WHERE project_slug = ? AND module_name = ? AND category = ?');
      r = stmt.get(projectSlug, moduleName, category);
    } else {
      stmt = this.db.prepare('SELECT * FROM module_memory WHERE project_slug = ? AND module_name = ? LIMIT 1');
      r = stmt.get(projectSlug, moduleName);
    }
    if (!r) return null;

    return {
      id: r.id,
      project_slug: r.project_slug,
      module_name: r.module_name,
      category: r.category as ModuleCategory,
      summary: r.summary,
      key_files: JSON.parse(r.key_files || '[]'),
      dependencies: JSON.parse(r.dependencies || '[]'),
      content_hash: r.content_hash || '',
      updated_at: r.updated_at
    };
  }

  public saveModule(mod: Omit<ModuleMemory, 'id' | 'updated_at'>): void {
    const id = `${mod.project_slug}:${mod.category}:${mod.module_name}`;
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO module_memory (id, project_slug, module_name, category, summary, key_files, dependencies, content_hash, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_slug, category, module_name) DO UPDATE SET
        summary = excluded.summary,
        key_files = excluded.key_files,
        dependencies = excluded.dependencies,
        content_hash = excluded.content_hash,
        updated_at = excluded.updated_at
    `);
    stmt.run(
      id,
      mod.project_slug,
      mod.module_name,
      mod.category,
      mod.summary,
      JSON.stringify(mod.key_files),
      JSON.stringify(mod.dependencies),
      mod.content_hash || '',
      now
    );

    const pmStmt = this.db.prepare(`
      INSERT INTO project_memory (project_slug, category, module_name, content, updated_at, dependencies)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_slug, category, module_name) DO UPDATE SET
        content = excluded.content,
        updated_at = excluded.updated_at,
        dependencies = excluded.dependencies
    `);
    pmStmt.run(
      mod.project_slug,
      mod.category,
      mod.module_name,
      mod.summary,
      now,
      JSON.stringify(mod.dependencies)
    );
  }

  public deleteModule(projectSlug: string, moduleName: string, category?: string): boolean {
    let result;
    if (category) {
      const stmt = this.db.prepare('DELETE FROM module_memory WHERE project_slug = ? AND module_name = ? AND category = ?');
      result = stmt.run(projectSlug, moduleName, category);
      this.db.prepare('DELETE FROM project_memory WHERE project_slug = ? AND module_name = ? AND category = ?').run(projectSlug, moduleName, category);
    } else {
      const stmt = this.db.prepare('DELETE FROM module_memory WHERE project_slug = ? AND module_name = ?');
      result = stmt.run(projectSlug, moduleName);
      this.db.prepare('DELETE FROM project_memory WHERE project_slug = ? AND module_name = ?').run(projectSlug, moduleName);
    }
    return result.changes > 0;
  }

  // --- Session Checkpoints ---
  public saveCheckpoint(cp: Omit<SessionCheckpoint, 'id' | 'created_at'>): SessionCheckpoint {
    const id = `cp_${Date.now()}`;
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO session_checkpoints (id, project_slug, task_summary, next_steps, active_files, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id,
      cp.project_slug,
      cp.task_summary,
      cp.next_steps,
      JSON.stringify(cp.active_files),
      now
    );

    // Also update project_meta's last_active_task
    this.saveProjectMeta({
      project_slug: cp.project_slug,
      last_active_task: cp.task_summary
    });

    return {
      id,
      project_slug: cp.project_slug,
      task_summary: cp.task_summary,
      next_steps: cp.next_steps,
      active_files: cp.active_files,
      created_at: now
    };
  }

  public getLatestCheckpoint(projectSlug: string): SessionCheckpoint | null {
    const stmt = this.db.prepare(`
      SELECT * FROM session_checkpoints
      WHERE project_slug = ?
      ORDER BY id DESC, created_at DESC
      LIMIT 1
    `);
    const r = stmt.get(projectSlug) as any;
    if (!r) return null;

    return {
      id: r.id,
      project_slug: r.project_slug,
      task_summary: r.task_summary,
      next_steps: r.next_steps,
      active_files: JSON.parse(r.active_files || '[]'),
      created_at: r.created_at
    };
  }

  public getCheckpoints(projectSlug: string, limit: number = 5): SessionCheckpoint[] {
    const stmt = this.db.prepare(`
      SELECT * FROM session_checkpoints
      WHERE project_slug = ?
      ORDER BY id DESC, created_at DESC
      LIMIT ?
    `);
    const rows = stmt.all(projectSlug, limit) as any[];

    return rows.map((r) => ({
      id: r.id,
      project_slug: r.project_slug,
      task_summary: r.task_summary,
      next_steps: r.next_steps,
      active_files: JSON.parse(r.active_files || '[]'),
      created_at: r.created_at
    }));
  }

  // --- File Checksums ---
  public getFileChecksumsMap(projectSlug: string): Map<string, FileChecksum> {
    const stmt = this.db.prepare('SELECT * FROM file_checksums WHERE project_slug = ?');
    const rows = stmt.all(projectSlug) as any[];
    const map = new Map<string, FileChecksum>();

    for (const r of rows) {
      map.set(r.file_path, {
        file_path: r.file_path,
        hash: r.hash,
        last_modified: r.last_modified,
        updated_at: r.updated_at
      });
    }
    return map;
  }

  public saveFileChecksums(projectSlug: string, checksums: FileChecksum[]): void {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO file_checksums (project_slug, file_path, hash, last_modified, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(project_slug, file_path) DO UPDATE SET
        hash = excluded.hash,
        last_modified = excluded.last_modified,
        updated_at = excluded.updated_at
    `);

    for (const c of checksums) {
      stmt.run(projectSlug, c.file_path, c.hash, c.last_modified, now);
    }
  }

  public deleteFileChecksum(projectSlug: string, filePath: string): void {
    const stmt = this.db.prepare('DELETE FROM file_checksums WHERE project_slug = ? AND file_path = ?');
    stmt.run(projectSlug, filePath);
  }

  // --- Decision Log ---
  public recordDecision(projectSlug: string, title: string, reason: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO decision_log (project_slug, decision_title, reason)
      VALUES (?, ?, ?)
    `);
    stmt.run(projectSlug, title, reason);
  }

  public getDecisions(projectSlug: string, limit: number = 10): Array<{ id: number; title: string; reason: string; created_at: string }> {
    const stmt = this.db.prepare(`
      SELECT id, decision_title as title, reason, created_at
      FROM decision_log
      WHERE project_slug = ?
      ORDER BY id DESC
      LIMIT ?
    `);
    return stmt.all(projectSlug, limit) as any[];
  }

  // --- Code Graph (AST Nodes & Edges) ---
  public saveCodeNodes(nodes: CodeNode[]): void {
    if (nodes.length === 0) return;
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO code_nodes (id, project_slug, file_path, node_type, name, line_start, line_end, signature, metadata, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        file_path = excluded.file_path,
        node_type = excluded.node_type,
        name = excluded.name,
        line_start = excluded.line_start,
        line_end = excluded.line_end,
        signature = excluded.signature,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at
    `);

    for (const n of nodes) {
      stmt.run(
        n.id,
        n.project_slug,
        n.file_path,
        n.node_type,
        n.name,
        n.line_start,
        n.line_end,
        n.signature,
        JSON.stringify(n.metadata || {}),
        now
      );
    }
  }

  public saveCodeEdges(edges: CodeEdge[]): void {
    if (edges.length === 0) return;
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO code_edges (id, project_slug, source_id, target_id, relation_type, metadata, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        relation_type = excluded.relation_type,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at
    `);

    for (const e of edges) {
      stmt.run(
        e.id,
        e.project_slug,
        e.source_id,
        e.target_id,
        e.relation_type,
        JSON.stringify(e.metadata || {}),
        now
      );
    }
  }

  public clearFileGraph(projectSlug: string, filePath: string): void {
    const stmtNodes = this.db.prepare('DELETE FROM code_nodes WHERE project_slug = ? AND file_path = ?');
    stmtNodes.run(projectSlug, filePath);

    // Delete edges where either source or target belongs to this file
    const fileNodePrefix = `${projectSlug}:${filePath}:%`;
    const stmtEdges = this.db.prepare(`
      DELETE FROM code_edges
      WHERE project_slug = ? AND (source_id LIKE ? OR target_id LIKE ?)
    `);
    stmtEdges.run(projectSlug, fileNodePrefix, fileNodePrefix);
  }

  public clearProjectGraph(projectSlug: string): void {
    this.db.prepare('DELETE FROM code_nodes WHERE project_slug = ?').run(projectSlug);
    this.db.prepare('DELETE FROM code_edges WHERE project_slug = ?').run(projectSlug);
  }

  public getCodeNode(id: string): CodeNode | null {
    const stmt = this.db.prepare('SELECT * FROM code_nodes WHERE id = ?');
    const r = stmt.get(id) as any;
    if (!r) return null;
    return {
      id: r.id,
      project_slug: r.project_slug,
      file_path: r.file_path,
      node_type: r.node_type as NodeType,
      name: r.name,
      line_start: r.line_start,
      line_end: r.line_end,
      signature: r.signature,
      metadata: JSON.parse(r.metadata || '{}'),
      updated_at: r.updated_at
    };
  }

  public findNodes(
    projectSlug: string,
    filter?: { file_path?: string; node_type?: NodeType; name?: string }
  ): CodeNode[] {
    let query = 'SELECT * FROM code_nodes WHERE project_slug = ?';
    const params: any[] = [projectSlug];

    if (filter?.file_path) {
      query += ' AND file_path = ?';
      params.push(filter.file_path);
    }
    if (filter?.node_type) {
      query += ' AND node_type = ?';
      params.push(filter.node_type);
    }
    if (filter?.name) {
      query += ' AND name LIKE ?';
      params.push(`%${filter.name}%`);
    }

    query += ' ORDER BY file_path ASC, line_start ASC';
    const rows = this.db.prepare(query).all(...params) as any[];

    return rows.map((r) => ({
      id: r.id,
      project_slug: r.project_slug,
      file_path: r.file_path,
      node_type: r.node_type as NodeType,
      name: r.name,
      line_start: r.line_start,
      line_end: r.line_end,
      signature: r.signature,
      metadata: JSON.parse(r.metadata || '{}'),
      updated_at: r.updated_at
    }));
  }

  public getOutgoingEdges(projectSlug: string, sourceId: string): Array<{ edge: CodeEdge; targetNode: CodeNode | null }> {
    const stmt = this.db.prepare(`
      SELECT e.*, n.id as n_id, n.project_slug as n_project_slug, n.file_path as n_file_path,
             n.node_type as n_node_type, n.name as n_name, n.line_start as n_line_start,
             n.line_end as n_line_end, n.signature as n_signature, n.metadata as n_metadata
      FROM code_edges e
      LEFT JOIN code_nodes n ON e.target_id = n.id
      WHERE e.project_slug = ? AND e.source_id = ?
    `);
    const rows = stmt.all(projectSlug, sourceId) as any[];

    return rows.map((r) => {
      const edge: CodeEdge = {
        id: r.id,
        project_slug: r.project_slug,
        source_id: r.source_id,
        target_id: r.target_id,
        relation_type: r.relation_type as RelationType,
        metadata: JSON.parse(r.metadata || '{}'),
        updated_at: r.updated_at
      };

      const targetNode: CodeNode | null = r.n_id ? {
        id: r.n_id,
        project_slug: r.n_project_slug,
        file_path: r.n_file_path,
        node_type: r.n_node_type,
        name: r.n_name,
        line_start: r.n_line_start,
        line_end: r.n_line_end,
        signature: r.n_signature,
        metadata: JSON.parse(r.n_metadata || '{}')
      } : null;

      return { edge, targetNode };
    });
  }

  public getIncomingEdges(projectSlug: string, targetId: string): Array<{ edge: CodeEdge; sourceNode: CodeNode | null }> {
    const stmt = this.db.prepare(`
      SELECT e.*, n.id as n_id, n.project_slug as n_project_slug, n.file_path as n_file_path,
             n.node_type as n_node_type, n.name as n_name, n.line_start as n_line_start,
             n.line_end as n_line_end, n.signature as n_signature, n.metadata as n_metadata
      FROM code_edges e
      LEFT JOIN code_nodes n ON e.source_id = n.id
      WHERE e.project_slug = ? AND e.target_id = ?
    `);
    const rows = stmt.all(projectSlug, targetId) as any[];

    return rows.map((r) => {
      const edge: CodeEdge = {
        id: r.id,
        project_slug: r.project_slug,
        source_id: r.source_id,
        target_id: r.target_id,
        relation_type: r.relation_type as RelationType,
        metadata: JSON.parse(r.metadata || '{}'),
        updated_at: r.updated_at
      };

      const sourceNode: CodeNode | null = r.n_id ? {
        id: r.n_id,
        project_slug: r.n_project_slug,
        file_path: r.n_file_path,
        node_type: r.n_node_type,
        name: r.n_name,
        line_start: r.n_line_start,
        line_end: r.n_line_end,
        signature: r.n_signature,
        metadata: JSON.parse(r.n_metadata || '{}')
      } : null;

      return { edge, sourceNode };
    });
  }

  public getEndpoints(projectSlug: string): CodeNode[] {
    return this.findNodes(projectSlug, { node_type: 'endpoint' });
  }

  public getAllEdges(projectSlug: string): CodeEdge[] {
    const stmt = this.db.prepare('SELECT * FROM code_edges WHERE project_slug = ?');
    const rows = stmt.all(projectSlug) as any[];

    return rows.map((r) => ({
      id: r.id,
      project_slug: r.project_slug,
      source_id: r.source_id,
      target_id: r.target_id,
      relation_type: r.relation_type as RelationType,
      metadata: JSON.parse(r.metadata || '{}'),
      updated_at: r.updated_at
    }));
  }
}

