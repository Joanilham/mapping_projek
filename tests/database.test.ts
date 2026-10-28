import { test, describe, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { MemoryDatabase } from '../src/db/database.js';

describe('MemoryDatabase Unit Tests', () => {
  let tmpDir: string;
  let db: MemoryDatabase;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'proj-map-db-test-'));
    db = new MemoryDatabase(tmpDir);
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('should initialize schema and database file in .project-memory', () => {
    const dbPath = path.join(tmpDir, '.project-memory', 'memory.db');
    assert.strictEqual(fs.existsSync(dbPath), true);
    assert.strictEqual(fs.existsSync(path.join(tmpDir, '.project-memory', '.gitignore')), true);
  });

  test('should save and retrieve project metadata with special characters', () => {
    const slug = 'test-project';
    const overview = 'System with "quotes", symbols like $ & <tag>, and unicode 🚀.';
    const rules = 'Rule 1: Always use strict mode; Rule 2: O(1) lookups.';

    db.saveProjectMeta({
      project_slug: slug,
      name: 'Test Project',
      system_overview: overview,
      rules_and_conventions: rules,
      last_active_task: 'Task #1'
    });

    const meta = db.getProjectMeta(slug);
    assert.notStrictEqual(meta, null);
    assert.strictEqual(meta?.project_slug, slug);
    assert.strictEqual(meta?.name, 'Test Project');
    assert.strictEqual(meta?.system_overview, overview);
    assert.strictEqual(meta?.rules_and_conventions, rules);
    assert.strictEqual(meta?.last_active_task, 'Task #1');

    // Test update
    db.saveProjectMeta({
      project_slug: slug,
      last_active_task: 'Task #2 Updated'
    });

    const updated = db.getProjectMeta(slug);
    assert.strictEqual(updated?.last_active_task, 'Task #2 Updated');
    assert.strictEqual(updated?.system_overview, overview); // preserved
  });

  test('should save, list, and delete modules with array serialization', () => {
    const slug = 'mod-project';

    db.saveModule({
      project_slug: slug,
      module_name: 'auth_service',
      category: 'api',
      summary: 'Handles user auth and tokens',
      key_files: ['src/auth/jwt.ts', 'src/auth/login.ts'],
      dependencies: ['user_repo'],
      content_hash: 'abc123hash'
    });

    db.saveModule({
      project_slug: slug,
      module_name: 'user_repo',
      category: 'database',
      summary: 'Database operations for user entity',
      key_files: ['src/db/user.ts'],
      dependencies: [],
      content_hash: 'def456hash'
    });

    // Retrieve single
    const auth = db.getModule(slug, 'auth_service');
    assert.notStrictEqual(auth, null);
    assert.strictEqual(auth?.module_name, 'auth_service');
    assert.deepStrictEqual(auth?.key_files, ['src/auth/jwt.ts', 'src/auth/login.ts']);
    assert.deepStrictEqual(auth?.dependencies, ['user_repo']);

    // List all
    const all = db.getModules(slug);
    assert.strictEqual(all.length, 2);

    // Filter by category
    const apiOnly = db.getModules(slug, 'api');
    assert.strictEqual(apiOnly.length, 1);
    assert.strictEqual(apiOnly[0].module_name, 'auth_service');

    const dbOnly = db.getModules(slug, 'database');
    assert.strictEqual(dbOnly.length, 1);
    assert.strictEqual(dbOnly[0].module_name, 'user_repo');

    // Upsert update
    db.saveModule({
      project_slug: slug,
      module_name: 'auth_service',
      category: 'api',
      summary: 'Updated summary for auth',
      key_files: ['src/auth/jwt.ts'],
      dependencies: ['user_repo', 'session_cache'],
      content_hash: 'updated_hash'
    });

    const updatedAuth = db.getModule(slug, 'auth_service');
    assert.strictEqual(updatedAuth?.summary, 'Updated summary for auth');
    assert.deepStrictEqual(updatedAuth?.dependencies, ['user_repo', 'session_cache']);

    // Delete module
    const deleted = db.deleteModule(slug, 'auth_service');
    assert.strictEqual(deleted, true);
    assert.strictEqual(db.getModule(slug, 'auth_service'), null);
    assert.strictEqual(db.getModules(slug).length, 1);
  });

  test('should record checkpoints and return latest in order', async () => {
    const slug = 'cp-project';

    db.saveCheckpoint({
      project_slug: slug,
      task_summary: 'Checkpoint 1: Setup DB',
      next_steps: 'Build API',
      active_files: ['db.ts']
    });

    // Small delay to ensure timestamp/id order
    await new Promise((r) => setTimeout(r, 15));

    db.saveCheckpoint({
      project_slug: slug,
      task_summary: 'Checkpoint 2: Build API',
      next_steps: 'Write Tests',
      active_files: ['api.ts']
    });

    const latest = db.getLatestCheckpoint(slug);
    assert.notStrictEqual(latest, null);
    assert.strictEqual(latest?.task_summary, 'Checkpoint 2: Build API');
    assert.strictEqual(latest?.next_steps, 'Write Tests');

    const list = db.getCheckpoints(slug, 5);
    assert.strictEqual(list.length, 2);
    assert.strictEqual(list[0].task_summary, 'Checkpoint 2: Build API');
    assert.strictEqual(list[1].task_summary, 'Checkpoint 1: Setup DB');
  });

  test('should save and retrieve file checksums correctly', () => {
    const slug = 'checksum-project';

    db.saveFileChecksums(slug, [
      { file_path: 'src/a.ts', hash: 'hashA', last_modified: 1000, updated_at: 'now' },
      { file_path: 'src/b.ts', hash: 'hashB', last_modified: 2000, updated_at: 'now' }
    ]);

    const map = db.getFileChecksumsMap(slug);
    assert.strictEqual(map.size, 2);
    assert.strictEqual(map.get('src/a.ts')?.hash, 'hashA');
    assert.strictEqual(map.get('src/b.ts')?.hash, 'hashB');

    // Delete one
    db.deleteFileChecksum(slug, 'src/a.ts');
    const updatedMap = db.getFileChecksumsMap(slug);
    assert.strictEqual(updatedMap.size, 1);
    assert.strictEqual(updatedMap.has('src/a.ts'), false);
    assert.strictEqual(updatedMap.has('src/b.ts'), true);
  });

  test('should record and retrieve architectural decisions (ADR)', () => {
    const slug = 'adr-project';

    db.recordDecision(slug, 'Use SQLite Native', 'Zero external dependency and fastest performance');
    db.recordDecision(slug, 'TypeScript Strict Mode', 'Eliminate runtime null pointer bugs');

    const decisions = db.getDecisions(slug);
    assert.strictEqual(decisions.length, 2);
    assert.strictEqual(decisions[0].title, 'TypeScript Strict Mode'); // Latest first
    assert.strictEqual(decisions[1].title, 'Use SQLite Native');
  });
});
