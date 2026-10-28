/**
 * mcp-memory // Architecture & Data Workbench
 * Visual Dashboard v2.5
 * Interactive 3-Mode Workspace & Multi-Project Memory System
 */

// ============================================================================
// 1. DATA MEMORI PROYEK (DENGAN DEPENDENSI TERHUBUNG & KODE FITUR NYATA)
// ============================================================================
let rawData = [
  {
    id: 1,
    project: "mapping-projek",
    category: "architecture",
    module: "system_overview",
    content: `### Fungsi Utama
Engine pemetaan struktur kode AST, penelusuran aliran data taint analysis, dan memory vault persisten lokal (0 Token LLM) untuk pair programming agentic AI.

### Komponen & Lokasi Berkas
- \`SessionManager\` (\`src/engine/session_manager.ts\`): Orkestrator utama siklus hidup proyek, hashing delta berkas, dan cold-start prompt.
- \`AstParser\` (\`src/parser/ast_parser.ts\`): Ekstraksi simbol AST Babel, decorator controller, dan route.
- \`DataFlowTracer\` (\`src/engine/data_flow.ts\`): Penelusuran aliran data interprosedural dan tainting.
- \`MemoryDatabase\` (\`src/db/database.ts\`): SQLite WAL storage lokal untuk metadata, nodes, edges, dan checkpoints.

### Alur Kerja & Aturan Teknis
- Bekerja secara lokal dan instan tanpa panggilan API cloud.
- Mengisolasi memori antar-proyek menggunakan slug berbasis \`lowercase-kebab-case\`.`,
    dependencies: ["db_engine", "cold_start"],
    updated_at: new Date().toISOString()
  },
  {
    id: 2,
    project: "mapping-projek",
    category: "architecture",
    module: "ast_parser",
    content: `### Fungsi Utama
Engine parser AST berbasis Babel parser dan traverse untuk mengekstrak deklarasi Class, Method, Function, Interface, HTTP Endpoints, dan relasi pemanggilan fungsi secara lokal (0 Token LLM).

### Komponen & Lokasi Berkas
- \`AstParser\` (\`src/parser/ast_parser.ts\`): Mem-parse file TypeScript/JavaScript, mengekstrak dekorator controller (@Controller, @Get, @Post), route Next.js, deklarasi tipe, dan call graph.

### Alur Kerja & Aturan Teknis
- Bekerja secara inkremental bersama DeltaHasher. Hanya mem-parse ulang file yang mengalami perubahan kode (added/modified).`,
    dependencies: ["db_engine", "delta_hasher"],
    updated_at: new Date().toISOString()
  },
  {
    id: 3,
    project: "mapping-projek",
    category: "architecture",
    module: "data_flow_tracer",
    content: `### Fungsi Utama
Engine penelusuran alur data (data-flow tracing) yang melintasi relasi HANDLES_ROUTE, CALLS, DEFINES, dan IMPORTS untuk menghasilkan rantai eksekusi dan diagram sekuensial Mermaid.

### Komponen & Lokasi Berkas
- \`DataFlowTracer\` (\`src/engine/data_flow.ts\`): Melakukan graph traversal dari entry point menuju controller, service, hingga database dengan proteksi siklus sirkular.

### Alur Kerja & Aturan Teknis
- Mengembalikan rantai eksekusi step-by-step dan diagram Mermaid otomatis untuk AI dan visualisasi interaktif.`,
    dependencies: ["ast_parser", "db_engine"],
    updated_at: new Date().toISOString()
  },
  {
    id: 4,
    project: "mapping-projek",
    category: "architecture",
    module: "di_resolver",
    content: `### Fungsi Utama
Modul resolusi lintas-file untuk Dependency Injection dan Interface-to-Implementation agar Call Graph tidak terputus saat bertemu antarmuka abstrak.

### Komponen & Lokasi Berkas
- \`DependencyInjectionResolver\` (\`src/engine/di_resolver.ts\`): Memetakan interface ke class implementasi, constructor parameter injection, dan resolusi polimorfik.

### Alur Kerja & Aturan Teknis
- Mengubah target edge CALLS dari interface abstrak menjadi method implementasi konkret.`,
    dependencies: ["system_overview"],
    updated_at: new Date().toISOString()
  },
  {
    id: 5,
    project: "mapping-projek",
    category: "architecture",
    module: "delta_hasher",
    content: `### Fungsi Utama
Engine deteksi selisih (delta) berkas berbasis MD5 hash dan timestamp mtime lokal untuk meminimalkan beban I/O pemetaan.

### Komponen & Lokasi Berkas
- \`DeltaHasher\` (\`src/parser/delta_hasher.ts\`): Memindai berkas proyek dengan filter ignore list ketat (.git, node_modules, dist, .project-memory).

### Alur Kerja & Aturan Teknis
- Menghasilkan daftar \`added\`, \`modified\`, \`deleted\`, dan \`unchanged\` files.`,
    dependencies: ["db_engine"],
    updated_at: new Date().toISOString()
  },
  {
    id: 6,
    project: "mapping-projek",
    category: "architecture",
    module: "cold_start",
    content: `### Fungsi Utama
Penyintesis ringkasan eksekutif cold-start instan (<400 token) untuk AI saat membuka kembali proyek tanpa membuang context window atau re-scanning berkas.

### Komponen & Lokasi Berkas
- \`ColdStartEngine\` (\`src/engine/cold_start.ts\`): Menggabungkan nama proyek, arsitektur inti, modul utama, dan checkpoint tugas terakhir.

### Alur Kerja & Aturan Teknis
- Disajikan via tool MCP \`bootstrap_project_session\` dan endpoint REST \`/api/project\`.`,
    dependencies: ["db_engine", "delta_hasher"],
    updated_at: new Date().toISOString()
  },
  {
    id: 7,
    project: "mapping-projek",
    category: "architecture",
    module: "sugiyama_layered_layout",
    content: `### Fungsi Utama
Algoritma penataan graf berjenjang (Sugiyama Layered Graph Drawing) murni dalam TypeScript/JavaScript untuk menyusun arsitektur sistem dari Layer 0 (Entry) hingga Layer 4 (Storage).

### Komponen & Lokasi Berkas
- \`computeSugiyamaLayout\` (\`public/app.js\`): Menghapus siklus dengan DFS, memetakan level layer, dan menyeimbangkan posisi X/Y simpul.`,
    dependencies: ["system_overview"],
    updated_at: new Date().toISOString()
  },
  {
    id: 8,
    project: "mapping-projek",
    category: "api",
    module: "mcp_server",
    content: `### Fungsi Utama
Model Context Protocol (MCP) server yang mengekspos tool cold-start, session checkpoints, dan modul memori ke AI IDE (Antigravity/Cursor/Claude).

### Komponen & Lokasi Berkas
- \`McpServer\` (\`src/mcp/server.ts\`): Mengimplementasikan transport StdioServerTransport dengan tools lengkap.
- \`CLI Launcher\` (\`src/cli/index.ts\`, \`bin/project-mapper.js\`): Command line interface.

### Alur Kerja & Aturan Teknis
- Berkomunikasi via standard I/O (stdio) sesuai standar resmi Model Context Protocol.`,
    dependencies: ["cold_start", "db_engine"],
    updated_at: new Date().toISOString()
  },
  {
    id: 9,
    project: "mapping-projek",
    category: "api",
    module: "taint_analysis_and_data_flow",
    content: `### Fungsi Utama
Pelacakan aliran data mendalam (Interprocedural Variable Slicing / Taint Analysis) untuk membuktikan apakah payload HTTP benar-benar mengalir ke database/API eksternal dan apakah telah disanitasi.

### Komponen & Lokasi Berkas
- \`InterproceduralDataFlowTracer\` (\`src/engine/data_flow.ts\`): Menganalisis intraprocedural AST def-use summary di tiap fungsi dan merangkainya lintas fungsi hingga ke sink.

### Alur Kerja & Aturan Teknis
- Sumber taint awal (Source): parameter fungsi pertama, \`req.body\`, \`req.params\`, \`req.query\`.
- Deteksi Sink: database write (\`.save\`, \`.insert\`, \`.update\`, \`.execute\`).`,
    dependencies: ["system_overview", "di_resolver"],
    updated_at: new Date().toISOString()
  },
  {
    id: 10,
    project: "mapping-projek",
    category: "database",
    module: "db_engine",
    content: `### Fungsi Utama
Penyimpanan persisten SQLite lokal berbasis \`node:sqlite\` bawaan Node 22 untuk menyimpan project metadata, modul memori, checksum berkas, AST code nodes, edges, dan checkpoints.

### Komponen & Lokasi Berkas
- \`MemoryDatabase\` (\`src/db/database.ts\`): Database wrapper dengan migrasi skema otomatis dan optimasi WAL mode.

### Alur Kerja & Aturan Teknis
- Terletak pada \`.project-memory/memory.db\` di dalam root workspace.`,
    dependencies: ["system_overview"],
    updated_at: new Date().toISOString()
  },
  {
    id: 11,
    project: "mapping-projek",
    category: "rules",
    module: "testing_protocol",
    content: `### Fungsi Utama
Suite automated unit & integration testing berbasis node:test bawaan Node 22 dan tsx runner untuk memvalidasi stabilitas database, hashing delta, cold-start, dan MCP server.

### Komponen & Lokasi Berkas
- \`tests/**/*.test.ts\`: Seluruh berkas unit test dan skenario integrasi.

### Alur Kerja & Aturan Teknis
- Dijalankan via \`npm test\` (\`tsx --test tests/**/*.test.ts\`). Semua tes harus pass 100% sebelum commit atau checkpoint.`,
    dependencies: ["db_engine", "delta_hasher", "cold_start", "mcp_server"],
    updated_at: new Date().toISOString()
  },
  {
    id: 12,
    project: "mapping-projek",
    category: "ui",
    module: "visual_dashboard",
    content: `### Fungsi Utama
Web application visual dashboard berbasis kanvas interaktif vis-network, vanilla CSS dark obsidian, dan REST API lokal untuk visualisasi graf arsitektur dan simulasi data flow.

### Komponen & Lokasi Berkas
- \`Dashboard Server\` (\`src/server/dashboard_server.ts\`): HTTP Server native node:http melayani REST API.
- \`Web App Frontend\` (\`public/index.html\`, \`public/styles.css\`, \`public/app.js\`): 3-Mode workspace.`,
    dependencies: ["data_flow_tracer", "db_engine"],
    updated_at: new Date().toISOString()
  }
];

