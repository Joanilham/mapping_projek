import { test, describe, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { MemoryDatabase } from '../src/db/database.js';
import { DeltaHasher } from '../src/engine/hasher.js';

describe('DeltaHasher Unit Tests', () => {
  let tmpDir: string;
  let db: MemoryDatabase;
  const slug = 'hasher-test-proj';

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'proj-map-hash-test-'));
    db = new MemoryDatabase(tmpDir);

    // Create a mock folder structure
    fs.mkdirSync(path.join(tmpDir, 'src', 'utils'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'node_modules', 'dummy-lib'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.git'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'dist'), { recursive: true });

    // Create files
    fs.writeFileSync(path.join(tmpDir, 'src', 'index.ts'), 'console.log("hello");');
    fs.writeFileSync(path.join(tmpDir, 'src', 'utils', 'helper.ts'), 'export const x = 10;');
    fs.writeFileSync(path.join(tmpDir, 'node_modules', 'dummy-lib', 'index.js'), 'ignored');
    fs.writeFileSync(path.join(tmpDir, '.git', 'HEAD'), 'ref: refs/heads/main');
    fs.writeFileSync(path.join(tmpDir, 'dist', 'index.js'), 'compiled');
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('should scan only non-ignored project files', () => {
    const hasher = new DeltaHasher(tmpDir, slug, db);
    const files = hasher.scanFiles();

    assert.strictEqual(files.includes('src/index.ts'), true);
    assert.strictEqual(files.includes('src/utils/helper.ts'), true);
    assert.strictEqual(files.some(f => f.startsWith('node_modules')), false);
    assert.strictEqual(files.some(f => f.startsWith('.git')), false);
    assert.strictEqual(files.some(f => f.startsWith('dist')), false);
    assert.strictEqual(files.some(f => f.startsWith('.project-memory')), false);
    assert.strictEqual(files.length, 2);
  });

  test('should detect all files as added on initial run', () => {
    const hasher = new DeltaHasher(tmpDir, slug, db);
    const { delta } = hasher.computeDelta();

    assert.strictEqual(delta.hasChanges, true);
    assert.strictEqual(delta.addedFiles.length, 2);
    assert.strictEqual(delta.modifiedFiles.length, 0);
    assert.strictEqual(delta.deletedFiles.length, 0);
    assert.strictEqual(delta.unchangedCount, 0);
    assert.strictEqual(delta.totalCount, 2);
  });

  test('should report 0 changes after syncing checksums', () => {
    const hasher = new DeltaHasher(tmpDir, slug, db);
    hasher.syncChecksums(); // Take baseline

    const { delta } = hasher.computeDelta();
    assert.strictEqual(delta.hasChanges, false);
    assert.strictEqual(delta.addedFiles.length, 0);
    assert.strictEqual(delta.modifiedFiles.length, 0);
    assert.strictEqual(delta.deletedFiles.length, 0);
    assert.strictEqual(delta.unchangedCount, 2);
    assert.strictEqual(delta.totalCount, 2);
  });

  test('should detect modified, added, and deleted files accurately', () => {
    const hasher = new DeltaHasher(tmpDir, slug, db);
    hasher.syncChecksums(); // Baseline has 2 files: src/index.ts, src/utils/helper.ts

    // 1. Modify src/index.ts
    fs.writeFileSync(path.join(tmpDir, 'src', 'index.ts'), 'console.log("modified content");');

    // 2. Add src/new-feature.ts
    fs.writeFileSync(path.join(tmpDir, 'src', 'new-feature.ts'), 'export const feature = true;');

    // 3. Delete src/utils/helper.ts
    fs.unlinkSync(path.join(tmpDir, 'src', 'utils', 'helper.ts'));

    const { delta } = hasher.computeDelta();

    assert.strictEqual(delta.hasChanges, true);
    assert.strictEqual(delta.modifiedFiles.length, 1);
    assert.strictEqual(delta.modifiedFiles[0], 'src/index.ts');

    assert.strictEqual(delta.addedFiles.length, 1);
    assert.strictEqual(delta.addedFiles[0], 'src/new-feature.ts');

    assert.strictEqual(delta.deletedFiles.length, 1);
    assert.strictEqual(delta.deletedFiles[0], 'src/utils/helper.ts');

    assert.strictEqual(delta.unchangedCount, 0);
    assert.strictEqual(delta.totalCount, 2); // 2 files on disk currently

    // After re-syncing, delta should be clean again
    const postSyncDelta = hasher.syncChecksums();
    assert.strictEqual(postSyncDelta.hasChanges, true); // this was the delta synced

    const cleanCheck = hasher.computeDelta();
    assert.strictEqual(cleanCheck.delta.hasChanges, false);
    assert.strictEqual(cleanCheck.delta.unchangedCount, 2);
  });
});
