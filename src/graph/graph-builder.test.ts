/**
 * Tests for GraphBuilder — edge resolution, barrel files, and conditional edges
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GraphBuilder } from './graph-builder.js';
import { nodeToMermaid } from './graph-to-mermaid.js';
import { clearTsconfigCache } from './resolve-import/index.js';

const TEST_DIR = join(process.cwd(), '.test-graph');

describe('GraphBuilder', () => {
  let builder: GraphBuilder;

  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
    clearTsconfigCache();
    builder = new GraphBuilder();
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    clearTsconfigCache();
  });

  describe('barrel file (re-export) resolution', () => {
    it('should create edges through barrel file re-exports', () => {
      // Set up: component imports from barrel, barrel re-exports from actual file
      const libDir = join(TEST_DIR, 'lib');
      mkdirSync(libDir, { recursive: true });

      // Actual defining file
      const searchFile = join(libDir, 'use-search.ts');
      writeFileSync(searchFile, `export function useSearch() { return { query: '' } }`);

      // Barrel file
      const indexFile = join(libDir, 'index.ts');
      writeFileSync(indexFile, `export { useSearch } from "./use-search"`);

      // Consumer that imports via barrel
      const componentFile = join(TEST_DIR, 'component.ts');
      writeFileSync(
        componentFile,
        `import { useSearch } from "./lib"
export function MyComponent() {
  const search = useSearch()
  return search
}`,
      );

      const graph = builder.build([searchFile, indexFile, componentFile]);

      // Should have nodes for useSearch and MyComponent
      const useSearchNode = graph.nodes.find((n) => n.name === 'useSearch');
      const componentNode = graph.nodes.find((n) => n.name === 'MyComponent');
      expect(useSearchNode).toBeDefined();
      expect(componentNode).toBeDefined();

      // Should have edge: MyComponent → useSearch
      const edge = graph.edges.find(
        (e) => e.source === componentNode?.id && e.target === useSearchNode?.id,
      );
      expect(edge).toBeDefined();
      expect(edge?.type).toBe('direct-call');
    });

    it('should handle renamed re-exports', () => {
      const libDir = join(TEST_DIR, 'lib');
      mkdirSync(libDir, { recursive: true });

      const helperFile = join(libDir, 'helper.ts');
      writeFileSync(helperFile, `export function internalHelper() { return 1 }`);

      const indexFile = join(libDir, 'index.ts');
      writeFileSync(indexFile, `export { internalHelper as helper } from "./helper"`);

      const consumerFile = join(TEST_DIR, 'consumer.ts');
      writeFileSync(
        consumerFile,
        `import { helper } from "./lib"
export function main() {
  return helper()
}`,
      );

      const graph = builder.build([helperFile, indexFile, consumerFile]);

      const helperNode = graph.nodes.find((n) => n.name === 'internalHelper');
      const mainNode = graph.nodes.find((n) => n.name === 'main');
      expect(helperNode).toBeDefined();
      expect(mainNode).toBeDefined();

      const edge = graph.edges.find(
        (e) => e.source === mainNode?.id && e.target === helperNode?.id,
      );
      expect(edge).toBeDefined();
    });

    it('should resolve direct imports without re-export following', () => {
      // Sanity check: direct imports still work
      const utilsFile = join(TEST_DIR, 'utils.ts');
      writeFileSync(utilsFile, `export function doWork() { return 1 }`);

      const mainFile = join(TEST_DIR, 'main.ts');
      writeFileSync(
        mainFile,
        `import { doWork } from "./utils"
export function run() {
  return doWork()
}`,
      );

      const graph = builder.build([utilsFile, mainFile]);

      const doWorkNode = graph.nodes.find((n) => n.name === 'doWork');
      const runNode = graph.nodes.find((n) => n.name === 'run');

      const edge = graph.edges.find((e) => e.source === runNode?.id && e.target === doWorkNode?.id);
      expect(edge).toBeDefined();
    });
  });

  describe('hasJsDoc flag', () => {
    it('should set hasJsDoc true for symbols with JSDoc', () => {
      const file = join(TEST_DIR, 'jsdoc.ts');
      writeFileSync(
        file,
        `/** Adds two numbers. */
