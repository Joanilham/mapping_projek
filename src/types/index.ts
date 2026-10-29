export interface ProjectMeta {
  project_slug: string;
  name: string;
  root_path: string;
  system_overview: string;
  rules_and_conventions: string;
  last_active_task: string;
  last_commit_hash?: string;
  updated_at: string;
}

export type ModuleCategory = 'architecture' | 'database' | 'api' | 'rules' | 'service' | 'ui';

export interface ModuleMemory {
  id: string;
  project_slug: string;
  module_name: string;
  category: ModuleCategory;
  summary: string;
  key_files: string[];
  dependencies: string[];
  content_hash: string;
  updated_at: string;
}

export interface SessionCheckpoint {
  id: string;
  project_slug: string;
  task_summary: string;
  next_steps: string;
  active_files: string[];
  created_at: string;
}

export interface FileChecksum {
  file_path: string;
  hash: string;
  last_modified: number;
  updated_at: string;
}

export interface DeltaResult {
  addedFiles: string[];
  modifiedFiles: string[];
  deletedFiles: string[];
  unchangedCount: number;
  totalCount: number;
  hasChanges: boolean;
}

export interface ColdStartDigest {
  project_slug: string;
  name: string;
  system_overview: string;
  rules_and_conventions: string;
  last_checkpoint?: SessionCheckpoint;
  delta: DeltaResult;
  modules: Array<{ name: string; category: string; summary: string }>;
  days_since_last_visit: number;
  formatted_prompt: string;
}

export type NodeType = 'file' | 'class' | 'function' | 'method' | 'endpoint' | 'interface' | 'model';
export type RelationType = 'IMPORTS' | 'CALLS' | 'DEFINES' | 'EXTENDS' | 'HANDLES_ROUTE' | 'DATA_FLOWS_TO' | 'IMPLEMENTS' | 'INJECTS' | 'RESOLVES_TO';

export interface CodeNode {
  id: string;
  project_slug: string;
  file_path: string;
  node_type: NodeType;
  name: string;
  line_start: number;
  line_end: number;
  signature: string;
  metadata?: Record<string, any>;
  updated_at?: string;
}

export interface CodeEdge {
  id: string;
  project_slug: string;
  source_id: string;
  target_id: string;
  relation_type: RelationType;
  metadata?: Record<string, any>;
  updated_at?: string;
}

export interface TaintTransition {
  fromSymbol: string;
  toSymbol: string;
  line: number;
  sanitized: boolean;
  mutationExpr?: string;
}

export interface CallArgumentBinding {
  calleeName: string;
  line: number;
  argTaintSources: Array<{
    argIndex: number;
    rawExpression: string;
    dependsOnVariables: string[];
    isSanitized: boolean;
  }>;
  assignedToVar?: string;
}

export interface FunctionDataFlowSummary {
  nodeId: string;
  functionName: string;
  parameters: string[];
  transitions: TaintTransition[];
  callBindings: CallArgumentBinding[];
  returnDependencies: string[];
}

export interface DataPropagationStep {
  step: number;
  node: CodeNode;
  incomingTaintedParams: string[];
  variableLineage: TaintTransition[];
  forwardedToNextCall?: {
    calleeName: string;
    passedExpressions: string[];
    sanitized: boolean;
  };
  isSink: boolean;
  sinkType?: 'DATABASE_WRITE' | 'EXTERNAL_API' | 'RESPONSE_OUTPUT';
  sinkTaintedUnprotected?: boolean;
}

export interface DataFlowTraceResult {
  entry_point: CodeNode;
  total_steps: number;
  is_sanitized_along_path: boolean;
  has_unprotected_sink?: boolean;
  steps: DataPropagationStep[];
}

export interface DataFlowStep {
  step: number;
  node: CodeNode;
  relation: RelationType;
  details?: string;
  propagation?: DataPropagationStep;
}

export interface DataFlowTrace {
  entry_point: CodeNode;
  steps: DataFlowStep[];
  total_steps: number;
  mermaid_diagram: string;
  propagation?: DataFlowTraceResult;
}

export type DependencyEcosystem = 'npm' | 'composer' | 'pypi' | 'gomod';

export type DependencyStatus = 'UP_TO_DATE' | 'PATCH_UPDATE' | 'MINOR_UPDATE' | 'MAJOR_UPDATE' | 'SECURITY_VULNERABLE';

export interface DependencyItem {
  name: string;
  ecosystem: DependencyEcosystem;
  currentVersion: string;
  wantedVersion?: string;
  latestVersion: string;
  isDev: boolean;
  status: DependencyStatus;
  updateType: 'MAJOR' | 'MINOR' | 'PATCH' | 'NONE';
  description?: string;
  homepage?: string;
  vulnerabilities?: Array<{
    id: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    title: string;
    advisoryUrl?: string;
  }>;
  suggestedCommand: string;
}

export interface DependencyAuditResult {
  projectSlug: string;
  manifestPath: string;
  ecosystems: DependencyEcosystem[];
  score: number; // 0 - 100
  health: 'OPTIMAL' | 'WARNING' | 'CRITICAL';
  totalDependencies: number;
  upToDateCount: number;
  outdatedCount: number;
  vulnerableCount: number;
  summary: {
    major: number;
    minor: number;
    patch: number;
    vulnerable: number;
  };
  dependencies: DependencyItem[];
}

