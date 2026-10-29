import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as url from 'node:url';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { SessionManager } from '../engine/session_manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, '../../public');

export interface DashboardServerOptions {
  port?: number;
  workspacePath?: string;
}

export function startDashboardServer(options?: DashboardServerOptions): Promise<{ server: http.Server; port: number; url: string }> {
  const workspace = options?.workspacePath || process.cwd();
  const masterManager = new SessionManager(workspace);
  let manager = masterManager;
  const requestedPort = options?.port !== undefined ? options.port : 3333;

  function getManagerForProject(slug?: string): SessionManager {
    if (!slug || slug === 'ALL' || slug === manager.projectSlug) {
      return manager;
    }
    const meta = masterManager.db.getProjectMeta(slug) || manager.db.getProjectMeta(slug);
    if (meta && meta.root_path && fs.existsSync(meta.root_path)) {
      return new SessionManager(meta.root_path, slug);
    }
    return manager;
  }

  let activeScanProgress: {
    isScanning: boolean;
    projectSlug: string;
    rootPath: string;
    phase: string;
    stepNumber: number;
    stepTotal: number;
    stepName: string;
    currentFile: string;
    currentIndex: number;
    totalFiles: number;
    percent: number;
    errorCount: number;
    errors: Array<{ file: string; message: string }>;
    error: string | null;
    result: any;
    startTime: number;
  } = {
    isScanning: false,
    projectSlug: '',
    rootPath: '',
    phase: 'idle',
    stepNumber: 0,
    stepTotal: 4,
    stepName: '',
    currentFile: '',
    currentIndex: 0,
    totalFiles: 0,
    percent: 0,
    errorCount: 0,
    errors: [],
    error: null,
    result: null,
    startTime: 0
  };

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      // Set default CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      const parsedUrl = url.parse(req.url || '/', true);
      const pathname = parsedUrl.pathname || '/';

      // --- REST API ROUTES ---
      if (pathname.startsWith('/api/')) {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        try {
          if (pathname === '/api/status' && req.method === 'GET') {
            res.writeHead(200);
            res.end(JSON.stringify({ status: 'ok', bridge: true, project: manager.projectSlug }));
            return;
          }

          if (pathname === '/api/sync_vault' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
              try {
                const data = JSON.parse(body || '{}');
                const targetSlug = data.projectSlug || data.project || 'my-music';
                const result = manager.syncFromMcpVault(targetSlug);
                res.writeHead(200);
                res.end(JSON.stringify(result));
              } catch (err: any) {
                res.writeHead(500);
                res.end(JSON.stringify({ error: err.message }));
              }
            });
            return;
          }

          if (pathname === '/api/project' && req.method === 'GET') {
            const project = (parsedUrl.query.project as string) || manager.projectSlug;
            const targetMgr = getManagerForProject(project);

            const digest = targetMgr.getColdStartDigest();
            const meta = targetMgr.db.getProjectMeta(project) || masterManager.db.getProjectMeta(project);
            const checkpoints = targetMgr.db.getCheckpoints(project, 10);
            const decisions = targetMgr.db.getDecisions(project, 10);
            const modules = targetMgr.db.getModules(project);

            res.writeHead(200);
            res.end(JSON.stringify({ digest, meta, checkpoints, decisions, modules }));
            return;
          }

          if (pathname === '/api/scan_progress' && req.method === 'GET') {
            res.writeHead(200);
            res.end(JSON.stringify(activeScanProgress));
            return;
          }

          if (pathname === '/api/scan_project' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', async () => {
              try {
                const data = JSON.parse(body || '{}');
                const targetPath = data.path || data.workspacePath;
                if (!targetPath) {
                  res.writeHead(400);
                  res.end(JSON.stringify({ error: 'path is required' }));
                  return;
                }
                const resolved = path.resolve(targetPath);
                if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
                  res.writeHead(404);
                  res.end(JSON.stringify({ error: `Directory not found: ${resolved}` }));
                  return;
                }

                // Initialize progress tracking state
                activeScanProgress = {
                  isScanning: true,
                  projectSlug: path.basename(resolved),
                  rootPath: resolved,
                  phase: 'discovering',
                  stepNumber: 1,
                  stepTotal: 4,
                  stepName: '1/4 Inventarisasi Berkas',
                  currentFile: 'Memeriksa berkas & dependensi proyek...',
                  currentIndex: 0,
                  totalFiles: 0,
                  percent: 5,
                  errorCount: 0,
                  errors: [],
                  error: null,
                  result: null,
                  startTime: Date.now()
                };

                // If reset is requested, clear previous local memory for clean start
                if (data.reset) {
                  const memDir = path.join(resolved, '.project-memory');
                  if (fs.existsSync(memDir)) {
                    try { fs.rmSync(memDir, { recursive: true, force: true }); } catch {}
                  }
                }

                // Switch server active manager to the target project!
                manager = new SessionManager(resolved);
                const initRes = await manager.initProjectAsync({
                  onProgress: (p) => {
                    activeScanProgress.phase = p.phase;
                    activeScanProgress.stepNumber = p.stepNumber ?? 1;
                    activeScanProgress.stepTotal = p.stepTotal ?? 4;
                    activeScanProgress.stepName = p.stepName ?? '';
                    activeScanProgress.currentFile = p.currentFile || '';
                    activeScanProgress.currentIndex = p.currentIndex;
                    activeScanProgress.totalFiles = p.totalFiles;
                    activeScanProgress.errorCount = p.errorCount;

                    if (p.phase === 'discovering' || p.phase === 'checksumming') {
                      activeScanProgress.percent = Math.max(activeScanProgress.percent, 8);
                    } else if (p.phase === 'parsing') {
                      if (p.totalFiles > 0) {
                        // 10% to 80%
                        activeScanProgress.percent = Math.min(80, Math.round((p.currentIndex / p.totalFiles) * 70) + 10);
                      }
                    } else if (p.phase === 'resolving') {
                      activeScanProgress.percent = 88;
                    } else if (p.phase === 'finalizing') {
                      activeScanProgress.percent = 95;
                    } else if (p.phase === 'complete') {
                      activeScanProgress.percent = 100;
                    }

                    if (p.lastError) {
                      activeScanProgress.errors.push(p.lastError);
                    }
                    if (p.errors && p.errors.length > 0) {
                      activeScanProgress.errors = p.errors;
                    }
                  }
                });

                const scanResult = {
                  success: true,
                  projectSlug: manager.projectSlug,
                  name: manager.projectSlug,
                  rootPath: resolved,
                  totalFiles: initRes.totalFiles,
                  dbPath: initRes.dbPath,
                  errors: initRes.errors || []
                };

                // Permanently register the scanned project into master database registry!
                masterManager.db.saveProjectMeta({
                  project_slug: manager.projectSlug,
                  name: path.basename(resolved),
                  root_path: resolved,
                  system_overview: `Proyek dipindai dari ${resolved}`,
                  rules_and_conventions: 'Standar kode proyek.',
                  last_active_task: 'Project scanned via Dashboard GUI.'
                });

                activeScanProgress.isScanning = false;
                activeScanProgress.phase = 'complete';
                activeScanProgress.stepNumber = 4;
                activeScanProgress.stepName = 'Selesai';
                activeScanProgress.percent = 100;
                activeScanProgress.currentFile = 'Pemindaian selesai!';
                activeScanProgress.result = scanResult;

                res.writeHead(200);
                res.end(JSON.stringify(scanResult));
              } catch (err: any) {
                activeScanProgress.isScanning = false;
                activeScanProgress.phase = 'error';
                activeScanProgress.error = err.message;

                res.writeHead(500);
                res.end(JSON.stringify({ error: err.message, errors: activeScanProgress.errors }));
              }
            });
            return;
          }

          if (pathname === '/api/pick_folder') {
            const initialDir = (parsedUrl.query.initialDir as string) || path.dirname(manager.workspacePath) || manager.workspacePath;
            const formattedDir = initialDir.endsWith(path.sep) ? initialDir : initialDir + path.sep;

            const zenityArgs = [
              '--file-selection',
              '--directory',
              '--title=Pilih Direktori Proyek untuk Dipindai',
              `--filename=${formattedDir}`
            ];

            const runEnv = {
              ...process.env,
              DISPLAY: process.env.DISPLAY || ':0',
              WAYLAND_DISPLAY: process.env.WAYLAND_DISPLAY
            };

            execFile('zenity', zenityArgs, { env: runEnv }, (error, stdout) => {
              if (error) {
                // Exit code 1 typically indicates user pressed Cancel
                if ((error as any).code === 1) {
                  res.writeHead(200);
                  res.end(JSON.stringify({ success: false, cancelled: true }));
                  return;
                }
                res.writeHead(200);
                res.end(JSON.stringify({ success: false, error: error.message }));
                return;
              }

              const chosen = (stdout || '').trim();
              if (chosen && fs.existsSync(chosen) && fs.statSync(chosen).isDirectory()) {
                res.writeHead(200);
                res.end(JSON.stringify({
                  success: true,
                  path: chosen,
                  name: path.basename(chosen)
                }));
              } else {
                res.writeHead(200);
                res.end(JSON.stringify({ success: false, error: 'Path yang dipilih tidak valid atau bukan direktori' }));
              }
            });
            return;
          }

          if (pathname === '/api/browse_directories' && req.method === 'GET') {
            try {
              let targetDir = (parsedUrl.query.dir as string) || path.dirname(manager.workspacePath) || manager.workspacePath;
              targetDir = path.resolve(targetDir);
              if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
                targetDir = manager.workspacePath;
              }

              const entries = fs.readdirSync(targetDir, { withFileTypes: true });
              const subdirs = entries
                .filter(e => e.isDirectory() && !e.name.startsWith('.'))
                .map(e => ({
                  name: e.name,
                  path: path.join(targetDir, e.name)
                }))
                .sort((a, b) => a.name.localeCompare(b.name));

              res.writeHead(200);
              res.end(JSON.stringify({
                currentDir: targetDir,
                parentDir: path.dirname(targetDir),
                directories: subdirs
              }));
            } catch (err: any) {
              res.writeHead(500);
              res.end(JSON.stringify({ error: err.message }));
            }
            return;
          }

          if (pathname === '/api/projects' && req.method === 'GET') {
            try {
              const masterMeta = masterManager.db.getRawDb().prepare('SELECT project_slug, name, root_path FROM project_meta').all() as any[];
              const activeMeta = (manager !== masterManager)
                ? (manager.db.getRawDb().prepare('SELECT project_slug, name, root_path FROM project_meta').all() as any[])
                : [];
              const modProjects = masterManager.db.getRawDb().prepare('SELECT DISTINCT project_slug FROM module_memory').all() as any[];
              const nodeProjects = masterManager.db.getRawDb().prepare('SELECT DISTINCT project_slug FROM code_nodes').all() as any[];

              const map = new Map<string, { slug: string; name: string; rootPath: string }>();

              map.set(masterManager.projectSlug, {
                slug: masterManager.projectSlug,
                name: masterManager.projectSlug,
                rootPath: masterManager.workspacePath
              });

              for (const m of [...masterMeta, ...activeMeta]) {
                if (m && m.project_slug) {
                  map.set(m.project_slug, {
                    slug: m.project_slug,
                    name: m.name || m.project_slug,
                    rootPath: m.root_path || ''
                  });
                }
              }

              for (const p of [...modProjects, ...nodeProjects]) {
                if (p && p.project_slug && !map.has(p.project_slug)) {
                  map.set(p.project_slug, {
                    slug: p.project_slug,
                    name: p.project_slug,
                    rootPath: ''
                  });
                }
              }

              const allProjects = Array.from(map.values());
              const allSlugs = allProjects.map(p => p.slug);

              res.writeHead(200);
              res.end(JSON.stringify({
                activeProject: manager.projectSlug,
                projects: allSlugs,
                projectDetails: allProjects
              }));
            } catch (err: any) {
              res.writeHead(200);
              res.end(JSON.stringify({ activeProject: manager.projectSlug, projects: [manager.projectSlug] }));
            }
            return;
          }

          if (pathname === '/api/register_project' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
              try {
                const data = JSON.parse(body || '{}');
                const targetPath = data.path;
                if (targetPath && fs.existsSync(targetPath)) {
                  const resolved = path.resolve(targetPath);
                  const slug = data.slug || path.basename(resolved).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
                  masterManager.db.saveProjectMeta({
                    project_slug: slug,
                    name: path.basename(resolved),
                    root_path: resolved,
                    system_overview: `Proyek teregistrasi dari ${resolved}`,
                    rules_and_conventions: 'Standar kode proyek.',
                    last_active_task: 'Project registered.'
                  });
                  res.writeHead(200);
                  res.end(JSON.stringify({ success: true, projectSlug: slug }));
                  return;
                }
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Valid directory path required' }));
              } catch (err: any) {
                res.writeHead(500);
                res.end(JSON.stringify({ error: err.message }));
              }
            });
            return;
          }

          if (pathname === '/api/file_content' && req.method === 'GET') {
            const reqPath = parsedUrl.query.path as string;
            if (!reqPath) {
              res.writeHead(400);
              res.end(JSON.stringify({ error: 'path parameter required' }));
              return;
            }
            const resolved = path.resolve(manager.workspacePath, reqPath);
            if (resolved.startsWith(manager.workspacePath) && fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
              const content = fs.readFileSync(resolved, 'utf-8');
              res.writeHead(200);
              res.end(JSON.stringify({ path: reqPath, content }));
              return;
            }

            // Virtual file lookup in project_memory or module_memory for vault-synced projects
            try {
              const parts = reqPath.split('/');
              const modName = parts[parts.length - 1].replace(/\.[a-zA-Z0-9]+$/, '');
              const row = manager.db.getRawDb().prepare(
                'SELECT content FROM project_memory WHERE module_name = ? LIMIT 1'
              ).get(modName) as any;
              if (row && row.content) {
                res.writeHead(200);
                res.end(JSON.stringify({ path: reqPath, content: row.content }));
                return;
              }
            } catch {}

            res.writeHead(404);
            res.end(JSON.stringify({ error: 'File not found' }));
            return;
          }

          if (pathname === '/api/graph' && req.method === 'GET') {
            const rawProject = parsedUrl.query.project as string;
            const project = (!rawProject || rawProject === 'ALL') ? manager.projectSlug : rawProject;
            const targetMgr = getManagerForProject(project);
            let nodes = targetMgr.db.findNodes(project);
            let edges = targetMgr.db.getAllEdges(project);

            // Format edges with source & target aliases for contract & Playwright tests
            const formattedEdges = edges.map(e => ({
              ...e,
              source: e.source_id,
              target: e.target_id
            }));

            // Rule 5: Graph Anti-Crash Invariant - resolve any dangling edge
            const nodeIds = new Set(nodes.map(n => n.id));
            for (const e of formattedEdges) {
              if (!nodeIds.has(e.source)) {
                nodes.push({
                  id: e.source,
                  project_slug: project,
                  file_path: 'external',
                  node_type: 'class' as any,
                  name: e.source,
                  line_start: 1,
                  line_end: 1,
                  signature: `external:${e.source}`,
                  metadata: { stub: true },
                  updated_at: new Date().toISOString()
                });
                nodeIds.add(e.source);
              }
              if (!nodeIds.has(e.target)) {
                nodes.push({
                  id: e.target,
                  project_slug: project,
                  file_path: 'external',
                  node_type: 'class' as any,
                  name: e.target,
                  line_start: 1,
                  line_end: 1,
                  signature: `external:${e.target}`,
                  metadata: { stub: true },
                  updated_at: new Date().toISOString()
                });
                nodeIds.add(e.target);
              }
            }

            res.writeHead(200);
            res.end(JSON.stringify({ nodes, edges: formattedEdges, totalNodes: nodes.length, totalEdges: formattedEdges.length }));
            return;
          }

          if (pathname === '/api/endpoints' && req.method === 'GET') {
            const endpoints = manager.getEndpoints();
            res.writeHead(200);
            res.end(JSON.stringify(endpoints));
            return;
          }

          if (pathname === '/api/trace' && req.method === 'GET') {
            const query = parsedUrl.query.query as string | undefined;
            const trace = manager.traceDataFlow(query);
            res.writeHead(200);
            res.end(JSON.stringify({ trace }));
            return;
          }

          if (pathname === '/api/security_audit' && req.method === 'GET') {
            try {
              const project = (parsedUrl.query.project as string) || manager.projectSlug;
              const targetMgr = getManagerForProject(project);
              const auditResult = targetMgr.auditSecurity(project);
              res.writeHead(200);
              res.end(JSON.stringify(auditResult));
            } catch (err: any) {
              res.writeHead(500);
              res.end(JSON.stringify({ error: err.message }));
            }
            return;
          }

          if (pathname === '/api/performance_audit' && req.method === 'GET') {
            try {
              const project = (parsedUrl.query.project as string) || manager.projectSlug;
              const targetMgr = getManagerForProject(project);
              const auditResult = targetMgr.auditPerformance(project);
              res.writeHead(200);
              res.end(JSON.stringify(auditResult));
            } catch (err: any) {
              res.writeHead(500);
              res.end(JSON.stringify({ error: err.message }));
            }
            return;
          }

          if (pathname === '/api/dependency_audit' && req.method === 'GET') {
            try {
              const project = (parsedUrl.query.project as string) || manager.projectSlug;
              const targetMgr = getManagerForProject(project);
              const auditResult = await targetMgr.auditDependencies(project);
              res.writeHead(200);
              res.end(JSON.stringify(auditResult));
            } catch (err: any) {
              res.writeHead(500);
              res.end(JSON.stringify({ error: err.message }));
            }
            return;
          }

          if (pathname === '/api/sync' && req.method === 'POST') {
            const delta = manager.syncBaseline();
            res.writeHead(200);
            res.end(JSON.stringify({ success: true, delta }));
            return;
          }

          if (pathname === '/api/remap' && req.method === 'POST') {
            const result = manager.mapCodebase({ forceAll: true });
            res.writeHead(200);
            res.end(JSON.stringify({ success: true, result }));
            return;
          }

          if (pathname === '/api/delete' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
              try {
                const data = JSON.parse(body || '{}');
                const project = data.project || manager.projectSlug;
                const moduleName = data.moduleName || data.module;
                const success = manager.db.deleteModule(project, moduleName);
                res.writeHead(200);
                res.end(JSON.stringify({ success, deleted: moduleName }));
              } catch (err: any) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: err.message }));
              }
            });
            return;
          }

          if (pathname === '/api/set_active_project' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
              try {
                const data = JSON.parse(body || '{}');
                const targetSlug = data.project;
                if (targetSlug && targetSlug !== 'ALL') {
                  manager = getManagerForProject(targetSlug);
                } else if (targetSlug === 'ALL') {
                  manager = masterManager;
                }
                res.writeHead(200);
                res.end(JSON.stringify({ success: true, activeProject: manager.projectSlug }));
              } catch (err: any) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: err.message }));
              }
            });
            return;
          }

          if (pathname === '/api/clear' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
              try {
                const data = JSON.parse(body || '{}');
                const project = data.project || manager.projectSlug;

                // 1. Drop all records across all tables in the active manager DB
                manager.dropProject(project);

                // 2. If active manager was in another folder (e.g. external scanned folder), also wipe from workspace DB
                // 2. Also wipe from masterManager DB registry
                try {
                  masterManager.dropProject(project);
                } catch {}

                // 3. Reset manager back to masterManager if it was on the dropped project
                if (manager.projectSlug === project || manager.workspacePath !== workspace) {
                  manager = masterManager;
                }

                // 4. Retrieve remaining distinct project slugs
                const metaProjects = manager.db.getRawDb().prepare('SELECT DISTINCT project_slug FROM project_meta').all() as any[];
                const modProjects = manager.db.getRawDb().prepare('SELECT DISTINCT project_slug FROM module_memory').all() as any[];
                const nodeProjects = manager.db.getRawDb().prepare('SELECT DISTINCT project_slug FROM code_nodes').all() as any[];
                const allSlugs = [...new Set([
                  manager.projectSlug,
                  ...metaProjects.map(p => p.project_slug),
                  ...modProjects.map(p => p.project_slug),
                  ...nodeProjects.map(p => p.project_slug)
                ])].filter(p => p && p !== project);

                const nextActiveProject = allSlugs.includes(manager.projectSlug) && manager.projectSlug !== project
                  ? manager.projectSlug
                  : (allSlugs[0] || 'mapping-projek');

                res.writeHead(200);
                res.end(JSON.stringify({
                  success: true,
                  project,
                  nextActiveProject,
                  projects: allSlugs
                }));
              } catch (err: any) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: err.message }));
              }
            });
            return;
          }

          if (pathname === '/api/checkpoint' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
              try {
                const data = JSON.parse(body || '{}');
                const cp = manager.saveCheckpoint(data.task_summary || 'Manual Checkpoint', data.next_steps || '');
                res.writeHead(200);
                res.end(JSON.stringify({ success: true, checkpoint: cp }));
              } catch (err: any) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: err.message }));
              }
            });
            return;
          }

          res.writeHead(404);
          res.end(JSON.stringify({ error: 'API route not found' }));
          return;
        } catch (err: any) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: err.message }));
          return;
        }
      }

      // --- STATIC ASSET SERVING ---
      let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

      if (!fs.existsSync(filePath)) {
        filePath = path.join(PUBLIC_DIR, 'index.html');
      }

      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.json': 'application/json',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.ico': 'image/x-icon'
      };

      const contentType = mimeTypes[ext] || 'text/plain';

      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('File Not Found');
          return;
        }

        res.writeHead(200, {
          'Content-Type': contentType,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        });
        res.end(data);
      });
    });

    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        // Try next port
        server.listen(requestedPort + 1);
      } else {
        reject(err);
      }
    });

    server.listen(requestedPort, '0.0.0.0', () => {
      const address = server.address() as any;
      const actualPort = address.port;
      const serverUrl = `http://localhost:${actualPort}`;
      resolve({ server, port: actualPort, url: serverUrl });
    });
  });
}

// Allow direct execution: `tsx src/server/dashboard_server.ts`
if (process.argv[1]?.endsWith('dashboard_server.ts') || process.argv[1]?.endsWith('dashboard_server.js')) {
  startDashboardServer().then(({ url }) => {
    console.log(`\n🚀 Project Mapper Visual Dashboard is running at: ${url}`);
    console.log(`   Press Ctrl+C to stop.\n`);
  }).catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
