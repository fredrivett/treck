/**
 * Types for symbol extraction
 */

import type { ConditionInfo } from '../graph/types.js';

export interface ParamInfo {
  name: string;
  type: string;
  isOptional: boolean;
  isRest: boolean;
  defaultValue?: string;
  description?: string;
}

export interface JsDocParamTag {
  name: string;
  description: string;
}

export interface JsDocInfo {
  description?: string;
  params: JsDocParamTag[];
  returns?: string;
  examples: string[];
  deprecated?: string | true;
  throws: string[];
  see: string[];
}

/** Structured info about the call expression used to initialize a const symbol. */
export interface InitializerCallInfo {
  /** The function/method name (e.g. "task", "createFunction"). */
  functionName: string;
  /** The full callee expression (e.g. "inngest.createFunction", "schedules.task", "task"). */
  expression: string;
}

export interface SymbolInfo {
  name: string;
  kind: 'function' | 'class' | 'const' | 'method' | 'component';
  filePath: string;
  params: string;
  body: string;
  fullText: string;
  startLine: number;
  endLine: number;
  structuredParams?: ParamInfo[];
  returnType?: string;
  isExported?: boolean;
  jsDoc?: JsDocInfo;
  /** Structured info about the initializer call for const symbols (e.g. `task(...)`, `inngest.createFunction(...)`). */
  initializerCall?: InitializerCallInfo;
  /** File-level directives like `"use server"` or `"use client"`. */
  directives?: string[];
}

export interface CallSite {
  name: string;
  expression: string;
  conditions?: ConditionInfo[]; // chain of ancestor conditions (nested if/else)
}

export interface ImportInfo {
  name: string;
  originalName: string; // original export name (differs from name when renamed: import { foo as bar })
  source: string;
  isDefault: boolean;
}

export interface ReExportInfo {
  localName: string; // exported name (e.g. "useSearch")
  originalName: string; // original name in source file (differs when renamed: export { foo as bar })
  source: string; // module specifier (e.g. "./use-search")
}

export interface ExtractionResult {
  symbols: SymbolInfo[];
  errors: string[];
}