export function add(a: number, b: number) { return a + b }`,
      );

      const graph = builder.build([file]);
      const node = graph.nodes.find((n) => n.name === 'add');
      expect(node?.hasJsDoc).toBe(true);
    });

    it('should set hasJsDoc false for symbols without JSDoc', () => {
      const file = join(TEST_DIR, 'no-jsdoc.ts');
      writeFileSync(file, `export function add(a: number, b: number) { return a + b }`);

      const graph = builder.build([file]);
      const node = graph.nodes.find((n) => n.name === 'add');
      expect(node?.hasJsDoc).toBe(false);
    });

    it('should handle mixed JSDoc presence in same file', () => {
      const file = join(TEST_DIR, 'mixed.ts');
      writeFileSync(
        file,
        `/** Documented function. */
export function documented() { return 1 }
export function undocumented() { return 2 }`,
      );

      const graph = builder.build([file]);
      const docNode = graph.nodes.find((n) => n.name === 'documented');
      const undocNode = graph.nodes.find((n) => n.name === 'undocumented');
      expect(docNode?.hasJsDoc).toBe(true);
      expect(undocNode?.hasJsDoc).toBe(false);
    });
  });

  describe('conditional call edges', () => {
    it('should create conditional-call edges for calls inside if/else', () => {
      const mainFile = join(TEST_DIR, 'main.ts');
      writeFileSync(
        mainFile,
        `export function processImage() { return 'image' }
export function processDoc() { return 'doc' }
export function handle(req: any) {
  if (req.type === 'image') {
    processImage()
  } else {
    processDoc()
  }
}`,
      );

      const graph = builder.build([mainFile]);

      const handleNode = graph.nodes.find((n) => n.name === 'handle');
      const imageNode = graph.nodes.find((n) => n.name === 'processImage');
      const docNode = graph.nodes.find((n) => n.name === 'processDoc');

      const imageEdge = graph.edges.find(
        (e) => e.source === handleNode?.id && e.target === imageNode?.id,
      );
      const docEdge = graph.edges.find(
        (e) => e.source === handleNode?.id && e.target === docNode?.id,
      );

      expect(imageEdge?.type).toBe('conditional-call');
      expect(imageEdge?.conditions).toHaveLength(1);
      expect(imageEdge?.conditions?.[0].branch).toBe('then');

      expect(docEdge?.type).toBe('conditional-call');
      expect(docEdge?.conditions?.[0].branch).toBe('else');
    });

    it('should keep direct-call for unconditional calls', () => {
      const mainFile = join(TEST_DIR, 'main.ts');
      writeFileSync(
        mainFile,
        `export function validate() { return true }
export function handle(req: any) {
  validate()
}`,
      );

      const graph = builder.build([mainFile]);
      const handleNode = graph.nodes.find((n) => n.name === 'handle');
      const validateNode = graph.nodes.find((n) => n.name === 'validate');

      const edge = graph.edges.find(
        (e) => e.source === handleNode?.id && e.target === validateNode?.id,
      );

      expect(edge?.type).toBe('direct-call');
      expect(edge?.conditions).toBeUndefined();
    });

    it('should handle mixed conditional and unconditional edges from same source', () => {
      const mainFile = join(TEST_DIR, 'main.ts');
      writeFileSync(
        mainFile,
        `export function validate() { return true }
export function processImage() { return 'image' }
export function save() { return true }
export function handle(req: any) {
  validate()
  if (req.type === 'image') {
    processImage()
  }
  save()
}`,
      );

      const graph = builder.build([mainFile]);
      const handleNode = graph.nodes.find((n) => n.name === 'handle');

      const validateEdge = graph.edges.find(
        (e) =>
          e.source === handleNode?.id &&
          e.target === graph.nodes.find((n) => n.name === 'validate')?.id,
      );
      const imageEdge = graph.edges.find(
        (e) =>
          e.source === handleNode?.id &&
          e.target === graph.nodes.find((n) => n.name === 'processImage')?.id,
      );
      const saveEdge = graph.edges.find(
        (e) =>
          e.source === handleNode?.id &&
          e.target === graph.nodes.find((n) => n.name === 'save')?.id,
      );

      expect(validateEdge?.type).toBe('direct-call');
      expect(imageEdge?.type).toBe('conditional-call');
      expect(saveEdge?.type).toBe('direct-call');
    });

    it('should include condition text in edge label', () => {
      const mainFile = join(TEST_DIR, 'main.ts');
      writeFileSync(
        mainFile,
        `export function compress() { return true }
