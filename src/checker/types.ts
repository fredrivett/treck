/**
 * Types for the staleness checker.
 */

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
