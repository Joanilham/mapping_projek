import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { CodeNode, CodeEdge, NodeType, RelationType } from '../types/index.js';

// Robust ESM/CJS interop for @babel/traverse
const traverse = (_traverse as any).default || _traverse;

export interface ParseResult {
  nodes: CodeNode[];
  edges: CodeEdge[];
}

/**
 * Recursively extract callee symbol name from complex or chained MemberExpressions
 * e.g. "this.orderService.paymentGateway.charge" or "db.users.findMany"
 */
function extractCalleeName(callee: any): string {
  if (!callee) return '';
  if (callee.type === 'Identifier') return callee.name;
  if (callee.type === 'ThisExpression') return 'this';
  if (callee.type === 'MemberExpression') {
    const prop = callee.property?.name || (typeof callee.property?.value === 'string' ? callee.property.value : '');
    const obj = extractCalleeName(callee.object);
    return obj ? (prop ? `${obj}.${prop}` : obj) : prop;
  }
  if (callee.type === 'CallExpression') {
    return extractCalleeName(callee.callee);
  }
  return '';
}

export class AstParser {
  private projectSlug: string;
  private workspacePath: string;

  constructor(workspacePath: string, projectSlug: string) {
    this.workspacePath = workspacePath;
    this.projectSlug = projectSlug;
  }

