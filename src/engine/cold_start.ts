import { MemoryDatabase } from '../db/database.js';
import { DeltaHasher } from './hasher.js';
import { ColdStartDigest } from '../types/index.js';

export class ColdStartEngine {
  private workspacePath: string;
  private projectSlug: string;
  private db: MemoryDatabase;
  private hasher: DeltaHasher;

  constructor(workspacePath: string, projectSlug: string, db: MemoryDatabase) {
    this.workspacePath = workspacePath;
    this.projectSlug = projectSlug;
    this.db = db;
    this.hasher = new DeltaHasher(workspacePath, projectSlug, db);
  }

  /**
   * Generates a complete cold-start executive digest
   */
  public generateDigest(): ColdStartDigest {
    let meta = this.db.getProjectMeta(this.projectSlug);
    if (!meta) {
      meta = {
        project_slug: this.projectSlug,
        name: this.projectSlug,
        root_path: this.workspacePath,
        system_overview: 'New unmapped project. Please run initial mapping or save overview.',
        rules_and_conventions: 'Standard best practices.',
        last_active_task: 'Initial project setup.',
        updated_at: new Date().toISOString()
      };
      this.db.saveProjectMeta(meta);
    }

    const latestCp = this.db.getLatestCheckpoint(this.projectSlug);
    const { delta } = this.hasher.computeDelta();
    const modules = this.db.getModules(this.projectSlug);

    // Calculate days since last visit
    const lastTimestamp = latestCp?.created_at || meta.updated_at || new Date().toISOString();
    const diffMs = Math.max(0, Date.now() - new Date(lastTimestamp).getTime());
    const daysSince = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    // Build compact formatted prompt
    const prompt = this.formatColdStartPrompt(meta, latestCp, delta, modules, daysSince);

    return {
      project_slug: this.projectSlug,
      name: meta.name,
      system_overview: meta.system_overview,
      rules_and_conventions: meta.rules_and_conventions,
      last_checkpoint: latestCp || undefined,
      delta,
      modules: modules.map((m) => ({ name: m.module_name, category: m.category, summary: m.summary })),
      days_since_last_visit: daysSince,
      formatted_prompt: prompt
    };
  }

  private formatColdStartPrompt(
    meta: any,
    checkpoint: any,
    delta: any,
    modules: any[],
    daysSince: number
  ): string {
    const timeStr = daysSince === 0 ? 'Today / Active' : `${daysSince} day(s) ago`;
    const lines: string[] = [];

    lines.push(`## 🧠 Project Cold-Start Memory: [${meta.name || this.projectSlug}]`);
    lines.push(`- **Last Active**: ${timeStr}`);
    if (meta.system_overview) {
      lines.push(`- **Architecture & Overview**: ${meta.system_overview}`);
    }
    if (meta.rules_and_conventions) {
      lines.push(`- **Conventions & Rules**: ${meta.rules_and_conventions}`);
    }

    if (checkpoint) {
      lines.push('');
      lines.push('### 📌 Last Session Checkpoint:');
      lines.push(`- **Accomplished**: ${checkpoint.task_summary}`);
      if (checkpoint.next_steps) {
        lines.push(`- **Pending / Next Steps**: ${checkpoint.next_steps}`);
      }
      if (checkpoint.active_files && checkpoint.active_files.length > 0) {
        lines.push(`- **Active Files**: \`${checkpoint.active_files.join('`, `')}\``);
      }
    }

    lines.push('');
    lines.push('### 🔄 Delta Since Last Session:');
    if (!delta.hasChanges) {
      lines.push(`- ✅ All ${delta.totalCount} files are unchanged. Codebase state is 100% synchronized!`);
    } else {
      lines.push(`- Total tracked files: ${delta.totalCount} (${delta.unchangedCount} unchanged)`);
      if (delta.modifiedFiles.length > 0) {
        lines.push(`- ✏️ Modified (${delta.modifiedFiles.length}): \`${delta.modifiedFiles.slice(0, 8).join('`, `')}${delta.modifiedFiles.length > 8 ? '...' : ''}\``);
      }
      if (delta.addedFiles.length > 0) {
        lines.push(`- ➕ Added (${delta.addedFiles.length}): \`${delta.addedFiles.slice(0, 8).join('`, `')}${delta.addedFiles.length > 8 ? '...' : ''}\``);
      }
      if (delta.deletedFiles.length > 0) {
        lines.push(`- 🗑️ Deleted (${delta.deletedFiles.length}): \`${delta.deletedFiles.slice(0, 8).join('`, `')}${delta.deletedFiles.length > 8 ? '...' : ''}\``);
      }
    }

    if (modules.length > 0) {
      lines.push('');
      lines.push(`### 📦 Known Modules (${modules.length}):`);
      for (const m of modules.slice(0, 10)) {
        lines.push(`- \`${m.module_name}\` [${m.category}]: ${m.summary}`);
      }
      if (modules.length > 10) {
        lines.push(`- *(and ${modules.length - 10} more modules stored in memory)*`);
      }
    }

    lines.push('');
    lines.push('> 💡 **AI Instruction**: Memory restored. Do NOT crawl directory or re-parse unchanged files. Focus only on modified files or user instructions.');

    return lines.join('\n');
  }
}
