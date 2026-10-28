import { test, describe, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as http from 'node:http';
import { startDashboardServer } from '../src/server/dashboard_server.js';
import { SessionManager } from '../src/engine/session_manager.js';

describe('Dashboard Server Integration Tests', () => {
  let tmpDir: string;
  let serverInstance: http.Server;
  let serverUrl: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'proj-map-ui-test-'));

    // Create a mock source file
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'src', 'app.ts'),
      'export class AppService { run() { console.log("running"); } }'
    );

    const manager = new SessionManager(tmpDir);
    manager.initProject();

    // Start server on dynamic ephemeral port
    const started = await startDashboardServer({ port: 0, workspacePath: tmpDir });
    serverInstance = started.server;
    serverUrl = started.url;
  });

  afterEach(async () => {
    if (serverInstance) {
      await new Promise<void>((resolve) => serverInstance.close(() => resolve()));
    }
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('should serve /api/project JSON data', async () => {
    const res = await fetch(`${serverUrl}/api/project`);
    assert.strictEqual(res.status, 200);

    const data = await res.json();
    assert.strictEqual(typeof data.digest, 'object');
    assert.strictEqual(typeof data.digest.project_slug, 'string');
  });

  test('should serve /api/graph with code nodes and edges', async () => {
    const res = await fetch(`${serverUrl}/api/graph`);
    assert.strictEqual(res.status, 200);

    const data = await res.json();
    assert.strictEqual(Array.isArray(data.nodes), true);
    assert.strictEqual(Array.isArray(data.edges), true);
    assert.strictEqual(typeof data.totalNodes, 'number');
  });

  test('should serve static index.html on root /', async () => {
    const res = await fetch(`${serverUrl}/`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('content-type')?.includes('text/html'), true);

    const text = await res.text();
    assert.strictEqual(text.includes('PROJECT MAPPER'), true);
  });

  test('should handle /api/scan_project and switch project in GUI', async () => {
    const newProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'new-proj-test-'));
    fs.mkdirSync(path.join(newProjectDir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(newProjectDir, 'src', 'service.ts'),
      'export class UserService { getUser() { return { id: 1 }; } }'
    );

    const res = await fetch(`${serverUrl}/api/scan_project`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: newProjectDir, reset: true })
    });
    assert.strictEqual(res.status, 200);

    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(typeof data.projectSlug, 'string');
    assert.strictEqual(data.totalFiles >= 1, true);

    // Verify /api/project now returns the new project!
    const projRes = await fetch(`${serverUrl}/api/project`);
    const projData = await projRes.json();
    assert.strictEqual(projData.digest.project_slug, data.projectSlug);

    fs.rmSync(newProjectDir, { recursive: true, force: true });
  });

  test('should handle /api/sync_vault and sync exactly 19 my-music modules', async () => {
    // 1. Create a mock vault DB mimicking ~/.local/share/mcp-memory/projects_vault.db
    const vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-test-'));
    const vaultPath = path.join(vaultDir, 'projects_vault.db');
    const { DatabaseSync } = await import('node:sqlite');
    const vaultDb = new DatabaseSync(vaultPath);
    vaultDb.exec(`
      CREATE TABLE project_memory (
        project_slug TEXT NOT NULL,
        category TEXT NOT NULL,
        module_name TEXT NOT NULL,
        content TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        dependencies TEXT DEFAULT '[]',
        PRIMARY KEY (project_slug, category, module_name)
      );
    `);

    const sampleModules = [
      ['my-music', 'api', 'lrclib_lyrics_api', '[]'],
      ['my-music', 'api', 'youtube_extractor', '["core_model","core_network"]'],
      ['my-music', 'api', 'youtube_innertube_api', '["youtube_extractor","player_service"]'],
      ['my-music', 'architecture', 'offline_and_settings', '[]'],
      ['my-music', 'architecture', 'system_overview', '[]'],
      ['my-music', 'architecture', 'youtube_extractor', '["core_common","domain"]'],
      ['my-music', 'architecture', 'audio_player_engine', '[]'],
      ['my-music', 'architecture', 'download_manager', '[]'],
      ['my-music', 'architecture', 'lyrics_subsystem', '[]'],
      ['my-music', 'architecture', 'android_player_engine', '["player_engine","core_model"]'],
      ['my-music', 'architecture', 'ui_components', '["core_common","core_designsystem","player_engine","youtube_extractor"]'],
      ['my-music', 'architecture', 'video_player_view', '["ui_components"]'],
      ['my-music', 'architecture', 'youtube_caching_system', '[]'],
      ['my-music', 'architecture', 'native_video_player', '["youtube_caching_system"]'],
      ['my-music', 'architecture', 'media_loading_optimization', '["youtube_innertube_api","player_service"]'],
      ['my-music', 'database', 'local_database_schema', '[]'],
      ['my-music', 'rules', 'offline_playback_rules', '[]'],
      ['my-music', 'rules', 'project_rules', '[]'],
      ['my-music', 'rules', 'isolated_mcp_protocol', '["system_overview", "project_rules"]']
    ];

    const ins = vaultDb.prepare(`
      INSERT INTO project_memory (project_slug, category, module_name, content, dependencies)
      VALUES (?, ?, ?, 'Module content', ?)
    `);
    for (const [slug, cat, mod, deps] of sampleModules) {
      ins.run(slug, cat, mod, deps);
    }
    vaultDb.close();

    process.env.MCP_VAULT_DB_PATH = vaultPath;

    const res = await fetch(`${serverUrl}/api/sync_vault`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectSlug: 'my-music' })
    });
    assert.strictEqual(res.status, 200);

    const data = await res.json();
    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.projectSlug, 'my-music');
    assert.strictEqual(data.syncedCount, 19);

    // Verify local DB table project_memory has 19 rows
    const localDbPath = path.join(tmpDir, '.project-memory', 'memory.db');
    const localDb = new DatabaseSync(localDbPath, { readOnly: true });
    const rows = localDb.prepare('SELECT module_name, category FROM project_memory WHERE project_slug = ?').all('my-music');
    assert.strictEqual(rows.length, 19);
    localDb.close();

    // Verify /api/graph?project=my-music
    const graphRes = await fetch(`${serverUrl}/api/graph?project=my-music`);
    assert.strictEqual(graphRes.status, 200);
    const graphData = await graphRes.json();
    const nodeIds = new Set(graphData.nodes.map((n: any) => n.id));
    assert.strictEqual(nodeIds.size >= 18, true);

    for (const edge of graphData.edges) {
      assert.strictEqual(nodeIds.has(edge.source), true, `Dangling edge source: ${edge.source}`);
      assert.strictEqual(nodeIds.has(edge.target), true, `Dangling edge target: ${edge.target}`);
    }

    // Verify /api/projects returns both projects
    const projListRes = await fetch(`${serverUrl}/api/projects`);
    assert.strictEqual(projListRes.status, 200);
    const projListData = await projListRes.json();
    assert.strictEqual(Array.isArray(projListData.projects), true);
    assert.strictEqual(projListData.projects.includes('my-music'), true);

    // Verify /api/security_audit?project=my-music
    const secRes = await fetch(`${serverUrl}/api/security_audit?project=my-music`);
    assert.strictEqual(secRes.status, 200);
    const secData = await secRes.json();
    assert.strictEqual(secData.projectSlug, 'my-music');
    assert.strictEqual(typeof secData.score, 'number');

    // Verify /api/performance_audit?project=my-music
    const perfRes = await fetch(`${serverUrl}/api/performance_audit?project=my-music`);
    assert.strictEqual(perfRes.status, 200);
    const perfData = await perfRes.json();
    assert.strictEqual(perfData.projectSlug, 'my-music');
    assert.strictEqual(typeof perfData.score, 'number');

    // Verify virtual /api/file_content for my-music module
    const fileRes = await fetch(`${serverUrl}/api/file_content?path=modules/api/lrclib_lyrics_api`);
    assert.strictEqual(fileRes.status, 200);
    const fileData = await fileRes.json();
    assert.strictEqual(fileData.content.includes('Module content'), true);

    delete process.env.MCP_VAULT_DB_PATH;
    fs.rmSync(vaultDir, { recursive: true, force: true });
  });
});