  /**
   * Parse a single source file into CodeNodes and CodeEdges
   */
  public parseFile(relPath: string, fileContent?: string): ParseResult {
    const fullPath = path.join(this.workspacePath, relPath);
    let content = '';

    try {
      content = fileContent !== undefined ? fileContent : fs.readFileSync(fullPath, 'utf-8');
    } catch {
      return { nodes: [], edges: [] };
    }

    const nodes: CodeNode[] = [];
    const edges: CodeEdge[] = [];

    // 1. Root File Node
    const fileNodeId = `${this.projectSlug}:${relPath}:file:${path.basename(relPath)}`;
    const lineCount = content.split('\n').length;

    nodes.push({
      id: fileNodeId,
      project_slug: this.projectSlug,
      file_path: relPath,
      node_type: 'file',
      name: path.basename(relPath),
      line_start: 1,
      line_end: lineCount,
      signature: `File: ${relPath}`
    });

    let ast: any;
    try {
      ast = parse(content, {
        sourceType: 'module',
        plugins: [
          'typescript',
          'jsx',
          'decorators-legacy'
        ],
        errorRecovery: true
      });
    } catch {
      // If parsing fails completely, return file node only (resilient to syntax errors)
      return { nodes, edges };
    }

    // Context tracking during traversal
    let currentScopeId: string = fileNodeId;
    let currentClassName: string = '';
    let classBaseRoute: string = '';

    const self = this;

    try {
      traverse(ast, {
        // 1. Imports (including relative & path aliases)
        ImportDeclaration(p: any) {
          const importSource = p.node.source.value;
          const line = p.node.loc?.start.line || 1;

          if (typeof importSource === 'string' && (importSource.startsWith('.') || importSource.startsWith('@/') || importSource.startsWith('~/'))) {
            const resolvedRel = self.resolveImportPath(relPath, importSource);
            const targetFileId = `${self.projectSlug}:${resolvedRel}:file:${path.basename(resolvedRel)}`;

            edges.push({
              id: `${self.projectSlug}:${fileNodeId}:${targetFileId}:IMPORTS`,
              project_slug: self.projectSlug,
              source_id: fileNodeId,
              target_id: targetFileId,
              relation_type: 'IMPORTS',
              metadata: { importSource, line }
            });
          }
        },

        // 2. Class Declarations
        ClassDeclaration: {
          enter(p: any) {
            const className = p.node.id?.name || 'AnonymousClass';
            currentClassName = className;
            const loc = p.node.loc;
            const classNodeId = `${self.projectSlug}:${relPath}:class:${className}`;

            // Check for Controller and DI decorators (e.g. @Controller('/api/users'), @Injectable())
            classBaseRoute = '';
            let isInjectable = false;
            if (p.node.decorators) {
              for (const dec of p.node.decorators) {
                const expr = dec.expression;
                const decName = expr?.type === 'CallExpression' ? expr.callee?.name : expr?.name;
                if (expr && expr.type === 'CallExpression' && expr.callee?.name === 'Controller') {
                  const arg = expr.arguments?.[0]?.value;
                  if (typeof arg === 'string') {
                    classBaseRoute = arg.startsWith('/') ? arg : `/${arg}`;
                  }
                }
                if (decName === 'Injectable' || decName === 'Service' || decName === 'Repository') {
                  isInjectable = true;
                }
              }
            }

            nodes.push({
              id: classNodeId,
              project_slug: self.projectSlug,
              file_path: relPath,
              node_type: 'class',
              name: className,
              line_start: loc?.start.line || 1,
              line_end: loc?.end.line || 1,
              signature: `class ${className}`,
              metadata: { baseRoute: classBaseRoute, isInjectable }
            });

            edges.push({
              id: `${self.projectSlug}:${fileNodeId}:${classNodeId}:DEFINES`,
              project_slug: self.projectSlug,
              source_id: fileNodeId,
              target_id: classNodeId,
              relation_type: 'DEFINES'
            });

            // Detect `implements InterfaceA, InterfaceB`
            if (p.node.implements && Array.isArray(p.node.implements)) {
              for (const impl of p.node.implements) {
                const ifaceName = impl.expression?.name || impl.id?.name;
                if (ifaceName) {
                  edges.push({
                    id: `${self.projectSlug}:${classNodeId}:${ifaceName}:IMPLEMENTS`,
                    project_slug: self.projectSlug,
                    source_id: classNodeId,
                    target_id: ifaceName,
                    relation_type: 'IMPLEMENTS',
                    metadata: { interfaceName: ifaceName, line: loc?.start.line || 1 }
                  });
                }
              }
            }

            if (p.node.superClass?.name) {
              const superName = p.node.superClass.name;
              edges.push({
                id: `${self.projectSlug}:${classNodeId}:${superName}:EXTENDS`,
                project_slug: self.projectSlug,
                source_id: classNodeId,
                target_id: superName,
                relation_type: 'EXTENDS'
              });
            }

            currentScopeId = classNodeId;
          },
          exit() {
            currentClassName = '';
            classBaseRoute = '';
            currentScopeId = fileNodeId;
          }
        },

        // 3. Class Methods
        ClassMethod: {
          enter(p: any) {
            const methodName = p.node.key?.name || 'method';
            const loc = p.node.loc;
            const isAsync = p.node.async || false;
            const methodNodeId = `${self.projectSlug}:${relPath}:method:${currentClassName}.${methodName}`;

            nodes.push({
              id: methodNodeId,
              project_slug: self.projectSlug,
              file_path: relPath,
              node_type: 'method',
              name: `${currentClassName}.${methodName}`,
              line_start: loc?.start.line || 1,
              line_end: loc?.end.line || 1,
              signature: `${isAsync ? 'async ' : ''}${methodName}()`
            });

            edges.push({
              id: `${self.projectSlug}:${currentScopeId}:${methodNodeId}:DEFINES`,
              project_slug: self.projectSlug,
              source_id: currentScopeId,
              target_id: methodNodeId,
              relation_type: 'DEFINES'
            });

            // Detect Dependency Injection in constructor: `constructor(private readonly orderRepo: IOrderRepository)`
            if (p.node.kind === 'constructor') {
              const params = p.node.params || [];
              for (const param of params) {
                const isParamProp = param.type === 'TSParameterProperty';
                const actualParam = isParamProp ? param.parameter : param;
                const paramName = actualParam?.name;
                if (!paramName) continue;

                // A. Check Decorator @Inject('TOKEN')
                let injectToken: string | null = null;
                const decorators = param.decorators || actualParam.decorators || [];
                for (const dec of decorators) {
                  const expr = dec.expression;
                  if (expr?.type === 'CallExpression' && expr.callee?.name === 'Inject') {
                    const arg = expr.arguments?.[0];
                    injectToken = arg?.value || arg?.name || null;
                  }
                }

                // B. Check TypeScript Type Annotation
                let declaredType: string | null = null;
                const typeAnnotation = actualParam.typeAnnotation?.typeAnnotation;
                if (typeAnnotation?.type === 'TSTypeReference') {
                  declaredType = typeAnnotation.typeName?.name || null;
                }

                const targetToken = injectToken || declaredType;
                if (targetToken) {
                  edges.push({
                    id: `${self.projectSlug}:${currentScopeId}:${paramName}:${targetToken}:INJECTS`,
                    project_slug: self.projectSlug,
                    source_id: currentScopeId,
                    target_id: targetToken,
                    relation_type: 'INJECTS',
                    metadata: {
                      propertyName: paramName,
                      token: targetToken,
                      isExplicitToken: Boolean(injectToken)
                    }
                  });
                }
              }
            }

            // Check for HTTP decorators: @Get(), @Post(), @Put(), @Delete(), @Patch()
            if (p.node.decorators) {
              for (const dec of p.node.decorators) {
                const expr = dec.expression;
                let httpMethod: string = '';
                let subRoute: string = '';

                if (expr?.type === 'CallExpression') {
                  httpMethod = expr.callee?.name || '';
                  const arg = expr.arguments?.[0]?.value;
                  if (typeof arg === 'string') subRoute = arg;
                } else if (expr?.type === 'Identifier') {
                  httpMethod = expr.name;
                }

                const standardHttp = ['Get', 'Post', 'Put', 'Delete', 'Patch', 'Options', 'Head'];
                if (standardHttp.includes(httpMethod)) {
                  const cleanSub = subRoute.startsWith('/') ? subRoute : (subRoute ? `/${subRoute}` : '');
                  const fullRoute = `${classBaseRoute}${cleanSub}` || '/';
                  const endpointName = `${httpMethod.toUpperCase()} ${fullRoute}`;
                  const endpointId = `${self.projectSlug}:${relPath}:endpoint:${httpMethod.toUpperCase()}_${fullRoute.replace(/[^a-zA-Z0-9/_-]/g, '_')}`;

                  nodes.push({
                    id: endpointId,
                    project_slug: self.projectSlug,
                    file_path: relPath,
                    node_type: 'endpoint',
                    name: endpointName,
                    line_start: loc?.start.line || 1,
                    line_end: loc?.end.line || 1,
                    signature: endpointName,
                    metadata: { httpMethod: httpMethod.toUpperCase(), route: fullRoute }
                  });

                  edges.push({
                    id: `${self.projectSlug}:${endpointId}:${methodNodeId}:HANDLES_ROUTE`,
                    project_slug: self.projectSlug,
                    source_id: endpointId,
                    target_id: methodNodeId,
                    relation_type: 'HANDLES_ROUTE'
                  });
                }
              }
            }

            currentScopeId = methodNodeId;
          },
          exit() {
            currentScopeId = currentClassName ? `${self.projectSlug}:${relPath}:class:${currentClassName}` : fileNodeId;
          }
        },

        // 4. Standalone Function Declarations
        FunctionDeclaration: {
          enter(p: any) {
            const funcName = p.node.id?.name || 'anonymous';
            const loc = p.node.loc;
            const isAsync = p.node.async || false;
            const funcNodeId = `${self.projectSlug}:${relPath}:function:${funcName}`;

            nodes.push({
              id: funcNodeId,
              project_slug: self.projectSlug,
              file_path: relPath,
              node_type: 'function',
              name: funcName,
              line_start: loc?.start.line || 1,
              line_end: loc?.end.line || 1,
              signature: `${isAsync ? 'async ' : ''}function ${funcName}()`
            });

            edges.push({
              id: `${self.projectSlug}:${fileNodeId}:${funcNodeId}:DEFINES`,
              project_slug: self.projectSlug,
              source_id: fileNodeId,
              target_id: funcNodeId,
              relation_type: 'DEFINES'
            });

            // Detect Next.js App Router exports: GET, POST, PUT, DELETE, PATCH
            const nextHttp = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD'];
            if (nextHttp.includes(funcName) && (relPath.includes('route.') || relPath.includes('/api/'))) {
              const routePath = self.deriveRoutePathFromFile(relPath);
              const endpointName = `${funcName} ${routePath}`;
              const endpointId = `${self.projectSlug}:${relPath}:endpoint:${funcName}_${routePath}`;

              nodes.push({
                id: endpointId,
                project_slug: self.projectSlug,
                file_path: relPath,
                node_type: 'endpoint',
                name: endpointName,
                line_start: loc?.start.line || 1,
                line_end: loc?.end.line || 1,
                signature: endpointName,
                metadata: { httpMethod: funcName, route: routePath }
              });

              edges.push({
                id: `${self.projectSlug}:${endpointId}:${funcNodeId}:HANDLES_ROUTE`,
                project_slug: self.projectSlug,
                source_id: endpointId,
                target_id: funcNodeId,
                relation_type: 'HANDLES_ROUTE'
              });
            }

            currentScopeId = funcNodeId;
          },
          exit() {
            currentScopeId = fileNodeId;
          }
        },

        // 5. Arrow Functions & Function Expressions assigned to variables (export const foo = () => ...)
        VariableDeclarator: {
          enter(p: any) {
            const varName = p.node.id?.name;
            const init = p.node.init;
            if (!varName || !init) return;

            const isArrow = init.type === 'ArrowFunctionExpression';
            const isFuncExpr = init.type === 'FunctionExpression';

            if (isArrow || isFuncExpr) {
              const loc = init.loc || p.node.loc;
              const isAsync = init.async || false;
              const funcNodeId = `${self.projectSlug}:${relPath}:function:${varName}`;

              nodes.push({
                id: funcNodeId,
                project_slug: self.projectSlug,
                file_path: relPath,
                node_type: 'function',
                name: varName,
                line_start: loc?.start.line || 1,
                line_end: loc?.end.line || 1,
                signature: `${isAsync ? 'async ' : ''}const ${varName} = () =>`
              });

              edges.push({
                id: `${self.projectSlug}:${fileNodeId}:${funcNodeId}:DEFINES`,
                project_slug: self.projectSlug,
                source_id: fileNodeId,
                target_id: funcNodeId,
                relation_type: 'DEFINES'
              });

              // Detect Next.js route handlers: export const GET = ...
              const nextHttp = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD'];
              if (nextHttp.includes(varName) && (relPath.includes('route.') || relPath.includes('/api/'))) {
                const routePath = self.deriveRoutePathFromFile(relPath);
                const endpointName = `${varName} ${routePath}`;
                const endpointId = `${self.projectSlug}:${relPath}:endpoint:${varName}_${routePath}`;

                nodes.push({
                  id: endpointId,
                  project_slug: self.projectSlug,
                  file_path: relPath,
                  node_type: 'endpoint',
                  name: endpointName,
                  line_start: loc?.start.line || 1,
                  line_end: loc?.end.line || 1,
                  signature: endpointName,
                  metadata: { httpMethod: varName, route: routePath }
                });

                edges.push({
                  id: `${self.projectSlug}:${endpointId}:${funcNodeId}:HANDLES_ROUTE`,
                  project_slug: self.projectSlug,
                  source_id: endpointId,
                  target_id: funcNodeId,
                  relation_type: 'HANDLES_ROUTE'
                });
              }

              currentScopeId = funcNodeId;
            }
          },
          exit(p: any) {
            const init = p.node.init;
            if (init && (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression')) {
              currentScopeId = fileNodeId;
            }
          }
        },

        // 6. Interfaces & Types (Data Contracts / DTOs / Models)
        TSInterfaceDeclaration(p: any) {
          const name = p.node.id?.name;
          if (!name) return;
          const loc = p.node.loc;
          const ifaceId = `${self.projectSlug}:${relPath}:interface:${name}`;

          nodes.push({
            id: ifaceId,
            project_slug: self.projectSlug,
            file_path: relPath,
            node_type: 'interface',
            name,
            line_start: loc?.start.line || 1,
            line_end: loc?.end.line || 1,
            signature: `interface ${name}`
          });

          edges.push({
            id: `${self.projectSlug}:${fileNodeId}:${ifaceId}:DEFINES`,
            project_slug: self.projectSlug,
            source_id: fileNodeId,
            target_id: ifaceId,
            relation_type: 'DEFINES'
          });
        },

        // 7. Call Expressions (Calls & Data Flow)
        CallExpression(p: any) {
          if (currentScopeId === fileNodeId) return;

          const callee = p.node.callee;
          const calleeName = extractCalleeName(callee);

          // Detect Express router / app calls: app.get('/path', handler)
          if (callee.type === 'MemberExpression') {
            const prop = callee.property?.name || '';
            const obj = callee.object?.name || '';
            const expressMethods = ['get', 'post', 'put', 'delete', 'patch'];

            if (expressMethods.includes(prop) && (obj === 'app' || obj === 'router')) {
              const routeArg = p.node.arguments?.[0]?.value;
              if (typeof routeArg === 'string') {
                const httpMethod = prop.toUpperCase();
                const endpointName = `${httpMethod} ${routeArg}`;
                const endpointId = `${self.projectSlug}:${relPath}:endpoint:${httpMethod}_${routeArg.replace(/[^a-zA-Z0-9/_-]/g, '_')}`;

                nodes.push({
                  id: endpointId,
                  project_slug: self.projectSlug,
                  file_path: relPath,
                  node_type: 'endpoint',
                  name: endpointName,
                  line_start: p.node.loc?.start.line || 1,
                  line_end: p.node.loc?.end.line || 1,
                  signature: endpointName,
                  metadata: { httpMethod, route: routeArg }
                });

                edges.push({
                  id: `${self.projectSlug}:${endpointId}:${currentScopeId}:HANDLES_ROUTE`,
                  project_slug: self.projectSlug,
                  source_id: endpointId,
                  target_id: currentScopeId,
                  relation_type: 'HANDLES_ROUTE'
                });
              }
            }
          }

          if (calleeName) {
            edges.push({
              id: `${self.projectSlug}:${currentScopeId}:${calleeName}:CALLS:${p.node.loc?.start.line || 0}`,
              project_slug: self.projectSlug,
              source_id: currentScopeId,
              target_id: calleeName,
              relation_type: 'CALLS',
              metadata: {
                line: p.node.loc?.start.line || 1,
                calleeName
              }
            });
          }
        }
      });
    } catch {
      // Graceful recovery if traversal fails on any unexpected node
    }

    return { nodes, edges };
  }

  /**
   * Resolve relative imports or path aliases (@/, ~/) to normalized project relative path
   */
  public resolveImportPath(currentRelPath: string, importSource: string): string {
    let resolved: string;

    if (importSource.startsWith('@/') || importSource.startsWith('~/')) {
      const sub = importSource.slice(2);
      if (fs.existsSync(path.join(this.workspacePath, 'src', sub))) {
        resolved = path.join('src', sub).replace(/\\/g, '/');
      } else {
        resolved = sub.replace(/\\/g, '/');
      }
    } else if (importSource.startsWith('.')) {
      const currentDir = path.dirname(currentRelPath);
      resolved = path.join(currentDir, importSource).replace(/\\/g, '/');
    } else {
      resolved = importSource.replace(/\\/g, '/');
    }

    // Check extensions
    const exts = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.js'];
    for (const ext of exts) {
      if (fs.existsSync(path.join(this.workspacePath, resolved + ext))) {
        return (resolved + ext).replace(/\\/g, '/');
      }
    }

    if (!path.extname(resolved)) {
      resolved += '.ts';
    }
    return resolved;
  }

  /**
   * Derive route path from Next.js / API folder convention
   */
  private deriveRoutePathFromFile(relPath: string): string {
    let p = relPath.replace(/^src\//, '').replace(/^app\//, '').replace(/^pages\//, '');
    p = p.replace(/\/route\.[jt]sx?$/, '').replace(/\.[jt]sx?$/, '');
    return p.startsWith('/') ? p : `/${p}`;
  }
}
