import process from 'node:process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { SessionManager } from '../engine/session_manager.js';
import { ModuleCategory } from '../types/index.js';

function printHelp(): void {
  console.log(`
╔════════════════════════════════════════════════════════════════════╗
║             PROJECT-MAPPER: AI Persistent Memory Engine            ║
╚════════════════════════════════════════════════════════════════════╝

Usage:
  project-mapper <command> [workspace] [options]

Commands (Memory & Cold-Start):
  init [workspace]                Initialize project memory & take baseline snapshot
  digest [workspace]              Generate cold-start executive digest (< 400 tokens)
  status [workspace]              Show current delta changes vs saved memory
  checkpoint <summary> [next]     Save session checkpoint before closing IDE
  sync [workspace]                Commit current file state as the new baseline
  add-module <name> <cat> <desc>  Register a module into memory
  list-modules [workspace]        List all registered modules

Commands (Codebase AST & Data Flow):
  map [workspace] [--force]       Parse codebase AST, extract symbols & call graph
  trace [endpointOrSymbol]        Trace data flow execution chain & generate Mermaid
  endpoints                       List all detected HTTP API endpoints
  symbols [file]                  List extracted classes, functions, and methods
  ui [workspace] [--port 3333]    Launch interactive Visual Dashboard Web UI
  watch [workspace] [--ui]        Auto-scan on file save (0 AI tokens, file watcher)
  dev [workspace]                 Auto-scan in background + Live Dashboard UI
  serve [workspace]               Start MCP server on stdio

Options:
  --workspace, -w <dir>           Specify target workspace directory (default: current directory)
  --help, -h                      Show this help message

Examples:
  npx project-mapper init /path/to/my-new-project
  npx project-mapper map /path/to/my-new-project
  npx project-mapper ui /path/to/my-new-project
  npx project-mapper checkpoint "Implemented new feature" "Run unit tests"
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] || 'digest';

  if (command === '--help' || command === '-h' || command === 'help') {
    printHelp();
    return;
  }

  let workspace = process.cwd();
  const wsFlagIdx = args.indexOf('--workspace') !== -1 ? args.indexOf('--workspace') : args.indexOf('-w');
  if (wsFlagIdx !== -1 && args[wsFlagIdx + 1]) {
    workspace = path.resolve(args[wsFlagIdx + 1]);
  } else if (['init', 'digest', 'status', 'sync', 'map', 'serve', 'ui', 'dashboard', 'list-modules'].includes(command)) {
    const candidate = args.find(a => !a.startsWith('-') && a !== command);
    if (candidate) {
      try {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
          workspace = path.resolve(candidate);
        }
      } catch {}
    }
  }

  const manager = new SessionManager(workspace);

  switch (command) {
    case 'init': {
      console.log(`\n📦 Initializing memory for [${manager.projectSlug}] at ${workspace}...`);
      const res = manager.initProject();
      console.log(`✅ Project initialized successfully!`);
      console.log(`   - Slug: ${res.projectSlug}`);
      console.log(`   - Baseline tracked files: ${res.totalFiles}`);
      console.log(`   - Database: ${res.dbPath}\n`);
      break;
    }

    case 'digest':
    case 'cold-start': {
      const digest = manager.getColdStartDigest();
      console.log('\n' + digest.formatted_prompt + '\n');
      break;
    }

    case 'status': {
      const { delta } = manager.hasher.computeDelta();
      console.log(`\n📊 Status for [${manager.projectSlug}]:`);
      console.log(`   Total Tracked Files: ${delta.totalCount}`);
      console.log(`   Unchanged Files:     ${delta.unchangedCount}`);
      console.log(`   Modified Files:      ${delta.modifiedFiles.length}`);
      console.log(`   Added Files:         ${delta.addedFiles.length}`);
      console.log(`   Deleted Files:       ${delta.deletedFiles.length}`);

      if (delta.modifiedFiles.length > 0) {
        console.log(`\n✏️  Modified:`);
        delta.modifiedFiles.forEach(f => console.log(`   • ${f}`));
      }
      if (delta.addedFiles.length > 0) {
        console.log(`\n➕ Added:`);
        delta.addedFiles.forEach(f => console.log(`   • ${f}`));
      }
      if (delta.deletedFiles.length > 0) {
        console.log(`\n🗑️  Deleted:`);
        delta.deletedFiles.forEach(f => console.log(`   • ${f}`));
      }
      console.log('');
      break;
    }

    case 'checkpoint': {
      const summary = args[1];
      if (!summary) {
        console.error('❌ Error: Please provide a task summary for the checkpoint.');
        console.error('   Usage: project-mapper checkpoint "<what you finished>" ["<next steps>"]');
        process.exit(1);
      }
      const nextSteps = args[2] || '';
      const cp = manager.saveCheckpoint(summary, nextSteps);
      console.log(`\n✅ Session Checkpoint Saved!`);
      console.log(`   - Checkpoint ID: ${cp.id}`);
      console.log(`   - Task:          ${cp.task_summary}`);
      if (cp.next_steps) {
        console.log(`   - Next Steps:    ${cp.next_steps}`);
      }
      console.log(`   - File baseline updated & AST synchronized.\n`);
      break;
    }

    case 'sync': {
      console.log(`\n🔄 Synchronizing current disk files to memory baseline...`);
      const res = manager.syncBaseline();
      console.log(`✅ Synchronized! Total baseline files: ${res.total}`);
      console.log(`   (Added: ${res.added}, Modified: ${res.modified}, Deleted: ${res.deleted})\n`);
      break;
    }

    case 'add-module': {
      const name = args[1];
      const category = (args[2] || 'architecture') as ModuleCategory;
      const desc = args[3] || 'No description';

      if (!name) {
        console.error('❌ Error: Module name required.');
        console.error('   Usage: project-mapper add-module <name> <category> "<summary>"');
        process.exit(1);
      }

      manager.saveModule(name, category, desc);
      console.log(`✅ Module [${name}] (${category}) saved to memory.\n`);
      break;
    }

    case 'list-modules': {
      const modules = manager.getModules();
      console.log(`\n📦 Stored Modules for [${manager.projectSlug}] (${modules.length}):`);
      for (const m of modules) {
        console.log(`   • [${m.category}] ${m.module_name}: ${m.summary}`);
      }
      console.log('');
      break;
    }

    case 'map': {
      const forceAll = args.includes('--force');
      console.log(`\n🔍 Parsing codebase AST for [${manager.projectSlug}]${forceAll ? ' (Full Re-scan)' : ' (Incremental)'}...`);
      const res = manager.mapCodebase({ forceAll });
      console.log(`✅ AST Mapping Complete!`);
      console.log(`   - Files Processed: ${res.scannedFiles}`);
      console.log(`   - Total Code Nodes: ${res.totalNodes}`);
      console.log('');
      break;
    }

    case 'endpoints': {
      const endpoints = manager.getEndpoints();
      console.log(`\n🌐 Detected Endpoints for [${manager.projectSlug}] (${endpoints.length}):`);
      if (endpoints.length === 0) {
        console.log('   (No HTTP endpoints detected yet. Run `project-mapper map` first)');
      } else {
        for (const ep of endpoints) {
          console.log(`   • ${ep.name}  -> ${ep.file_path}:${ep.line_start}`);
        }
      }
      console.log('');
      break;
    }

    case 'trace': {
      const query = args[1];
      console.log(`\n⚡ Tracing data flow${query ? ` for "${query}"` : ''}...`);
      const trace = manager.traceDataFlow(query);
      if (!trace) {
        console.log(`❌ No matching entry point found for: "${query || '(any endpoint)'}"`);
        console.log(`   Tip: Run "project-mapper endpoints" to see available routes.\n`);
        return;
      }

      console.log(`\n📍 Data Flow: ${trace.entry_point.name} (${trace.total_steps} steps)`);
      if (trace.propagation) {
        console.log(`   🛡️  Sanitized Along Path: ${trace.propagation.is_sanitized_along_path ? '✅ YES' : '❌ NO'}`);
        if (trace.propagation.has_unprotected_sink) {
          console.log(`   ⚠️  WARNING: Unsanitized data reaches a sensitive Sink!`);
        }
      }

      for (const step of trace.steps) {
        console.log(`   ${step.step}. [${step.node.node_type}] ${step.node.name} (${step.node.file_path}:${step.node.line_start})`);
        if (step.details) {
          console.log(`      └─ ${step.details}`);
        }
        if (step.propagation) {
          const p = step.propagation;
          if (p.variableLineage.length > 0) {
            const vars = p.variableLineage
              .map(v => `${v.fromSymbol} → ${v.toSymbol}${v.sanitized ? ' (sanitized)' : ''}`)
              .join(', ');
            console.log(`      └─ 🧬 Lineage: ${vars}`);
          }
          if (p.forwardedToNextCall) {
            console.log(`      └─ ➡️  Forwarded to ${p.forwardedToNextCall.calleeName}: ${p.forwardedToNextCall.passedExpressions.join(', ')}`);
          }
          if (p.isSink) {
            console.log(`      └─ 🎯 SINK: ${p.sinkType} ${p.sinkTaintedUnprotected ? '⚠️ (UNSANITIZED)' : '✅'}`);
          }
        }
      }

      console.log('\n📊 Mermaid Sequence Diagram:\n');
      console.log(trace.mermaid_diagram);
      console.log('');
      break;
    }

    case 'symbols': {
      const fileFilter = args[1];
      const symbols = manager.getSymbols(fileFilter);
      console.log(`\n🧩 Extracted Symbols${fileFilter ? ` in ${fileFilter}` : ''} (${symbols.length}):`);
      for (const s of symbols.slice(0, 30)) {
        console.log(`   • [${s.node_type}] ${s.name}  (${s.file_path}:${s.line_start})`);
      }
      if (symbols.length > 30) {
        console.log(`   ... and ${symbols.length - 30} more symbols.`);
      }
      console.log('');
      break;
    }

    case 'serve': {
      const { startMcpServer } = await import('../mcp/server.js');
      await startMcpServer(workspace);
      break;
    }

    case 'ui':
    case 'dashboard': {
      const portArgIdx = args.indexOf('--port');
      const port = portArgIdx !== -1 && args[portArgIdx + 1] ? parseInt(args[portArgIdx + 1], 10) : 3333;
      const { startDashboardServer } = await import('../server/dashboard_server.js');
      const { url } = await startDashboardServer({ port, workspacePath: workspace });
      console.log(`\n✨ Project Mapper Visual Dashboard launched!`);
      console.log(`   🔗 Web UI: ${url}`);
      console.log(`   💡 Press Ctrl+C to stop.\n`);
      break;
    }

    case 'watch':
    case 'dev': {
      console.log(`\n👁️  Starting Automatic Project Scanner for [${manager.projectSlug}] at ${workspace}...`);
      // 1. Initial scan
      const initialMap = manager.mapCodebase({ forceAll: false });
      console.log(`✅ Baseline mapped: ${initialMap.scannedFiles} files, ${initialMap.totalNodes} code nodes.`);
      console.log(`👀 Watching for file changes (saving AST locally, 0 AI tokens)...`);

      // 2. Optional UI start
      const startUi = args.includes('--ui') || command === 'dev';
      if (startUi) {
        const portArgIdx = args.indexOf('--port');
        const port = portArgIdx !== -1 && args[portArgIdx + 1] ? parseInt(args[portArgIdx + 1], 10) : 3333;
        const { startDashboardServer } = await import('../server/dashboard_server.js');
        const { url } = await startDashboardServer({ port, workspacePath: workspace });
        console.log(`✨ Live Visual Dashboard: ${url}\n`);
      }

      // 3. Debounced file watcher
      let debounceTimer: NodeJS.Timeout | null = null;
      const pendingChangedFiles = new Set<string>();

      const watcher = fs.watch(workspace, { recursive: true }, (eventType, filename) => {
        if (!filename) return;
        // Ignore noise and temp files
        if (
          filename.includes('node_modules') ||
          filename.includes('.git') ||
          filename.includes('.project-memory') ||
          filename.includes('dist') ||
          filename.includes('build') ||
          filename.startsWith('.')
        ) {
          return;
        }

        pendingChangedFiles.add(filename);

        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          const files = [...pendingChangedFiles];
          pendingChangedFiles.clear();

          const res = manager.mapCodebase({ forceAll: false });
          const timestamp = new Date().toLocaleTimeString();
          console.log(`⚡ [${timestamp}] Auto-scan updated ${files.length} changed file(s):`);
          files.slice(0, 5).forEach(f => console.log(`   • ${f}`));
          if (files.length > 5) console.log(`   ... and ${files.length - 5} more.`);
          console.log(`   Graph now has ${res.totalNodes} nodes, ${res.totalEdges} edges.\n`);
        }, 400);
      });

      process.on('SIGINT', () => {
        watcher.close();
        console.log('\n👋 Auto-scan stopped.');
        process.exit(0);
      });
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});