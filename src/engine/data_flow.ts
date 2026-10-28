import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { MemoryDatabase } from '../db/database.js';
import {
  CodeNode,
  CodeEdge,
  DataFlowStep,
  DataFlowTrace,
  TaintTransition,
  CallArgumentBinding,
  FunctionDataFlowSummary,
  DataPropagationStep,
  DataFlowTraceResult
} from '../types/index.js';

const traverse = (_traverse as any).default || _traverse;

const SANITIZER_PATTERNS = /sanitize|escape|validate|parse|zod|joi|clean|hash|encrypt|Number|parseInt|Boolean|DOMPurify|validator/i;
const SINK_PATTERNS = {
  DATABASE_WRITE: /\.(save|create|insert|update|upsert|delete|destroy|execute|query|raw|findOneAndUpdate|run|exec)$/i,
  EXTERNAL_API: /\.(post|put|patch|fetch|axios|send|publish|emit|charge|request)$/i,
  RESPONSE_OUTPUT: /\.(json|send|render|end|write)$/i
};

export class InterproceduralDataFlowTracer {
  private workspacePath: string;
  private summaryCache = new Map<string, FunctionDataFlowSummary>();

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
  }

  /**
   * Menganalisis satu fungsi/method secara mikro (Intraprocedural AST Def-Use Slicing)
   */
  public analyzeFunctionAst(node: CodeNode): FunctionDataFlowSummary {
    if (this.summaryCache.has(node.id)) {
      return this.summaryCache.get(node.id)!;
    }

    const summary: FunctionDataFlowSummary = {
      nodeId: node.id,
      functionName: node.name,
      parameters: [],
      transitions: [],
      callBindings: [],
      returnDependencies: []
    };

    const fullPath = path.join(this.workspacePath, node.file_path);
    if (!fs.existsSync(fullPath)) return summary;
    const fileContent = fs.readFileSync(fullPath, 'utf-8');

    let ast: any;
    try {
      ast = parse(fileContent, {
        sourceType: 'module',
        plugins: ['typescript', 'jsx', 'decorators-legacy'],
        errorRecovery: true
      });
    } catch {
      return summary;
    }

    const taintTable = new Map<string, { sources: Set<string>; sanitized: boolean }>();

    const extractIdentifiersAndMemberPaths = (exprNode: any): string[] => {
      const results: string[] = [];
      if (!exprNode) return results;

      if (exprNode.type === 'Identifier') {
        results.push(exprNode.name);
      } else if (exprNode.type === 'MemberExpression' || exprNode.type === 'OptionalMemberExpression') {
        const fullChain = this.flattenMemberExpr(exprNode);
        if (fullChain) results.push(fullChain);
        const rootObj = fullChain.split('.')[0];
        if (rootObj && rootObj !== 'this') results.push(rootObj);
      } else if (exprNode.type === 'CallExpression' || exprNode.type === 'OptionalCallExpression') {
        for (const arg of exprNode.arguments || []) {
          results.push(...extractIdentifiersAndMemberPaths(arg));
        }
        if (exprNode.callee?.type === 'MemberExpression') {
          results.push(...extractIdentifiersAndMemberPaths(exprNode.callee.object));
        }
      } else if (exprNode.type === 'AwaitExpression' || exprNode.type === 'SpreadElement' || exprNode.type === 'TSAsExpression') {
        results.push(...extractIdentifiersAndMemberPaths(exprNode.argument || exprNode.expression));
      } else if (exprNode.type === 'BinaryExpression' || exprNode.type === 'LogicalExpression') {
        results.push(
          ...extractIdentifiersAndMemberPaths(exprNode.left),
          ...extractIdentifiersAndMemberPaths(exprNode.right)
        );
      } else if (exprNode.type === 'ConditionalExpression') {
        results.push(
          ...extractIdentifiersAndMemberPaths(exprNode.consequent),
          ...extractIdentifiersAndMemberPaths(exprNode.alternate)
        );
      } else if (exprNode.type === 'TemplateLiteral') {
        for (const expr of exprNode.expressions || []) {
          results.push(...extractIdentifiersAndMemberPaths(expr));
        }
      } else if (exprNode.type === 'ObjectExpression') {
        for (const prop of exprNode.properties || []) {
          results.push(...extractIdentifiersAndMemberPaths(prop.value || prop.argument));
        }
      } else if (exprNode.type === 'ArrayExpression') {
        for (const elem of exprNode.elements || []) {
          results.push(...extractIdentifiersAndMemberPaths(elem));
        }
      }

      return Array.from(new Set(results));
    };

    const self = this;
    const shortTargetName = node.name.split('.').pop();

    traverse(ast, {
      enter(p: any) {
        const loc = p.node.loc;
        if (!loc) return;

        const isFuncNode =
          p.isClassMethod() ||
          p.isFunctionDeclaration() ||
          p.isArrowFunctionExpression() ||
          p.isFunctionExpression();

        if (!isFuncNode) return;

        // Toleransi baris +-2 untuk menangani perbedaan baris akibat @Decorator di TypeScript
        const lineMatches = Math.abs(loc.start.line - node.line_start) <= 2;
        const nameMatches =
          p.node.id?.name === shortTargetName ||
          p.node.key?.name === shortTargetName ||
          (p.parentPath?.isVariableDeclarator() && p.parentPath.node.id?.name === shortTargetName);

        if (loc.start.line === node.line_start || (lineMatches && nameMatches)) {
          // 1. Daftarkan semua parameter fungsi sebagai Initial Taint Sources
          for (const param of p.node.params || []) {
            const paramIdent =
              param.type === 'TSParameterProperty'
                ? param.parameter
                : param.type === 'AssignmentPattern'
                ? param.left
                : param;

            if (paramIdent?.type === 'Identifier') {
              summary.parameters.push(paramIdent.name);
              taintTable.set(paramIdent.name, { sources: new Set([paramIdent.name]), sanitized: false });
            } else if (paramIdent?.type === 'ObjectPattern') {
              for (const prop of paramIdent.properties || []) {
                const keyName = prop.value?.name || prop.key?.name;
                if (keyName) {
                  summary.parameters.push(keyName);
                  taintTable.set(keyName, { sources: new Set([keyName]), sanitized: false });
                }
              }
            }
          }

          // Otomatis anggap `req`, `request`, `ctx`, `body`, `query`, `params` sebagai Taint Source bawaan HTTP
          for (const defaultSource of ['req', 'request', 'ctx', 'body', 'query', 'params']) {
            if (!taintTable.has(defaultSource)) {
              taintTable.set(defaultSource, { sources: new Set([defaultSource]), sanitized: false });
            }
          }

          // 2. Telusuri isi body fungsi
          p.traverse({
            VariableDeclarator(vp: any) {
              const init = vp.node.init;
              if (!init) return;

              const rhsSymbols = extractIdentifiersAndMemberPaths(init);
              const initCode = fileContent.slice(init.start, init.end);
              const isSanitizerCall = SANITIZER_PATTERNS.test(initCode);

              const registerTargetVar = (targetVarName: string, propSuffix = '') => {
                const inheritedSources = new Set<string>();
                let isSanitized = isSanitizerCall;

                for (const sym of rhsSymbols) {
                  const rootSym = sym.split('.')[0];
                  if (taintTable.has(sym) || taintTable.has(rootSym)) {
                    const entry = taintTable.get(sym) || taintTable.get(rootSym)!;
                    entry.sources.forEach(s => inheritedSources.add(propSuffix ? `${s}.${propSuffix}` : s));
                    if (entry.sanitized) isSanitized = true;
                  }
                }

                if (inheritedSources.size > 0) {
                  taintTable.set(targetVarName, { sources: inheritedSources, sanitized: isSanitized });
                }

                const primaryFrom = Array.from(inheritedSources)[0] || rhsSymbols[0] || 'input';
                summary.transitions.push({
                  fromSymbol: propSuffix ? `${primaryFrom}.${propSuffix}` : primaryFrom,
                  toSymbol: targetVarName,
                  line: vp.node.loc?.start.line || node.line_start,
                  sanitized: isSanitized,
                  mutationExpr: initCode.length < 80 ? initCode : initCode.slice(0, 77) + '...'
                });
              };

              if (vp.node.id.type === 'Identifier') {
                registerTargetVar(vp.node.id.name);
              } else if (vp.node.id.type === 'ObjectPattern') {
                for (const prop of vp.node.id.properties || []) {
                  const targetName = prop.value?.name || prop.key?.name;
                  const sourceProp = prop.key?.name;
                  if (targetName) registerTargetVar(targetName, sourceProp);
                }
              }
            },

            AssignmentExpression(ap: any) {
              if (ap.node.left.type === 'Identifier') {
                const targetName = ap.node.left.name;
                const rhsSymbols = extractIdentifiersAndMemberPaths(ap.node.right);
                const rhsCode = fileContent.slice(ap.node.right.start, ap.node.right.end);
                const isSanitized = SANITIZER_PATTERNS.test(rhsCode);

                for (const sym of rhsSymbols) {
                  const rootSym = sym.split('.')[0];
                  if (taintTable.has(sym) || taintTable.has(rootSym)) {
                    const prev = taintTable.get(sym) || taintTable.get(rootSym)!;
                    taintTable.set(targetName, {
                      sources: new Set(prev.sources),
                      sanitized: prev.sanitized || isSanitized
                    });
                    summary.transitions.push({
                      fromSymbol: sym,
                      toSymbol: targetName,
                      line: ap.node.loc?.start.line || node.line_start,
                      sanitized: prev.sanitized || isSanitized,
                      mutationExpr: rhsCode.length < 80 ? rhsCode : rhsCode.slice(0, 77) + '...'
                    });
                  }
                }
              }
            },

            CallExpression(cp: any) {
              const calleeName = self.flattenMemberExpr(cp.node.callee);
              if (!calleeName) return;

              const argBindings: CallArgumentBinding['argTaintSources'] = [];
              (cp.node.arguments || []).forEach((argNode: any, idx: number) => {
                const rawExpr = fileContent.slice(argNode.start, argNode.end);
                const usedVars = extractIdentifiersAndMemberPaths(argNode);
                const taintedDeps: string[] = [];
                let argSanitized = SANITIZER_PATTERNS.test(rawExpr);

                for (const v of usedVars) {
                  const rootV = v.split('.')[0];
                  if (taintTable.has(v) || taintTable.has(rootV)) {
                    taintedDeps.push(v);
                    if ((taintTable.get(v) || taintTable.get(rootV))?.sanitized) {
                      argSanitized = true;
                    }
                  }
                }

                argBindings.push({
                  argIndex: idx,
                  rawExpression: rawExpr.length < 60 ? rawExpr : rawExpr.slice(0, 57) + '...',
                  dependsOnVariables: taintedDeps,
                  isSanitized: argSanitized
                });
              });

              let assignedToVar: string | undefined;
              const parent = cp.parentPath?.node;
              if (parent?.type === 'VariableDeclarator' && parent.id?.type === 'Identifier') {
                assignedToVar = parent.id.name;
              } else if (cp.parentPath?.node?.type === 'AwaitExpression') {
                const grandParent = cp.parentPath.parentPath?.node;
                if (grandParent?.type === 'VariableDeclarator' && grandParent.id?.type === 'Identifier') {
                  assignedToVar = grandParent.id.name;
                }
              }

              summary.callBindings.push({
                calleeName,
                line: cp.node.loc?.start.line || node.line_start,
                argTaintSources: argBindings,
                assignedToVar
              });
            },

            ReturnStatement(rp: any) {
              if (!rp.node.argument) return;
              const retVars = extractIdentifiersAndMemberPaths(rp.node.argument);
              for (const v of retVars) {
                const rootV = v.split('.')[0];
                if (taintTable.has(v) || taintTable.has(rootV)) {
                  summary.returnDependencies.push(v);
                }
              }
            }
          });

          p.stop();
        }
      }
    });

    this.summaryCache.set(node.id, summary);
    return summary;
  }

  /**
   * Melacak propagasi data lintas fungsi (Interprocedural Slicing dari Endpoint/Source hingga Sink)
   */
  public traceInterproceduralFlow(
    entryNode: CodeNode,
    allNodes: CodeNode[],
    allEdges: CodeEdge[]
  ): DataFlowTraceResult {
    const nodeMap = new Map(allNodes.map(n => [n.id, n]));
    const steps: DataPropagationStep[] = [];
    const visited = new Set<string>();
    let sanitizedAlongPath = false;
    let hasUnprotectedSink = false;

    let startFuncNode = entryNode;
    if (entryNode.node_type === 'endpoint') {
      const routeEdge = allEdges.find(
        e => e.source_id === entryNode.id && e.relation_type === 'HANDLES_ROUTE'
      );
      if (routeEdge && nodeMap.has(routeEdge.target_id)) {
        startFuncNode = nodeMap.get(routeEdge.target_id)!;
      }
    }

    const traverseCallChain = (currentNode: CodeNode, incomingTaintedParams: string[], isAlreadySanitized: boolean) => {
      if (visited.has(currentNode.id) || steps.length >= 25) return;
      visited.add(currentNode.id);

      const summary = this.analyzeFunctionAst(currentNode);

      // Cek apakah parameter yang masuk disanitasi di dalam fungsi ini
      const sanitizedInThisFunc =
        isAlreadySanitized || summary.transitions.some(t => t.sanitized);

      if (sanitizedInThisFunc) {
        sanitizedAlongPath = true;
      }

      const outgoingCallEdges = allEdges.filter(
        e => e.source_id === currentNode.id && e.relation_type === 'CALLS'
      );

      let sinkDetected: DataPropagationStep['sinkType'] | undefined;
      let sinkTaintedUnprotected = false;

      for (const binding of summary.callBindings) {
        let matchedSink: DataPropagationStep['sinkType'] | undefined;
        if (SINK_PATTERNS.DATABASE_WRITE.test(binding.calleeName)) {
          matchedSink = 'DATABASE_WRITE';
        } else if (SINK_PATTERNS.EXTERNAL_API.test(binding.calleeName)) {
          matchedSink = 'EXTERNAL_API';
        } else if (SINK_PATTERNS.RESPONSE_OUTPUT.test(binding.calleeName)) {
          matchedSink = 'RESPONSE_OUTPUT';
        }

        if (matchedSink) {
          sinkDetected = matchedSink;
          const hasUnsanitizedTaint = binding.argTaintSources.some(
            arg => arg.dependsOnVariables.length > 0 && !arg.isSanitized && !sanitizedInThisFunc
          );
          if (hasUnsanitizedTaint && matchedSink !== 'RESPONSE_OUTPUT') {
            sinkTaintedUnprotected = true;
            hasUnprotectedSink = true;
          }
        }
      }

      const currentStepIndex = steps.length + 1;
      const stepRecord: DataPropagationStep = {
        step: currentStepIndex,
        node: currentNode,
        incomingTaintedParams:
          incomingTaintedParams.length > 0 ? incomingTaintedParams : summary.parameters,
        variableLineage: summary.transitions,
        isSink: Boolean(sinkDetected),
        sinkType: sinkDetected,
        sinkTaintedUnprotected
      };

      steps.push(stepRecord);

      for (const edge of outgoingCallEdges) {
        const targetNode = this.findTargetNode(edge.target_id, allNodes);
        if (!targetNode || visited.has(targetNode.id)) continue;

        const matchingBinding = summary.callBindings.find(
          b => b.line === edge.metadata?.line || edge.target_id.endsWith(b.calleeName.split('.').pop() || '')
        );

        const passedTaintedArgs: string[] = [];
        let callSanitized = sanitizedInThisFunc;

        if (matchingBinding) {
          for (const argInfo of matchingBinding.argTaintSources) {
            if (argInfo.dependsOnVariables.length > 0) {
              passedTaintedArgs.push(`arg[${argInfo.argIndex}]: ${argInfo.rawExpression}`);
              if (argInfo.isSanitized) callSanitized = true;
            }
          }

          if (passedTaintedArgs.length > 0 && !stepRecord.forwardedToNextCall) {
            stepRecord.forwardedToNextCall = {
              calleeName: matchingBinding.calleeName,
              passedExpressions: passedTaintedArgs,
              sanitized: callSanitized
            };
          }
        }

        if (callSanitized) sanitizedAlongPath = true;

        const targetSummary = this.analyzeFunctionAst(targetNode);
        const nextTaintedParams: string[] = [];

        if (matchingBinding) {
          matchingBinding.argTaintSources.forEach(argInfo => {
            if (argInfo.dependsOnVariables.length > 0) {
              const targetParamName = targetSummary.parameters[argInfo.argIndex] || `param_${argInfo.argIndex}`;
              nextTaintedParams.push(`${targetParamName} <= (${argInfo.rawExpression})`);
            }
          });
        }

        traverseCallChain(targetNode, nextTaintedParams, callSanitized);
      }
    };

    traverseCallChain(startFuncNode, ['req.body', 'req.params', 'req.query'], false);

    return {
      entry_point: entryNode,
      total_steps: steps.length,
      is_sanitized_along_path: sanitizedAlongPath,
      has_unprotected_sink: hasUnprotectedSink,
      steps
    };
  }

  private findTargetNode(targetIdOrSymbol: string, allNodes: CodeNode[]): CodeNode | undefined {
    const exact = allNodes.find(n => n.id === targetIdOrSymbol);
    if (exact) return exact;

    const shortMethod = targetIdOrSymbol.split('.').pop();
    if (!shortMethod) return undefined;

    return allNodes.find(
      n =>
        (n.node_type === 'method' || n.node_type === 'function') &&
        (n.name === targetIdOrSymbol || n.name.endsWith(`.${shortMethod}`) || n.name === shortMethod)
    );
  }

  private flattenMemberExpr(node: any): string {
    if (!node) return '';
    if (node.type === 'Identifier') return node.name;
    if (node.type === 'ThisExpression') return 'this';
    if (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') {
      const obj = this.flattenMemberExpr(node.object);
      const prop = node.property?.name || node.property?.value || '';
      return obj ? (prop ? `${obj}.${prop}` : obj) : prop;
    }
    return '';
  }
}

