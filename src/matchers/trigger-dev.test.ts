import { describe, expect, it } from 'vitest';
import type { SymbolInfo } from '../extractors/types.js';
import { triggerDevMatcher } from './trigger-dev.js';

/** Helper to create a minimal SymbolInfo for testing */
function makeSymbol(overrides: Partial<SymbolInfo>): SymbolInfo {
  return {
    name: 'test',
    kind: 'function',
    filePath: 'test.ts',
    params: '',
    body: '',
    fullText: '',
    startLine: 1,
    endLine: 1,
    ...overrides,
  };
}

describe('triggerDevMatcher', () => {
  describe('detectEntryPoint', () => {
    it('should detect a task() definition', () => {
      const symbol = makeSymbol({
        kind: 'const',
        body: 'task({ id: "analyze-image", run: async () => {} })',
      });

      const result = triggerDevMatcher.detectEntryPoint(symbol, 'tasks/analyze.ts');

      expect(result).toEqual({
        entryType: 'trigger-task',
        metadata: { taskId: 'analyze-image' },
      });
    });

    it('should extract task ID with single quotes', () => {
      const symbol = makeSymbol({
        kind: 'const',
        body: "task({ id: 'my-task', run: async () => {} })",
      });

      const result = triggerDevMatcher.detectEntryPoint(symbol, 'tasks/my.ts');

      expect(result?.metadata?.taskId).toBe('my-task');
    });

    it('should return null for non-task consts', () => {
      const symbol = makeSymbol({
        kind: 'const',
        body: 'createClient({ url: "..." })',
      });

      expect(triggerDevMatcher.detectEntryPoint(symbol, 'lib/db.ts')).toBeNull();
    });

    it('should return null for functions', () => {
      const symbol = makeSymbol({
        kind: 'function',
        body: '{ task() }',
      });

      expect(triggerDevMatcher.detectEntryPoint(symbol, 'test.ts')).toBeNull();
    });
  });

  describe('detectConnections', () => {
    it('should detect tasks.trigger()', () => {
      const symbol = makeSymbol({
        body: '{ await tasks.trigger("analyze-image", { id: 1 }) }',
        startLine: 10,
        endLine: 15,
      });

      const connections = triggerDevMatcher.detectConnections(symbol, 'route.ts');

      expect(connections).toHaveLength(1);
      expect(connections[0]).toEqual({
        type: 'task-trigger',
        targetHint: 'analyze-image',
        sourceLocation: [10, 15],
      });
    });

    it('should detect tasks.triggerAndWait()', () => {
      const symbol = makeSymbol({
        body: '{ await tasks.triggerAndWait("process-pdf", { url }) }',
      });

      const connections = triggerDevMatcher.detectConnections(symbol, 'handler.ts');

      expect(connections).toHaveLength(1);
      expect(connections[0].targetHint).toBe('process-pdf');
    });

    it('should detect tasks.batchTrigger()', () => {
      const symbol = makeSymbol({
        body: '{ await tasks.batchTrigger("send-email", items) }',
      });

      const connections = triggerDevMatcher.detectConnections(symbol, 'handler.ts');

      expect(connections).toHaveLength(1);
      expect(connections[0].targetHint).toBe('send-email');
    });

    it('should handle TypeScript generics', () => {
      const symbol = makeSymbol({
        body: '{ await tasks.trigger<typeof analyzeImageTask>("analyze-image", { id: 1 }) }',
      });

      const connections = triggerDevMatcher.detectConnections(symbol, 'route.ts');

      expect(connections).toHaveLength(1);
      expect(connections[0].targetHint).toBe('analyze-image');
    });

    it('should handle generics with triggerAndWait', () => {
      const symbol = makeSymbol({
        body: '{ const result = await tasks.triggerAndWait<typeof myTask>("my-task", payload) }',
      });

      const connections = triggerDevMatcher.detectConnections(symbol, 'caller.ts');

      expect(connections).toHaveLength(1);
      expect(connections[0].targetHint).toBe('my-task');
    });

    it('should detect multiple triggers in one body', () => {
      const symbol = makeSymbol({
        body: `{
          await tasks.trigger("step-one", { id })
          await tasks.trigger<typeof stepTwo>("step-two", { id })
          await tasks.triggerAndWait("step-three", { id })
        }`,
      });

      const connections = triggerDevMatcher.detectConnections(symbol, 'orchestrator.ts');

      expect(connections).toHaveLength(3);
      expect(connections.map((c) => c.targetHint)).toEqual(['step-one', 'step-two', 'step-three']);
    });

    it('should return empty for bodies with no triggers', () => {
      const symbol = makeSymbol({
        body: '{ const x = await fetch("/api/data") }',
      });

      expect(triggerDevMatcher.detectConnections(symbol, 'lib.ts')).toHaveLength(0);
    });
  });
});
