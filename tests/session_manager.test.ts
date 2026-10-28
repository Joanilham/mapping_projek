import { test, describe, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SessionManager } from '../src/engine/session_manager.js';

describe('SessionManager Unit Tests', () => {
  let tmpDir: string;

  beforeEach(() => {
    // Directory with uppercase and spaces to test slug generation
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'My Awesome Project-'));
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'index.ts'), 'export const a = 1;');
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('should sanitize workspace path into lowercase-kebab-case slug', () => {
    const manager = new SessionManager(tmpDir);
    assert.strictEqual(/^[a-z0-9-]+$/.test(manager.projectSlug), true);
    assert.strictEqual(manager.projectSlug.includes(' '), false);
    assert.strictEqual(manager.projectSlug.includes('my-awesome-project'), true);
  });

  test('should initialize project and anchor baseline files', () => {
    const manager = new SessionManager(tmpDir);
    const result = manager.initProject({
      name: 'Awesome App',
      overview: 'Modular microservice',
      rules: 'Use ESM'
    });

    assert.strictEqual(result.projectSlug, manager.projectSlug);
    assert.strictEqual(result.totalFiles, 1);

    const meta = manager.db.getProjectMeta(manager.projectSlug);
    assert.strictEqual(meta?.name, 'Awesome App');
    assert.strictEqual(meta?.system_overview, 'Modular microservice');
  });

  test('should save checkpoint and sync current file baseline', () => {
    const manager = new SessionManager(tmpDir);
    manager.initProject();

    // Add a new file
    fs.writeFileSync(path.join(tmpDir, 'src', 'utils.ts'), 'export const b = 2;');

    // Verify status sees the new file before checkpoint
    const deltaBefore = manager.hasher.computeDelta().delta;
    assert.strictEqual(deltaBefore.addedFiles.length, 1);

    // Save checkpoint
    const cp = manager.saveCheckpoint('Created utils helper', 'Write unit tests', ['src/utils.ts']);
    assert.strictEqual(cp.task_summary, 'Created utils helper');
    assert.strictEqual(cp.next_steps, 'Write unit tests');

    // After checkpoint, file baseline should be automatically synced!
    const deltaAfter = manager.hasher.computeDelta().delta;
    assert.strictEqual(deltaAfter.hasChanges, false);
    assert.strictEqual(deltaAfter.unchangedCount, 2);
  });
});
