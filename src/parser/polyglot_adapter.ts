import * as path from 'node:path';
import * as fs from 'node:fs';
import { CodeNode, CodeEdge, RelationType, NodeType } from '../types/index.js';
import { AstParser } from './ast_parser.js';
import { POLYGLOT_PATTERNS, pluralizeSnakeCase, BraceDepthPrefixStack } from './polyglot_tokenizer_rules.js';

export type SupportedLang = 'python' | 'go' | 'typescript' | 'php';

/**
 * Universal Polyglot AST & Tokenizer Engine (v2.0)
 *
 * Implements a Two-Pass Architecture:
 * - Pass 1: Global Symbol & Import Indexing + Route Prefix Group Scoping
 * - Pass 2: Edge & Flow Extraction across the 5 Universal Layers:
 *     1. ENTRY (Routes, CLI, Superglobals)
 *     2. LOGIC (Controllers, Services, DI)
 *     3. MODEL (ORM, Structs, Schemas)
 *     4. DB / DATA SINK (Migrations, Queries)
 *     5. VIEW / RESPONSE (Templates, JSON, Responses)
 * - Graph Referential Integrity Invariant: Guarantees 0 dangling edges with automatic stub node creation.
 */
export class PolyglotAstAdapter {
  private workspacePath: string;
  private projectSlug: string;
  private tsBabelParser: AstParser;

  constructor(workspacePath: string, projectSlug: string) {
    this.workspacePath = workspacePath;
    this.projectSlug = projectSlug;
    this.tsBabelParser = new AstParser(workspacePath, projectSlug);
  }

  /**
   * Main entry point to parse a file or code snippet in any supported language
   */
  public parse(relPath: string, code?: string): { nodes: CodeNode[]; edges: CodeEdge[] } {
    const ext = path.extname(relPath).toLowerCase();
    const fullPath = path.isAbsolute(relPath) ? relPath : path.join(this.workspacePath, relPath);
    const content = code !== undefined ? code : (fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf-8') : '');
    if (!content) return { nodes: [], edges: [] };
    if (content.length > 600_000) {
      throw new Error(`Ukuran berkas (${Math.round(content.length / 1024)} KB) melebihi batas aman 600 KB, dilewati untuk mencegah hang.`);
    }

    // 1. JS / TS (Babel AST)
    if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(ext)) {
      const parsed = this.tsBabelParser.parseFile(relPath, content);
      return this.ensureReferentialIntegrity(relPath, parsed.nodes, parsed.edges, new Map());
    }

    // 2. PHP (Native, Laravel, Blade)
    if (['.php', '.phtml'].includes(ext) || relPath.endsWith('.blade.php')) {
      return this.parsePhp(relPath, content);
    }

    // 3. Python (FastAPI, Flask, Django, Native)
    if (ext === '.py') {
      return this.parsePython(relPath, content);
    }

    // 4. Go (Native, Gin, Fiber, Echo)
    if (ext === '.go') {
      return this.parseGo(relPath, content);
    }

    return { nodes: [], edges: [] };
  }