export class DataFlowTracer {
  private projectSlug: string;
  private db: MemoryDatabase;
  private workspacePath?: string;
  private taintTracer?: InterproceduralDataFlowTracer;

  constructor(projectSlug: string, db: MemoryDatabase, workspacePath?: string) {
    this.projectSlug = projectSlug;
    this.db = db;
    this.workspacePath = workspacePath;
    if (workspacePath) {
      this.taintTracer = new InterproceduralDataFlowTracer(workspacePath);
    }
  }

  public findEntryPoints(query?: string): CodeNode[] {
    if (!query) {
      return this.db.getEndpoints(this.projectSlug);
    }

    const endpoints = this.db.findNodes(this.projectSlug, { node_type: 'endpoint', name: query });
    if (endpoints.length > 0) return endpoints;

    return this.db.findNodes(this.projectSlug, { name: query });
  }

  public trace(entryNode: CodeNode, maxDepth: number = 6): DataFlowTrace {
    const steps: DataFlowStep[] = [];
    const visited = new Set<string>();

    steps.push({
      step: 1,
      node: entryNode,
      relation: 'HANDLES_ROUTE',
      details: `Entry point [${entryNode.node_type}]: ${entryNode.name}`
    });
    visited.add(entryNode.id);

    let currentStepNum = 2;

    const traverse = (currentNode: CodeNode, currentDepth: number) => {
      if (currentDepth >= maxDepth) return;

      const outgoing = this.db.getOutgoingEdges(this.projectSlug, currentNode.id);

      for (const item of outgoing) {
        const edge = item.edge;
        let targetNode = item.targetNode;

        if (!targetNode && edge.target_id) {
          const rawTarget = edge.target_id;
          const parts = rawTarget.split('.');
          const simpleName = parts.pop() || rawTarget;
          const prefix = parts.length > 0 ? parts[0].toLowerCase() : '';

          const candidates = this.db.findNodes(this.projectSlug, { name: simpleName });
          if (candidates.length > 0) {
            if (prefix) {
              const matched = candidates.find(c =>
                c.file_path.toLowerCase().includes(prefix) ||
                c.name.toLowerCase().includes(prefix)
              );
              targetNode = matched || candidates[0];
            } else {
              targetNode = candidates[0];
            }
          }
        }

        if (targetNode && !visited.has(targetNode.id)) {
          visited.add(targetNode.id);

          steps.push({
            step: currentStepNum++,
            node: targetNode,
            relation: edge.relation_type,
            details: `${currentNode.name} -> [${edge.relation_type}] -> ${targetNode.name}`
          });

          traverse(targetNode, currentDepth + 1);
        }
      }
    };

    traverse(entryNode, 1);

    let propagation: DataFlowTraceResult | undefined;
    if (this.taintTracer) {
      const allNodes = this.db.findNodes(this.projectSlug);
      const allEdges = this.db.getAllEdges(this.projectSlug);
      try {
        propagation = this.taintTracer.traceInterproceduralFlow(entryNode, allNodes, allEdges);
        const propStepMap = new Map(propagation.steps.map(s => [s.node.id, s]));
        for (const step of steps) {
          if (propStepMap.has(step.node.id)) {
            step.propagation = propStepMap.get(step.node.id);
          }
        }
      } catch (err) {
        console.error('Taint tracing error:', err);
      }
    }

    const mermaid = this.generateMermaidDiagram(entryNode, steps);

    return {
      entry_point: entryNode,
      steps,
      total_steps: steps.length,
      mermaid_diagram: mermaid,
      propagation
    };
  }