export function handle(req: any) {
  if (req.type === 'image') {
    if (req.size > 1000) {
      compress()
    }
  }
}`,
      );

      const graph = builder.build([mainFile]);
      const handleNode = graph.nodes.find((n) => n.name === 'handle');
      const compressNode = graph.nodes.find((n) => n.name === 'compress');

      const edge = graph.edges.find(
        (e) => e.source === handleNode?.id && e.target === compressNode?.id,
      );

      expect(edge?.label).toContain('\u2192'); // → character joining nested conditions
      expect(edge?.conditions).toHaveLength(2);
    });
  });

  describe('trigger task dispatch edges', () => {
    it('should create async-dispatch edge from tasks.trigger() to task definition', () => {
      const taskFile = join(TEST_DIR, 'my-task.ts');
      writeFileSync(
        taskFile,
        `export const myTask = task({
  id: "my-task",
  run: async () => { return 1 }
})`,
      );

      const callerFile = join(TEST_DIR, 'caller.ts');
      writeFileSync(
        callerFile,
        `export async function handleRequest() {
  await tasks.trigger("my-task", { data: 1 })
}`,
      );

      const graph = builder.build([taskFile, callerFile]);

      const taskNode = graph.nodes.find((n) => n.name === 'myTask');
      const callerNode = graph.nodes.find((n) => n.name === 'handleRequest');
      expect(taskNode).toBeDefined();
      expect(callerNode).toBeDefined();

      const edge = graph.edges.find(
        (e) => e.source === callerNode?.id && e.target === taskNode?.id,
      );
      expect(edge).toBeDefined();
      expect(edge?.type).toBe('async-dispatch');
    });

    it('should handle TypeScript generics in tasks.trigger<typeof T>()', () => {
      const taskFile = join(TEST_DIR, 'analyze.ts');
      writeFileSync(
        taskFile,
        `export const analyzeTask = task({
  id: "analyze",
  run: async () => { return 1 }
})`,
      );

      const callerFile = join(TEST_DIR, 'route.ts');
      writeFileSync(
        callerFile,
        `export async function POST() {
  await tasks.trigger<typeof analyzeTask>("analyze", { id: 1 })
}`,
      );

      const graph = builder.build([taskFile, callerFile]);

      const taskNode = graph.nodes.find((n) => n.name === 'analyzeTask');
      const callerNode = graph.nodes.find((n) => n.name === 'POST');
      expect(taskNode).toBeDefined();
      expect(callerNode).toBeDefined();

      const edge = graph.edges.find(
        (e) => e.source === callerNode?.id && e.target === taskNode?.id,
      );
      expect(edge).toBeDefined();
      expect(edge?.type).toBe('async-dispatch');
    });
  });
});

describe('Mermaid conditional edges', () => {
  it('should render conditional-call edges with dashed arrows and condition labels', () => {
    const graph = {
      version: '1.0',
      generatedAt: new Date().toISOString(),
      nodes: [
        {
          id: 'main.ts:handle',
          name: 'handle',
          kind: 'function' as const,
          filePath: 'main.ts',
          isAsync: false,
          hash: 'abc',
          lineRange: [1, 10] as [number, number],
        },
        {
          id: 'main.ts:processImage',
          name: 'processImage',
          kind: 'function' as const,
          filePath: 'main.ts',
          isAsync: false,
          hash: 'def',
          lineRange: [11, 15] as [number, number],
        },
      ],
      edges: [
        {
          id: 'main.ts:handle->main.ts:processImage',
          source: 'main.ts:handle',
          target: 'main.ts:processImage',
          type: 'conditional-call' as const,
          conditions: [
            { condition: 'if (req.size > 1000)', branch: 'then', branchGroup: 'branch:3' },
          ],
          label: 'if (req.size > 1000)',
          isAsync: false,
        },
      ],
    };

    const mermaid = nodeToMermaid(graph, 'main.ts:handle');

    // Dashed arrow for conditional-call
    expect(mermaid).toContain('.->');
    // Label is pipe-delimited
    expect(mermaid).toContain('|"');
    expect(mermaid).toContain('1000');
    // > should be escaped as Mermaid HTML entity (#62;)
    expect(mermaid).not.toContain('> 1000');
    expect(mermaid).toContain('#62; 1000');
  });
});