  // ==========================================================================
  // PHP / LARAVEL PARSER (Two-Pass)
  // ==========================================================================
  private parsePhp(relPath: string, content: string): { nodes: CodeNode[]; edges: CodeEdge[] } {
    const nodes: CodeNode[] = [];
    const edges: CodeEdge[] = [];
    const lines = content.split('\n');
    const fileNodeId = `${this.projectSlug}:${relPath}:file:${path.basename(relPath)}`;

    nodes.push({
      id: fileNodeId,
      project_slug: this.projectSlug,
      file_path: relPath,
      node_type: 'file',
      name: path.basename(relPath),
      line_start: 1,
      line_end: lines.length,
      signature: `File: ${relPath}`
    });

    const symbolMap = new Map<string, string>(); // Name -> NodeId
    const aliasMap = new Map<string, string>();  // ShortAlias -> FullClass
    const prefixStack = new BraceDepthPrefixStack();

    // ------------------------------------------------------------------------
    // Pass 1: Index Classes, Methods, Imports (use statements), and Explicit Tables
    // ------------------------------------------------------------------------
    let activeClass: { name: string; id: string; isModel: boolean; tableName: string } | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;
      const trimmed = line.trim();

      // Track use aliases: use App\Services\OrderService as OS;
      const useMatch = trimmed.match(/^use\s+([A-Za-z0-9_\\]+)(?:\s+as\s+([A-Za-z0-9_]+))?\s*;/);
      if (useMatch) {
        const fullClass = useMatch[1];
        const alias = useMatch[2] || fullClass.split('\\').pop() || fullClass;
        aliasMap.set(alias, fullClass);
      }

      // Class declaration: class UserController extends Controller
      const classMatch = trimmed.match(/class\s+([A-Za-z0-9_]+)(?:\s+extends\s+([A-Za-z0-9_\\]+))?(?:\s+implements\s+([A-Za-z0-9_\\,\s]+))?/);
      if (classMatch) {
        const className = classMatch[1];
        const parentClass = classMatch[2] || '';
        const isModel = /Model|Authenticatable|Pivot/.test(parentClass);
        const classId = `${this.projectSlug}:${relPath}:${isModel ? 'model' : 'class'}:${className}`;

        activeClass = {
          name: className,
          id: classId,
          isModel,
          tableName: isModel ? pluralizeSnakeCase(className) : ''
        };

        symbolMap.set(className, classId);
        symbolMap.set(activeClass.name, classId);

        nodes.push({
          id: classId,
          project_slug: this.projectSlug,
          file_path: relPath,
          node_type: isModel ? 'model' : 'class',
          name: className,
          line_start: lineNum,
          line_end: lineNum,
          signature: `class ${className}${parentClass ? ` extends ${parentClass}` : ''}`,
          metadata: { isModel, parentClass }
        });

        edges.push({
          id: `${this.projectSlug}:${fileNodeId}:${classId}:DEFINES`,
          project_slug: this.projectSlug,
          source_id: fileNodeId,
          target_id: classId,
          relation_type: 'DEFINES'
        });

        if (parentClass) {
          edges.push({
            id: `${this.projectSlug}:${classId}:${parentClass}:EXTENDS`,
            project_slug: this.projectSlug,
            source_id: classId,
            target_id: parentClass,
            relation_type: 'EXTENDS'
          });
        }
      }

      // Explicit Model Table: protected $table = 'custom_users';
      const tableMatch = trimmed.match(/protected\s+\$table\s*=\s*['"]([a-zA-Z0-9_]+)['"]\s*;/);
      if (tableMatch && activeClass && activeClass.isModel) {
        activeClass.tableName = tableMatch[1];
      }

      // Function / Method: function index(Request $request)
      const funcMatch = trimmed.match(/(?:(public|protected|private)\s+)?(?:static\s+)?function\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)/);
      if (funcMatch) {
        const funcName = funcMatch[2];
        const params = funcMatch[3] || '';
        const isMethod = Boolean(activeClass);
        const fullName = isMethod ? `${activeClass!.name}.${funcName}` : funcName;
        const funcId = `${this.projectSlug}:${relPath}:${isMethod ? 'method' : 'function'}:${fullName}`;

        symbolMap.set(fullName, funcId);
        symbolMap.set(funcName, funcId);

        nodes.push({
          id: funcId,
          project_slug: this.projectSlug,
          file_path: relPath,
          node_type: isMethod ? 'method' : 'function',
          name: fullName,
          line_start: lineNum,
          line_end: lineNum,
          signature: `function ${funcName}(${params})`,
          metadata: { className: activeClass?.name, isMethod }
        });

        const parentId = isMethod ? activeClass!.id : fileNodeId;
        edges.push({
          id: `${this.projectSlug}:${parentId}:${funcId}:DEFINES`,
          project_slug: this.projectSlug,
          source_id: parentId,
          target_id: funcId,
          relation_type: 'DEFINES'
        });
      }
    }

    // ------------------------------------------------------------------------
    // Pass 2: Edge & Flow Extraction (Routes, DI, Model Relations, DB Sinks, Views)
    // ------------------------------------------------------------------------
    let currentMethodId = '';
    let currentMethodClass = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;
      const trimmed = line.trim();

      // Track lexical braces for route prefix stacks
      for (const ch of line) {
        if (ch === '{') prefixStack.onOpenBrace();
        else if (ch === '}') prefixStack.onCloseBrace();
      }

      // Route Group Prefix Detection: Route::prefix('api/v1')->group(function () {
      const prefixMatch = line.match(/Route::prefix\s*\(\s*['"]([^'"]+)['"]\s*\)->group/);
      if (prefixMatch) {
        prefixStack.pushPrefix(prefixMatch[1]);
      }
      const groupMatch = line.match(/Route::group\s*\(\s*\[\s*['"]prefix['"]\s*=>\s*['"]([^'"]+)['"]/);
      if (groupMatch) {
        prefixStack.pushPrefix(groupMatch[1]);
      }

      // Active Method Tracking
      const methodMatch = line.match(/(?:function)\s+([A-Za-z0-9_]+)\s*\(/);
      if (methodMatch) {
        const mName = methodMatch[1];
        const foundNode = nodes.find(n => (n.node_type === 'method' || n.node_type === 'function') && (n.name.endsWith(`.${mName}`) || n.name === mName));
        if (foundNode) {
          currentMethodId = foundNode.id;
          currentMethodClass = foundNode.metadata?.className || '';
        }
      }

      // --- 1. ENTRY (Routes) ---
      // A. Tuple Route: Route::get('/users', [UserController::class, 'index'])
      const tupleMatch = line.match(/Route::(get|post|put|patch|delete|options|any|match)\s*\(\s*(?:\[[^\]]+\]\s*,\s*)?['"]([^'"]+)['"]\s*,\s*\[\s*([A-Za-z0-9_\\]+)::class\s*,\s*['"]([A-Za-z0-9_]+)['"]\s*\]/);
      if (tupleMatch) {
        const httpMethod = tupleMatch[1].toUpperCase();
        const rawRoute = tupleMatch[2];
        const controllerClass = tupleMatch[3].split('\\').pop() || tupleMatch[3];
        const action = tupleMatch[4];
        const fullRoute = prefixStack.resolvePath(rawRoute);
        const endpointId = `${this.projectSlug}:${relPath}:endpoint:${httpMethod}_${fullRoute.replace(/[^a-zA-Z0-9/_-]/g, '_')}`;

        nodes.push({
          id: endpointId,
          project_slug: this.projectSlug,
          file_path: relPath,
          node_type: 'endpoint',
          name: `${httpMethod} ${fullRoute}`,
          line_start: lineNum,
          line_end: lineNum,
          signature: `Route::${tupleMatch[1]}('${fullRoute}', [${controllerClass}::class, '${action}'])`,
          metadata: { httpMethod, route: fullRoute, controller: controllerClass, action }
        });

        const targetSymbol = `${controllerClass}.${action}`;
        const targetId = symbolMap.get(targetSymbol) || symbolMap.get(controllerClass) || targetSymbol;
        edges.push({
          id: `${this.projectSlug}:${endpointId}:${targetId}:HANDLES_ROUTE`,
          project_slug: this.projectSlug,
          source_id: endpointId,
          target_id: targetId,
          relation_type: 'HANDLES_ROUTE'
        });
      }

      // B. String Route: Route::post('/login', 'AuthController@login')
      const strRouteMatch = line.match(/Route::(get|post|put|patch|delete|any)\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([A-Za-z0-9_\\]+)@([A-Za-z0-9_]+)['"]/);
      if (strRouteMatch) {
        const httpMethod = strRouteMatch[1].toUpperCase();
        const rawRoute = strRouteMatch[2];
        const controllerClass = strRouteMatch[3].split('\\').pop() || strRouteMatch[3];
        const action = strRouteMatch[4];
        const fullRoute = prefixStack.resolvePath(rawRoute);
        const endpointId = `${this.projectSlug}:${relPath}:endpoint:${httpMethod}_${fullRoute.replace(/[^a-zA-Z0-9/_-]/g, '_')}`;

        nodes.push({
          id: endpointId,
          project_slug: this.projectSlug,
          file_path: relPath,
          node_type: 'endpoint',
          name: `${httpMethod} ${fullRoute}`,
          line_start: lineNum,
          line_end: lineNum,
          signature: `Route::${strRouteMatch[1]}('${fullRoute}', '${controllerClass}@${action}')`,
          metadata: { httpMethod, route: fullRoute, controller: controllerClass, action }
        });

        const targetSymbol = `${controllerClass}.${action}`;
        const targetId = symbolMap.get(targetSymbol) || symbolMap.get(controllerClass) || targetSymbol;
        edges.push({
          id: `${this.projectSlug}:${endpointId}:${targetId}:HANDLES_ROUTE`,
          project_slug: this.projectSlug,
          source_id: endpointId,
          target_id: targetId,
          relation_type: 'HANDLES_ROUTE'
        });
      }

      // C. Resource Route: Route::resource('photos', PhotoController::class)
      const resMatch = line.match(/Route::(resource|apiResource)\s*\(\s*['"]([^'"]+)['"]\s*,\s*([A-Za-z0-9_\\]+)::class/);
      if (resMatch) {
        const baseRoute = prefixStack.resolvePath(resMatch[2]);
        const ctrl = resMatch[3].split('\\').pop() || resMatch[3];
        const endpointId = `${this.projectSlug}:${relPath}:endpoint:RESOURCE_${baseRoute.replace(/[^a-zA-Z0-9/_-]/g, '_')}`;

        nodes.push({
          id: endpointId,
          project_slug: this.projectSlug,
          file_path: relPath,
          node_type: 'endpoint',
          name: `RESOURCE ${baseRoute}`,
          line_start: lineNum,
          line_end: lineNum,
          signature: `Route::resource('${baseRoute}', ${ctrl}::class)`,
          metadata: { resource: baseRoute, controller: ctrl }
        });

        const targetId = symbolMap.get(ctrl) || ctrl;
        edges.push({
          id: `${this.projectSlug}:${endpointId}:${targetId}:HANDLES_ROUTE`,
          project_slug: this.projectSlug,
          source_id: endpointId,
          target_id: targetId,
          relation_type: 'HANDLES_ROUTE'
        });
      }

      // D. Native PHP Direct Entry (superglobals outside class)
      const nativeEntryMatch = line.match(/\$_(GET|POST|REQUEST|FILES)\s*\[\s*['"]([^'"]+)['"]\s*\]/);
      if (nativeEntryMatch && !currentMethodClass) {
        const param = nativeEntryMatch[2];
        const endpointId = `${this.projectSlug}:${relPath}:endpoint:DIRECT_${param}`;
        if (!nodes.some(n => n.id === endpointId)) {
          nodes.push({
            id: endpointId,
            project_slug: this.projectSlug,
            file_path: relPath,
            node_type: 'endpoint',
            name: `SCRIPT $_${nativeEntryMatch[1]}['${param}']`,
            line_start: lineNum,
            line_end: lineNum,
            signature: `Direct Entry via $_${nativeEntryMatch[1]}['${param}']`
          });
          edges.push({
            id: `${this.projectSlug}:${endpointId}:${fileNodeId}:HANDLES_ROUTE`,
            project_slug: this.projectSlug,
            source_id: endpointId,
            target_id: fileNodeId,
            relation_type: 'HANDLES_ROUTE'
          });
        }
      }

      // --- 2. LOGIC (Dependency Injection & Method Calls) ---
      // Constructor / Method DI: (OrderService $orderService)
      const diMatches = line.matchAll(/([A-Z][A-Za-z0-9_\\]*)\s+\$([a-zA-Z0-9_]+)/g);
      for (const m of diMatches) {
        const serviceType = m[1].split('\\').pop() || m[1];
        if (serviceType !== 'Request' && serviceType !== 'Response' && serviceType !== 'String' && serviceType !== 'Int') {
          const callerId = currentMethodId || fileNodeId;
          const targetId = symbolMap.get(serviceType) || serviceType;
          edges.push({
            id: `${this.projectSlug}:${callerId}:${targetId}:INJECTS:${lineNum}`,
            project_slug: this.projectSlug,
            source_id: callerId,
            target_id: targetId,
            relation_type: 'INJECTS',
            metadata: { injectedClass: serviceType }
          });
        }
      }

      // Service Container: app(OrderService::class)
      const appDiMatch = line.match(/\b(?:app|resolve)\s*\(\s*([A-Za-z0-9_\\]+)::class\s*\)/);
      if (appDiMatch) {
        const svcName = appDiMatch[1].split('\\').pop() || appDiMatch[1];
        const callerId = currentMethodId || fileNodeId;
        const targetId = symbolMap.get(svcName) || svcName;
        edges.push({
          id: `${this.projectSlug}:${callerId}:${targetId}:INJECTS:${lineNum}`,
          project_slug: this.projectSlug,
          source_id: callerId,
          target_id: targetId,
          relation_type: 'INJECTS'
        });
      }

      // Chained Call: $this->orderService->create() or User::where(...)
      const staticEloquentMatch = line.match(/\b([A-Z][A-Za-z0-9_]*)::(where|find|create|update|first|all|with)\s*\(/);
      if (staticEloquentMatch) {
        const modelName = staticEloquentMatch[1];
        const callerId = currentMethodId || fileNodeId;
        const targetId = symbolMap.get(modelName) || modelName;
        edges.push({
          id: `${this.projectSlug}:${callerId}:${targetId}:CALLS:${lineNum}`,
          project_slug: this.projectSlug,
          source_id: callerId,
          target_id: targetId,
          relation_type: 'CALLS',
          metadata: { operation: staticEloquentMatch[2] }
        });
      }

      // --- 3. MODEL (Eloquent Relationships) ---
      // function items() { return $this->hasMany(OrderItem::class); }
      const relMatch = line.match(/return\s+\$this->(hasOne|hasMany|belongsTo|belongsToMany|morphTo|morphMany)\s*\(\s*([A-Za-z0-9_\\]+)::class/);
      if (relMatch && activeClass) {
        const relType = relMatch[1];
        const relatedModel = relMatch[2].split('\\').pop() || relMatch[2];
        const targetId = symbolMap.get(relatedModel) || relatedModel;
        edges.push({
          id: `${this.projectSlug}:${activeClass.id}:${targetId}:CALLS:${lineNum}`,
          project_slug: this.projectSlug,
          source_id: activeClass.id,
          target_id: targetId,
          relation_type: 'CALLS',
          metadata: { relationType: relType }
        });
      }

      // --- 4. DB SINK / MIGRATION ---
      // Schema::create('orders', ...)
      const schemaMatch = line.match(/Schema::(create|table)\s*\(\s*['"]([a-zA-Z0-9_]+)['"]/);
      if (schemaMatch) {
        const tableName = schemaMatch[2];
        const dbNodeId = `${this.projectSlug}:${relPath}:model:table_${tableName}`;
        nodes.push({
          id: dbNodeId,
          project_slug: this.projectSlug,
          file_path: relPath,
          node_type: 'model',
          name: `table:${tableName}`,
          line_start: lineNum,
          line_end: lineNum,
          signature: `Schema::create('${tableName}')`,
          metadata: { isTableSink: true, tableName }
        });
        edges.push({
          id: `${this.projectSlug}:${fileNodeId}:${dbNodeId}:DEFINES`,
          project_slug: this.projectSlug,
          source_id: fileNodeId,
          target_id: dbNodeId,
          relation_type: 'DEFINES'
        });
      }

      // DB::table('users') or PDO query
      const dbQueryMatch = line.match(/DB::table\s*\(\s*['"]([a-zA-Z0-9_]+)['"]\s*\)/);
      if (dbQueryMatch) {
        const tbl = dbQueryMatch[1];
        const callerId = currentMethodId || fileNodeId;
        const sinkNodeId = `${this.projectSlug}:db_sink:${tbl}`;
        edges.push({
          id: `${this.projectSlug}:${callerId}:${sinkNodeId}:CALLS:${lineNum}`,
          project_slug: this.projectSlug,
          source_id: callerId,
          target_id: sinkNodeId,
          relation_type: 'CALLS',
          metadata: { sqlSink: true, table: tbl }
        });
      }

      // --- 5. VIEW / RESPONSE ---
      // view('users.index') or View::make('orders.show')
      const viewMatch = line.match(/\b(?:view|View::make|Inertia::render|inertia)\s*\(\s*['"]([a-zA-Z0-9_./-]+)['"]/);
      if (viewMatch) {
        const viewName = viewMatch[1];
        const viewNodeId = `${this.projectSlug}:view:${viewName.replace(/\./g, '/')}`;
        const callerId = currentMethodId || fileNodeId;

        nodes.push({
          id: viewNodeId,
          project_slug: this.projectSlug,
          file_path: `resources/views/${viewName.replace(/\./g, '/')}.blade.php`,
          node_type: 'file',
          name: `view:${viewName}`,
          line_start: lineNum,
          line_end: lineNum,
          signature: `view('${viewName}')`,
          metadata: { isView: true, viewName }
        });

        edges.push({
          id: `${this.projectSlug}:${callerId}:${viewNodeId}:CALLS:${lineNum}`,
          project_slug: this.projectSlug,
          source_id: callerId,
          target_id: viewNodeId,
          relation_type: 'CALLS'
        });
      }

      // Blade inheritance: @extends('layouts.app') or @include('partials.nav')
      const bladeSubViewMatch = line.match(/@(extends|include|includeIf|includeWhen)\s*\(\s*['"]([a-zA-Z0-9_.-]+)['"]/);
      if (bladeSubViewMatch) {
        const subViewName = bladeSubViewMatch[2];
        const subViewId = `${this.projectSlug}:view:${subViewName.replace(/\./g, '/')}`;
        nodes.push({
          id: subViewId,
          project_slug: this.projectSlug,
          file_path: `resources/views/${subViewName.replace(/\./g, '/')}.blade.php`,
          node_type: 'file',
          name: `view:${subViewName}`,
          line_start: lineNum,
          line_end: lineNum,
          signature: `@${bladeSubViewMatch[1]}('${subViewName}')`,
          metadata: { isView: true, subViewName }
        });
        edges.push({
          id: `${this.projectSlug}:${fileNodeId}:${subViewId}:IMPORTS:${lineNum}`,
          project_slug: this.projectSlug,
          source_id: fileNodeId,
          target_id: subViewId,
          relation_type: 'IMPORTS'
        });
      }
    }

    return this.ensureReferentialIntegrity(relPath, nodes, edges, symbolMap);
  }

  // ==========================================================================
  // PYTHON PARSER (FastAPI, Flask, Django, Native)
  // ==========================================================================
  private parsePython(relPath: string, content: string): { nodes: CodeNode[]; edges: CodeEdge[] } {
    const nodes: CodeNode[] = [];
    const edges: CodeEdge[] = [];
    const lines = content.split('\n');
    const fileNodeId = `${this.projectSlug}:${relPath}:file:${path.basename(relPath)}`;

    nodes.push({
      id: fileNodeId,
      project_slug: this.projectSlug,
      file_path: relPath,
      node_type: 'file',
      name: path.basename(relPath),
      line_start: 1,
      line_end: lines.length,
      signature: `File: ${relPath}`
    });

    const symbolMap = new Map<string, string>();
    let currentClassName = '';
    let currentClassId = '';
    let pendingDecoratorRoute: { method: string; route: string } | null = null;

    // Pass 1: Index Classes & Functions
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;
      const trimmed = line.trim();

      // Class: class UserService(BaseService):
      const classMatch = trimmed.match(/^class\s+([A-Za-z0-9_]+)(?:\(([^)]*)\))?:/);
      if (classMatch) {
        currentClassName = classMatch[1];
        const isModel = /Model|Base|BaseModel|SQLModel/.test(classMatch[2] || '');
        currentClassId = `${this.projectSlug}:${relPath}:${isModel ? 'model' : 'class'}:${currentClassName}`;
        symbolMap.set(currentClassName, currentClassId);

        nodes.push({
          id: currentClassId,
          project_slug: this.projectSlug,
          file_path: relPath,
          node_type: isModel ? 'model' : 'class',
          name: currentClassName,
          line_start: lineNum,
          line_end: lineNum,
          signature: `class ${currentClassName}`
        });

        edges.push({
          id: `${this.projectSlug}:${fileNodeId}:${currentClassId}:DEFINES`,
          project_slug: this.projectSlug,
          source_id: fileNodeId,
          target_id: currentClassId,
          relation_type: 'DEFINES'
        });
        continue;
      }

      // Def: def get_user(user_id: int):
      const funcMatch = trimmed.match(/^(?:async\s+)?def\s+([A-Za-z0-9_]+)\s*\((.*)\)\s*(?:->\s*[^:]+)?\s*:/);
      if (funcMatch) {
        const funcName = funcMatch[1];
        const isMethod = Boolean(currentClassName && line.startsWith('    '));
        const fullName = isMethod ? `${currentClassName}.${funcName}` : funcName;
        const funcId = `${this.projectSlug}:${relPath}:${isMethod ? 'method' : 'function'}:${fullName}`;
        symbolMap.set(fullName, funcId);
        symbolMap.set(funcName, funcId);

        nodes.push({
          id: funcId,
          project_slug: this.projectSlug,
          file_path: relPath,
          node_type: isMethod ? 'method' : 'function',
          name: fullName,
          line_start: lineNum,
          line_end: lineNum,
          signature: `def ${funcName}(${funcMatch[2]})`
        });

        const parentId = isMethod ? currentClassId : fileNodeId;
        edges.push({
          id: `${this.projectSlug}:${parentId}:${funcId}:DEFINES`,
          project_slug: this.projectSlug,
          source_id: parentId,
          target_id: funcId,
          relation_type: 'DEFINES'
        });
      }
    }

    // Pass 2: Decorator Routes, DI (Depends), ORM Relations & Views
    currentClassName = '';
    currentClassId = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;
      const trimmed = line.trim();

      if (trimmed.startsWith('class ')) {
        const m = trimmed.match(/^class\s+([A-Za-z0-9_]+)/);
        if (m) {
          currentClassName = m[1];
          currentClassId = symbolMap.get(currentClassName) || '';
        }
      }

      // Decorator route: @app.get("/api/v1/users")
      const decMatch = trimmed.match(/^@(?:app|router|bp)\.(get|post|put|delete|patch|options|route)\s*\(\s*['"]([^'"]+)['"]/i);
      if (decMatch) {
        pendingDecoratorRoute = {
          method: decMatch[1].toUpperCase(),
          route: decMatch[2]
        };
        continue;
      }

      // Connect route to decorated function
      const defMatch = trimmed.match(/^(?:async\s+)?def\s+([A-Za-z0-9_]+)\s*\((.*)\)\s*(?:->\s*[^:]+)?\s*:/);
      if (defMatch) {
        const funcName = defMatch[1];
        const params = defMatch[2];
        const isMethod = Boolean(currentClassName && line.startsWith('    '));
        const fullName = isMethod ? `${currentClassName}.${funcName}` : funcName;
        const funcId = symbolMap.get(fullName) || symbolMap.get(funcName) || `${this.projectSlug}:${relPath}:function:${funcName}`;

        if (pendingDecoratorRoute) {
          const { method, route } = pendingDecoratorRoute;
          const endpointId = `${this.projectSlug}:${relPath}:endpoint:${method}_${route.replace(/[^a-zA-Z0-9/_-]/g, '_')}`;

          nodes.push({
            id: endpointId,
            project_slug: this.projectSlug,
            file_path: relPath,
            node_type: 'endpoint',
            name: `${method} ${route}`,
            line_start: lineNum - 1,
            line_end: lineNum,
            signature: `${method} ${route}`,
            metadata: { httpMethod: method, route }
          });

          edges.push({
            id: `${this.projectSlug}:${endpointId}:${funcId}:HANDLES_ROUTE`,
            project_slug: this.projectSlug,
            source_id: endpointId,
            target_id: funcId,
            relation_type: 'HANDLES_ROUTE'
          });

          pendingDecoratorRoute = null;
        }

        // FastAPI Dependency Injection: service: UserService = Depends(get_user_service)
        const diMatch = params.match(/([a-zA-Z0-9_]+)\s*:\s*([A-Za-z0-9_]+)\s*=\s*Depends\(\s*([A-Za-z0-9_.]+)?\s*\)/);
        if (diMatch) {
          const injectedClass = diMatch[2];
          const targetId = symbolMap.get(injectedClass) || injectedClass;
          edges.push({
            id: `${this.projectSlug}:${funcId}:${targetId}:INJECTS:${lineNum}`,
            project_slug: this.projectSlug,
            source_id: funcId,
            target_id: targetId,
            relation_type: 'INJECTS'
          });
        }
      }

      // Django path('api/users', views.user_list)
      const djangoPathMatch = trimmed.match(/\bpath\s*\(\s*['"]([^'"]*)['"]\s*,\s*([a-zA-Z0-9_.]+)/);
      if (djangoPathMatch) {
        const route = djangoPathMatch[1];
        const handler = djangoPathMatch[2];
        const endpointId = `${this.projectSlug}:${relPath}:endpoint:GET_${route.replace(/[^a-zA-Z0-9/_-]/g, '_')}`;

        nodes.push({
          id: endpointId,
          project_slug: this.projectSlug,
          file_path: relPath,
          node_type: 'endpoint',
          name: `ROUTE /${route}`,
          line_start: lineNum,
          line_end: lineNum,
          signature: `path('${route}', ${handler})`
        });

        const targetId = symbolMap.get(handler) || handler;
        edges.push({
          id: `${this.projectSlug}:${endpointId}:${targetId}:HANDLES_ROUTE`,
          project_slug: this.projectSlug,
          source_id: endpointId,
          target_id: targetId,
          relation_type: 'HANDLES_ROUTE'
        });
      }

      // SQLAlchemy / Django ORM relation
      const relMatch = trimmed.match(/([a-zA-Z0-9_]+)\s*=\s*(?:relationship|models\.ForeignKey)\s*\(\s*['"]?([A-Za-z0-9_]+)['"]?/);
      if (relMatch && currentClassId) {
        const targetModel = relMatch[2];
        const targetId = symbolMap.get(targetModel) || targetModel;
        edges.push({
          id: `${this.projectSlug}:${currentClassId}:${targetId}:CALLS:${lineNum}`,
          project_slug: this.projectSlug,
          source_id: currentClassId,
          target_id: targetId,
          relation_type: 'CALLS'
        });
      }

      // Views: render_template('index.html')
      const pyViewMatch = trimmed.match(/\b(?:render_template|TemplateResponse)\s*\(\s*(?:request\s*,\s*)?['"]([^'"]+\.(?:html|jinja2|j2))['"]/);
      if (pyViewMatch) {
        const vName = pyViewMatch[1];
        const viewId = `${this.projectSlug}:view:${vName}`;
        nodes.push({
          id: viewId,
          project_slug: this.projectSlug,
          file_path: `templates/${vName}`,
          node_type: 'file',
          name: `view:${vName}`,
          line_start: lineNum,
          line_end: lineNum,
          signature: `render_template('${vName}')`
        });
        const callerId = currentClassId || fileNodeId;
        edges.push({
          id: `${this.projectSlug}:${callerId}:${viewId}:CALLS:${lineNum}`,
          project_slug: this.projectSlug,
          source_id: callerId,
          target_id: viewId,
          relation_type: 'CALLS'
        });
      }
    }

    return this.ensureReferentialIntegrity(relPath, nodes, edges, symbolMap);
  }

  // ==========================================================================
  // GO PARSER (Gin, Fiber, Echo, Native net/http)
  // ==========================================================================
  private parseGo(relPath: string, content: string): { nodes: CodeNode[]; edges: CodeEdge[] } {
    const nodes: CodeNode[] = [];
    const edges: CodeEdge[] = [];
    const lines = content.split('\n');
    const fileNodeId = `${this.projectSlug}:${relPath}:file:${path.basename(relPath)}`;

    nodes.push({
      id: fileNodeId,
      project_slug: this.projectSlug,
      file_path: relPath,
      node_type: 'file',
      name: path.basename(relPath),
      line_start: 1,
      line_end: lines.length,
      signature: `File: ${relPath}`
    });

    const symbolMap = new Map<string, string>();
    const routerGroupPrefixes = new Map<string, string>(); // groupVar -> "/api/v1"

    // Pass 1: Index Structs, Interfaces, Receiver Methods, and Router Groups
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;
      const trimmed = line.trim();

      // Router Group: v1 := r.Group("/api/v1")
      const groupMatch = trimmed.match(/([a-zA-Z0-9_]+)\s*:?=\s*(?:r|router|app|e)\.Group\s*\(\s*"([^"]+)"\s*\)/);
      if (groupMatch) {
        routerGroupPrefixes.set(groupMatch[1], groupMatch[2]);
      }

      // Struct: type OrderService struct
      const structMatch = trimmed.match(/^type\s+([A-Za-z0-9_]+)\s+struct/);
      if (structMatch) {
        const structName = structMatch[1];
        const isModel = content.includes(`\`gorm:`) || content.includes(`\`db:`) || content.includes(`\`sql:`);
        const structId = `${this.projectSlug}:${relPath}:${isModel ? 'model' : 'class'}:${structName}`;
        symbolMap.set(structName, structId);

        nodes.push({
          id: structId,
          project_slug: this.projectSlug,
          file_path: relPath,
          node_type: isModel ? 'model' : 'class',
          name: structName,
          line_start: lineNum,
          line_end: lineNum,
          signature: `type ${structName} struct`
        });

        edges.push({
          id: `${this.projectSlug}:${fileNodeId}:${structId}:DEFINES`,
          project_slug: this.projectSlug,
          source_id: fileNodeId,
          target_id: structId,
          relation_type: 'DEFINES'
        });
        continue;
      }

      // Interface: type IOrderRepository interface
      const ifaceMatch = trimmed.match(/^type\s+([A-Za-z0-9_]+)\s+interface/);
      if (ifaceMatch) {
        const ifaceName = ifaceMatch[1];
        const ifaceId = `${this.projectSlug}:${relPath}:interface:${ifaceName}`;
        symbolMap.set(ifaceName, ifaceId);

        nodes.push({
          id: ifaceId,
          project_slug: this.projectSlug,
          file_path: relPath,
          node_type: 'interface',
          name: ifaceName,
          line_start: lineNum,
          line_end: lineNum,
          signature: `type ${ifaceName} interface`
        });

        edges.push({
          id: `${this.projectSlug}:${fileNodeId}:${ifaceId}:DEFINES`,
          project_slug: this.projectSlug,
          source_id: fileNodeId,
          target_id: ifaceId,
          relation_type: 'DEFINES'
        });
        continue;
      }

      // Receiver Method: func (s *OrderService) CreateOrder(...)
      const receiverMatch = trimmed.match(/^func\s+\(\w+\s+\*?([A-Za-z0-9_]+)\)\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)/);
      if (receiverMatch) {
        const receiverType = receiverMatch[1];
        const methodName = receiverMatch[2];
        const fullName = `${receiverType}.${methodName}`;
        const methodId = `${this.projectSlug}:${relPath}:method:${fullName}`;
        const classNodeId = symbolMap.get(receiverType) || `${this.projectSlug}:${relPath}:class:${receiverType}`;
        symbolMap.set(fullName, methodId);
        symbolMap.set(methodName, methodId);

        nodes.push({
          id: methodId,
          project_slug: this.projectSlug,
          file_path: relPath,
          node_type: 'method',
          name: fullName,
          line_start: lineNum,
          line_end: lineNum,
          signature: `func (${receiverType}) ${methodName}()`
        });

        edges.push({
          id: `${this.projectSlug}:${classNodeId}:${methodId}:DEFINES`,
          project_slug: this.projectSlug,
          source_id: classNodeId,
          target_id: methodId,
          relation_type: 'DEFINES'
        });
        continue;
      }

      // Function: func Main()
      const funcMatch = trimmed.match(/^func\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)/);
      if (funcMatch) {
        const funcName = funcMatch[1];
        const funcId = `${this.projectSlug}:${relPath}:function:${funcName}`;
        symbolMap.set(funcName, funcId);

        nodes.push({
          id: funcId,
          project_slug: this.projectSlug,
          file_path: relPath,
          node_type: 'function',
          name: funcName,
          line_start: lineNum,
          line_end: lineNum,
          signature: `func ${funcName}()`
        });

        edges.push({
          id: `${this.projectSlug}:${fileNodeId}:${funcId}:DEFINES`,
          project_slug: this.projectSlug,
          source_id: fileNodeId,
          target_id: funcId,
          relation_type: 'DEFINES'
        });
      }
    }

    // Pass 2: HTTP Routes & Constructor DI
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;
      const trimmed = line.trim();

      // Constructor DI: func NewOrderHandler(svc *OrderService) *OrderHandler
      const ctorMatch = trimmed.match(/^func\s+New([A-Za-z0-9_]+)\s*\(([^)]*)\)/);
      if (ctorMatch) {
        const targetHandler = ctorMatch[1];
        const params = ctorMatch[2];
        const handlerId = symbolMap.get(targetHandler) || targetHandler;

        const depMatches = params.matchAll(/\*?([A-Z][A-Za-z0-9_]+)/g);
        for (const dm of depMatches) {
          const depType = dm[1];
          if (depType !== targetHandler && !['Context', 'DB', 'Logger'].includes(depType)) {
            const depId = symbolMap.get(depType) || depType;
            edges.push({
              id: `${this.projectSlug}:${handlerId}:${depId}:INJECTS:${lineNum}`,
              project_slug: this.projectSlug,
              source_id: handlerId,
              target_id: depId,
              relation_type: 'INJECTS'
            });
          }
        }
      }

      // Gin/Fiber/Echo HTTP routes: r.GET("/orders", orderController.Create) or v1.POST(...)
      const routeMatch = trimmed.match(/\b([a-zA-Z0-9_]+)\.(GET|POST|PUT|DELETE|PATCH|Handle)\s*\(\s*"([^"]+)"\s*,\s*([A-Za-z0-9_.]+)/i);
      if (routeMatch) {
        const routerVar = routeMatch[1];
        const httpMethod = routeMatch[2].toUpperCase();
        const rawRoute = routeMatch[3];
        const handler = routeMatch[4];
        const groupPrefix = routerGroupPrefixes.get(routerVar) || '';
        const fullRoute = groupPrefix ? `${groupPrefix.replace(/\/$/, '')}/${rawRoute.replace(/^\//, '')}` : rawRoute;
        const endpointId = `${this.projectSlug}:${relPath}:endpoint:${httpMethod}_${fullRoute.replace(/[^a-zA-Z0-9/_-]/g, '_')}`;

        nodes.push({
          id: endpointId,
          project_slug: this.projectSlug,
          file_path: relPath,
          node_type: 'endpoint',
          name: `${httpMethod} ${fullRoute}`,
          line_start: lineNum,
          line_end: lineNum,
          signature: `${httpMethod} ${fullRoute}`,
          metadata: { httpMethod, route: fullRoute, handler }
        });

        const targetId = symbolMap.get(handler) || handler;
        edges.push({
          id: `${this.projectSlug}:${endpointId}:${targetId}:HANDLES_ROUTE`,
          project_slug: this.projectSlug,
          source_id: endpointId,
          target_id: targetId,
          relation_type: 'HANDLES_ROUTE'
        });
      }
    }

    return this.ensureReferentialIntegrity(relPath, nodes, edges, symbolMap);
  }

  // ==========================================================================
  // GRAPH REFERENTIAL INTEGRITY INVARIANT (Anti-Crash Filter)
  // ==========================================================================
  private ensureReferentialIntegrity(
    relPath: string,
    nodes: CodeNode[],
    edges: CodeEdge[],
    symbolMap: Map<string, string>
  ): { nodes: CodeNode[]; edges: CodeEdge[] } {
    const nodeIds = new Set(nodes.map(n => n.id));

    // Pass: rewire any edges that point to short symbol names
    for (const e of edges) {
      if (!nodeIds.has(e.target_id)) {
        if (symbolMap.has(e.target_id)) {
          e.target_id = symbolMap.get(e.target_id)!;
        }
      }
      if (!nodeIds.has(e.source_id)) {
        if (symbolMap.has(e.source_id)) {
          e.source_id = symbolMap.get(e.source_id)!;
        }
      }
    }

    // Pass: create stub nodes for any external / unresolved symbols
    for (const e of edges) {
      if (!nodeIds.has(e.source_id)) {
        nodes.push({
          id: e.source_id,
          project_slug: this.projectSlug,
          file_path: relPath,
          node_type: 'class',
          name: e.source_id,
          line_start: 1,
          line_end: 1,
          signature: `external:${e.source_id}`,
          metadata: { stub: true }
        });
        nodeIds.add(e.source_id);
      }

      if (!nodeIds.has(e.target_id)) {
        nodes.push({
          id: e.target_id,
          project_slug: this.projectSlug,
          file_path: relPath,
          node_type: 'class',
          name: e.target_id,
          line_start: 1,
          line_end: 1,
          signature: `external:${e.target_id}`,
          metadata: { stub: true }
        });
        nodeIds.add(e.target_id);
      }

      // Add source & target alias properties for Playwright & E2E tests
      (e as any).source = e.source_id;
      (e as any).target = e.target_id;
    }

    return { nodes, edges };
  }
}
