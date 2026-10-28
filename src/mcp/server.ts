import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as process from 'node:process';
import { SessionManager } from '../engine/session_manager.js';

export function createMcpServer(defaultWorkspace: string = process.cwd()): McpServer {
  const server = new McpServer({
    name: 'project-mapper-memory',
    version: '1.1.0'
  });

  function getManager(workspace?: string): SessionManager {
    return new SessionManager(workspace || defaultWorkspace);
  }

  // 1. Tool: bootstrap_project_session (Cold-Start Initializer)
  server.tool(
    'bootstrap_project_session',
    {
      workspacePath: z.string().optional().describe('Absolute path to project root. Defaults to IDE current workspace.')
    },
    async ({ workspacePath }) => {
      const manager = getManager(workspacePath);
      const digest = manager.getColdStartDigest();

      return {
        content: [{ type: 'text', text: digest.formatted_prompt }]
      };
    }
  );

  // 2. Tool: map_codebase (Incremental AST & Call Graph Sync)
  server.tool(
    'map_codebase',
    {
      forceAll: z.boolean().optional().describe('Force full re-scan of all files instead of incremental delta'),
      workspacePath: z.string().optional().describe('Project workspace path')
    },
    async ({ forceAll, workspacePath }) => {
      const manager = getManager(workspacePath);
      const res = manager.mapCodebase({ forceAll: Boolean(forceAll) });

      return {
        content: [
          {
            type: 'text',
            text: `✅ AST Mapping complete for [${manager.projectSlug}].\n` +
                  `- Scanned files: ${res.scannedFiles}\n` +
                  `- Total graph nodes: ${res.totalNodes}`
          }
        ]
      };
    }
  );

  // 3. Tool: save_session_checkpoint
  server.tool(
    'save_session_checkpoint',
    {
      task_summary: z.string().describe('Summary of what was accomplished in this session'),
      next_steps: z.string().optional().describe('Pending tasks or recommended next steps for the next session'),
      active_files: z.array(z.string()).optional().describe('Key files that were modified or referenced'),
      workspacePath: z.string().optional().describe('Project workspace path')
    },
    async ({ task_summary, next_steps, active_files, workspacePath }) => {
      const manager = getManager(workspacePath);
      const cp = manager.saveCheckpoint(task_summary, next_steps || '', active_files || []);

      return {
        content: [
          {
            type: 'text',
            text: `✅ Session Checkpoint [${cp.id}] saved successfully for [${manager.projectSlug}].\n` +
                  `Accomplished: ${cp.task_summary}\n` +
                  (cp.next_steps ? `Next Steps: ${cp.next_steps}\n` : '') +
                  `File checksum baseline updated.`
          }
        ]
      };
    }
  );

  // 4. Tool: get_project_context
  server.tool(
    'get_project_context',
    {
      moduleName: z.string().optional().describe('Specific module name to retrieve'),
      category: z.enum(['architecture', 'database', 'api', 'rules', 'service', 'ui']).optional().describe('Filter by category'),
      workspacePath: z.string().optional().describe('Project workspace path')
    },
    async ({ moduleName, category, workspacePath }) => {
      const manager = getManager(workspacePath);

      if (moduleName) {
        const mod = manager.db.getModule(manager.projectSlug, moduleName);
        if (!mod) {
          return {
            content: [{ type: 'text', text: `Module [${moduleName}] not found in project [${manager.projectSlug}].` }]
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: `### Module: ${mod.module_name} (${mod.category})\n` +
                    `- **Summary**: ${mod.summary}\n` +
                    `- **Key Files**: ${mod.key_files.length ? mod.key_files.join(', ') : 'None specified'}\n` +
                    `- **Dependencies**: ${mod.dependencies.length ? mod.dependencies.join(', ') : 'None'}\n` +
                    `- **Updated**: ${mod.updated_at}`
            }
          ]
        };
      }

      const modules = manager.getModules(category);
      if (modules.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No modules found${category ? ` in category '${category}'` : ''} for project [${manager.projectSlug}].`
            }
          ]
        };
      }

      const text = modules.map(m => `• [${m.category}] \`${m.module_name}\`: ${m.summary}`).join('\n');
      return {
        content: [{ type: 'text', text: `### Project Modules (${modules.length}):\n${text}` }]
      };
    }
  );

  // 5. Tool: save_project_context
  server.tool(
    'save_project_context',
    {
      moduleName: z.string().describe('Module name in snake_case (e.g. auth_service)'),
      category: z.enum(['architecture', 'database', 'api', 'rules', 'service', 'ui']).describe('Category of module'),
      summary: z.string().describe('Summary of the module responsibilities and rules'),
      keyFiles: z.array(z.string()).optional().describe('List of key file paths'),
      dependencies: z.array(z.string()).optional().describe('List of other module names this module depends on'),
      workspacePath: z.string().optional().describe('Project workspace path')
    },
    async ({ moduleName, category, summary, keyFiles, dependencies, workspacePath }) => {
      const manager = getManager(workspacePath);
      manager.saveModule(moduleName, category, summary, keyFiles || [], dependencies || []);

      return {
        content: [
          {
            type: 'text',
            text: `✅ Saved module [${moduleName}] (${category}) into project [${manager.projectSlug}] memory.`
          }
        ]
      };
    }
  );

  // 6. Tool: list_project_modules
  server.tool(
    'list_project_modules',
    {
      category: z.string().optional().describe('Optional category filter'),
      workspacePath: z.string().optional().describe('Project workspace path')
    },
    async ({ category, workspacePath }) => {
      const manager = getManager(workspacePath);
      const modules = manager.getModules(category);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              modules.map(m => ({
                name: m.module_name,
                category: m.category,
                summary: m.summary,
                dependencies: m.dependencies,
                files: m.key_files
              })),
              null,
              2
            )
          }
        ]
      };
    }
  );

  // 7. Tool: record_architectural_decision
  server.tool(
    'record_architectural_decision',
    {
      title: z.string().describe('Decision title (e.g., "Switched to SQLite native storage")'),
      reason: z.string().describe('Reason and trade-offs behind this technical decision'),
      workspacePath: z.string().optional().describe('Project workspace path')
    },
    async ({ title, reason, workspacePath }) => {
      const manager = getManager(workspacePath);
      manager.db.recordDecision(manager.projectSlug, title, reason);

      return {
        content: [{ type: 'text', text: `✅ Recorded architectural decision: "${title}"` }]
      };
    }
  );

  // 8. Tool: trace_data_flow (Deep Taint & Execution Trace)
  server.tool(
    'trace_data_flow',
    {
      query: z.string().optional().describe('HTTP endpoint name or function to trace (e.g., "POST /users" or "createOrder")'),
      workspacePath: z.string().optional().describe('Project workspace path')
    },
    async ({ query, workspacePath }) => {
      const manager = getManager(workspacePath);
      const trace = manager.traceDataFlow(query);

      if (!trace) {
        return {
          content: [
            {
              type: 'text',
              text: `No entry point found for: "${query || '(any endpoint)'}". Try calling 'list_api_endpoints' or 'map_codebase' first.`
            }
          ]
        };
      }

      const stepsText = trace.steps
        .map(s => {
          let line = `${s.step}. [${s.node.node_type}] **${s.node.name}** (\`${s.node.file_path}:${s.node.line_start}\`)\n   └─ ${s.details}`;
          if (s.propagation) {
            const p = s.propagation;
            if (p.variableLineage.length > 0) {
              const lineageStr = p.variableLineage
                .map(t => `\`${t.fromSymbol}\` -> \`${t.toSymbol}\`${t.sanitized ? ' ✅(sanitized)' : ''}`)
                .join(', ');
              line += `\n   └─ 🧬 Taint Lineage: ${lineageStr}`;
            }
            if (p.forwardedToNextCall) {
              line += `\n   └─ ➡️ Passed to \`${p.forwardedToNextCall.calleeName}\`: ${p.forwardedToNextCall.passedExpressions.join(', ')}`;
            }
            if (p.isSink) {
              line += `\n   └─ 🎯 SINK [${p.sinkType}] ${p.sinkTaintedUnprotected ? '⚠️ (UNSANITIZED PAYLOAD REACHED SINK!)' : '✅ (Sanitized/Safe)'}`;
            }
          }
          return line;
        })
        .join('\n');

      const sanitizationSummary = trace.propagation
        ? `\n**Sanitized Along Path**: ${trace.propagation.is_sanitized_along_path ? '✅ Yes' : '❌ No'}` +
          `\n**Unprotected Sink Reached**: ${trace.propagation.has_unprotected_sink ? '⚠️ YES (Check sanitization!)' : '✅ No'}\n`
        : '';

      return {
        content: [
          {
            type: 'text',
            text: `### 📍 Data Flow: ${trace.entry_point.name} (${trace.total_steps} steps)` +
                  `${sanitizationSummary}\n` +
                  `${stepsText}\n\n` +
                  `### 📊 Sequence Diagram:\n` +
                  `${trace.mermaid_diagram}`
          }
        ]
      };
    }
  );

  // 9. Tool: list_api_endpoints
  server.tool(
    'list_api_endpoints',
    {
      workspacePath: z.string().optional().describe('Project workspace path')
    },
    async ({ workspacePath }) => {
      const manager = getManager(workspacePath);
      const endpoints = manager.getEndpoints();

      if (endpoints.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No HTTP endpoints detected for [${manager.projectSlug}]. Ensure codebase is mapped with 'map_codebase'.`
            }
          ]
        };
      }

      const text = endpoints.map(ep => `• **${ep.name}** -> \`${ep.file_path}:${ep.line_start}\``).join('\n');
      return {
        content: [{ type: 'text', text: `### 🌐 Detected HTTP Endpoints (${endpoints.length}):\n${text}` }]
      };
    }
  );

  // 10. Tool: get_code_symbols
  server.tool(
    'get_code_symbols',
    {
      filePath: z.string().optional().describe('Relative file path to filter symbols (optional)'),
      workspacePath: z.string().optional().describe('Project workspace path')
    },
    async ({ filePath, workspacePath }) => {
      const manager = getManager(workspacePath);
      const symbols = manager.getSymbols(filePath);

      if (symbols.length === 0) {
        return {
          content: [{ type: 'text', text: `No symbols found${filePath ? ` for ${filePath}` : ''}.` }]
        };
      }

      const text = symbols.slice(0, 40).map(s => `• [${s.node_type}] **${s.name}** (\`${s.file_path}:${s.line_start}\`) - \`${s.signature}\``).join('\n');
      return {
        content: [{ type: 'text', text: `### 🧩 Code Symbols (${symbols.length}):\n${text}` }]
      };
    }
  );

  return server;
}

export async function startMcpServer(workspace: string = process.cwd()): Promise<void> {
  const server = createMcpServer(workspace);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js')) {
  startMcpServer().catch((err) => {
    console.error('Failed to start MCP server:', err);
    process.exit(1);
  });
}