// ============================================================================
// 2. REPOSITORI KODE FITUR NYATA & PETA KETERGANTUNGAN BERKAS
// ============================================================================
let projectFilesRegistry = [
  {
    id: "f_session_mgr",
    name: "session_manager.ts",
    path: "src/engine/session_manager.ts",
    project: "mapping-projek",
    gradleModule: ":engine",
    layer: "architecture",
    ownerModule: "system_overview",
    imports: ["f_database", "f_delta_hasher", "f_cold_start", "f_ast_parser", "f_data_flow"],
    stateContract: "ProjectBaseline, ColdStartDigest, CodebaseMapResult",
    code: `import * as path from 'node:path';
import * as fs from 'node:fs';
import { MemoryDatabase } from '../db/database.js';
import { DeltaHasher } from '../parser/delta_hasher.js';
import { ColdStartEngine } from './cold_start.js';
import { AstParser } from '../parser/ast_parser.js';
import { DataFlowTracer } from './data_flow.js';

export class SessionManager {
  public workspacePath: string;
  public projectSlug: string;
  public db: MemoryDatabase;
  public hasher: DeltaHasher;
  public coldStart: ColdStartEngine;
  public astParser: AstParser;
  public dataFlowTracer: DataFlowTracer;

  constructor(workspacePath: string, customDbPath?: string) {
    this.workspacePath = path.resolve(workspacePath);
    this.projectSlug = this.sanitizeSlug(path.basename(this.workspacePath));
    this.db = new MemoryDatabase(this.workspacePath, customDbPath);
    this.hasher = new DeltaHasher(this.workspacePath);
    this.coldStart = new ColdStartEngine(this.db);
    this.astParser = new AstParser();
    this.dataFlowTracer = new DataFlowTracer(this.db, this.projectSlug);
  }

  public sanitizeSlug(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'default-project';
  }

  public getColdStartDigest(): string {
    return this.coldStart.generateColdStartDigest(this.projectSlug);
  }

  public syncBaseline(): { added: number; modified: number; deleted: number; unchanged: number } {
    const delta = this.hasher.scanDelta(this.db.getFileChecksumsMap(this.projectSlug));
    const allCurrent = [...delta.added, ...delta.modified, ...delta.unchanged];
    this.db.saveFileChecksums(this.projectSlug, allCurrent);
    for (const d of delta.deleted) {
      this.db.deleteFileChecksum(this.projectSlug, d.file_path);
    }
    return {
      added: delta.added.length,
      modified: delta.modified.length,
      deleted: delta.deleted.length,
      unchanged: delta.unchanged.length
    };
  }
}`
  },
  {
    id: "f_database",
    name: "database.ts",
    path: "src/db/database.ts",
    gradleModule: ":db",
    layer: "database",
    ownerModule: "db_engine",
    imports: [],
    stateContract: "SQLite WAL Transaction, ModuleMemory, CodeNodes, CodeEdges",
    code: `import { DatabaseSync } from 'node:sqlite';
import * as path from 'node:path';
import * as fs from 'node:fs';

export class MemoryDatabase {
  private db: DatabaseSync;
  public dbPath: string;

  constructor(workspacePath: string, customDbPath?: string) {
    if (customDbPath) {
      this.dbPath = customDbPath;
    } else {
      const memoryDir = path.join(workspacePath, '.project-memory');
      if (!fs.existsSync(memoryDir)) fs.mkdirSync(memoryDir, { recursive: true });
      this.dbPath = path.join(memoryDir, 'memory.db');
    }
    this.db = new DatabaseSync(this.dbPath);
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(\`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      CREATE TABLE IF NOT EXISTS project_meta (project_slug TEXT PRIMARY KEY, name TEXT, updated_at TEXT);
      CREATE TABLE IF NOT EXISTS module_memory (id TEXT PRIMARY KEY, project_slug TEXT, module_name TEXT, category TEXT, summary TEXT, dependencies TEXT, updated_at TEXT);
      CREATE TABLE IF NOT EXISTS code_nodes (id TEXT PRIMARY KEY, project_slug TEXT, file_path TEXT, node_type TEXT, name TEXT, signature TEXT);
      CREATE TABLE IF NOT EXISTS code_edges (id TEXT PRIMARY KEY, project_slug TEXT, source_id TEXT, target_id TEXT, relation_type TEXT);
    \`);
  }
}`
  },
  {
    id: "f_ast_parser",
    name: "ast_parser.ts",
    path: "src/parser/ast_parser.ts",
    gradleModule: ":parser",
    layer: "architecture",
    ownerModule: "ast_parser",
    imports: ["f_database"],
    stateContract: "Babel AST ASTProgram, CodeNode[], CodeEdge[], ExtractedSymbols",
    code: `import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
const traverse = (_traverse as any).default || _traverse;

export class AstParser {
  public parseSourceFile(filePath: string, code: string, projectSlug: string) {
    const nodes = [];
    const edges = [];
    const ast = parse(code, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx', 'decorators-legacy']
    });

    traverse(ast, {
      ClassDeclaration(path) {
        nodes.push({ id: \`\${projectSlug}:\${filePath}:class:\${path.node.id.name}\`, name: path.node.id.name, node_type: 'class' });
      },
      FunctionDeclaration(path) {
        if (path.node.id) nodes.push({ id: \`\${projectSlug}:\${filePath}:func:\${path.node.id.name}\`, name: path.node.id.name, node_type: 'function' });
      }
    });

    return { nodes, edges };
  }
}`
  },
  {
    id: "f_data_flow",
    name: "data_flow.ts",
    path: "src/engine/data_flow.ts",
    gradleModule: ":engine",
    layer: "architecture",
    ownerModule: "data_flow_tracer",
    imports: ["f_database", "f_ast_parser", "f_di_resolver"],
    stateContract: "DataFlowTrace, VariableLineage, TaintSummary, MermaidDiagram",
    code: `export class DataFlowTracer {
  constructor(private db: any, private projectSlug: string) {}

  public traceRoute(routePath: string) {
    const entryNodes = this.db.findNodes(this.projectSlug, 'endpoint', routePath);
    const traceSteps = [];
    const visited = new Set();

    for (const entry of entryNodes) {
      this.dfsTrace(entry.id, traceSteps, visited);
    }
    return { steps: traceSteps, mermaid: this.renderMermaid(traceSteps) };
  }

  private dfsTrace(currentId: string, steps: any[], visited: Set<string>) {
    if (visited.has(currentId)) return;
    visited.add(currentId);
    const outgoing = this.db.getOutgoingEdges(this.projectSlug, currentId);
    for (const edge of outgoing) {
      steps.push({ from: edge.source_id, to: edge.target_id, relation: edge.relation_type });
      this.dfsTrace(edge.target_id, steps, visited);
    }
  }
}`
  },
  {
    id: "f_di_resolver",
    name: "di_resolver.ts",
    path: "src/engine/di_resolver.ts",
    gradleModule: ":engine",
    layer: "architecture",
    ownerModule: "di_resolver",
    imports: ["f_database"],
    stateContract: "InterfaceToImplementationMap, ResolvedCallsEdges",
    code: `export class DependencyInjectionResolver {
  public resolveImplementations(nodes: any[], edges: any[]) {
    const ifaceMap = new Map();
    for (const edge of edges) {
      if (edge.relation_type === 'implements') {
        ifaceMap.set(edge.target_id, edge.source_id);
      }
    }
    return edges.map(e => {
      if (e.relation_type === 'calls' && ifaceMap.has(e.target_id)) {
        return { ...e, target_id: ifaceMap.get(e.target_id), resolved: true };
      }
      return e;
    });
  }
}`
  },
  {
    id: "f_delta_hasher",
    name: "delta_hasher.ts",
    path: "src/parser/delta_hasher.ts",
    gradleModule: ":parser",
    layer: "architecture",
    ownerModule: "delta_hasher",
    imports: ["f_database"],
    stateContract: "FileChecksumMap, DeltaScanResult",
    code: `import * as crypto from 'node:crypto';
import * as fs from 'node:fs';

export class DeltaHasher {
  constructor(private workspace: string) {}

  public computeFileHash(absPath: string): string {
    const buffer = fs.readFileSync(absPath);
    return crypto.createHash('md5').update(buffer).digest('hex');
  }
}`
  },
  {
    id: "f_cold_start",
    name: "cold_start.ts",
    path: "src/engine/cold_start.ts",
    gradleModule: ":engine",
    layer: "architecture",
    ownerModule: "cold_start",
    imports: ["f_database"],
    stateContract: "CompactExecutiveDigest (<400 tokens)",
    code: `export class ColdStartEngine {
  constructor(private db: any) {}

  public generateColdStartDigest(projectSlug: string): string {
    const meta = this.db.getProjectMeta(projectSlug);
    const cp = this.db.getLatestCheckpoint(projectSlug);
    const modules = this.db.getModules(projectSlug);

    return \`# Project: \${meta?.name || projectSlug}
## System Overview: \${meta?.system_overview}
## Last Checkpoint: \${cp?.task_summary || 'Baseline Initialized'}
## Modules: \${modules.map((m: any) => m.module_name).join(', ')}\`;
  }
}`
  },
  {
    id: "f_mcp_server",
    name: "server.ts",
    path: "src/mcp/server.ts",
    gradleModule: ":api",
    layer: "api",
    ownerModule: "mcp_server",
    imports: ["f_session_mgr"],
    stateContract: "MCP StdioServerTransport, JSON-RPC 2.0 CallToolRequest",
    code: `import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

export function createMcpServer(manager: any) {
  const server = new Server({ name: 'project-mapper', version: '2.5.0' }, { capabilities: { tools: {} } });
  return server;
}`
  },
  {
    id: "f_dashboard_server",
    name: "dashboard_server.ts",
    path: "src/server/dashboard_server.ts",
    gradleModule: ":server",
    layer: "api",
    ownerModule: "visual_dashboard",
    imports: ["f_session_mgr"],
    stateContract: "HTTP REST API, Static File Server, No-Cache Stream",
    code: `import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';

export function startDashboardServer(options: any) {
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    // Serves /api/project, /api/graph, /api/trace, /api/file_content, and static assets
  });
  return server;
}`
  },
  {
    id: "f_app_js",
    name: "app.js",
    path: "public/app.js",
    gradleModule: ":ui",
    layer: "ui",
    ownerModule: "visual_dashboard",
    imports: ["f_dashboard_server"],
    stateContract: "vis.Network Canvas, 3-Mode State Engine, Telemetry Stream",
    code: `// Interactive Workbench Client - Mode 01, Mode 02, and Mode 03 Runtime Engine`
  }
];

// ============================================================================
// 3. SKENARIO SIMULASI ALIRAN DATA PIPELINE (MODE 3)
// ============================================================================
const pipelineScenarios = [
  {
    name: "01. Save Checkpoint & Baseline",
    title: "Session Checkpoint & Database WAL Transaction Pipeline",
    steps: [
      {
        step: 1,
        node: "POST /api/checkpoint",
        file: "dashboard_server.ts",
        layer: "REST API Gateway",
        desc: "Menerima payload JSON checkpoint dari AI IDE / antarmuka dashboard",
        payloadType: "HTTP JSON Payload",
        payload: JSON.stringify({
          task_summary: "Redesign visual dashboard v2.5 workbench",
          next_steps: "Semua 3 mode kanvas tersinkronisasi penuh"
        }, null, 2),
        metrics: {
          "HTTP Status": "200 OK",
          "Payload Size": "148 bytes",
          "Sanitized": "JSON.parse + Validation",
          "Sink Detected": "Database Write"
        }
      },
      {
        step: 2,
        node: "SessionManager.saveCheckpoint()",
        file: "session_manager.ts",
        layer: "Engine Core",
        desc: "Mengikat ringkasan tugas dan memvalidasi berkas aktif sesi",
        payloadType: "Domain SessionCheckpoint",
        payload: JSON.stringify({
          id: "cp_1793104055672",
          project_slug: "mapping-projek",
          active_files: ["src/engine/session_manager.ts", "public/app.js"]
        }, null, 2),
        metrics: {
          "Method": "saveCheckpoint()",
          "Execution Time": "0.42 ms",
          "Sanitizer": "path.resolve()",
          "Memory Impact": "48 KB"
        }
      },
      {
        step: 3,
        node: "DeltaHasher.scanDelta()",
        file: "delta_hasher.ts",
        layer: "Parser Delta Engine",
        desc: "Memindai file checksum untuk mendeteksi perubahan berkas",
        payloadType: "Checksum Map",
        payload: JSON.stringify({
          scanned: 16,
          added: 0,
          modified: 2,
          deleted: 0,
          unchanged: 14
        }, null, 2),
        metrics: {
          "Hasher": "MD5 Hex Digest",
          "Filter Rules": "Strict .gitignore bypass",
          "I/O Operations": "Optimized Stat Only"
        }
      },
      {
        step: 4,
        node: "MemoryDatabase.saveCheckpoint()",
        file: "database.ts",
        layer: "Database Storage",
        desc: "Menyimpan checkpoint ke tabel session_checkpoints",
        payloadType: "SQL Prepared Statement",
        payload: `INSERT INTO session_checkpoints (id, project_slug, task_summary, next_steps, active_files, created_at)
VALUES ('cp_1793104055672', 'mapping-projek', 'Redesign visual dashboard v2.5', '...', '["..."]', datetime('now'));`,
        metrics: {
          "Journal Mode": "WAL",
          "Synchronous": "NORMAL",
          "Lock Contention": "0 ms",
          "SINK TYPE": "DATABASE_WRITE"
        }
      },
      {
        step: 5,
        node: "ColdStartEngine.generateColdStartDigest()",
        file: "cold_start.ts",
        layer: "AI Context Optimizer",
        desc: "Menghasilkan digest eksekutif terkompresi (<400 token) untuk AI",
        payloadType: "Executive Prompt String",
        payload: `# Project: Mapping Projek (mapping-projek)
## System Overview: Engine pemetaan struktur & data flow proyek.
## Last Task: Redesign visual dashboard v2.5 workbench
## Modules (13): ast_parser, cold_start, di_resolver, ...`,
        metrics: {
          "Token Count": "178 tokens",
          "Token Savings": "97.4% vs full scan",
          "Cold-Start Time": "1.2 ms",
          "Status": "READY_FOR_AGENT"
        }
      }
    ]
  },
  {
    name: "02. AST Taint & Lineage Trace",
    title: "Interprocedural Variable Slicing & Taint Analysis",
    steps: [
      {
        step: 1,
        node: "HTTP Endpoint /checkout",
        file: "ast_parser.ts",
        layer: "Entry Source",
        desc: "Ekstraksi parameter masukan dari deklarasi route atau decorator controller",
        payloadType: "Source Request Parameter",
        payload: JSON.stringify({
          source: "req.body.paymentDetails",
          tainted: true,
          type: "PaymentRequestDTO"
        }, null, 2),
        metrics: {
          "Taint Status": "TAINTED_UNTRUSTED",
          "Source Type": "HTTP_BODY",
          "Parser": "Babel AST Traverse"
        }
      },
      {
        step: 2,
        node: "Sanitizer: PaymentSchema.validate()",
        file: "data_flow.ts",
        layer: "Validation & Sanitization",
        desc: "Mendeteksi pemanggilan sanitizer (Zod / Joi / parseInt / escape)",
        payloadType: "AST Sanitizer Node",
        payload: `const cleanPayment = PaymentSchema.validate(req.body.paymentDetails);`,
        metrics: {
          "Sanitizer Match": "SchemaValidator.validate()",
          "Pattern": "sanitize | validate | escape",
          "Taint Cleansed": "TRUE"
        }
      },
      {
        step: 3,
        node: "Dependency Injection Resolves To PaymentService",
        file: "di_resolver.ts",
        layer: "DI Polymorphism",
        desc: "Menghubungkan IPaymentService interface ke Concrete StripePaymentService",
        payloadType: "Resolved Concrete Class",
        payload: JSON.stringify({
          token: "IPaymentService",
          resolvedClass: "StripePaymentService",
          concreteMethod: "processPayment"
        }, null, 2),
        metrics: {
          "Resolution Strategy": "Interface Implementation",
          "Polymorphic Variants": "1 Target"
        }
      },
      {
        step: 4,
        node: "Database Sink: db.insertTransaction()",
        file: "database.ts",
        layer: "Database Sink",
        desc: "Payload bersih disimpan ke persisten storage tanpa celah injeksi",
        payloadType: "SQL Query Execution",
        payload: `INSERT INTO transactions (id, amount, status) VALUES (?, ?, 'CONFIRMED');`,
        metrics: {
          "Sink Status": "PROTECTED_SINK",
          "Vulnerability Found": "NONE (Clean Path)"
        }
      }
    ]
  }
];

