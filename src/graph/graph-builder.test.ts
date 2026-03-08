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

    it('should upgrade to direct-call when same target is called conditionally and unconditionally', () => {
      const mainFile = join(TEST_DIR, 'main.ts');
      writeFileSync(
        mainFile,
        `export function save() { return true }
export function handle(req: any) {
  if (req.valid) {
    save()
  }
  save()
}`,
      );

      const graph = builder.build([mainFile]);
      const handleNode = graph.nodes.find((n) => n.name === 'handle');
      const saveNode = graph.nodes.find((n) => n.name === 'save');

      const edges = graph.edges.filter(
        (e) => e.source === handleNode?.id && e.target === saveNode?.id,
      );

      expect(edges).toHaveLength(1);
      expect(edges[0].type).toBe('direct-call');
      expect(edges[0].conditions).toBeUndefined();
    });

    it('should preserve separate conditional edges when same target is called under two different conditions', () => {
      const mainFile = join(TEST_DIR, 'main.ts');
      writeFileSync(
        mainFile,
        `export function save() { return true }
export function handle(req: any) {
  if (req.type === 'image') {
    save()
  }
  if (req.type === 'doc') {
    save()
  }
}`,
      );

      const graph = builder.build([mainFile]);
      const handleNode = graph.nodes.find((n) => n.name === 'handle');
      const saveNode = graph.nodes.find((n) => n.name === 'save');

      const edges = graph.edges.filter(
        (e) => e.source === handleNode?.id && e.target === saveNode?.id,
      );

      expect(edges).toHaveLength(2);
      for (const edge of edges) {
        expect(edge.type).toBe('conditional-call');
        expect(edge.conditions).toHaveLength(1);
      }
      expect(edges.map((edge) => edge.id)).toEqual(
        expect.arrayContaining([
          `${handleNode?.id}->${saveNode?.id}`,
          `${handleNode?.id}->${saveNode?.id}::1`,
        ]),
      );
    });

    it('should preserve separate conditional edges across three or more different conditions', () => {
      const mainFile = join(TEST_DIR, 'main.ts');
      writeFileSync(
        mainFile,
        `export function save() { return true }
export function handle(req: any) {
  if (req.type === 'image') {
    save()
  }
  if (req.type === 'doc') {
    save()
  }
  if (req.type === 'video') {
    save()
  }
}`,
      );

      const graph = builder.build([mainFile]);
      const handleNode = graph.nodes.find((n) => n.name === 'handle');
      const saveNode = graph.nodes.find((n) => n.name === 'save');

      const edges = graph.edges.filter(
        (e) => e.source === handleNode?.id && e.target === saveNode?.id,
      );

      expect(edges).toHaveLength(3);
      for (const edge of edges) {
        expect(edge.type).toBe('conditional-call');
        expect(edge.conditions).toHaveLength(1);
      }
      expect(edges.map((edge) => edge.id)).toEqual(
        expect.arrayContaining([
          `${handleNode?.id}->${saveNode?.id}`,
          `${handleNode?.id}->${saveNode?.id}::1`,
          `${handleNode?.id}->${saveNode?.id}::2`,
        ]),
      );
    });

    it('should preserve separate conditional edges for repeated JSX targets in different guards', () => {
      const mainFile = join(TEST_DIR, 'main.tsx');
      writeFileSync(
        mainFile,
        `export function Guides() { return <div /> }
export function TreeDir({
  depth,
  isCollapsed,
  items,
}: {
  depth: number;
  isCollapsed: boolean;
  items: Array<{ type: 'dir' | 'sym'; items?: unknown[] }>;
}) {
  return (
    <div>
      {depth > 0 && <Guides />}
      {!isCollapsed && (
        <div>
          {items.map((item, index) => {
            if (item.type === 'dir') {
              return (
                <TreeDir
                  key={index}
                  depth={depth + 1}
                  isCollapsed={isCollapsed}
                  items={item.items ?? []}
                />
              )
            }
            return <Guides key={index} />
          })}
        </div>
      )}
    </div>
  )
}`,
      );

      const graph = builder.build([mainFile]);
      const treeDirNode = graph.nodes.find((n) => n.name === 'TreeDir');
      const guidesNode = graph.nodes.find((n) => n.name === 'Guides');

      const edges = graph.edges.filter(
        (e) => e.source === treeDirNode?.id && e.target === guidesNode?.id,
      );

      expect(edges).toHaveLength(2);
      expect(edges.every((edge) => edge.type === 'conditional-call')).toBe(true);
      expect(edges.map((edge) => edge.conditions?.map((condition) => condition.condition))).toEqual(
        expect.arrayContaining([
          ['depth > 0 &&'],
          ['!isCollapsed &&', "else (item.type === 'dir')"],
        ]),
      );
    });

    it('should preserve accumulated implicit else conditions after stacked early returns', () => {
      const mainFile = join(TEST_DIR, 'main.ts');
      writeFileSync(
        mainFile,
        `export function reject() { return false }
export function serveFromCache() { return true }
export function fulfill() { return true }
export function handle(req: any) {
  if (req.invalid) {
    return reject()
  }
  if (req.cached) {
    return serveFromCache()
  }
  fulfill()
}`,
      );

      const graph = builder.build([mainFile]);
      const handleNode = graph.nodes.find((n) => n.name === 'handle');
      const fulfillNode = graph.nodes.find((n) => n.name === 'fulfill');
      const edge = graph.edges.find(
        (e) => e.source === handleNode?.id && e.target === fulfillNode?.id,
      );

      expect(edge?.type).toBe('conditional-call');
      expect(edge?.conditions?.map((condition) => condition.condition)).toEqual([
        'else (req.invalid)',
        'else (req.cached)',
      ]);
    });

    it('should preserve accumulated implicit else conditions after an else-if return chain', () => {
      const mainFile = join(TEST_DIR, 'main.ts');
      writeFileSync(
        mainFile,
        `export function handleGet() { return true }
export function handlePost() { return true }
export function handleOther() { return true }
export function route(req: any) {
  if (req.method === 'GET') {
    return handleGet()
  } else if (req.method === 'POST') {
    return handlePost()
  }
  handleOther()
}`,
      );

      const graph = builder.build([mainFile]);
      const routeNode = graph.nodes.find((n) => n.name === 'route');
      const otherNode = graph.nodes.find((n) => n.name === 'handleOther');
      const edge = graph.edges.find((e) => e.source === routeNode?.id && e.target === otherNode?.id);

      expect(edge?.type).toBe('conditional-call');
      expect(edge?.conditions?.map((condition) => condition.condition)).toEqual([
        "else (req.method === 'GET')",
        "else (req.method === 'POST')",
      ]);
    });
  });

  describe('trigger task dispatch edges', () => {
    it('should create async-dispatch edge from tasks.trigger() to task definition', () => {
      const taskFile = join(TEST_DIR, 'my-task.ts');
      writeFileSync(
        taskFile,
        `import { task } from "@trigger.dev/sdk/v3"
export const myTask = task({
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
        `import { task } from "@trigger.dev/sdk/v3"
export const analyzeTask = task({
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

    it('should create async-dispatch edge from instance trigger (myTask.trigger())', () => {
      const taskFile = join(TEST_DIR, 'process.ts');
      writeFileSync(
        taskFile,
        `import { task } from "@trigger.dev/sdk/v3"
export const processData = task({
  id: "process-data",
  run: async (payload) => { return { done: true } }
})`,
      );

      const callerFile = join(TEST_DIR, 'handler.ts');
      writeFileSync(
        callerFile,
        `export async function handleWebhook(req) {
  await processData.trigger({ userId: req.userId })
}`,
      );

      const graph = builder.build([taskFile, callerFile]);

      const taskNode = graph.nodes.find((n) => n.name === 'processData');
      const callerNode = graph.nodes.find((n) => n.name === 'handleWebhook');
      expect(taskNode).toBeDefined();
      expect(callerNode).toBeDefined();

      const edge = graph.edges.find(
        (e) => e.source === callerNode?.id && e.target === taskNode?.id,
      );
      expect(edge).toBeDefined();
      expect(edge?.type).toBe('async-dispatch');
    });

    it('should create async-dispatch edge from instance triggerAndWait', () => {
      const taskFile = join(TEST_DIR, 'child.ts');
      writeFileSync(
        taskFile,
        `import { task } from "@trigger.dev/sdk/v3"
export const childTask = task({
  id: "child-task",
  run: async (payload) => { return { result: 42 } }
})`,
      );

      const parentFile = join(TEST_DIR, 'parent.ts');
      writeFileSync(
        parentFile,
        `export async function parentRun() {
  const result = await childTask.triggerAndWait({ data: 1 })
  return result
}`,
      );

      const graph = builder.build([taskFile, parentFile]);

      const taskNode = graph.nodes.find((n) => n.name === 'childTask');
      const parentNode = graph.nodes.find((n) => n.name === 'parentRun');

      const edge = graph.edges.find(
        (e) => e.source === parentNode?.id && e.target === taskNode?.id,
      );
      expect(edge).toBeDefined();
      expect(edge?.type).toBe('async-dispatch');
    });

    it('should detect schemaTask() as a trigger-task entry point', () => {
      const taskFile = join(TEST_DIR, 'schema-task.ts');
      writeFileSync(
        taskFile,
        `import { schemaTask } from "@trigger.dev/sdk/v3"
export const createUser = schemaTask({
  id: "create-user",
  schema: z.object({ name: z.string() }),
  run: async (payload) => { return { ok: true } }
})`,
      );

      const graph = builder.build([taskFile]);

      const taskNode = graph.nodes.find((n) => n.name === 'createUser');
      expect(taskNode).toBeDefined();
      expect(taskNode?.entryType).toBe('trigger-task');
      expect(taskNode?.metadata?.taskId).toBe('create-user');
    });

    it('should detect schedules.task() as a trigger-scheduled-task entry point', () => {
      const taskFile = join(TEST_DIR, 'scheduled.ts');
      writeFileSync(
        taskFile,
        `export const dailyCleanup = schedules.task({
  id: "daily-cleanup",
  cron: "0 0 * * *",
  run: async () => {}
})`,
      );

      const graph = builder.build([taskFile]);

      const taskNode = graph.nodes.find((n) => n.name === 'dailyCleanup');
      expect(taskNode).toBeDefined();
      expect(taskNode?.entryType).toBe('trigger-scheduled-task');
      expect(taskNode?.metadata?.taskId).toBe('daily-cleanup');
      expect(taskNode?.metadata?.cronSchedule).toBe('0 0 * * *');
    });

    it('should resolve instance trigger to a scheduled task', () => {
      const taskFile = join(TEST_DIR, 'sync-task.ts');
      writeFileSync(
        taskFile,
        `export const syncTask = schedules.task({
  id: "user-sync",
  run: async (payload) => {}
})`,
      );

      const callerFile = join(TEST_DIR, 'admin.ts');
      writeFileSync(
        callerFile,
        `export async function forceSync() {
  await syncTask.trigger({ force: true })
}`,
      );

      const graph = builder.build([taskFile, callerFile]);

      const taskNode = graph.nodes.find((n) => n.name === 'syncTask');
      const callerNode = graph.nodes.find((n) => n.name === 'forceSync');

      const edge = graph.edges.find(
        (e) => e.source === callerNode?.id && e.target === taskNode?.id,
      );
      expect(edge).toBeDefined();
      expect(edge?.type).toBe('async-dispatch');
    });

    it('should not detect inngest matcher code as an inngest entry point', () => {
      // Regression: the inngest matcher previously matched itself because its
      // JSDoc/body text contained "inngest.createFunction(...)". With structured
      // initializerCall + import verification, this should no longer happen.
      const matcherFile = join(TEST_DIR, 'inngest-matcher.ts');
      writeFileSync(
        matcherFile,
        `import type { SymbolInfo } from '../extractors/types.js'

/**
 * Inngest framework matcher
 * Detects inngest.createFunction() calls as entry points.
 */
export const inngestMatcher = {
  name: 'inngest',
  detectEntryPoint(symbol: SymbolInfo) {
    if (symbol.kind === 'const' && /\\w\\.createFunction\\s*\\(/.test(symbol.body)) {
      return { entryType: 'inngest-function' }
    }
    return null
  },
}`,
      );

      const graph = builder.build([matcherFile]);

      const matcherNode = graph.nodes.find((n) => n.name === 'inngestMatcher');
      expect(matcherNode).toBeDefined();
      expect(matcherNode?.entryType).toBeUndefined();
    });

    it('should not create false-positive edges for non-task objects with .trigger()', () => {
      const taskFile = join(TEST_DIR, 'real-task.ts');
      writeFileSync(
        taskFile,
        `import { task } from "@trigger.dev/sdk/v3"
export const realTask = task({
  id: "real-task",
  run: async () => {}
})`,
      );

      const callerFile = join(TEST_DIR, 'ui.ts');
      writeFileSync(
        callerFile,
        `export function handleClick() {
  eventEmitter.trigger("click")
}`,
      );

      const graph = builder.build([taskFile, callerFile]);

      const callerNode = graph.nodes.find((n) => n.name === 'handleClick');
      // eventEmitter doesn't match any task node, so no edge should be created
      const edges = graph.edges.filter((e) => e.source === callerNode?.id);
      expect(edges).toHaveLength(0);
    });
  });

  describe('Next.js runtime connection edges', () => {
    it('should create http-request edge from fetch with explicit method to matching handler', () => {
      const apiDir = join(TEST_DIR, 'app', 'api', 'analyze');
      mkdirSync(apiDir, { recursive: true });

      const routeFile = join(apiDir, 'route.ts');
      writeFileSync(
        routeFile,
        `export async function POST(req: Request) {
  return Response.json({ ok: true })
}`,
      );

      const callerFile = join(TEST_DIR, 'caller.ts');
      writeFileSync(
        callerFile,
        `export async function submitAnalysis() {
  const res = await fetch("/api/analyze", { method: "POST", body: "{}" })
  return res.json()
}`,
      );

      const graph = builder.build([routeFile, callerFile]);

      const routeNode = graph.nodes.find((n) => n.name === 'POST');
      const callerNode = graph.nodes.find((n) => n.name === 'submitAnalysis');
      expect(routeNode).toBeDefined();
      expect(callerNode).toBeDefined();

      const edge = graph.edges.find(
        (e) => e.source === callerNode?.id && e.target === routeNode?.id,
      );
      expect(edge).toBeDefined();
      expect(edge?.type).toBe('http-request');
      expect(edge?.label).toBe('/api/analyze');
    });

    it('should default bare fetch() to GET', () => {
      const apiDir = join(TEST_DIR, 'app', 'api', 'status');
      mkdirSync(apiDir, { recursive: true });

      const routeFile = join(apiDir, 'route.ts');
      writeFileSync(
        routeFile,
        `export async function GET(req: Request) {
  return Response.json({ status: "ok" })
}`,
      );

      const callerFile = join(TEST_DIR, 'health.ts');
      writeFileSync(
        callerFile,
        `export async function checkStatus() {
  const res = await fetch("/api/status")
  return res.json()
}`,
      );

      const graph = builder.build([routeFile, callerFile]);

      const routeNode = graph.nodes.find((n) => n.name === 'GET');
      const callerNode = graph.nodes.find((n) => n.name === 'checkStatus');
      expect(routeNode).toBeDefined();
      expect(callerNode).toBeDefined();

      const edge = graph.edges.find(
        (e) => e.source === callerNode?.id && e.target === routeNode?.id,
      );
      expect(edge).toBeDefined();
      expect(edge?.type).toBe('http-request');
    });

    it('should create http-request edge from router.push() to page', () => {
      const pageDir = join(TEST_DIR, 'app', 'dashboard');
      mkdirSync(pageDir, { recursive: true });

      const pageFile = join(pageDir, 'page.tsx');
      writeFileSync(
        pageFile,
        `export default function DashboardPage() {
  return '<div>Dashboard</div>'
}`,
      );

      const callerFile = join(TEST_DIR, 'nav.ts');
      writeFileSync(
        callerFile,
        `export function goToDashboard() {
  router.push("/dashboard")
}`,
      );

      const graph = builder.build([pageFile, callerFile]);

      // The extractor uses the actual function name for named default exports
      const pageNode = graph.nodes.find((n) => n.name === 'DashboardPage');
      const callerNode = graph.nodes.find((n) => n.name === 'goToDashboard');
      expect(pageNode).toBeDefined();
      expect(pageNode?.entryType).toBe('page');
      expect(pageNode?.metadata?.route).toBe('/dashboard');
      expect(callerNode).toBeDefined();

      const edge = graph.edges.find(
        (e) => e.source === callerNode?.id && e.target === pageNode?.id,
      );
      expect(edge).toBeDefined();
      expect(edge?.type).toBe('http-request');
      expect(edge?.label).toBe('/dashboard');
    });

    it('should not create edge for fetch to nonexistent API route', () => {
      const callerFile = join(TEST_DIR, 'caller.ts');
      writeFileSync(
        callerFile,
        `export async function callApi() {
  const res = await fetch("/api/nonexistent")
  return res.json()
}`,
      );

      const graph = builder.build([callerFile]);

      const callerNode = graph.nodes.find((n) => n.name === 'callApi');
      const edges = graph.edges.filter((e) => e.source === callerNode?.id);
      expect(edges).toHaveLength(0);
    });

    it('should not create edge when fetch method does not match any handler', () => {
      const apiDir = join(TEST_DIR, 'app', 'api', 'items');
      mkdirSync(apiDir, { recursive: true });

      const routeFile = join(apiDir, 'route.ts');
      writeFileSync(
        routeFile,
        `export async function POST(req: Request) {
  return Response.json({ created: true })
}`,
      );

      // Bare fetch is GET, but route only has POST
      const callerFile = join(TEST_DIR, 'list.ts');
      writeFileSync(
        callerFile,
        `export async function listItems() {
  const res = await fetch("/api/items")
  return res.json()
}`,
      );

      const graph = builder.build([routeFile, callerFile]);

      const callerNode = graph.nodes.find((n) => n.name === 'listItems');
      const edges = graph.edges.filter((e) => e.source === callerNode?.id);
      expect(edges).toHaveLength(0);
    });

    it('should not bleed method from one fetch into another', () => {
      const dataDir = join(TEST_DIR, 'app', 'api', 'data');
      const updateDir = join(TEST_DIR, 'app', 'api', 'update');
      mkdirSync(dataDir, { recursive: true });
      mkdirSync(updateDir, { recursive: true });

      const dataRoute = join(dataDir, 'route.ts');
      writeFileSync(
        dataRoute,
        `export async function GET(req: Request) {
  return Response.json({ items: [] })
}`,
      );

      const updateRoute = join(updateDir, 'route.ts');
      writeFileSync(
        updateRoute,
        `export async function PUT(req: Request) {
  return Response.json({ updated: true })
}`,
      );

      // Two fetches in the same function — the PUT method must not bleed into the first
      const callerFile = join(TEST_DIR, 'actions.ts');
      writeFileSync(
        callerFile,
        `export async function refreshAndUpdate() {
  const data = await fetch("/api/data")
  await fetch("/api/update", { method: "PUT", body: "{}" })
  return data.json()
}`,
      );

      const graph = builder.build([dataRoute, updateRoute, callerFile]);

      const callerNode = graph.nodes.find((n) => n.name === 'refreshAndUpdate');
      const getNode = graph.nodes.find((n) => n.name === 'GET');
      const putNode = graph.nodes.find((n) => n.name === 'PUT');
      expect(callerNode).toBeDefined();

      // First fetch (bare) → GET handler
      const getEdge = graph.edges.find(
        (e) => e.source === callerNode?.id && e.target === getNode?.id,
      );
      expect(getEdge).toBeDefined();
      expect(getEdge?.type).toBe('http-request');

      // Second fetch (PUT) → PUT handler
      const putEdge = graph.edges.find(
        (e) => e.source === callerNode?.id && e.target === putNode?.id,
      );
      expect(putEdge).toBeDefined();
      expect(putEdge?.type).toBe('http-request');
    });

    it('should handle router.replace() the same as router.push()', () => {
      const pageDir = join(TEST_DIR, 'app', 'settings');
      mkdirSync(pageDir, { recursive: true });

      const pageFile = join(pageDir, 'page.tsx');
      writeFileSync(
        pageFile,
        `export default function SettingsPage() {
  return '<div>Settings</div>'
}`,
      );

      const callerFile = join(TEST_DIR, 'redirect.ts');
      writeFileSync(
        callerFile,
        `export function redirectToSettings() {
  router.replace("/settings")
}`,
      );

      const graph = builder.build([pageFile, callerFile]);

      const pageNode = graph.nodes.find((n) => n.name === 'SettingsPage');
      const callerNode = graph.nodes.find((n) => n.name === 'redirectToSettings');
      expect(pageNode).toBeDefined();
      expect(callerNode).toBeDefined();

      const edge = graph.edges.find(
        (e) => e.source === callerNode?.id && e.target === pageNode?.id,
      );
      expect(edge).toBeDefined();
      expect(edge?.type).toBe('http-request');
    });

    it('should detect server actions via "use server" directive without file I/O in matcher', () => {
      const actionsFile = join(TEST_DIR, 'actions.ts');
      writeFileSync(
        actionsFile,
        `"use server"
export async function createItem(name: string) {
  return { name }
}
export async function deleteItem(id: string) {
  return id
}`,
      );

      const graph = builder.build([actionsFile]);

      const createNode = graph.nodes.find((n) => n.name === 'createItem');
      const deleteNode = graph.nodes.find((n) => n.name === 'deleteItem');
      expect(createNode?.entryType).toBe('server-action');
      expect(deleteNode?.entryType).toBe('server-action');
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
