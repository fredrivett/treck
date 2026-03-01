import { describe, expect, it } from 'vitest';
import type { SymbolInfo } from '../extractors/types.js';
import { inngestMatcher } from './inngest.js';

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

describe('inngestMatcher', () => {
  describe('detectEntryPoint', () => {
    it('should detect inngest.createFunction() with event trigger and id', () => {
      const symbol = makeSymbol({
        kind: 'const',
        body: 'inngest.createFunction({ id: "analyze-image" }, { event: "image/uploaded" }, async ({ event, step }) => {})',
      });

      const result = inngestMatcher.detectEntryPoint(symbol, 'inngest/functions.ts');

      expect(result).toEqual({
        entryType: 'inngest-function',
        metadata: { eventTrigger: 'image/uploaded', taskId: 'analyze-image' },
      });
    });

    it('should extract event trigger with single quotes', () => {
      const symbol = makeSymbol({
        kind: 'const',
        body: "inngest.createFunction({ id: 'my-fn' }, { event: 'user/created' }, handler)",
      });

      const result = inngestMatcher.detectEntryPoint(symbol, 'inngest/functions.ts');

      expect(result?.metadata?.eventTrigger).toBe('user/created');
    });

    it('should extract function ID', () => {
      const symbol = makeSymbol({
        kind: 'const',
        body: 'inngest.createFunction({ id: "process-order" }, { event: "order/placed" }, handler)',
      });

      const result = inngestMatcher.detectEntryPoint(symbol, 'inngest/functions.ts');

      expect(result?.metadata?.taskId).toBe('process-order');
    });

    it('should handle cron trigger (no event)', () => {
      const symbol = makeSymbol({
        kind: 'const',
        body: 'inngest.createFunction({ id: "daily-cleanup" }, { cron: "0 0 * * *" }, handler)',
      });

      const result = inngestMatcher.detectEntryPoint(symbol, 'inngest/functions.ts');

      expect(result).toEqual({
        entryType: 'inngest-function',
        metadata: { taskId: 'daily-cleanup' },
      });
    });

    it('should return null for non-createFunction consts', () => {
      const symbol = makeSymbol({
        kind: 'const',
        body: 'createClient({ url: "..." })',
      });

      expect(inngestMatcher.detectEntryPoint(symbol, 'lib/db.ts')).toBeNull();
    });

    it('should return null for function kind', () => {
      const symbol = makeSymbol({
        kind: 'function',
        body: '{ createFunction() }',
      });

      expect(inngestMatcher.detectEntryPoint(symbol, 'test.ts')).toBeNull();
    });
  });

  describe('detectConnections', () => {
    describe('inngest.send()', () => {
      it('should detect inngest.send() with object syntax', () => {
        const symbol = makeSymbol({
          body: '{ await inngest.send({ name: "user/created", data: { userId: 1 } }) }',
          startLine: 10,
          endLine: 15,
        });

        const connections = inngestMatcher.detectConnections(symbol, 'api/route.ts');

        expect(connections).toHaveLength(1);
        expect(connections[0]).toEqual({
          type: 'inngest-send',
          targetHint: 'user/created',
          sourceLocation: [10, 15],
        });
      });

      it('should detect inngest.send() with array syntax', () => {
        const symbol = makeSymbol({
          body: '{ await inngest.send([{ name: "event/one", data: {} }]) }',
        });

        const connections = inngestMatcher.detectConnections(symbol, 'api/route.ts');

        expect(connections).toHaveLength(1);
        expect(connections[0].targetHint).toBe('event/one');
      });

      it('should detect inngest.send() with single quotes', () => {
        const symbol = makeSymbol({
          body: "{ await inngest.send({ name: 'my/event', data: {} }) }",
        });

        const connections = inngestMatcher.detectConnections(symbol, 'handler.ts');

        expect(connections).toHaveLength(1);
        expect(connections[0].targetHint).toBe('my/event');
      });
    });

    describe('step.sendEvent()', () => {
      it('should detect step.sendEvent() with single event', () => {
        const symbol = makeSymbol({
          body: '{ await step.sendEvent("send-welcome", { name: "email/welcome", data: { to: user.email } }) }',
        });

        const connections = inngestMatcher.detectConnections(symbol, 'inngest/fn.ts');

        expect(connections).toHaveLength(1);
        expect(connections[0]).toEqual({
          type: 'inngest-send',
          targetHint: 'email/welcome',
          sourceLocation: [1, 1],
        });
      });

      it('should detect step.sendEvent() with array form', () => {
        const symbol = makeSymbol({
          body: '{ await step.sendEvent("send-events", [{ name: "audit/log", data: {} }]) }',
        });

        const connections = inngestMatcher.detectConnections(symbol, 'inngest/fn.ts');

        expect(connections).toHaveLength(1);
        expect(connections[0].targetHint).toBe('audit/log');
      });
    });

    describe('step.invoke()', () => {
      it('should detect step.invoke() old API (no step name)', () => {
        const symbol = makeSymbol({
          body: '{ await step.invoke({ function: analyzeImage, data: { imageUrl } }) }',
        });

        const connections = inngestMatcher.detectConnections(symbol, 'inngest/fn.ts');

        expect(connections).toHaveLength(1);
        expect(connections[0]).toEqual({
          type: 'inngest-invoke',
          targetHint: 'analyzeImage',
          sourceLocation: [1, 1],
        });
      });

      it('should detect step.invoke() new API (with step name)', () => {
        const symbol = makeSymbol({
          body: '{ await step.invoke("run-analysis", { function: analyzeImage, data: { imageUrl } }) }',
        });

        const connections = inngestMatcher.detectConnections(symbol, 'inngest/fn.ts');

        expect(connections).toHaveLength(1);
        expect(connections[0]).toEqual({
          type: 'inngest-invoke',
          targetHint: 'analyzeImage',
          sourceLocation: [1, 1],
        });
      });
    });

    it('should detect multiple connections in one body', () => {
      const symbol = makeSymbol({
        body: `{
          await inngest.send({ name: "user/created", data: { userId } })
          await step.sendEvent("notify", { name: "notification/send", data: {} })
          await step.invoke("run-task", { function: processOrder, data: {} })
        }`,
      });

      const connections = inngestMatcher.detectConnections(symbol, 'inngest/fn.ts');

      expect(connections).toHaveLength(3);
      expect(connections.map((c) => c.type)).toEqual([
        'inngest-send',
        'inngest-send',
        'inngest-invoke',
      ]);
      expect(connections.map((c) => c.targetHint)).toEqual([
        'user/created',
        'notification/send',
        'processOrder',
      ]);
    });

    it('should return empty for bodies with no inngest patterns', () => {
      const symbol = makeSymbol({
        body: '{ const x = await fetch("/api/data") }',
      });

      expect(inngestMatcher.detectConnections(symbol, 'lib.ts')).toHaveLength(0);
    });
  });
});