// ============================================================================
// 4. STATE GLOBAL WORKBENCH & VIS-NETWORK
// ============================================================================
let network = null;
let nodesDataset = new vis.DataSet();
let edgesDataset = new vis.DataSet();

let fileNetwork = null;
let fileNodesDataset = new vis.DataSet();
let fileEdgesDataset = new vis.DataSet();

let currentWorkspaceMode = "graph"; // 'graph' | 'files' | 'flow'
let selectedId = 1; // Default ke system_overview
let selectedFileId = null;
let activeInspectorTab = "spec"; // 'spec' | 'code' | 'state'

// Pelacak cabang kategori yang ditutup (collapsed)
let collapsedCategories = new Set();
let collapsedProjects = new Set();

// State simulator aliran data (Mode 3)
let activeScenarioIdx = 0;
let activeStepIdx = 0;
let simInterval = null;

let pendingDeleteTarget = null;
let pendingClearProject = null;
let isBridgeOnline = false;
const BRIDGE_URL = window.location.origin;

function getThemeVars() {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  return {
    isDark,
    text: isDark ? "#f4f4f6" : "#0f172a",
    body: isDark ? "#a1a1aa" : "#334155",
    muted: isDark ? "#71717a" : "#64748b",
    edge: isDark ? "#27272f" : "#cbd5e1",
    projBg: isDark ? "#18181f" : "#ffffff",
    projBorder: isDark ? "#383842" : "#94a3b8",
    depEdge: isDark ? "#52525b" : "#64748b",
    highlightEdge: isDark ? "#3b82f6" : "#2563eb",
    fontBg: isDark ? "rgba(9, 9, 11, 0.72)" : "rgba(248, 250, 252, 0.85)",
    colors: {
      architecture: isDark ? "#3b82f6" : "#2563eb",
      api: isDark ? "#10b981" : "#059669",
      database: isDark ? "#8b5cf6" : "#7c3aed",
      rules: isDark ? "#f59e0b" : "#d97706",
      ui: isDark ? "#ec4899" : "#db2777",
      default: "#71717a"
    }
  };
}

// ============================================================================
// 5. SIDEBAR TREE & CABANG KATEGORI (EXPAND / COLLAPSE INTERAKTIF)
// ============================================================================
function getFilteredModules() {
  const projFilter = document.getElementById("projectFilter").value;
  const query = document.getElementById("searchInput").value.toLowerCase().trim();

  return rawData.filter(item => {
    const matchProj = projFilter === "ALL" || item.project === projFilter;
    if (!matchProj) return false;
    if (!query) return true;

    const matchMod = item.module.toLowerCase().includes(query) ||
                     (item.content && item.content.toLowerCase().includes(query)) ||
                     (item.category && item.category.toLowerCase().includes(query));
    return matchMod;
  });
}

function renderSidebarList() {
  const filtered = getFilteredModules();
  document.getElementById("moduleCount").textContent = filtered.length;

  const listEl = document.getElementById("sidebar-module-list") || document.getElementById("moduleList");
  listEl.innerHTML = "";

  const categoriesOrder = ["architecture", "api", "database", "rules", "ui"];
  const grouped = {};
  filtered.forEach(item => {
    const key = `${item.project}::${item.category}`;
    if (!grouped[key]) {
      grouped[key] = { project: item.project, category: item.category, items: [] };
    }
    grouped[key].items.push(item);
  });

  Object.values(grouped)
    .sort((a, b) => {
      const idxA = categoriesOrder.indexOf(a.category);
      const idxB = categoriesOrder.indexOf(b.category);
      return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
    })
    .forEach(group => {
      const catId = `c_${group.project}_${group.category}`;
      const isCollapsed = collapsedCategories.has(catId);

      const groupDiv = document.createElement("div");
      groupDiv.className = "category-group" + (isCollapsed ? " collapsed" : "");

      const headerDiv = document.createElement("div");
      headerDiv.className = "category-header";
      headerDiv.onclick = () => toggleCategoryBranch(group.project, group.category);

      headerDiv.innerHTML = `
        <div class="category-header-left">
          <span class="chevron">▼</span>
          <span class="dot dot-${group.category}"></span>
          <span>${group.category}</span>
        </div>
        <span style="font-size:10px; color:var(--text-muted)">${group.items.length} mod</span>
      `;

      const childrenDiv = document.createElement("div");
      childrenDiv.className = "category-children";

      group.items.forEach(item => {
        const modFiles = projectFilesRegistry.filter(f => f.ownerModule === item.module);
        const depCount = Array.isArray(item.dependencies) ? item.dependencies.length : 0;

        const itemDiv = document.createElement("div");
        itemDiv.className = "module-item" + (selectedId === item.id ? " active" : "");
        itemDiv.onclick = (e) => {
          e.stopPropagation();
          selectModule(item.id, true);
        };

        itemDiv.innerHTML = `
          <div class="module-item-top">
            <span class="module-name">${item.module}</span>
          </div>
          <div class="module-sub">
            <span>${modFiles.length} file</span>
            <span>${depCount > 0 ? depCount + " deps" : "root"}</span>
          </div>
        `;
        childrenDiv.appendChild(itemDiv);
      });

      groupDiv.appendChild(headerDiv);
      groupDiv.appendChild(childrenDiv);
      listEl.appendChild(groupDiv);
    });
}

function toggleCategoryBranch(project, category) {
  const catId = `c_${project}_${category}`;
  if (collapsedCategories.has(catId)) {
    collapsedCategories.delete(catId);
    showToast(`cabang dibuka: ${category}`);
  } else {
    collapsedCategories.add(catId);
    showToast(`cabang ditutup: ${category}`);
  }
  renderSidebarList();
  syncMemoryGraphData(false);
  showCategoryInspector(project, category);
}

function toggleProjectBranch(project) {
  const pId = `p_${project}`;
  if (collapsedProjects.has(pId)) {
    collapsedProjects.delete(pId);
    showToast(`proyek dibuka: ${project}`);
  } else {
    collapsedProjects.add(pId);
    showToast(`proyek ditutup: ${project}`);
  }
  renderSidebarList();
  syncMemoryGraphData(false);
}

function toggleAllBranches(collapse) {
  if (collapse) {
    rawData.forEach(item => {
      collapsedCategories.add(`c_${item.project}_${item.category}`);
    });
    showToast("Seluruh cabang kategori ditutup");
  } else {
    collapsedCategories.clear();
    collapsedProjects.clear();
    showToast("Seluruh cabang kategori dibuka");
  }
  renderSidebarList();
  syncMemoryGraphData(false);
}

// ============================================================================
// 6. MODE 1: MEMORY GRAPH (COLLAPSIBLE CATEGORY CLUSTERS & DIFFERENTIAL UPDATE)
// ============================================================================
function syncMemoryGraphData(fullRebuild = false) {
  const filtered = getFilteredModules();
  const theme = getThemeVars();

  const targetNodes = [];
  const targetEdges = [];
  const addedNodes = new Set();

  const catCounts = {};
  filtered.forEach(item => {
    const cId = `c_${item.project}_${item.category}`;
    catCounts[cId] = (catCounts[cId] || 0) + 1;
  });

  filtered.forEach(item => {
    const pId = `p_${item.project}`;
    const cId = `c_${item.project}_${item.category}`;
    const mId = `m_${item.id}`;
    const col = theme.colors[item.category] || theme.colors.default;

    const isProjCollapsed = collapsedProjects.has(pId);
    const isCatCollapsed = isProjCollapsed || collapsedCategories.has(cId);

    // 1. Simpul Root Proyek
    if (!addedNodes.has(pId)) {
      targetNodes.push({
        id: pId,
        label: isProjCollapsed ? `[+] ${item.project}` : `[-] ${item.project}`,
        shape: "box",
        margin: { top: 8, bottom: 8, left: 14, right: 14 },
        color: {
          background: theme.projBg,
          border: theme.projBorder,
          highlight: { background: theme.projBg, border: theme.highlightEdge }
        },
        font: {
          color: theme.text,
          face: "JetBrains Mono, monospace",
          size: 12,
          bold: true
        },
        borderWidth: 1.8,
        nodeType: "project",
        project: item.project
      });
      addedNodes.add(pId);
    }

    if (isProjCollapsed) return;

    // 2. Simpul Kategori Cluster
    if (!addedNodes.has(cId)) {
      const count = catCounts[cId] || 0;
      const catLabel = isCatCollapsed
        ? `${item.category} [+${count}]`
        : `${item.category} (${count})`;

      targetNodes.push({
        id: cId,
        label: catLabel,
        shape: "box",
        margin: { top: 6, bottom: 6, left: 10, right: 10 },
        color: {
          background: isCatCollapsed ? col : theme.projBg,
          border: col,
          highlight: { background: col, border: theme.isDark ? "#ffffff" : "#0f172a" }
        },
        font: {
          color: isCatCollapsed ? "#ffffff" : theme.text,
          face: "JetBrains Mono, monospace",
          size: 11,
          bold: true
        },
        borderWidth: 1.8,
        nodeType: "category",
        project: item.project,
        category: item.category
      });

      targetEdges.push({
        id: `e_${pId}_${cId}`,
        from: pId,
        to: cId,
        color: { color: theme.edge },
        width: 1.5,
        length: 95
      });
      addedNodes.add(cId);
    }

    if (isCatCollapsed) return;

    // 3. Simpul Modul Anak
    const isSelected = selectedId === item.id;
    targetNodes.push({
      id: mId,
      label: item.module,
      shape: "dot",
      size: isSelected ? 15 : 10,
      color: {
        background: col,
        border: isSelected ? (theme.isDark ? "#ffffff" : "#0f172a") : col,
        highlight: { background: col, border: theme.isDark ? "#ffffff" : "#0f172a" }
      },
      font: {
        color: theme.text,
        face: "JetBrains Mono, monospace",
        size: isSelected ? 12 : 11,
        bold: isSelected,
        background: theme.fontBg
      },
      borderWidth: isSelected ? 3 : 1.5,
      nodeType: "module",
      raw: item
    });
    addedNodes.add(mId);

    targetEdges.push({
      id: `e_${cId}_${mId}`,
      from: cId,
      to: mId,
      color: { color: theme.edge },
      width: 1,
      length: 75
    });
  });

  // Panah ketergantungan antar modul
  const moduleMap = new Map();
  filtered.forEach(item => moduleMap.set(`${item.project}:${item.module}`, item));

  filtered.forEach(item => {
    const fromId = `m_${item.id}`;
    if (!addedNodes.has(fromId)) return;

    if (Array.isArray(item.dependencies)) {
      item.dependencies.forEach(depName => {
        const target = moduleMap.get(`${item.project}:${depName}`);
        if (target && addedNodes.has(`m_${target.id}`)) {
          const isRelatedToSelected = (selectedId === item.id || selectedId === target.id);
          targetEdges.push({
            id: `dep_${item.id}_${target.id}`,
            from: fromId,
            to: `m_${target.id}`,
            color: { color: isRelatedToSelected ? theme.highlightEdge : theme.depEdge },
            dashes: [4, 4],
            width: isRelatedToSelected ? 2 : 1,
            arrows: { to: { enabled: true, scaleFactor: 0.55 } }
          });
        }
      });
    }
  });

  if (fullRebuild) {
    nodesDataset.clear();
    edgesDataset.clear();
    nodesDataset.add(targetNodes);
    edgesDataset.add(targetEdges);
  } else {
    const currentIds = new Set(nodesDataset.getIds());
    const nextIds = new Set(targetNodes.map(n => n.id));
    const toRemoveNodes = [...currentIds].filter(id => !nextIds.has(id));
    if (toRemoveNodes.length > 0) nodesDataset.remove(toRemoveNodes);
    nodesDataset.update(targetNodes);

    const currentEdgeIds = new Set(edgesDataset.getIds());
    const nextEdgeIds = new Set(targetEdges.map(e => e.id));
    const toRemoveEdges = [...currentEdgeIds].filter(id => !nextEdgeIds.has(id));
    if (toRemoveEdges.length > 0) edgesDataset.remove(toRemoveEdges);
    edgesDataset.update(targetEdges);
  }
}

