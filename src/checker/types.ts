/**
 * Types for the staleness checker.
 */

/** A source-code dependency tracked for a documented symbol. */
export interface DocDependency {
  path: string;
  symbol: string;
  hash: string;
  /** Git commit hash when this dependency was last valid. */
  asOf?: string;
}

/** Frontmatter metadata stored alongside a generated doc file. */
export interface DocMetadata {
  title: string;
  treckVersion?: string;
  generated: string;
  dependencies: DocDependency[];
  kind?: string;
  exported?: boolean;
  isAsync?: boolean;
  hasJsDoc?: boolean;
  isTrivial?: boolean;
  deprecated?: string | boolean;
  filePath?: string;
  lineRange?: string;
  entryType?: string;
  httpMethod?: string;
  route?: string;
  eventTrigger?: string;
  taskId?: string;
}

/** A graph node whose source code has changed since the last sync. */
export interface StaleDoc {
  nodeId: string;
  reason: string;
  staleDependencies: StaleDependency[];
}

/** A single dependency that is out of date within a stale doc. */
export interface StaleDependency {
  path: string;
  symbol: string;
  oldHash: string;
  newHash: string;
  reason: 'changed' | 'not-found' | 'file-not-found';
}

/** Aggregate result of checking all graph nodes for staleness. */
export interface CheckResult {
  totalDocs: number;
  staleDocs: StaleDoc[];
  upToDate: string[];
  errors: string[];
}
