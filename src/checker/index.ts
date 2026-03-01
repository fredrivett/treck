/**
 * Staleness checker - detects when graph.json is out of sync with source code
 */

import { existsSync } from 'node:fs';
import { resolveSourcePath } from '../cli/utils/paths.js';
import { TypeScriptExtractor } from '../extractors/typescript/index.js';
import { GraphStore } from '../graph/graph-store.js';
import { ContentHasher } from '../hasher/index.js';
import type { CheckResult } from './types.js';

/** Detects when graph.json is out of sync with source code by comparing content hashes. */
export class StaleChecker {
  private extractor: TypeScriptExtractor;
  private hasher: ContentHasher;

  /** Initialize the checker with an extractor and hasher. */
  constructor() {
    this.extractor = new TypeScriptExtractor();
    this.hasher = new ContentHasher();
  }

  /**
   * Check all nodes in graph.json for staleness.
   *
   * Reads graph.json from the output directory, then for each node compares
   * the stored hash against a freshly computed hash from source.
   *
   * @param outputDir - Path to the treck output directory (e.g. `_treck`)
   */
  checkGraph(outputDir: string): CheckResult {
    const result: CheckResult = {
      totalDocs: 0,
      staleDocs: [],
      upToDate: [],
      errors: [],
    };

    const store = new GraphStore(outputDir);
    const graph = store.read();

    if (!graph) {
      result.errors.push(`Graph not found in ${outputDir}. Run: treck sync`);
      return result;
    }

    result.totalDocs = graph.nodes.length;

    for (const node of graph.nodes) {
      try {
        const sourcePath = resolveSourcePath(node.filePath);

        if (!existsSync(sourcePath)) {
          result.staleDocs.push({
            nodeId: node.id,
            reason: `${node.filePath} not found`,
            staleDependencies: [
              {
                path: node.filePath,
                symbol: node.name,
                oldHash: node.hash,
                newHash: '',
                reason: 'file-not-found',
              },
            ],
          });
          continue;
        }

        const currentSymbol = this.extractor.extractSymbol(sourcePath, node.name);

        if (!currentSymbol) {
          result.staleDocs.push({
            nodeId: node.id,
            reason: `${node.filePath}:${node.name} not found`,
            staleDependencies: [
              {
                path: node.filePath,
                symbol: node.name,
                oldHash: node.hash,
                newHash: '',
                reason: 'not-found',
              },
            ],
          });
          continue;
        }

        const currentHash = this.hasher.hashSymbol(currentSymbol);

        if (currentHash !== node.hash) {
          result.staleDocs.push({
            nodeId: node.id,
            reason: `${node.filePath}:${node.name} changed`,
            staleDependencies: [
              {
                path: node.filePath,
                symbol: node.name,
                oldHash: node.hash,
                newHash: currentHash,
                reason: 'changed',
              },
            ],
          });
        } else {
          result.upToDate.push(node.id);
        }
      } catch (error) {
        result.errors.push(
          `Error checking ${node.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return result;
  }
}

export * from './types.js';