function initMemoryGraph() {
  const container = document.getElementById("networkCanvas");
  const options = {
    nodes: {
      font: { minVisible: 9 }
    },
    physics: {
      solver: "forceAtlas2Based",
      forceAtlas2Based: {
        gravitationalConstant: -55,
        centralGravity: 0.01,
        springLength: 85,
        springConstant: 0.06,
        damping: 0.85
      },
      stabilization: { iterations: 120 }
    },
    interaction: { hover: true, tooltipDelay: 120 }
  };

  network = new vis.Network(container, { nodes: nodesDataset, edges: edgesDataset }, options);

  network.on("click", (params) => {
    if (params.nodes.length === 0) return;
    const clickedNodeId = params.nodes[0];
    const node = nodesDataset.get(clickedNodeId);
    if (!node) return;

    if (node.nodeType === "module" && node.raw) {
      selectModule(node.raw.id, false);
    } else if (node.nodeType === "category") {
      toggleCategoryBranch(node.project, node.category);
    } else if (node.nodeType === "project") {
      toggleProjectBranch(node.project);
    }
  });
}

function selectModule(moduleId, focusOnCanvas = false) {
  const item = rawData.find(d => d.id === moduleId);
  if (!item) return;

  selectedId = item.id;

  const cId = `c_${item.project}_${item.category}`;
  if (collapsedCategories.has(cId)) {
    collapsedCategories.delete(cId);
  }

  renderSidebarList();
  syncMemoryGraphData(false);

  if (focusOnCanvas && network && currentWorkspaceMode === "graph") {
    const nodeId = `m_${item.id}`;
    network.selectNodes([nodeId]);
    network.focus(nodeId, { scale: 1.2, animation: { duration: 280 } });
  }

  const modFiles = projectFilesRegistry.filter(f => f.ownerModule === item.module);
  if (modFiles.length > 0) {
    selectedFileId = modFiles[0].id;
  }

  renderInspectorForModule(item);
}

function focusModuleByName(project, moduleName) {
  const target = rawData.find(d => d.project === project && d.module === moduleName);
  if (target) {
    selectModule(target.id, true);
  }
}