  public generateMermaidDiagram(entryPoint: CodeNode, steps: DataFlowStep[]): string {
    const lines: string[] = [];
    lines.push('```mermaid');
    lines.push('sequenceDiagram');
    lines.push('  autonumber');

    const sanitizeId = (str: string) => str.replace(/[^a-zA-Z0-9_]/g, '_');

    lines.push(`  actor Client`);
    lines.push(`  participant EP as ${entryPoint.name}`);

    for (let i = 1; i < steps.length; i++) {
      const step = steps[i];
      const partId = `P_${i}_${sanitizeId(step.node.name)}`;
      lines.push(`  participant ${partId} as ${step.node.name}`);
    }

    lines.push(`  Client->>EP: Trigger`);

    let prevPart = 'EP';
    for (let i = 1; i < steps.length; i++) {
      const step = steps[i];
      const partId = `P_${i}_${sanitizeId(step.node.name)}`;
      const passedArgs = step.propagation?.forwardedToNextCall?.passedExpressions?.join(', ');
      const label = passedArgs ? `${step.relation} (${passedArgs})` : step.relation;

      lines.push(`  ${prevPart}->>${partId}: ${label}`);
      if (step.propagation?.isSink) {
        const sinkStatus = step.propagation.sinkTaintedUnprotected ? '⚠️ UNSANITIZED SINK' : '✅ SINK';
        lines.push(`  Note over ${partId}: ${sinkStatus}: ${step.propagation.sinkType}`);
      }
      prevPart = partId;
    }

    lines.push('```');
    return lines.join('\n');
  }
}