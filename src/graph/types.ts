/**
 * Types for the project-wide call graph
 */

import type { ParamInfo } from '../extractors/types.js';

export interface GraphNode {
  id: string; // "src/api/analyze/route.ts:POST"
  name: string;
  kind: 'function' | 'class' | 'const' | 'method' | 'component';
  filePath: string;
  entryType?: EntryType;
  isAsync: boolean;
  hash: string;
  lineRange: [number, number];
  metadata?: EntryPointMetadata;
  description?: string;
  structuredParams?: ParamInfo[];
  returnType?: string;
  isExported?: boolean;
  examples?: string[];
  deprecated?: string | boolean;
  throws?: string[];
  see?: string[];
  hasJsDoc?: boolean;
  isTrivial?: boolean;
}

export type EntryType =
  | 'api-route'
  | 'page'
  | 'inngest-function'
  | 'trigger-task'
  | 'middleware'
  | 'server-action';

export interface EntryPointMetadata {
  httpMethod?: string;
  route?: string;
  eventTrigger?: string;
  taskId?: string;
}

export type EdgeType =
  | 'direct-call'
  | 'async-dispatch'
  | 'event-emit'
  | 'http-request'
  | 'conditional-call'
  | 'error-handler'
  | 'middleware-chain';

export interface ConditionInfo {
  condition: string; // "if (req.type === 'image')" or "else if (req.size > 1000)"
  branch: string; // "then" | "else" | "else-if" | "case image" | "default" | "&&" | "||"
  branchGroup: string; // "branch:3" — line number of if/switch, links alternatives
}

export interface GraphEdge {
  id: string;
  source: string; // node id
  target: string; // node id
  type: EdgeType;
  label?: string;
  conditions?: ConditionInfo[]; // chain of ancestor conditions (nested if/else)
  isAsync: boolean;
  order?: number; // call order within source function
}

export interface FlowGraph {
  version: string;
  generatedAt: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}
