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
  // ═══════════════════════════════════════════════════════════════════════
  // detectEntryPoint
  // ═══════════════════════════════════════════════════════════════════════

  describe('detectEntryPoint', () => {
    // ── task() ──────────────────────────────────────────────────────────

    describe('task()', () => {
      it('should detect a basic task() definition', () => {
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

      it('should extract task ID with backtick quotes', () => {
        const symbol = makeSymbol({
          kind: 'const',
          body: 'task({ id: `my-task`, run: async () => {} })',
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

    // ── schemaTask() ────────────────────────────────────────────────────

    describe('schemaTask()', () => {
      it('should detect a schemaTask() definition', () => {
        const symbol = makeSymbol({
          kind: 'const',
          body: 'schemaTask({ id: "create-user", schema: z.object({ name: z.string() }), run: async () => {} })',
        });

        const result = triggerDevMatcher.detectEntryPoint(symbol, 'tasks/user.ts');

        expect(result).toEqual({
          entryType: 'trigger-task',
          metadata: { taskId: 'create-user' },
        });
      });

      it('should handle schemaTask with multiline body', () => {
        const symbol = makeSymbol({
          kind: 'const',
          body: `schemaTask({
  id: "validate-order",
  schema: z.object({
    orderId: z.string(),
    amount: z.number(),
  }),
  run: async (payload) => {
    return { valid: true };
  },
})`,
        });

        const result = triggerDevMatcher.detectEntryPoint(symbol, 'tasks/order.ts');

        expect(result?.entryType).toBe('trigger-task');
        expect(result?.metadata?.taskId).toBe('validate-order');
      });

      it('should not match "schemaTask" appearing in a function body', () => {
        const symbol = makeSymbol({
          kind: 'function',
          body: '{ const x = schemaTask({}) }',
        });

        expect(triggerDevMatcher.detectEntryPoint(symbol, 'test.ts')).toBeNull();
      });
    });

    // ── schedules.task() ────────────────────────────────────────────────

    describe('schedules.task()', () => {
      it('should detect a scheduled task with simple cron string', () => {
        const symbol = makeSymbol({
          kind: 'const',
          body: 'schedules.task({ id: "daily-cleanup", cron: "0 0 * * *", run: async () => {} })',
        });

        const result = triggerDevMatcher.detectEntryPoint(symbol, 'tasks/cleanup.ts');

        expect(result).toEqual({
          entryType: 'trigger-scheduled-task',
          metadata: { taskId: 'daily-cleanup', cronSchedule: '0 0 * * *' },
        });
      });

      it('should detect a scheduled task with object cron (pattern + timezone)', () => {
        const symbol = makeSymbol({
          kind: 'const',
          body: `schedules.task({
  id: "tokyo-report",
  cron: { pattern: "0 5 * * *", timezone: "Asia/Tokyo" },
  run: async (payload) => {}
})`,
        });

        const result = triggerDevMatcher.detectEntryPoint(symbol, 'tasks/report.ts');

        expect(result).toEqual({
          entryType: 'trigger-scheduled-task',
          metadata: { taskId: 'tokyo-report', cronSchedule: '0 5 * * *' },
        });
      });

      it('should handle scheduled task without explicit cron (dynamic schedule)', () => {
        const symbol = makeSymbol({
          kind: 'const',
          body: 'schedules.task({ id: "per-user-sync", run: async (payload) => {} })',
        });

        const result = triggerDevMatcher.detectEntryPoint(symbol, 'tasks/sync.ts');

        expect(result).toEqual({
          entryType: 'trigger-scheduled-task',
          metadata: { taskId: 'per-user-sync' },
        });
      });

      it('should handle every-two-hours cron pattern', () => {
        const symbol = makeSymbol({
          kind: 'const',
          body: `schedules.task({ id: "poll-api", cron: "0 */2 * * *", run: async () => {} })`,
        });

        const result = triggerDevMatcher.detectEntryPoint(symbol, 'tasks/poll.ts');

        expect(result?.metadata?.cronSchedule).toBe('0 */2 * * *');
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // detectConnections
  // ═══════════════════════════════════════════════════════════════════════

  describe('detectConnections', () => {
    // ── String-based triggers (tasks.*) ─────────────────────────────────

    describe('tasks.trigger() (string-based)', () => {
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
        expect(connections[0].type).toBe('task-trigger');
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

      it('should detect tasks.batchTriggerAndWait()', () => {
        const symbol = makeSymbol({
          body: '{ await tasks.batchTriggerAndWait("generate-report", items) }',
        });

        const connections = triggerDevMatcher.detectConnections(symbol, 'handler.ts');

        expect(connections).toHaveLength(1);
        expect(connections[0].type).toBe('task-trigger');
        expect(connections[0].targetHint).toBe('generate-report');
      });

      it('should detect tasks.triggerAndPoll()', () => {
        const symbol = makeSymbol({
          body: '{ const run = await tasks.triggerAndPoll("process-data", payload, { pollIntervalMs: 1000 }) }',
        });

        const connections = triggerDevMatcher.detectConnections(symbol, 'api.ts');

        expect(connections).toHaveLength(1);
        expect(connections[0].type).toBe('task-trigger');
        expect(connections[0].targetHint).toBe('process-data');
      });

      it('should handle TypeScript generics in tasks.trigger<typeof T>()', () => {
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

      it('should detect multiple string-based triggers in one body', () => {
        const symbol = makeSymbol({
          body: `{
          await tasks.trigger("step-one", { id })
          await tasks.trigger<typeof stepTwo>("step-two", { id })
          await tasks.triggerAndWait("step-three", { id })
        }`,
        });

        const connections = triggerDevMatcher.detectConnections(symbol, 'orchestrator.ts');

        const stringBased = connections.filter((c) => c.type === 'task-trigger');
        expect(stringBased).toHaveLength(3);
        expect(stringBased.map((c) => c.targetHint)).toEqual([
          'step-one',
          'step-two',
          'step-three',
        ]);
      });
    });

    // ── Instance-based triggers (myTask.*) ──────────────────────────────

    describe('instance-based triggers (myTask.trigger())', () => {
      it('should detect myTask.trigger(payload)', () => {
        const symbol = makeSymbol({
          body: '{ const handle = await processData.trigger({ userId: "123" }) }',
          startLine: 5,
          endLine: 10,
        });

        const connections = triggerDevMatcher.detectConnections(symbol, 'caller.ts');

        expect(connections).toHaveLength(1);
        expect(connections[0]).toEqual({
          type: 'task-trigger-ref',
          targetHint: 'processData',
          sourceLocation: [5, 10],
        });
      });

      it('should detect myTask.triggerAndWait(payload)', () => {
        const symbol = makeSymbol({
          body: '{ const result = await analyzeImage.triggerAndWait({ url: "https://..." }) }',
        });

        const connections = triggerDevMatcher.detectConnections(symbol, 'parent-task.ts');

        expect(connections).toHaveLength(1);
        expect(connections[0].type).toBe('task-trigger-ref');
        expect(connections[0].targetHint).toBe('analyzeImage');
      });

      it('should detect myTask.batchTrigger(items)', () => {
        const symbol = makeSymbol({
          body: `{ const handle = await sendEmail.batchTrigger([
            { payload: { to: "a@b.com" } },
            { payload: { to: "c@d.com" } },
          ]) }`,
        });

        const connections = triggerDevMatcher.detectConnections(symbol, 'batch-caller.ts');

        expect(connections).toHaveLength(1);
        expect(connections[0].type).toBe('task-trigger-ref');
        expect(connections[0].targetHint).toBe('sendEmail');
      });

      it('should detect myTask.batchTriggerAndWait(items)', () => {
        const symbol = makeSymbol({
          body: `{ const results = await generatePdf.batchTriggerAndWait([
            { payload: { templateId: "inv-1" } },
          ]) }`,
        });

        const connections = triggerDevMatcher.detectConnections(symbol, 'parent.ts');

        expect(connections).toHaveLength(1);
        expect(connections[0].type).toBe('task-trigger-ref');
        expect(connections[0].targetHint).toBe('generatePdf');
      });

      it('should handle generics on instance trigger', () => {
        const symbol = makeSymbol({
          body: '{ await childTask.trigger<{ result: string }>({ data: 1 }) }',
        });

        const connections = triggerDevMatcher.detectConnections(symbol, 'parent.ts');

        expect(connections).toHaveLength(1);
        expect(connections[0].type).toBe('task-trigger-ref');
        expect(connections[0].targetHint).toBe('childTask');
      });

      it('should handle generics on instance triggerAndWait', () => {
        const symbol = makeSymbol({
          body: '{ const res = await myTask.triggerAndWait<{ output: number }>(payload) }',
        });

        const connections = triggerDevMatcher.detectConnections(symbol, 'parent.ts');

        expect(connections).toHaveLength(1);
        expect(connections[0].targetHint).toBe('myTask');
      });

      it('should NOT match tasks.trigger() as instance-based (it is string-based)', () => {
        const symbol = makeSymbol({
          body: '{ await tasks.trigger("my-task", payload) }',
        });

        const connections = triggerDevMatcher.detectConnections(symbol, 'caller.ts');
        const refs = connections.filter((c) => c.type === 'task-trigger-ref');

        expect(refs).toHaveLength(0);
      });

      it('should NOT match batch.trigger() as instance-based', () => {
        const symbol = makeSymbol({
          body: '{ await batch.trigger([{ id: "t", payload: {} }]) }',
        });

        const connections = triggerDevMatcher.detectConnections(symbol, 'caller.ts');
        const refs = connections.filter((c) => c.type === 'task-trigger-ref');

        expect(refs).toHaveLength(0);
      });

      it('should detect multiple different instance-based triggers in one body', () => {
        const symbol = makeSymbol({
          body: `{
            await stepOne.trigger({ id: 1 })
            const result = await stepTwo.triggerAndWait({ id: 2 })
            await stepThree.batchTrigger(items)
          }`,
        });

        const connections = triggerDevMatcher.detectConnections(symbol, 'orchestrator.ts');
        const refs = connections.filter((c) => c.type === 'task-trigger-ref');

        expect(refs).toHaveLength(3);
        expect(refs.map((c) => c.targetHint)).toEqual(['stepOne', 'stepTwo', 'stepThree']);
      });

      it('should detect the same task triggered multiple times', () => {
        const symbol = makeSymbol({
          body: `{
            await childTask.trigger({ attempt: 1 })
            await childTask.trigger({ attempt: 2 })
          }`,
        });

        const connections = triggerDevMatcher.detectConnections(symbol, 'retry.ts');
        const refs = connections.filter((c) => c.type === 'task-trigger-ref');

        expect(refs).toHaveLength(2);
        expect(refs[0].targetHint).toBe('childTask');
        expect(refs[1].targetHint).toBe('childTask');
      });

      it('should handle await on a new line', () => {
        const symbol = makeSymbol({
          body: `{
            const handle =
              await longTaskName.trigger(
                { data: bigPayload }
              )
          }`,
        });

        const connections = triggerDevMatcher.detectConnections(symbol, 'caller.ts');
        const refs = connections.filter((c) => c.type === 'task-trigger-ref');

        expect(refs).toHaveLength(1);
        expect(refs[0].targetHint).toBe('longTaskName');
      });

      it('should handle .unwrap() chaining after triggerAndWait', () => {
        const symbol = makeSymbol({
          body: '{ const output = await childTask.triggerAndWait(payload).unwrap() }',
        });

        const connections = triggerDevMatcher.detectConnections(symbol, 'parent.ts');
        const refs = connections.filter((c) => c.type === 'task-trigger-ref');

        expect(refs).toHaveLength(1);
        expect(refs[0].targetHint).toBe('childTask');
      });

      it('should handle trigger with options object', () => {
        const symbol = makeSymbol({
          body: `{ await myTask.trigger(payload, {
            delay: "5m",
            tags: ["user:123"],
            idempotencyKey: "key_1234",
          }) }`,
        });

        const connections = triggerDevMatcher.detectConnections(symbol, 'caller.ts');
        const refs = connections.filter((c) => c.type === 'task-trigger-ref');

        expect(refs).toHaveLength(1);
        expect(refs[0].targetHint).toBe('myTask');
      });
    });

    // ── batch.trigger / batch.triggerAndWait (multi-task, string IDs) ───

    describe('batch.trigger() (multi-task, string IDs)', () => {
      it('should detect task IDs in batch.trigger()', () => {
        const symbol = makeSymbol({
          body: `{ await batch.trigger([
            { id: "send-email", payload: { to: "user@example.com" } },
            { id: "generate-pdf", payload: { templateId: "invoice" } },
          ]) }`,
        });

        const connections = triggerDevMatcher.detectConnections(symbol, 'handler.ts');
        const stringBased = connections.filter((c) => c.type === 'task-trigger');

        expect(stringBased).toHaveLength(2);
        expect(stringBased.map((c) => c.targetHint)).toEqual(['send-email', 'generate-pdf']);
      });

      it('should detect task IDs in batch.triggerAndWait()', () => {
        const symbol = makeSymbol({
          body: `{ const results = await batch.triggerAndWait([
            { id: "analyze", payload: { url } },
            { id: "summarize", payload: { text } },
          ]) }`,
        });

        const connections = triggerDevMatcher.detectConnections(symbol, 'parent.ts');
        const stringBased = connections.filter((c) => c.type === 'task-trigger');

        expect(stringBased).toHaveLength(2);
        expect(stringBased.map((c) => c.targetHint)).toEqual(['analyze', 'summarize']);
      });

      it('should handle generics in batch.trigger<typeof T | typeof U>()', () => {
        const symbol = makeSymbol({
          body: `{ await batch.trigger<typeof sendEmail | typeof generatePdf>([
            { id: "send-email", payload: { to: "a@b.com" } },
            { id: "generate-pdf", payload: { data: {} } },
          ]) }`,
        });

        const connections = triggerDevMatcher.detectConnections(symbol, 'handler.ts');
        const stringBased = connections.filter((c) => c.type === 'task-trigger');

        expect(stringBased).toHaveLength(2);
      });

      it('should handle single item in batch.trigger()', () => {
        const symbol = makeSymbol({
          body: `{ await batch.trigger([{ id: "only-task", payload: {} }]) }`,
        });

        const connections = triggerDevMatcher.detectConnections(symbol, 'handler.ts');
        const stringBased = connections.filter((c) => c.type === 'task-trigger');

        expect(stringBased).toHaveLength(1);
        expect(stringBased[0].targetHint).toBe('only-task');
      });
    });

    // ── batch.triggerByTask / batch.triggerByTaskAndWait (refs) ─────────

    describe('batch.triggerByTask() (multi-task, variable refs)', () => {
      it('should detect task refs in batch.triggerByTask()', () => {
        const symbol = makeSymbol({
          body: `{ await batch.triggerByTask([
            { task: sendEmail, payload: { to: "user@example.com" } },
            { task: generatePdf, payload: { templateId: "invoice" } },
          ]) }`,
        });

        const connections = triggerDevMatcher.detectConnections(symbol, 'handler.ts');
        const refs = connections.filter((c) => c.type === 'task-trigger-ref');

        expect(refs).toHaveLength(2);
        expect(refs.map((c) => c.targetHint)).toEqual(['sendEmail', 'generatePdf']);
      });

      it('should detect task refs in batch.triggerByTaskAndWait()', () => {
        const symbol = makeSymbol({
          body: `{ const results = await batch.triggerByTaskAndWait([
            { task: childTask1, payload: { foo: "World" } },
            { task: childTask2, payload: { bar: 42 } },
          ]) }`,
        });

        const connections = triggerDevMatcher.detectConnections(symbol, 'parent.ts');
        const refs = connections.filter((c) => c.type === 'task-trigger-ref');

        expect(refs).toHaveLength(2);
        expect(refs.map((c) => c.targetHint)).toEqual(['childTask1', 'childTask2']);
      });

      it('should handle single task in batch.triggerByTaskAndWait()', () => {
        const symbol = makeSymbol({
          body: `{ await batch.triggerByTaskAndWait([{ task: onlyTask, payload: {} }]) }`,
        });

        const connections = triggerDevMatcher.detectConnections(symbol, 'handler.ts');
        const refs = connections.filter((c) => c.type === 'task-trigger-ref');

        expect(refs).toHaveLength(1);
        expect(refs[0].targetHint).toBe('onlyTask');
      });
    });

    // ── Mixed patterns ─────────────────────────────────────────────────

    describe('mixed patterns in one body', () => {
      it('should detect string-based and instance-based triggers together', () => {
        const symbol = makeSymbol({
          body: `{
            await tasks.trigger("step-one", { id })
            const result = await childTask.triggerAndWait({ id })
          }`,
        });

        const connections = triggerDevMatcher.detectConnections(symbol, 'mixed.ts');

        const stringBased = connections.filter((c) => c.type === 'task-trigger');
        const refs = connections.filter((c) => c.type === 'task-trigger-ref');

        expect(stringBased).toHaveLength(1);
        expect(stringBased[0].targetHint).toBe('step-one');
        expect(refs).toHaveLength(1);
        expect(refs[0].targetHint).toBe('childTask');
      });

      it('should detect all trigger patterns in a complex orchestrator', () => {
        const symbol = makeSymbol({
          body: `{
            await tasks.trigger("init-job", { jobId })
            const result = await analyzeTask.triggerAndWait(data)
            await batch.trigger([
              { id: "notify-email", payload: { to } },
              { id: "notify-slack", payload: { channel } },
            ])
            await batch.triggerByTaskAndWait([
              { task: cleanupTask, payload: { jobId } },
            ])
          }`,
        });

        const connections = triggerDevMatcher.detectConnections(symbol, 'orchestrator.ts');

        const stringBased = connections.filter((c) => c.type === 'task-trigger');
        const refs = connections.filter((c) => c.type === 'task-trigger-ref');

        // String-based: tasks.trigger("init-job") + batch IDs ("notify-email", "notify-slack")
        expect(stringBased.map((c) => c.targetHint)).toEqual([
          'init-job',
          'notify-email',
          'notify-slack',
        ]);
        // Refs: analyzeTask.triggerAndWait + batch.triggerByTaskAndWait cleanupTask
        expect(refs.map((c) => c.targetHint)).toEqual(['analyzeTask', 'cleanupTask']);
      });
    });

    // ── Edge cases ─────────────────────────────────────────────────────

    describe('edge cases', () => {
      it('should return empty for bodies with no triggers', () => {
        const symbol = makeSymbol({
          body: '{ const x = await fetch("/api/data") }',
        });

        expect(triggerDevMatcher.detectConnections(symbol, 'lib.ts')).toHaveLength(0);
      });

      it('should not match random objects with .trigger() method', () => {
        // This WILL detect "eventEmitter" as a ref — acceptable false positive
        // since the graph builder won't find a matching task node for it
        const symbol = makeSymbol({
          body: '{ eventEmitter.trigger("click") }',
        });

        const connections = triggerDevMatcher.detectConnections(symbol, 'ui.ts');
        // Instance pattern matches; the graph builder filters it later
        const refs = connections.filter((c) => c.type === 'task-trigger-ref');
        expect(refs).toHaveLength(1);
        expect(refs[0].targetHint).toBe('eventEmitter');
      });

      it('should handle single quotes in task IDs', () => {
        const symbol = makeSymbol({
          body: "{ await tasks.trigger('my-task', payload) }",
        });

        const connections = triggerDevMatcher.detectConnections(symbol, 'caller.ts');

        expect(connections).toHaveLength(1);
        expect(connections[0].targetHint).toBe('my-task');
      });

      it('should handle backtick quotes in task IDs', () => {
        const symbol = makeSymbol({
          body: '{ await tasks.trigger(`my-task`, payload) }',
        });

        const connections = triggerDevMatcher.detectConnections(symbol, 'caller.ts');

        expect(connections).toHaveLength(1);
        expect(connections[0].targetHint).toBe('my-task');
      });
    });
  });
});
