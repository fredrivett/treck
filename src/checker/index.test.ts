/**
 * Tests for staleness checker (graph.json-based)
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TypeScriptExtractor } from '../extractors/typescript/index.js';
import { GraphStore } from '../graph/graph-store.js';
import type { FlowGraph, GraphNode } from '../graph/types.js';
import { ContentHasher } from '../hasher/index.js';
import { StaleChecker } from './index.js';

const TEST_DIR = join(process.cwd(), '.test-checker');
const OUTPUT_DIR = join(TEST_DIR, '_treck');
const SRC_DIR = join(TEST_DIR, 'src');

function makeNode(
  overrides: Partial<GraphNode> & { id: string; name: string; filePath: string; hash: string },
): GraphNode {
  return {
    kind: 'function',
    isAsync: false,
    lineRange: [1, 5] as [number, number],
    ...overrides,
  };
}

function makeGraph(nodes: GraphNode[], edges: FlowGraph['edges'] = []): FlowGraph {
  return {
    version: '1.0',
    generatedAt: new Date().toISOString(),
    nodes,
    edges,
  };
}

describe('StaleChecker', () => {
  let checker: StaleChecker;

  beforeEach(() => {
    checker = new StaleChecker();

    // Clean up and create test directories
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
    mkdirSync(OUTPUT_DIR, { recursive: true });
    mkdirSync(SRC_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe('checkGraph', () => {
    it('should detect up-to-date node', () => {
      // Create source file
      const sourceCode = 'export function add(a: number, b: number): number {\n  return a + b\n}\n';
      const sourcePath = join(SRC_DIR, 'math.ts');
      writeFileSync(sourcePath, sourceCode);

      // Extract and hash to get correct hash
      const extractor = new TypeScriptExtractor();
      const hasher = new ContentHasher();
      const symbol = extractor.extractSymbol(sourcePath, 'add');
      if (!symbol) throw new Error('Expected symbol to be defined');
      const correctHash = hasher.hashSymbol(symbol);

      // Write graph.json with matching hash
      const graph = makeGraph([
        makeNode({ id: `${sourcePath}:add`, name: 'add', filePath: sourcePath, hash: correctHash }),
      ]);
      const store = new GraphStore(join(TEST_DIR, '_treck'));
      store.write(graph);

      const result = checker.checkGraph(join(TEST_DIR, '_treck'));
      expect(result.totalDocs).toBe(1);
      expect(result.staleDocs).toHaveLength(0);
      expect(result.upToDate).toHaveLength(1);
    });

    it('should detect stale node when code changes', () => {
      const sourcePath = join(SRC_DIR, 'math.ts');
      writeFileSync(sourcePath, 'export function add(a: number, b: number) { return a + b }');

      // Write graph with wrong hash
      const graph = makeGraph([
        makeNode({
          id: `${sourcePath}:add`,
          name: 'add',
          filePath: sourcePath,
          hash: 'old_hash_that_wont_match',
        }),
      ]);
      const store = new GraphStore(join(TEST_DIR, '_treck'));
      store.write(graph);

      const result = checker.checkGraph(join(TEST_DIR, '_treck'));
      expect(result.staleDocs).toHaveLength(1);
      expect(result.staleDocs[0].staleDependencies[0].reason).toBe('changed');
      expect(result.staleDocs[0].staleDependencies[0].oldHash).toBe('old_hash_that_wont_match');
      expect(result.staleDocs[0].staleDependencies[0].newHash).not.toBe('old_hash_that_wont_match');
    });

    it('should detect missing symbol', () => {
      const sourcePath = join(SRC_DIR, 'test.ts');
      writeFileSync(sourcePath, 'export function other() { return 1 }');

      const graph = makeGraph([
        makeNode({
          id: `${sourcePath}:doesNotExist`,
          name: 'doesNotExist',
          filePath: sourcePath,
          hash: 'abc123',
        }),
      ]);
      const store = new GraphStore(join(TEST_DIR, '_treck'));
      store.write(graph);

      const result = checker.checkGraph(join(TEST_DIR, '_treck'));
      expect(result.staleDocs).toHaveLength(1);
      expect(result.staleDocs[0].staleDependencies[0].reason).toBe('not-found');
    });

    it('should detect missing file', () => {
      const graph = makeGraph([
        makeNode({
          id: '/does/not/exist.ts:someFunc',
          name: 'someFunc',
          filePath: '/does/not/exist.ts',
          hash: 'abc123',
        }),
      ]);
      const store = new GraphStore(join(TEST_DIR, '_treck'));
      store.write(graph);

      const result = checker.checkGraph(join(TEST_DIR, '_treck'));
      expect(result.staleDocs).toHaveLength(1);
      expect(result.staleDocs[0].staleDependencies[0].reason).toBe('file-not-found');
    });

    it('should check multiple nodes', () => {
      const sourcePath = join(SRC_DIR, 'test.ts');
      writeFileSync(sourcePath, 'export function test() { return 1 }');

      const extractor = new TypeScriptExtractor();
      const hasher = new ContentHasher();
      const symbol = extractor.extractSymbol(sourcePath, 'test');
      if (!symbol) throw new Error('Expected symbol to be defined');
      const correctHash = hasher.hashSymbol(symbol);

      const graph = makeGraph([
        makeNode({
          id: `${sourcePath}:test`,
          name: 'test',
          filePath: sourcePath,
          hash: correctHash,
        }),
        makeNode({
          id: `${sourcePath}:test2`,
          name: 'test2',
          filePath: sourcePath,
          hash: 'wrong_hash',
        }),
      ]);
      const store = new GraphStore(join(TEST_DIR, '_treck'));
      store.write(graph);

      const result = checker.checkGraph(join(TEST_DIR, '_treck'));
      expect(result.totalDocs).toBe(2);
      expect(result.staleDocs).toHaveLength(1);
      expect(result.upToDate).toHaveLength(1);
    });

    it('should handle missing graph.json', () => {
      const result = checker.checkGraph(join(TEST_DIR, 'nonexistent'));
      expect(result.errors).toHaveLength(1);
      expect(result.totalDocs).toBe(0);
    });

    it('should use nodeId instead of docPath on stale results', () => {
      const sourcePath = join(SRC_DIR, 'test.ts');
      writeFileSync(sourcePath, 'export function test() { return 1 }');

      const graph = makeGraph([
        makeNode({ id: 'src/test.ts:test', name: 'test', filePath: sourcePath, hash: 'wrong' }),
      ]);
      const store = new GraphStore(join(TEST_DIR, '_treck'));
      store.write(graph);

      const result = checker.checkGraph(join(TEST_DIR, '_treck'));
      expect(result.staleDocs[0].nodeId).toBe('src/test.ts:test');
    });
  });
});
