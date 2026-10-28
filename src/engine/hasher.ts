import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { DeltaResult, FileChecksum } from '../types/index.js';
import { MemoryDatabase } from '../db/database.js';

const DEFAULT_IGNORE = new Set([
  'node_modules',
  '.git',
  '.project-memory',
  'dist',
  'build',
  'coverage',
  '.turbo',
  '.next',
  '.cache',
  '.DS_Store'
]);

export class DeltaHasher {
  private workspacePath: string;
  private projectSlug: string;
  private db: MemoryDatabase;
  private ignorePatterns: Set<string>;

  constructor(workspacePath: string, projectSlug: string, db: MemoryDatabase, customIgnore: string[] = []) {
    this.workspacePath = workspacePath;
    this.projectSlug = projectSlug;
    this.db = db;
    this.ignorePatterns = new Set([...DEFAULT_IGNORE, ...customIgnore]);
  }

  /**
   * Fast MD5 hash of file content
   */
  public hashFile(fullPath: string): string {
    const buffer = fs.readFileSync(fullPath);
    return crypto.createHash('md5').update(buffer).digest('hex');
  }

  /**
   * Recursively collect all relevant project files
   */
  public scanFiles(dir: string = this.workspacePath): string[] {
    const results: string[] = [];
    if (!fs.existsSync(dir)) return results;

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (this.ignorePatterns.has(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...this.scanFiles(fullPath));
      } else if (entry.isFile()) {
        // Store relative path with forward slashes for cross-platform consistency
        const relPath = path.relative(this.workspacePath, fullPath).replace(/\\/g, '/');
        results.push(relPath);
      }
    }

    return results;
  }

  /**
   * Compare disk files against saved checksums to compute delta
   */
  public computeDelta(): { delta: DeltaResult; currentChecksums: FileChecksum[] } {
    const existingMap = this.db.getFileChecksumsMap(this.projectSlug);
    const diskFiles = this.scanFiles();

    const currentChecksums: FileChecksum[] = [];
    const addedFiles: string[] = [];
    const modifiedFiles: string[] = [];
    const seenFiles = new Set<string>();
    let unchangedCount = 0;

    for (const relPath of diskFiles) {
      seenFiles.add(relPath);
      const fullPath = path.join(this.workspacePath, relPath);
      const stat = fs.statSync(fullPath);
      const existing = existingMap.get(relPath);

      // Fast path: if mtime matches, check if we can reuse hash
      let currentHash: string;
      if (existing && existing.last_modified === Math.floor(stat.mtimeMs)) {
        currentHash = existing.hash;
        unchangedCount++;
      } else {
        currentHash = this.hashFile(fullPath);
        if (!existing) {
          addedFiles.push(relPath);
        } else if (existing.hash !== currentHash) {
          modifiedFiles.push(relPath);
        } else {
          unchangedCount++;
        }
      }

      currentChecksums.push({
        file_path: relPath,
        hash: currentHash,
        last_modified: Math.floor(stat.mtimeMs),
        updated_at: new Date().toISOString()
      });
    }

    // Check for deleted files
    const deletedFiles: string[] = [];
    for (const [savedPath] of existingMap.entries()) {
      if (!seenFiles.has(savedPath)) {
        deletedFiles.push(savedPath);
      }
    }

    const totalCount = diskFiles.length;
    const hasChanges = addedFiles.length > 0 || modifiedFiles.length > 0 || deletedFiles.length > 0;

    return {
      delta: {
        addedFiles,
        modifiedFiles,
        deletedFiles,
        unchangedCount,
        totalCount,
        hasChanges
      },
      currentChecksums
    };
  }

  /**
   * Commit the current file state to the database
   */
  public syncChecksums(): DeltaResult {
    const { delta, currentChecksums } = this.computeDelta();

    // Save updated/added checksums
    if (currentChecksums.length > 0) {
      this.db.saveFileChecksums(this.projectSlug, currentChecksums);
    }

    // Remove deleted files
    for (const deleted of delta.deletedFiles) {
      this.db.deleteFileChecksum(this.projectSlug, deleted);
    }

    return delta;
  }
}
