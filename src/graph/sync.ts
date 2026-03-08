import { resolve } from 'node:path';
import type { TreckConfig } from '../cli/utils/config.js';
import { findSourceFiles } from '../cli/utils/source-files.js';
import { GraphBuilder } from './graph-builder.js';
import { entryPoints } from './graph-query.js';
import { GraphStore } from './graph-store.js';
import type { FlowGraph } from './types.js';

/** Result returned after syncing the graph. */
export interface SyncResult {
  graph: FlowGraph;
  nodeCount: number;
  edgeCount: number;
  entryPointCount: number;
}

/**
 * Build the dependency graph from source files and write it to disk.
 *
 * Finds source files matching the config scope, builds the call graph,
 * and writes graph.json to the output directory.
 *
 * @param config - Treck configuration with scope and output directory
 * @param target - Optional path to limit sync to files under this directory
 * @returns The built graph and summary stats, or null if no source files found
 */
export function syncGraph(config: TreckConfig, target?: string): SyncResult | null {
  let sourceFiles = findSourceFiles(process.cwd(), config.scope);

  if (target) {
    const targetPath = resolve(process.cwd(), target);
    sourceFiles = sourceFiles.filter((f) => f.startsWith(targetPath));

    if (sourceFiles.length === 0) {
      return null;
    }
  }

  if (sourceFiles.length === 0) {
    return null;
  }

  const builder = new GraphBuilder();
  const graph = builder.build(sourceFiles);

  const store = new GraphStore(config.outputDir);
  store.write(graph);

  return {
    graph,
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    entryPointCount: entryPoints(graph).length,
  };
}