function showCategoryInspector(project, category) {
  const panel = document.getElementById("inspectorPanel");
  const mods = rawData.filter(d => d.project === project && d.category === category);
  const cId = `c_${project}_${category}`;
  const isCollapsed = collapsedCategories.has(cId);

  panel.innerHTML = `
    <div class="inspector-header">
      <div class="breadcrumb">
        <span>${project} / cabang_kategori</span>
        <span>${isCollapsed ? "STATUS: TERTUTUP" : "STATUS: TERBUKA"}</span>
      </div>
      <div class="detail-title">
        <span><span class="dot dot-${category}"></span> ${category}</span>
        <button class="btn-mono" onclick="toggleCategoryBranch('${project}', '${category}')">
          ${isCollapsed ? "expand_branch" : "collapse_branch"}
        </button>
      </div>
    </div>
    <div class="inspector-body">
      <div class="markdown-body">
        <p>Cabang kategori <strong>${category}</strong> memuat <strong>${mods.length} modul</strong>.</p>
        <p>Klik tombol di atas atau klik langsung simpul kategori di kanvas untuk membuka/menutup seluruh anak simpul.</p>
        <hr/>
        <h4>Daftar Modul Terkait:</h4>
        <ul>
          ${mods.map(m => `
            <li>
              <a href="javascript:void(0)" onclick="selectModule(${m.id}, true)" style="color:var(--c-arch); text-decoration:none;">
                <strong>${m.module}</strong>
              </a>: ${(m.content || "").slice(0, 100).replace(/#/g, '')}...
            </li>
          `).join("")}
        </ul>
      </div>
    </div>
  `;
}

// ============================================================================
// 7. MODE 2: FILE DEPENDENCY MAP (PETA KETERGANTUNGAN BERKAS)
// ============================================================================
async function loadProjectFiles(targetProject) {
  const proj = targetProject || getSelectedProject();
  try {
    const gRes = await fetch(`${BRIDGE_URL}/api/graph?project=${encodeURIComponent(proj)}`);
    if (!gRes.ok) return;
    const gData = await gRes.json();
    if (!Array.isArray(gData.nodes)) return;

    // Filter out existing files for this project to refresh
    projectFilesRegistry = projectFilesRegistry.filter(f => f.project !== proj);
    const fileNodes = gData.nodes.filter(n => n.node_type === 'file');

    const norm = s => (s || '').replace(/\.(js|ts|mjs|cjs|jsx|tsx)/g, '').toLowerCase();

    if (fileNodes.length > 0) {
      // Build lookup map for resolving normalized import targets (e.g. .js -> .ts ESM resolution)
      const normMap = new Map();
      fileNodes.forEach(fn => {
        normMap.set(norm(fn.id), fn.file_path);
        normMap.set(norm(fn.file_path), fn.file_path);
        normMap.set(norm(fn.name), fn.file_path);
        const parts = (fn.id || '').split(':');
        if (parts.length >= 2) {
          normMap.set(norm(parts[1]), fn.file_path);
        }
      });

      fileNodes.forEach(fn => {
        const fileName = fn.name;
        let layer = 'architecture';
        const lp = fn.file_path.toLowerCase();
        if (lp.includes('ui') || lp.includes('public') || lp.includes('views') || lp.includes('components') || lp.includes('screen')) layer = 'ui';
        else if (lp.includes('api') || lp.includes('routes') || lp.includes('controller') || lp.includes('server') || lp.includes('endpoint')) layer = 'api';
        else if (lp.includes('db') || lp.includes('database') || lp.includes('storage') || lp.includes('models') || lp.includes('entity')) layer = 'database';
        else if (lp.includes('rules') || lp.includes('test') || lp.includes('spec') || lp.includes('check')) layer = 'rules';

        // Match import edges by source and normalized target
        const fileImports = (gData.edges || [])
          .filter(e => (e.source_id === fn.id || e.source === fn.id) && (e.relation_type || '').toUpperCase() === 'IMPORTS')
          .map(e => {
            const rawTarget = e.target_id || e.target || '';
            const tParts = rawTarget.split(':');
            const targetRel = tParts.length >= 2 ? tParts[1] : rawTarget;
            return normMap.get(norm(rawTarget)) || normMap.get(norm(targetRel)) || null;
          })
          .filter(Boolean);

        const matchingMod = rawData.find(d => d.project === proj && fn.file_path.includes(d.module));

        projectFilesRegistry.push({
          id: fn.file_path,
          name: fileName,
          path: fn.file_path,
          project: proj,
          gradleModule: `:${fn.file_path.split('/')[0] || 'root'}`,
          layer,
          ownerModule: matchingMod ? matchingMod.module : (rawData.find(d => d.project === proj)?.module || "system_overview"),
          imports: [...new Set(fileImports)],
          stateContract: `File: ${fn.file_path}`,
          code: `// ${fn.file_path} (Lines ${fn.line_start}-${fn.line_end})`
        });
      });
    } else {
      // For vault-synced or module-based projects (e.g. my-music):
      // Synthesize file nodes from the project's modules and dependency edges!
      const modNodes = gData.nodes.filter(n => n.node_type !== 'file');
      const modLookup = new Map();
      modNodes.forEach(n => {
        modLookup.set(n.id, n.id);
        modLookup.set(n.name, n.id);
      });

      modNodes.forEach(mn => {
        const cat = (mn.metadata && mn.metadata.category) || (mn.node_type === 'endpoint' ? 'api' : (mn.node_type === 'model' ? 'database' : (mn.node_type === 'interface' ? 'rules' : 'architecture')));
        const modDeps = (gData.edges || [])
          .filter(e => (e.source_id === mn.id || e.source === mn.id))
          .map(e => e.target_id || e.target)
          .filter(t => modLookup.has(t));

        projectFilesRegistry.push({
          id: mn.id,
          name: `${mn.name}.ts`,
          path: mn.file_path || `modules/${cat}/${mn.name}`,
          project: proj,
          gradleModule: `:${cat}`,
          layer: cat,
          ownerModule: mn.name,
          imports: [...new Set(modDeps)],
          stateContract: `Module Contract: ${mn.name}`,
          code: (mn.metadata && mn.metadata.content) ? mn.metadata.content : `// Module: ${mn.name}\n// Layer: ${cat}`
        });
      });
    }

    const curProjFiles = projectFilesRegistry.filter(f => f.project === proj);
    if (curProjFiles.length > 0) {
      if (!selectedFileId || !curProjFiles.some(f => f.id === selectedFileId)) {
        selectedFileId = curProjFiles[0].id;
      }
    }
  } catch (err) {
    console.warn("Failed to load project files:", err);
  }
}

function initFileDependencyMap() {
  const container = document.getElementById("fileMapCanvas");
  if (!container) return;

  const options = {
    nodes: {
      font: { minVisible: 11 }
    },
    layout: {
      hierarchical: {
        enabled: true,
        direction: "UD",
        sortMethod: "directed",
        levelSeparation: 150,
        nodeSpacing: 260,
        treeSpacing: 220,
        blockShifting: true,
        edgeMinimization: true,
        parentCentralization: true
      }
    },
    physics: {
      enabled: false
    },
    interaction: {
      hover: true,
      tooltipDelay: 100,
      zoomView: true,
      dragView: true
    }
  };

  fileNetwork = new vis.Network(container, { nodes: fileNodesDataset, edges: fileEdgesDataset }, options);

  fileNetwork.on("click", (params) => {
    if (params.nodes.length > 0) {
      const fileId = params.nodes[0];
      focusFileNodeOnMap(fileId);
    }
  });

  fileNetwork.on("zoom", () => {
    updateFileZoomDisplay();
  });

  renderFileDependencyMap(null, true);
  updateFileZoomDisplay();
}

function computeTopologicalLevels(files) {
  const fileMap = new Map();
  files.forEach(f => fileMap.set(f.id, f));

  const incoming = new Map();
  files.forEach(f => incoming.set(f.id, []));

  files.forEach(f => {
    (f.imports || []).forEach(targetId => {
      if (fileMap.has(targetId) && targetId !== f.id) {
        incoming.get(targetId).push(f.id);
      }
    });
  });

  const depths = new Map();
  function getDepth(id, visited = new Set()) {
    if (depths.has(id)) return depths.get(id);
    if (visited.has(id)) return 0;
    visited.add(id);

    const inc = incoming.get(id) || [];
    if (inc.length === 0) {
      depths.set(id, 0);
      return 0;
    }

    let maxD = 0;
    for (const parentId of inc) {
      const d = getDepth(parentId, new Set(visited));
      if (d + 1 > maxD) maxD = d + 1;
    }
    depths.set(id, maxD);
    return maxD;
  }

  files.forEach(f => getDepth(f.id));
  return depths;
}

function renderFileDependencyMap(highlightFileId = null, shouldFit = false) {
  const theme = getThemeVars();
  const nodes = [];
  const edges = [];

  const currentProject = getSelectedProject();
  const files = projectFilesRegistry.filter(f => (f.project || "mapping-projek") === currentProject || currentProject === "ALL");

  const connectedFiles = new Set();
  if (highlightFileId) {
    connectedFiles.add(highlightFileId);
    files.forEach(f => {
      if (f.id === highlightFileId) {
        (f.imports || []).forEach(imp => connectedFiles.add(imp));
      }
      if ((f.imports || []).includes(highlightFileId)) {
        connectedFiles.add(f.id);
      }
    });
  }

  // Hitung tingkat kedalaman hierarki arsitektur secara topologis (DAG)
  // File pemanggil/entry di atas (level 0), file dependensi mengalir konsisten ke bawah
  const topologicalDepths = computeTopologicalLevels(files);

  const validNodeIds = new Set();
  files.forEach(file => {
    validNodeIds.add(file.id);
    const col = theme.colors[file.layer] || theme.colors.default;
    const isNodeDimmed = highlightFileId && !connectedFiles.has(file.id);
    const isSelected = file.id === (highlightFileId || selectedFileId);

    const layer = file.layer || "architecture";
    const computedLevel = topologicalDepths.get(file.id) || 0;

    // Kontras tinggi untuk mode gelap dan mode terang
    const bgCol = isSelected
      ? col
      : (isNodeDimmed ? (theme.isDark ? "#121216" : "#f1f5f9") : (theme.isDark ? "#18181f" : "#ffffff"));
    const borderCol = isSelected
      ? (theme.isDark ? "#ffffff" : "#0f172a")
      : (isNodeDimmed ? (theme.isDark ? "#2e2e38" : "#cbd5e1") : col);
    const fontCol = isSelected
      ? "#ffffff"
      : (isNodeDimmed ? (theme.isDark ? "#52525b" : "#94a3b8") : (theme.isDark ? "#f8fafc" : "#0f172a"));

    nodes.push({
      id: file.id,
      label: `<b>${file.name}</b>\n[${file.gradleModule || ':' + layer}]`,
      level: computedLevel,
      shape: "box",
      margin: { top: 10, bottom: 10, left: 14, right: 14 },
      shadow: {
        enabled: !isNodeDimmed,
        color: isSelected ? col : (theme.isDark ? "rgba(0,0,0,0.55)" : "rgba(15,23,42,0.08)"),
        size: isSelected ? 16 : 8,
        x: 0,
        y: isSelected ? 4 : 2
      },
      color: {
        background: bgCol,
        border: borderCol,
        highlight: { background: col, border: theme.isDark ? "#ffffff" : "#0f172a" },
        hover: {
          background: isSelected ? col : (theme.isDark ? "#23232c" : "#f8fafc"),
          border: col
        }
      },
      font: {
        multi: "html",
        color: fontCol,
        face: "JetBrains Mono, monospace",
        size: 12.5,
        bold: { color: fontCol, size: 12.5, face: "JetBrains Mono, monospace" }
      },
      borderWidth: isSelected ? 2.8 : (isNodeDimmed ? 1.0 : 1.8)
    });
  });

  files.forEach(file => {
    (file.imports || []).forEach(targetId => {
      // Graph Anti-Crash Invariant: both from and to must exist in valid nodes
      if (!validNodeIds.has(targetId)) return;

      const isEdgeHighlighted = highlightFileId &&
        (file.id === highlightFileId || targetId === highlightFileId);
      const isEdgeDimmed = highlightFileId && !isEdgeHighlighted;

      edges.push({
        id: `fe_${file.id}_${targetId}`,
        from: file.id,
        to: targetId,
        color: {
          color: isEdgeHighlighted
            ? theme.highlightEdge
            : (theme.isDark ? "rgba(148, 163, 184, 0.45)" : "rgba(71, 85, 105, 0.55)"),
          highlight: theme.highlightEdge,
          hover: theme.highlightEdge,
          opacity: isEdgeDimmed ? 0.18 : 0.85
        },
        width: isEdgeHighlighted ? 2.8 : 1.6,
        arrows: { to: { enabled: true, scaleFactor: 0.75 } },
        smooth: { type: "cubicBezier", forceDirection: "vertical", roundness: 0.35 }
      });
    });
  });

  fileNodesDataset.clear();
  fileEdgesDataset.clear();
  fileNodesDataset.add(nodes);
  fileEdgesDataset.add(edges);

  if (fileNetwork) {
    try {
      fileNetwork.setData({ nodes: fileNodesDataset, edges: fileEdgesDataset });
    } catch {}
    if (shouldFit) {
      setTimeout(() => {
        try {
          fileNetwork.redraw();
          fileNetwork.fit({ animation: { duration: 250 } });
        } catch {}
      }, 60);
    }
  }
}

async function focusFileNodeOnMap(fileId) {
  const fileObj = projectFilesRegistry.find(f => f.id === fileId);
  if (!fileObj) return;

  selectedFileId = fileId;
  renderFileDependencyMap(fileId, false);

  if (fileNetwork) {
    try {
      fileNetwork.focus(fileId, {
        scale: 1.05,
        animation: { duration: 350, easingFunction: "easeInOutQuad" }
      });
    } catch {}
  }

  // If code is not loaded or is a comment stub, load real file content
  if (!fileObj.code || fileObj.code.startsWith('//')) {
    try {
      const fRes = await fetch(`${BRIDGE_URL}/api/file_content?path=${encodeURIComponent(fileObj.path)}`);
      if (fRes.ok) {
        const fData = await fRes.json();
        if (fData.content) fileObj.code = fData.content;
      }
    } catch {}
  }

  const ownerMod = rawData.find(d => d.project === fileObj.project && d.module === fileObj.ownerModule) ||
                   rawData.find(d => d.project === fileObj.project);
  if (ownerMod) {
    selectedId = ownerMod.id;
    activeInspectorTab = "code";
    renderSidebarList();
    renderInspectorForModule(ownerMod);
  }
}

function resetFileMapHighlight() {
  renderFileDependencyMap(null, false);
  if (fileNetwork) {
    try { fileNetwork.fit({ animation: { duration: 250 } }); } catch {}
  }
}

function zoomFileMap(factor) {
  if (!fileNetwork) return;
  const currentScale = fileNetwork.getScale();
  const nextScale = Math.max(0.2, Math.min(3.0, currentScale * factor));
  fileNetwork.moveTo({
    scale: nextScale,
    animation: { duration: 200 }
  });
  setTimeout(updateFileZoomDisplay, 220);
}

function updateFileZoomDisplay() {
  const el = document.getElementById("fileZoomLevel");
  if (el && fileNetwork) {
    el.textContent = `${Math.round(fileNetwork.getScale() * 100)}%`;
  }
}

// ============================================================================
// 8. MODE 3: SIMULATOR PIPELINE ALIRAN DATA & EKSEKUSI
// ============================================================================
function initDataFlowSimulator() {
  const selectorEl = document.getElementById("scenarioSelector");
  selectorEl.innerHTML = pipelineScenarios.map((sc, idx) => `
    <button class="scenario-btn ${idx === activeScenarioIdx ? 'active' : ''}" onclick="selectScenario(${idx})">
      ${sc.name}
    </button>
  `).join("");

  renderCurrentSimulationState();
}

function selectScenario(idx) {
  stopAutoPlaySimulation();
  activeScenarioIdx = idx;
  activeStepIdx = 0;
  initDataFlowSimulator();
}

function stepSimulation(delta) {
  const sc = pipelineScenarios[activeScenarioIdx];
  activeStepIdx = (activeStepIdx + delta + sc.steps.length) % sc.steps.length;
  renderCurrentSimulationState();
}

function resetSimulation() {
  stopAutoPlaySimulation();
  activeStepIdx = 0;
  renderCurrentSimulationState();
}

function toggleAutoPlaySimulation() {
  if (simInterval) {
    stopAutoPlaySimulation();
  } else {
    const btn = document.getElementById("btnAutoPlay");
    btn.textContent = "⏸ pause_flow";
    simInterval = setInterval(() => {
      stepSimulation(1);
    }, 2400);
  }
}

function stopAutoPlaySimulation() {
  if (simInterval) {
    clearInterval(simInterval);
    simInterval = null;
  }
  const btn = document.getElementById("btnAutoPlay");
  if (btn) btn.textContent = "▶ play_flow";
}

function renderCurrentSimulationState() {
  const sc = pipelineScenarios[activeScenarioIdx];
  const currentStep = sc.steps[activeStepIdx];

  document.getElementById("pipeScenarioTitle").textContent = sc.title;
  document.getElementById("pipeStepCounter").textContent = `STEP ${activeStepIdx + 1} / ${sc.steps.length}`;

  const trackEl = document.getElementById("pipelineNodesTrack");
  trackEl.innerHTML = sc.steps.map((st, idx) => {
    let stateClass = "";
    if (idx === activeStepIdx) stateClass = "active-step";
    else if (idx < activeStepIdx) stateClass = "visited-step";

    return `
      <div class="pipe-node ${stateClass}" onclick="jumpToSimStep(${idx})">
        <div class="pipe-step-badge">
          <span>HOP 0${st.step}</span>
          <span>${st.file}</span>
        </div>
        <div class="pipe-node-title">${st.node}</div>
        <div class="pipe-node-layer">${st.layer}</div>
        <div class="pipe-node-desc">${st.desc}</div>
      </div>
    `;
  }).join("");

  document.getElementById("payloadTypeBadge").textContent = currentStep.payloadType;
  document.getElementById("pipePayloadViewer").textContent = currentStep.payload;

  const metricsEl = document.getElementById("pipeStateMetrics");
  metricsEl.innerHTML = Object.entries(currentStep.metrics).map(([k, v]) => `
    <div class="state-kv-row">
      <span class="state-kv-key">${k}</span>
      <span class="state-kv-val">${v}</span>
    </div>
  `).join("");

  const matchedFile = projectFilesRegistry.find(f => f.name === currentStep.file);
  if (matchedFile) {
    selectedFileId = matchedFile.id;
    const ownerMod = rawData.find(d => d.module === matchedFile.ownerModule);
    if (ownerMod) {
      selectedId = ownerMod.id;
      renderInspectorForModule(ownerMod);
    }
  }
}

function jumpToSimStep(idx) {
  stopAutoPlaySimulation();
  activeStepIdx = idx;
  renderCurrentSimulationState();
}

// ============================================================================
// 9. PANEL INSPECTOR KANAN (SPESIFIKASI, KODE FITUR, & DATA CONTRACT)
// ============================================================================
function highlightCodeSyntax(rawCode) {
  const escaped = (rawCode || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return escaped.split("\n").map((line, i) => {
    let htmlLine = line;
    if (htmlLine.trim().startsWith("//") || htmlLine.trim().startsWith("/*") || htmlLine.trim().startsWith("*")) {
      htmlLine = `<span class="tok-cmt">${htmlLine}</span>`;
    } else {
      htmlLine = htmlLine
        .replace(/(".*?"|'.*?'|`.*?`)/g, '<span class="tok-str">$1</span>')
        .replace(/\b(export|import|from|class|interface|function|const|let|var|return|if|else|new|this|async|await|try|catch|type|extends|implements|public|private|protected|package|fun|val|suspend|override|data|object)\b/g, '<span class="tok-kw">$1</span>')
        .replace(/(@\w+)/g, '<span class="tok-ann">$1</span>')
        .replace(/\b(string|number|boolean|any|void|Promise|Record|Array|StateFlow|Flow|Result|Unit|SessionManager|AstParser|MemoryDatabase)\b/g, '<span class="tok-type">$1</span>');
    }
    return `<tr><td class="code-line-num">${i + 1}</td><td class="code-line-text">${htmlLine}</td></tr>`;
  }).join("");
}

function switchInspectorTab(tabName) {
  activeInspectorTab = tabName;
  const item = rawData.find(d => d.id === selectedId);
  if (item) renderInspectorForModule(item);
}

function selectInspectorFile(fileId) {
  selectedFileId = fileId;
  activeInspectorTab = "code";

  // Attempt live reload of file content from backend
  const targetFile = projectFilesRegistry.find(f => f.id === fileId);
  if (targetFile) {
    fetch(`${BRIDGE_URL}/api/file_content?path=${encodeURIComponent(targetFile.path)}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data && data.content) {
          targetFile.code = data.content;
          const item = rawData.find(d => d.id === selectedId);
          if (item) renderInspectorForModule(item);
        }
      })
      .catch(() => {});
  }

  const item = rawData.find(d => d.id === selectedId);
  if (item) renderInspectorForModule(item);
  if (currentWorkspaceMode === "files") {
    renderFileDependencyMap(fileId);
  }
}

function renderInspectorForModule(item) {
  const panel = document.getElementById("inspectorPanel");
  const modFiles = projectFilesRegistry.filter(f => f.ownerModule === item.module);

  const dependents = rawData.filter(d =>
    Array.isArray(d.dependencies) && d.dependencies.includes(item.module) && d.project === item.project
  );

  let depHtml = "";
  if (Array.isArray(item.dependencies) && item.dependencies.length > 0) {
    depHtml += `
      <div class="dep-container" style="margin-top: 8px;">
        <span class="dep-label">Dependencies:</span>
        <div style="display:flex; flex-wrap:wrap; gap:4px;">
          ${item.dependencies.map(d => `
            <span class="dep-link" onclick="focusModuleByName('${item.project}', '${d}')">
              → ${d}
            </span>
          `).join("")}
        </div>
      </div>
    `;
  }

  if (dependents.length > 0) {
    depHtml += `
      <div class="dep-container" style="margin-top: 5px;">
        <span class="dep-label">Used By:</span>
        <div style="display:flex; flex-wrap:wrap; gap:4px;">
          ${dependents.map(d => `
            <span class="dep-link" onclick="selectModule(${d.id}, true)">
              ← ${d.module}
            </span>
          `).join("")}
        </div>
      </div>
    `;
  }

  let tabBodyHtml = "";

  if (activeInspectorTab === "spec") {
    const renderedMd = typeof marked !== "undefined" ? marked.parse(item.content || "") : `<pre>${item.content}</pre>`;

    const fileButtons = modFiles.length > 0 ? `
      <div style="margin-bottom:12px; border:1px solid var(--border); border-radius:4px; padding:10px; background:var(--bg-subtle);">
        <div style="font-family:'JetBrains Mono',monospace; font-size:10px; color:var(--text-muted); margin-bottom:6px; text-transform:uppercase;">
          Berkas Kode Fitur di Modul Ini (${modFiles.length}):
        </div>
        <div class="file-pills-bar" style="margin-bottom:0;">
          ${modFiles.map(f => `
            <span class="file-pill" onclick="selectInspectorFile('${f.id}')">
              <span class="dot dot-${f.layer}"></span> ${f.name}
            </span>
          `).join("")}
        </div>
      </div>
    ` : "";

    tabBodyHtml = `${fileButtons}<div class="markdown-body">${renderedMd}</div>`;
  } else if (activeInspectorTab === "code") {
    const activeFile = modFiles.find(f => f.id === selectedFileId) || modFiles[0] || projectFilesRegistry[0];
    const upstreamFiles = projectFilesRegistry.filter(f => activeFile.imports.includes(f.id));
    const downstreamFiles = projectFilesRegistry.filter(f => f.imports.includes(activeFile.id));

    tabBodyHtml = `
      <div class="file-pills-bar">
        ${modFiles.map(f => `
          <button class="file-pill ${f.id === activeFile.id ? 'active' : ''}" onclick="selectInspectorFile('${f.id}')">
            ${f.name}
          </button>
        `).join("")}
      </div>

      <div class="code-box-wrapper">
        <div class="code-box-header">
          <span>${activeFile.path}</span>
          <button class="btn-mono" style="padding:2px 6px; font-size:10px;" onclick="copyActiveCode('${activeFile.id}')">copy</button>
        </div>
        <div class="code-scroll">
          <table class="code-table">
            <tbody>${highlightCodeSyntax(activeFile.code)}</tbody>
          </table>
        </div>
      </div>

      <div style="margin-top:14px; border:1px solid var(--border); border-radius:4px; padding:10px; background:var(--bg-subtle);">
        <div style="font-family:'JetBrains Mono',monospace; font-size:10px; color:var(--text-muted); margin-bottom:6px;">
          RELASI KETERGANTUNGAN BERKAS (${activeFile.name}):
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:5px; margin-bottom:6px;">
          <span class="dep-label">Imports:</span>
          ${upstreamFiles.length > 0
            ? upstreamFiles.map(uf => `<span class="dep-link" onclick="focusFileNodeOnMap('${uf.id}')">→ ${uf.name}</span>`).join("")
            : `<span style="font-family:'JetBrains Mono',monospace; font-size:10.5px; color:var(--text-muted)">Tidak ada (Leaf File)</span>`}
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:5px;">
          <span class="dep-label">Imported By:</span>
          ${downstreamFiles.length > 0
            ? downstreamFiles.map(df => `<span class="dep-link" onclick="focusFileNodeOnMap('${df.id}')">← ${df.name}</span>`).join("")
            : `<span style="font-family:'JetBrains Mono',monospace; font-size:10.5px; color:var(--text-muted)">Root Entry</span>`}
        </div>
      </div>
    `;
  } else if (activeInspectorTab === "state") {
    tabBodyHtml = `
      <div class="markdown-body">
        <h3>Kontrak State & Olah Data Modul</h3>
        <p>Daftar struktur data reaktif & interface contract yang dikelola oleh <strong>${item.module}</strong>:</p>
      </div>
      <div style="display:flex; flex-direction:column; gap:8px; margin-top:10px;">
        ${(modFiles.length > 0 ? modFiles : projectFilesRegistry.slice(0, 3)).map(f => `
          <div style="border:1px solid var(--border); border-radius:4px; padding:10px; background:var(--bg-code); font-family:'JetBrains Mono',monospace;">
            <div style="font-size:11px; color:var(--text-main); font-weight:600; margin-bottom:4px;">
              ${f.name} <span style="color:var(--text-muted); font-weight:400;">(${f.gradleModule})</span>
            </div>
            <div style="font-size:10.5px; color:var(--c-api);">
              Contract: ${f.stateContract}
            </div>
          </div>
        `).join("")}
      </div>
    `;
  }

  panel.innerHTML = `
    <div class="inspector-header">
      <div class="breadcrumb">
        <span>${item.project} / <span class="dot dot-${item.category}"></span> ${item.category}</span>
        <span>ID #${item.id}</span>
      </div>
      <div class="detail-title">
        <span>${item.module}</span>
      </div>
      ${depHtml}
    </div>

    <div class="inspector-tabs">
      <button class="insp-tab ${activeInspectorTab === 'spec' ? 'active' : ''}" onclick="switchInspectorTab('spec')">
        [ SPESIFIKASI ]
      </button>
      <button class="insp-tab ${activeInspectorTab === 'code' ? 'active' : ''}" onclick="switchInspectorTab('code')">
        [ KODE FITUR (${modFiles.length}) ]
      </button>
      <button class="insp-tab ${activeInspectorTab === 'state' ? 'active' : ''}" onclick="switchInspectorTab('state')">
        [ DATA & STATE ]
      </button>
    </div>

    <div class="inspector-body">
      ${tabBodyHtml}
    </div>

    <div class="inspector-footer">
      <span>updated: ${item.updated_at ? item.updated_at.slice(0, 19).replace('T', ' ') : '-'}</span>
      <button class="btn-danger-outline" onclick="confirmDeleteModule('${item.project}', '${item.module}', '${item.category}')">delete_node</button>
    </div>
  `;
}

function copyActiveCode(fileId) {
  const f = projectFilesRegistry.find(x => x.id === fileId);
  if (!f) return;
  navigator.clipboard.writeText(f.code).then(() => {
    showToast(`copied: ${f.name}`);
  }).catch(() => {
    const temp = document.createElement("textarea");
    temp.value = f.code;
    document.body.appendChild(temp);
    temp.select();
    document.execCommand("copy");
    document.body.removeChild(temp);
    showToast(`copied: ${f.name}`);
  });
}

// ============================================================================
// 10. WORKSPACE MODE SWITCHER & UTILITAS
// ============================================================================
function getSelectedProject() {
  const filter = document.getElementById("projectFilter");
  if (!filter) return "mapping-projek";
  const val = filter.value;
  if (val && val !== "ALL") return val;
  const firstMod = rawData[0];
  return firstMod ? firstMod.project : "mapping-projek";
}

function switchWorkspaceMode(mode) {
  currentWorkspaceMode = mode;
  document.getElementById("tabModeGraph").classList.toggle("active", mode === "graph");
  document.getElementById("tabModeFiles").classList.toggle("active", mode === "files");
  document.getElementById("tabModeFlow").classList.toggle("active", mode === "flow");
  const tabSec = document.getElementById("tabModeSecurity");
  if (tabSec) tabSec.classList.toggle("active", mode === "security");
  const tabPerf = document.getElementById("tabModePerformance");
  if (tabPerf) tabPerf.classList.toggle("active", mode === "performance");

  document.getElementById("viewGraph").classList.toggle("active", mode === "graph");
  document.getElementById("viewFiles").classList.toggle("active", mode === "files");
  document.getElementById("viewFlow").classList.toggle("active", mode === "flow");
  const viewSec = document.getElementById("viewSecurity");
  if (viewSec) viewSec.classList.toggle("active", mode === "security");
  const viewPerf = document.getElementById("viewPerformance");
  if (viewPerf) viewPerf.classList.toggle("active", mode === "performance");

  const statusEl = document.getElementById("activeModeStatus");
  if (mode === "graph") {
    stopAutoPlaySimulation();
    if (statusEl) statusEl.textContent = "01 // Cabang Arsitektur";
    setTimeout(() => network && network.fit({ animation: { duration: 250 } }), 60);
  } else if (mode === "files") {
    stopAutoPlaySimulation();
    if (statusEl) statusEl.textContent = "02 // Ketergantungan Berkas";
    const proj = getSelectedProject();
    const hasFiles = projectFilesRegistry.some(f => f.project === proj || proj === "ALL");
    const renderCb = () => {
      if (!fileNetwork) {
        initFileDependencyMap();
      } else {
        renderFileDependencyMap(selectedFileId, false);
      }
      setTimeout(() => {
        if (fileNetwork) {
          try {
            fileNetwork.redraw();
            if (selectedFileId && fileNodesDataset.get(selectedFileId)) {
              fileNetwork.focus(selectedFileId, {
                scale: 1.0,
                animation: { duration: 300 }
              });
            } else {
              fileNetwork.fit({ animation: { duration: 250 } });
            }
          } catch {}
        }
      }, 100);
    };

    if (!hasFiles) {
      loadProjectFiles(proj).then(renderCb);
    } else {
      renderCb();
    }
  } else if (mode === "flow") {
    if (statusEl) statusEl.textContent = "03 // Pipeline Aliran Data";
    initDataFlowSimulator();
  } else if (mode === "security") {
    stopAutoPlaySimulation();
    if (statusEl) statusEl.textContent = "04 // Audit Keamanan";
    loadSecurityAudit(false);
  } else if (mode === "performance") {
    stopAutoPlaySimulation();
    if (statusEl) statusEl.textContent = "05 // Audit Performa N+1";
    loadPerformanceAudit(false);
  }
}

function fitActiveGraph() {
  if (currentWorkspaceMode === "graph" && network) {
    network.fit({ animation: { duration: 280 } });
  } else if (currentWorkspaceMode === "files" && fileNetwork) {
    fileNetwork.fit({ animation: { duration: 280 } });
    setTimeout(updateFileZoomDisplay, 300);
  }
}

function toggleSidebar() {
  document.body.classList.toggle("sidebar-collapsed");
  const isCollapsed = document.body.classList.contains("sidebar-collapsed");
  const icon = document.getElementById("sidebarToggleIcon");
  if (icon) icon.textContent = isCollapsed ? "▶" : "◀";
  const btn = document.getElementById("btnToggleSidebar");
  if (btn) btn.classList.toggle("active", isCollapsed);

  setTimeout(() => {
    if (currentWorkspaceMode === "graph" && network) {
      network.redraw();
      network.fit({ animation: { duration: 250 } });
    } else if (currentWorkspaceMode === "files" && fileNetwork) {
      fileNetwork.redraw();
      fileNetwork.fit({ animation: { duration: 250 } });
      setTimeout(updateFileZoomDisplay, 260);
    }
  }, 290);
}

function toggleInspector() {
  document.body.classList.toggle("inspector-collapsed");
  const isCollapsed = document.body.classList.contains("inspector-collapsed");
  const icon = document.getElementById("inspectorToggleIcon");
  if (icon) icon.textContent = isCollapsed ? "◀" : "▶";
  const btn = document.getElementById("btnToggleInspector");
  if (btn) btn.classList.toggle("active", isCollapsed);

  setTimeout(() => {
    if (currentWorkspaceMode === "graph" && network) {
      network.redraw();
      network.fit({ animation: { duration: 250 } });
    } else if (currentWorkspaceMode === "files" && fileNetwork) {
      fileNetwork.redraw();
      fileNetwork.fit({ animation: { duration: 250 } });
      setTimeout(updateFileZoomDisplay, 260);
    }
  }, 290);
}

function toggleFullscreenCanvas() {
  const isBothCollapsed = document.body.classList.contains("sidebar-collapsed") &&
                          document.body.classList.contains("inspector-collapsed");
  if (isBothCollapsed) {
    document.body.classList.remove("sidebar-collapsed", "inspector-collapsed");
  } else {
    document.body.classList.add("sidebar-collapsed", "inspector-collapsed");
  }

  const isLeftCollapsed = document.body.classList.contains("sidebar-collapsed");
  const isRightCollapsed = document.body.classList.contains("inspector-collapsed");
  const iconL = document.getElementById("sidebarToggleIcon");
  if (iconL) iconL.textContent = isLeftCollapsed ? "▶" : "◀";
  const iconR = document.getElementById("inspectorToggleIcon");
  if (iconR) iconR.textContent = isRightCollapsed ? "◀" : "▶";

  setTimeout(() => {
    if (currentWorkspaceMode === "graph" && network) {
      network.redraw();
      network.fit({ animation: { duration: 250 } });
    } else if (currentWorkspaceMode === "files" && fileNetwork) {
      fileNetwork.redraw();
      fileNetwork.fit({ animation: { duration: 250 } });
      setTimeout(updateFileZoomDisplay, 260);
    }
  }, 290);
}

async function handleFilterChange() {
  const selectedProject = document.getElementById("projectFilter").value;
  const currentProject = selectedProject === "ALL" ? (rawData[0]?.project || "mapping-projek") : selectedProject;

  // 1. Strict Inspector Isolation: If currently selected module is not in selected project, select the first one!
  const filteredMods = getFilteredModules();
  const currentActive = rawData.find(d => d.id === selectedId);
  if (!currentActive || (selectedProject !== "ALL" && currentActive.project !== selectedProject)) {
    if (filteredMods.length > 0) {
      selectModule(filteredMods[0].id, false);
    }
  }

  // 2. Refresh sidebar and memory graph
  renderSidebarList();
  syncMemoryGraphData(true);

  // 3. Load files dynamically for the selected project
  await loadProjectFiles(currentProject);
  if (fileNetwork) {
    renderFileDependencyMap();
  }

  // 4. Update audits for the selected project
  if (currentWorkspaceMode === "security") {
    loadSecurityAudit(false);
  } else if (currentWorkspaceMode === "performance") {
    loadPerformanceAudit(false);
  }
}

async function updateProjectFilterOptions() {
  let projects = [...new Set(rawData.map(d => d.project))].filter(Boolean);
  try {
    const res = await fetch(`${BRIDGE_URL}/api/projects`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.projects)) {
        projects = [...new Set([...projects, ...data.projects])].filter(Boolean);
      }
    }
  } catch {}

  const selectEl = document.getElementById("projectFilter");
  if (!selectEl) return;
  const currentVal = selectEl.value;
  selectEl.innerHTML = '<option value="ALL">all_projects</option>';
  projects.forEach(p => {
    const opt = document.createElement("option");
    opt.value = p;
    opt.textContent = p;
    selectEl.appendChild(opt);
  });
  if (projects.includes(currentVal)) {
    selectEl.value = currentVal;
  }
}

function toggleTheme() {
  const html = document.documentElement;
  const btn = document.getElementById("themeBtn");
  const next = html.getAttribute("data-theme") === "dark" ? "light" : "dark";
  html.setAttribute("data-theme", next);
  btn.textContent = next === "dark" ? "light" : "dark";
  syncMemoryGraphData(false);
  if (fileNetwork) renderFileDependencyMap(selectedFileId);
  if (currentWorkspaceMode === "flow") {
    renderCurrentSimulationState();
  } else if (currentWorkspaceMode === "security") {
    renderSecurityIssues();
  }
}

// ============================================================================
// 11. BRIDGE API & MODAL HANDLERS
// ============================================================================
async function checkBridge() {
  try {
    const res = await fetch(`${BRIDGE_URL}/api/status`, { signal: AbortSignal.timeout(1500) });
    if (res.ok) {
      isBridgeOnline = true;
      document.getElementById("bridgeDot").className = "status-dot online";
      document.getElementById("bridgeText").textContent = "bridge:ok";
      return;
    }
  } catch {}
  isBridgeOnline = false;
  document.getElementById("bridgeDot").className = "status-dot";
  document.getElementById("bridgeText").textContent = "static";
}

function showToast(msg, isSuccess = false) {
  const toast = document.getElementById("toastMessage");
  if (toast) {
    toast.textContent = msg;
    toast.className = "toast show" + (isSuccess ? " toast-success" : "");
    setTimeout(() => toast.classList.remove("show"), 2600);
  }

  const statusEl = document.getElementById("sync-status");
  if (statusEl) {
    statusEl.textContent = msg;
    statusEl.style.display = "block";
    if (isSuccess) statusEl.className = "sync-status-text toast-success";
  }
}

async function handleSyncVaultClick() {
  const btn = document.getElementById("btn-sync-vault");
  if (btn) btn.disabled = true;
  const statusEl = document.getElementById("sync-status");
  if (statusEl) {
    statusEl.style.display = "block";
    statusEl.textContent = "Menyinkronkan 19 modul...";
  }

  try {
    const res = await fetch(`${BRIDGE_URL}/api/sync_vault`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectSlug: "my-music" })
    });

    if (res.ok) {
      const data = await res.json();
      const count = data.syncedCount || (data.modules ? data.modules.length : 19);
      const msg = `Berhasil disinkronkan: ${count} modul my-music dari MCP Vault!`;
      showToast(msg, true);
      if (statusEl) {
        statusEl.className = "sync-status-text toast-success";
        statusEl.textContent = msg;
      }

      if (Array.isArray(data.modules) && data.modules.length > 0) {
        const syncedMods = data.modules.map((m, idx) => ({
          id: `vault_mm_${idx + 1}`,
          project: "my-music",
          category: m.category || "architecture",
          module: m.module_name,
          content: m.content || "",
          dependencies: Array.isArray(m.dependencies) ? m.dependencies : [],
          updated_at: m.updated_at || new Date().toISOString()
        }));

        rawData = rawData.filter(m => m.project !== "my-music").concat(syncedMods);
      }

      await updateProjectFilterOptions();
      const sel = document.getElementById("projectFilter");
      if (sel) sel.value = "my-music";

      await handleFilterChange();
      const firstMyMusic = rawData.find(d => d.project === "my-music");
      if (firstMyMusic) selectModule(firstMyMusic.id, false);
    } else {
      const err = await res.json().catch(() => ({ error: "Sync failed" }));
      showToast(`Gagal sinkronisasi: ${err.error || res.statusText}`);
    }
  } catch (err) {
    showToast(`Error sinkronisasi vault: ${err.message}`);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function openModal(id) { document.getElementById(id).classList.add("active"); }
function closeModal(id) { document.getElementById(id).classList.remove("active"); }

function openScanModal() {
  const input = document.getElementById("scanPathInput");
  if (input) input.value = "";

  const container = document.getElementById("scanQuickSuggestions");
  if (container) {
    let recent = [];
    try {
      recent = JSON.parse(localStorage.getItem("recent_scanned_projects") || "[]");
    } catch {}

    if (recent.length === 0) {
      recent = [
        "/run/media/joan/7838E7CB38E7868A/Projek/Mapping Projek",
        "/home/joan/mcp-memory-server"
      ];
    }

    container.innerHTML = recent.map(p => `
      <span class="file-pill" onclick="document.getElementById('scanPathInput').value='${p}'" style="cursor:pointer; font-size:10px;">
        📁 ${p.split('/').pop() || p}
      </span>
    `).join("");
  }

  openModal("scanModal");
  setTimeout(() => {
    const el = document.getElementById("scanPathInput");
    if (el) el.focus();
  }, 100);
}

async function executeGuiProjectScan() {
  const pathVal = document.getElementById("scanPathInput").value.trim();
  if (!pathVal) {
    showToast("Masukkan path folder proyek terlebih dahulu!");
    return;
  }
  const resetVal = document.getElementById("scanResetCheck").checked;
  const btn = document.getElementById("btnExecuteScan");
  btn.disabled = true;
  btn.textContent = "⏳ memindai...";

  try {
    const res = await fetch(`${BRIDGE_URL}/api/scan_project`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: pathVal, reset: resetVal })
    });
    const data = await res.json();
    if (data.success) {
      closeModal("scanModal");
      showToast(`✅ Berhasil dipindai: ${data.projectSlug} (${data.totalFiles} berkas)`);

      // STRICT ISOLATION: When scanning Project A, Project B does not leak in!
      rawData = [];
      securityAuditCache = {};
      performanceAuditCache = {};

      try {
        let recent = JSON.parse(localStorage.getItem("recent_scanned_projects") || "[]");
        recent = [pathVal, ...recent.filter(p => p !== pathVal)].slice(0, 5);
        localStorage.setItem("recent_scanned_projects", JSON.stringify(recent));
      } catch {}

      await loadLiveDataFromBackend();

      const sel = document.getElementById("projectFilter");
      if (sel) {
        sel.value = data.projectSlug;
      }

      await handleFilterChange();
      setTimeout(() => fitActiveGraph(), 200);
    } else {
      showToast(`❌ Gagal: ${data.error || "Direktori tidak valid"}`);
    }
  } catch (err) {
    showToast(`❌ Error: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = "🚀 mulai_scan";
  }
}

function confirmDeleteModule(project, moduleName, category) {
  pendingDeleteTarget = { project, moduleName, category };
  document.getElementById("deleteModalDesc").innerHTML =
    `Hapus modul <code>${project}/${category}/${moduleName}</code> dari penyimpanan memori?`;
  openModal("deleteModal");
}

async function executeDeleteModule() {
  if (!pendingDeleteTarget) return;
  closeModal("deleteModal");
  const { project, moduleName } = pendingDeleteTarget;

  try {
    const res = await fetch(`${BRIDGE_URL}/api/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project, moduleName })
    });
    const result = await res.json();
    if (result.success) {
      rawData = rawData.filter(d => !(d.project === project && d.module === moduleName));
      showToast(`deleted: ${moduleName}`);
      document.getElementById("inspectorPanel").innerHTML = '<div class="empty-state">Modul telah dihapus.</div>';
      updateProjectFilterOptions();
      renderSidebarList();
      syncMemoryGraphData(true);
      return;
    }
  } catch {}

  const cliCmd = `node ./bin/project-mapper.js memory-delete ${moduleName}`;
  document.getElementById("cliCommandBox").textContent = cliCmd;
  openModal("cliFallbackModal");
}

function handleClearProjectClick() {
  const proj = document.getElementById("projectFilter").value;
  if (proj === "ALL") {
    showToast("Pilih proyek spesifik terlebih dahulu di dropdown");
    return;
  }
  pendingClearProject = proj;
  document.getElementById("clearModalDesc").innerHTML =
    `Hapus seluruh modul pada proyek <code>${proj}</code>?`;
  openModal("clearModal");
}

async function executeClearProject() {
  if (!pendingClearProject) return;
  closeModal("clearModal");
  const project = pendingClearProject;

  try {
    const res = await fetch(`${BRIDGE_URL}/api/clear`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project })
    });
    const result = await res.json();
    if (result.success) {
      rawData = rawData.filter(d => d.project !== project);
      showToast(`dropped: ${project}`);
      updateProjectFilterOptions();
      document.getElementById("projectFilter").value = "ALL";
      renderSidebarList();
      syncMemoryGraphData(true);
      return;
    }
  } catch {}

  const cliCmd = `node ./bin/project-mapper.js clear`;
  document.getElementById("cliCommandBox").textContent = cliCmd;
  openModal("cliFallbackModal");
}

function copyCliCommand() {
  const cmd = document.getElementById("cliCommandBox").textContent;
  navigator.clipboard.writeText(cmd).then(() => {
    showToast("copied to clipboard");
  }).catch(() => {
    const temp = document.createElement("textarea");
    temp.value = cmd;
    document.body.appendChild(temp);
    temp.select();
    document.execCommand("copy");
    document.body.removeChild(temp);
    showToast("copied to clipboard");
  });
}

// ============================================================================
// 12. DYNAMIC LIVE DATA SYNC & BOOTSTRAP
// ============================================================================
async function loadLiveDataFromBackend() {
  let activeSlug = "mapping-projek";
  try {
    const res = await fetch(`${BRIDGE_URL}/api/project`);
    if (res.ok) {
      const data = await res.json();
      activeSlug = data.meta?.project_slug || data.digest?.project_slug || "mapping-projek";

      if (Array.isArray(data.modules) && data.modules.length > 0) {
        const liveModules = data.modules.map((m, idx) => ({
          id: idx + 1,
          project: m.project_slug || activeSlug,
          category: m.category || "architecture",
          module: m.module_name,
          content: m.summary || "",
          dependencies: Array.isArray(m.dependencies) ? m.dependencies : [],
          updated_at: m.updated_at || new Date().toISOString()
        }));

        const existingKeys = new Set(liveModules.map(m => `${m.project}::${m.module}`));
        const otherModules = rawData.filter(m => m.project !== activeSlug && !existingKeys.has(`${m.project}::${m.module}`));
        rawData = [...liveModules, ...otherModules];
      } else {
        const otherModules = rawData.filter(m => m.project !== activeSlug);
        rawData = [{
          id: 1,
          project: activeSlug,
          category: "architecture",
          module: "system_overview",
          content: `### Sistem Overview: ${data.meta?.name || activeSlug}
${data.meta?.system_overview || 'Arsitektur dan sistem kode proyek.'}

*Proyek baru terpetakan secara otomatis (0 AI Token).*`,
          dependencies: [],
          updated_at: new Date().toISOString()
        }, ...otherModules];
      }
    }
  } catch (err) {
    console.warn("Could not fetch /api/project live data:", err);
  }

  await updateProjectFilterOptions();
  await loadProjectFiles(activeSlug);

  renderSidebarList();
  syncMemoryGraphData(true);

  const defMod = rawData.find(d => d.project === activeSlug && d.module === "system_overview") ||
                 rawData.find(d => d.project === activeSlug) ||
                 rawData[0];
  if (defMod) selectModule(defMod.id, false);
}

window.onload = async function () {
  await updateProjectFilterOptions();
  initMemoryGraph();
  renderSidebarList();
  syncMemoryGraphData(true);

  const defMod = rawData.find(d => d.module === "system_overview") || rawData[0];
  if (defMod) selectModule(defMod.id, false);

  checkBridge();
  setInterval(checkBridge, 5000);
  await loadLiveDataFromBackend();
};

// ============================================================================
// 12. AUDIT KEAMANAN & PERFORMA ENGINE
// ============================================================================
let securityAuditCache = {};
let performanceAuditCache = {};
let securityAuditData = null;
let currentSecurityFilter = "ALL";
let performanceAuditData = null;

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function loadSecurityAudit(forceRefresh = false) {
  const currentProject = getSelectedProject();
  const badgeEl = document.getElementById("securityGradeBadge");
  const summaryEl = document.getElementById("securityScoreSummary");
  const listEl = document.getElementById("securityIssuesList");
  if (!badgeEl || !listEl) return;

  if (forceRefresh) showToast(`Sedang memindai ulang keamanan [${currentProject}]...`);

  if (!securityAuditCache[currentProject] || forceRefresh) {
    if (summaryEl) summaryEl.textContent = `Memindai seluruh berkas proyek [${currentProject}]...`;
    listEl.innerHTML = `<div style="padding:20px; color:var(--text-muted); font-family:'JetBrains Mono', monospace;">Sedang menjalankan analisis AST & Taint Tracker untuk ${currentProject}...</div>`;
    try {
      const res = await fetch(`${BRIDGE_URL}/api/security_audit?project=${encodeURIComponent(currentProject)}`);
      if (!res.ok) throw new Error("Gagal mengambil data audit keamanan");
      securityAuditCache[currentProject] = await res.json();
    } catch (err) {
      if (summaryEl) summaryEl.textContent = `Error audit [${currentProject}]: ${err.message}`;
      listEl.innerHTML = `<div style="padding:20px; color:var(--c-danger);">Gagal memuat audit keamanan: ${err.message}</div>`;
      showToast(`Error: ${err.message}`);
      return;
    }
  }

  securityAuditData = securityAuditCache[currentProject];

  // Update badges & stats
  const grade = securityAuditData.grade || "A";
  badgeEl.className = `audit-grade-pill grade-${grade.toLowerCase()}`;
  badgeEl.textContent = `GRADE ${grade}`;
  if (summaryEl) summaryEl.textContent = `Projek: ${currentProject} • Skor Keamanan: ${securityAuditData.score}/100 • Total Temuan: ${securityAuditData.totalIssues}`;

  const cEl = document.getElementById("statSecCritical");
  if (cEl) cEl.textContent = securityAuditData.summary ? securityAuditData.summary.critical : 0;
  const hEl = document.getElementById("statSecHigh");
  if (hEl) hEl.textContent = securityAuditData.summary ? securityAuditData.summary.high : 0;
  const mEl = document.getElementById("statSecMedium");
  if (mEl) mEl.textContent = securityAuditData.summary ? securityAuditData.summary.medium : 0;
  const lEl = document.getElementById("statSecLow");
  if (lEl) lEl.textContent = securityAuditData.summary ? securityAuditData.summary.low : 0;

  renderSecurityIssues();
  if (forceRefresh) showToast(`Audit keamanan [${currentProject}] selesai!`, true);
}

function filterSecurityIssues(sev) {
  currentSecurityFilter = sev;
  const btns = ["secFilterAll", "secFilterCritical", "secFilterHigh", "secFilterMedium"];
  btns.forEach(b => {
    const el = document.getElementById(b);
    if (el) el.classList.remove("active");
  });
  if (sev === "ALL" && document.getElementById("secFilterAll")) document.getElementById("secFilterAll").classList.add("active");
  if (sev === "CRITICAL" && document.getElementById("secFilterCritical")) document.getElementById("secFilterCritical").classList.add("active");
  if (sev === "HIGH" && document.getElementById("secFilterHigh")) document.getElementById("secFilterHigh").classList.add("active");
  if (sev === "MEDIUM" && document.getElementById("secFilterMedium")) document.getElementById("secFilterMedium").classList.add("active");

  renderSecurityIssues();
}

function renderSecurityIssues() {
  const listEl = document.getElementById("securityIssuesList");
  if (!listEl || !securityAuditData) return;

  let issues = securityAuditData.issues || [];
  if (currentSecurityFilter !== "ALL") {
    issues = issues.filter(iss => iss.severity === currentSecurityFilter);
  }

  if (issues.length === 0) {
    listEl.innerHTML = '<div style="padding:24px; text-align:center; color:var(--c-api); font-family:\'JetBrains Mono\', monospace; background:var(--bg-subtle); border-radius:6px; border:1px solid var(--border);">✔ TIDAK DITEMUKAN KERENTANAN PADA KATEGORI INI</div>';
    return;
  }

  listEl.innerHTML = issues.map(iss => {
    const sevColor = iss.severity === "CRITICAL" ? "var(--c-danger)" : (iss.severity === "HIGH" ? "#f97316" : (iss.severity === "MEDIUM" ? "var(--c-rules)" : "var(--c-arch)"));
    return `
      <div class="issue-card" style="border-left: 3px solid ${sevColor};">
        <div class="issue-title-bar">
          <span class="issue-title">
            <span style="color:${sevColor}; font-weight:700;">[${iss.severity}]</span> ${iss.title}
          </span>
          <span class="issue-meta-pill" style="color:var(--text-muted);">${iss.category}</span>
        </div>
        <div style="font-size:11.5px; color:var(--text-muted); font-family:'JetBrains Mono',monospace; margin-bottom:6px;">
          ${iss.filePath} : baris ${iss.lineNumber}
        </div>
        <div style="font-size:12.5px; color:var(--text-body); margin-bottom:6px;">
          ${iss.description}
        </div>
        ${iss.codeSnippet ? `<div class="issue-code-box"><code>${escapeHtml(iss.codeSnippet)}</code></div>` : ''}
        <div class="issue-remedy">
          <strong>Rekomendasi Remediasi:</strong> ${iss.recommendation}
        </div>
      </div>
    `;
  }).join('');
}

async function loadPerformanceAudit(forceRefresh = false) {
  const currentProject = getSelectedProject();
  const badgeEl = document.getElementById("perfHealthBadge");
  const summaryEl = document.getElementById("perfScoreSummary");
  const n1ListEl = document.getElementById("perfN1List");
  const fkListEl = document.getElementById("perfMissingIdxList");
  if (!badgeEl || !n1ListEl || !fkListEl) return;

  if (forceRefresh) showToast(`Sedang memindai ulang performa [${currentProject}]...`);

  if (!performanceAuditCache[currentProject] || forceRefresh) {
    if (summaryEl) summaryEl.textContent = `Menganalisis 3D N+1 Queries & Schema Differ [${currentProject}]...`;
    n1ListEl.innerHTML = `<div style="padding:16px; color:var(--text-muted); font-family:'JetBrains Mono', monospace;">Memindai pola loop & relasi ORM [${currentProject}]...</div>`;
    fkListEl.innerHTML = `<div style="padding:16px; color:var(--text-muted); font-family:'JetBrains Mono', monospace;">Membandingkan foreign keys dengan indexes [${currentProject}]...</div>`;
    try {
      const res = await fetch(`${BRIDGE_URL}/api/performance_audit?project=${encodeURIComponent(currentProject)}`);
      if (!res.ok) throw new Error("Gagal mengambil data audit performa");
      performanceAuditCache[currentProject] = await res.json();
    } catch (err) {
      if (summaryEl) summaryEl.textContent = `Error audit [${currentProject}]: ${err.message}`;
      n1ListEl.innerHTML = `<div style="padding:16px; color:var(--c-danger);">Gagal memuat audit performa: ${err.message}</div>`;
      showToast(`Error: ${err.message}`);
      return;
    }
  }

  performanceAuditData = performanceAuditCache[currentProject];

  const health = performanceAuditData.health || "OPTIMAL";
  badgeEl.className = `audit-grade-pill ${health === "OPTIMAL" ? "grade-a" : (health === "WARNING" ? "grade-c" : "grade-f")}`;
  badgeEl.textContent = `HEALTH: ${health}`;
  if (summaryEl) summaryEl.textContent = `Projek: ${currentProject} • Skor Efisiensi: ${performanceAuditData.score}/100 • Total Temuan: ${performanceAuditData.totalFindings}`;

  const n1El = document.getElementById("statPerfN1");
  if (n1El) n1El.textContent = performanceAuditData.nPlusOneCount || 0;
  const fkEl = document.getElementById("statPerfMissingIdx");
  if (fkEl) fkEl.textContent = performanceAuditData.missingIndexCount || 0;

  // Render N+1 findings
  const n1Findings = performanceAuditData.nPlusOneFindings || [];
  if (n1Findings.length === 0) {
    n1ListEl.innerHTML = '<div style="padding:16px; text-align:center; color:var(--c-api); font-family:\'JetBrains Mono\', monospace; background:var(--bg-subtle); border-radius:6px; border:1px solid var(--border);">✔ TIDAK TERDETEKSI N+1 QUERIES PADA LOOP</div>';
  } else {
    n1ListEl.innerHTML = n1Findings.map(n1 => `
      <div class="issue-card" style="border-left: 3px solid var(--c-rules);">
        <div class="issue-title-bar">
          <span class="issue-title">
            <span style="color:var(--c-rules); font-weight:700;">[${n1.dimension}]</span> Operasi Query Dalam Perulangan
          </span>
          <span class="issue-meta-pill" style="color:var(--text-muted);">${n1.filePath} : ${n1.queryLineNumber}</span>
        </div>
        <div style="font-size:12.5px; color:var(--text-body); margin-bottom:6px;">
          ${n1.description}
        </div>
        <div class="issue-code-box">
          <div style="color:var(--text-muted); font-size:10px;">LOOP DI BARIS ${n1.loopLineNumber}:</div>
          <code>${escapeHtml(n1.loopSnippet)}</code>
          <div style="color:var(--c-danger); font-size:10px; margin-top:4px;">QUERY DI BARIS ${n1.queryLineNumber}:</div>
          <code>${escapeHtml(n1.querySnippet)}</code>
        </div>
        <div class="issue-remedy">
          <strong>Solusi Optimasi:</strong> ${n1.recommendation}
        </div>
      </div>
    `).join('');
  }

  // Render Missing Indexes findings
  const fkFindings = performanceAuditData.missingIndexFindings || [];
  if (fkFindings.length === 0) {
    fkListEl.innerHTML = '<div style="padding:16px; text-align:center; color:var(--c-api); font-family:\'JetBrains Mono\', monospace; background:var(--bg-subtle); border-radius:6px; border:1px solid var(--border);">✔ SELURUH FOREIGN KEY SUDAH MEMILIKI INDEX</div>';
  } else {
    fkListEl.innerHTML = fkFindings.map(fk => `
      <div class="issue-card" style="border-left: 3px solid var(--c-api);">
        <div class="issue-title-bar">
          <span class="issue-title">
            <span style="color:var(--c-api); font-weight:700;">[MISSING_INDEX]</span> Kolom '${fk.column}' pada tabel '${fk.table}'
          </span>
          <span class="issue-meta-pill" style="color:var(--text-muted);">${fk.filePath} : ${fk.lineNumber}</span>
        </div>
        <div style="font-size:12.5px; color:var(--text-body); margin-bottom:6px;">
          ${fk.description}
        </div>
        <div class="issue-code-box">
          <div style="color:var(--text-muted); font-size:10px;">SQL INDEX REKOMENDASI:</div>
          <code>${escapeHtml(fk.suggestedSql)}</code>
        </div>
        <div class="issue-remedy">
          <strong>Migration Snippet:</strong> <code>${escapeHtml(fk.suggestedMigration)}</code>
        </div>
      </div>
    `).join('');
  }
  if (forceRefresh) showToast(`Audit performa [${currentProject}] selesai!`, true);
}

// Global Keyboard Shortcuts for Panel Management
window.addEventListener("keydown", (e) => {
  if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable)) return;
  if (e.key === "[" || (e.ctrlKey && e.key === "b")) {
    e.preventDefault();
    toggleSidebar();
  } else if (e.key === "]") {
    e.preventDefault();
    toggleInspector();
  } else if (e.key === "f" || e.key === "F") {
    e.preventDefault();
    toggleFullscreenCanvas();
  }
});

