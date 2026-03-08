import 'fake-indexeddb/auto';
import type { UIMessage } from 'ai';
import { afterEach, describe, expect, it } from 'vitest';
import {
  _closeDb,
  deleteChat,
  deriveTitle,
  listChatsForGraph,
  loadChat,
  type StoredChat,
  saveChat,
} from './chat-store.js';

/** Create a minimal StoredChat for testing. */
function makeChat(overrides: Partial<StoredChat> = {}): StoredChat {
  return {
    id: crypto.randomUUID(),
    graphId: 'test-graph',
    title: 'Test chat',
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

/** Create a minimal UIMessage for testing. */
function makeMessage(role: 'user' | 'assistant', text: string): UIMessage {
  return {
    id: crypto.randomUUID(),
    role,
    parts: [{ type: 'text' as const, text }],
    createdAt: new Date(),
  };
}

/** Create a UIMessage with tool call parts (simulates AI tool usage). */
function makeToolMessage(toolName: string, output: unknown): UIMessage {
  return {
    id: crypto.randomUUID(),
    role: 'assistant',
    parts: [
      { type: 'text' as const, text: 'Here are the results' },
      {
        type: `tool-${toolName}` as 'text',
        toolCallId: crypto.randomUUID(),
        state: 'output-available',
        output,
      } as unknown as { type: 'text'; text: string },
    ],
    createdAt: new Date(),
  };
}

afterEach(async () => {
  await _closeDb();
  indexedDB.deleteDatabase('treck-chat');
});

describe('chat-store', () => {
  // --- saveChat + loadChat ---

  describe('saveChat + loadChat', () => {
    it('round-trips a chat with messages', async () => {
      const chat = makeChat({
        messages: [makeMessage('user', 'hello'), makeMessage('assistant', 'hi there')],
      });

      await saveChat(chat);
      const loaded = await loadChat(chat.id);

      expect(loaded).toBeDefined();
      expect(loaded!.id).toBe(chat.id);
      expect(loaded!.graphId).toBe(chat.graphId);
      expect(loaded!.title).toBe(chat.title);
      expect(loaded!.messages).toHaveLength(2);
      expect(loaded!.messages[0].parts[0]).toEqual({ type: 'text', text: 'hello' });
      expect(loaded!.messages[1].parts[0]).toEqual({ type: 'text', text: 'hi there' });
    });

    it('preserves all StoredChat fields', async () => {
      const chat = makeChat({
        id: 'fixed-id-123',
        graphId: 'my-graph',
        title: 'My title',
        createdAt: 1000,
        updatedAt: 2000,
        messages: [],
      });

      await saveChat(chat);
      const loaded = await loadChat(chat.id);

      expect(loaded).toEqual(chat);
    });

    it('updates an existing chat on re-save', async () => {
      const chat = makeChat({ title: 'Original' });
      await saveChat(chat);

      chat.title = 'Updated';
      chat.updatedAt = Date.now() + 1000;
      await saveChat(chat);

      const loaded = await loadChat(chat.id);
      expect(loaded!.title).toBe('Updated');
      expect(loaded!.updatedAt).toBe(chat.updatedAt);
    });

    it('updates messages on re-save', async () => {
      const chat = makeChat({ messages: [makeMessage('user', 'first')] });
      await saveChat(chat);

      chat.messages.push(makeMessage('assistant', 'reply'));
      chat.messages.push(makeMessage('user', 'follow-up'));
      await saveChat(chat);

      const loaded = await loadChat(chat.id);
      expect(loaded!.messages).toHaveLength(3);
      expect(loaded!.messages[2].parts[0]).toEqual({ type: 'text', text: 'follow-up' });
    });

    it('returns undefined for a missing chat', async () => {
      const loaded = await loadChat('nonexistent');
      expect(loaded).toBeUndefined();
    });

    it('returns undefined for empty string ID', async () => {
      const loaded = await loadChat('');
      expect(loaded).toBeUndefined();
    });

    it('handles chat with empty messages array', async () => {
      const chat = makeChat({ messages: [] });
      await saveChat(chat);

      const loaded = await loadChat(chat.id);
      expect(loaded!.messages).toEqual([]);
    });

    it('round-trips messages with tool call parts', async () => {
      const toolMsg = makeToolMessage('select_nodes', {
        selected: ['src/foo.ts:bar', 'src/baz.ts:qux'],
      });
      const chat = makeChat({
        messages: [makeMessage('user', 'find the entry points'), toolMsg],
      });

      await saveChat(chat);
      const loaded = await loadChat(chat.id);

      expect(loaded!.messages).toHaveLength(2);
      const loadedToolParts = loaded!.messages[1].parts;
      expect(loadedToolParts).toHaveLength(2);
      expect((loadedToolParts[1] as unknown as { output: unknown }).output).toEqual({
        selected: ['src/foo.ts:bar', 'src/baz.ts:qux'],
      });
    });

    it('handles many messages in a single chat', async () => {
      const messages: UIMessage[] = [];
      for (let i = 0; i < 100; i++) {
        messages.push(makeMessage(i % 2 === 0 ? 'user' : 'assistant', `Message ${i}`));
      }
      const chat = makeChat({ messages });
      await saveChat(chat);

      const loaded = await loadChat(chat.id);
      expect(loaded!.messages).toHaveLength(100);
      expect(loaded!.messages[99].parts[0]).toEqual({ type: 'text', text: 'Message 99' });
    });

    it('stores multiple chats with the same graphId independently', async () => {
      const chat1 = makeChat({ graphId: 'g', title: 'Chat 1' });
      const chat2 = makeChat({ graphId: 'g', title: 'Chat 2' });
      await saveChat(chat1);
      await saveChat(chat2);

      const loaded1 = await loadChat(chat1.id);
      const loaded2 = await loadChat(chat2.id);
      expect(loaded1!.title).toBe('Chat 1');
      expect(loaded2!.title).toBe('Chat 2');
    });
  });

  // --- listChatsForGraph ---

  describe('listChatsForGraph', () => {
    it('returns only chats for the requested graph', async () => {
      await saveChat(makeChat({ graphId: 'graph-a', title: 'Chat A' }));
      await saveChat(makeChat({ graphId: 'graph-b', title: 'Chat B' }));
      await saveChat(makeChat({ graphId: 'graph-a', title: 'Chat A2' }));

      const graphA = await listChatsForGraph('graph-a');
      const graphB = await listChatsForGraph('graph-b');

      expect(graphA).toHaveLength(2);
      expect(graphB).toHaveLength(1);
      expect(graphA.every((c) => c.graphId === 'graph-a')).toBe(true);
      expect(graphB[0].graphId).toBe('graph-b');
    });

    it('returns chats sorted by updatedAt descending', async () => {
      const now = Date.now();
      await saveChat(makeChat({ graphId: 'g', title: 'Oldest', updatedAt: now - 2000 }));
      await saveChat(makeChat({ graphId: 'g', title: 'Newest', updatedAt: now }));
      await saveChat(makeChat({ graphId: 'g', title: 'Middle', updatedAt: now - 1000 }));

      const chats = await listChatsForGraph('g');
      expect(chats.map((c) => c.title)).toEqual(['Newest', 'Middle', 'Oldest']);
    });

    it('omits messages from the returned metadata', async () => {
      await saveChat(
        makeChat({
          graphId: 'g',
          messages: [makeMessage('user', 'hello'), makeMessage('assistant', 'hi')],
        }),
      );

      const chats = await listChatsForGraph('g');
      expect(chats).toHaveLength(1);
      expect('messages' in chats[0]).toBe(false);
    });

    it('preserves all metadata fields except messages', async () => {
      const chat = makeChat({
        graphId: 'g',
        title: 'My chat',
        createdAt: 1000,
        updatedAt: 2000,
        messages: [makeMessage('user', 'hello')],
      });
      await saveChat(chat);

      const [meta] = await listChatsForGraph('g');
      expect(meta.id).toBe(chat.id);
      expect(meta.graphId).toBe('g');
      expect(meta.title).toBe('My chat');
      expect(meta.createdAt).toBe(1000);
      expect(meta.updatedAt).toBe(2000);
    });

    it('returns empty array for unknown graph', async () => {
      const chats = await listChatsForGraph('nonexistent');
      expect(chats).toEqual([]);
    });

    it('returns empty array when store is completely empty', async () => {
      const chats = await listChatsForGraph('anything');
      expect(chats).toEqual([]);
    });

    it('handles many chats for one graph', async () => {
      const now = Date.now();
      for (let i = 0; i < 50; i++) {
        await saveChat(makeChat({ graphId: 'g', title: `Chat ${i}`, updatedAt: now - i * 1000 }));
      }

      const chats = await listChatsForGraph('g');
      expect(chats).toHaveLength(50);
      // Verify sort order — first should be most recent
      expect(chats[0].title).toBe('Chat 0');
      expect(chats[49].title).toBe('Chat 49');
    });

    it('does not mix chats between graphs with similar names', async () => {
      await saveChat(makeChat({ graphId: 'app', title: 'app chat' }));
      await saveChat(makeChat({ graphId: 'app-v2', title: 'app-v2 chat' }));
      await saveChat(makeChat({ graphId: 'my-app', title: 'my-app chat' }));

      expect(await listChatsForGraph('app')).toHaveLength(1);
      expect(await listChatsForGraph('app-v2')).toHaveLength(1);
      expect(await listChatsForGraph('my-app')).toHaveLength(1);
    });

    it('reflects updates after a chat is re-saved', async () => {
      const chat = makeChat({ graphId: 'g', title: 'Before', updatedAt: 1000 });
      await saveChat(chat);

      chat.title = 'After';
      chat.updatedAt = 2000;
      await saveChat(chat);

      const chats = await listChatsForGraph('g');
      expect(chats).toHaveLength(1);
      expect(chats[0].title).toBe('After');
      expect(chats[0].updatedAt).toBe(2000);
    });

    it('reflects deletions', async () => {
      const chat1 = makeChat({ graphId: 'g', title: 'Keep' });
      const chat2 = makeChat({ graphId: 'g', title: 'Delete' });
      await saveChat(chat1);
      await saveChat(chat2);

      await deleteChat(chat2.id);

      const chats = await listChatsForGraph('g');
      expect(chats).toHaveLength(1);
      expect(chats[0].title).toBe('Keep');
    });

    it('handles chats with identical updatedAt timestamps', async () => {
      const now = Date.now();
      await saveChat(makeChat({ graphId: 'g', title: 'A', updatedAt: now }));
      await saveChat(makeChat({ graphId: 'g', title: 'B', updatedAt: now }));

      const chats = await listChatsForGraph('g');
      expect(chats).toHaveLength(2);
      // Both should be present; order between equal timestamps is implementation-defined
      const titles = chats.map((c) => c.title).sort();
      expect(titles).toEqual(['A', 'B']);
    });
  });

  // --- deleteChat ---

  describe('deleteChat', () => {
    it('removes the chat', async () => {
      const chat = makeChat();
      await saveChat(chat);

      await deleteChat(chat.id);

      const loaded = await loadChat(chat.id);
      expect(loaded).toBeUndefined();
    });

    it('does not throw for a missing chat', async () => {
      await expect(deleteChat('nonexistent')).resolves.toBeUndefined();
    });

    it('does not throw for empty string ID', async () => {
      await expect(deleteChat('')).resolves.toBeUndefined();
    });

    it('does not affect other chats', async () => {
      const chat1 = makeChat({ title: 'Keep' });
      const chat2 = makeChat({ title: 'Delete' });
      await saveChat(chat1);
      await saveChat(chat2);

      await deleteChat(chat2.id);

      const loaded = await loadChat(chat1.id);
      expect(loaded).toBeDefined();
      expect(loaded!.title).toBe('Keep');
    });

    it('does not affect chats in other graphs', async () => {
      const chatA = makeChat({ graphId: 'graph-a', title: 'A' });
      const chatB = makeChat({ graphId: 'graph-b', title: 'B' });
      await saveChat(chatA);
      await saveChat(chatB);

      await deleteChat(chatA.id);

      const loadedB = await loadChat(chatB.id);
      expect(loadedB).toBeDefined();
      expect(loadedB!.title).toBe('B');
    });

    it('can delete and re-create with the same ID', async () => {
      const id = crypto.randomUUID();
      await saveChat(makeChat({ id, title: 'First' }));
      await deleteChat(id);

      await saveChat(makeChat({ id, title: 'Second' }));
      const loaded = await loadChat(id);
      expect(loaded!.title).toBe('Second');
    });

    it('double-delete does not throw', async () => {
      const chat = makeChat();
      await saveChat(chat);
      await deleteChat(chat.id);
      await expect(deleteChat(chat.id)).resolves.toBeUndefined();
    });
  });

  // --- deriveTitle ---

  describe('deriveTitle', () => {
    it('returns short messages as-is', () => {
      expect(deriveTitle('Hello world')).toBe('Hello world');
    });

    it('truncates long messages to 60 chars with ellipsis', () => {
      const long = 'a'.repeat(100);
      const title = deriveTitle(long);
      expect(title).toHaveLength(60);
      expect(title).toBe(`${'a'.repeat(57)}...`);
    });

    it('handles exactly 60 characters without truncation', () => {
      const exact = 'a'.repeat(60);
      expect(deriveTitle(exact)).toBe(exact);
    });

    it('handles exactly 61 characters with truncation', () => {
      const input = 'a'.repeat(61);
      const title = deriveTitle(input);
      expect(title).toHaveLength(60);
      expect(title).toBe(`${'a'.repeat(57)}...`);
    });

    it('collapses internal whitespace', () => {
      expect(deriveTitle('hello   world')).toBe('hello world');
    });

    it('trims leading and trailing whitespace', () => {
      expect(deriveTitle('  hello world  ')).toBe('hello world');
    });

    it('collapses tabs and newlines', () => {
      expect(deriveTitle('hello\t\nworld')).toBe('hello world');
    });

    it('handles empty string', () => {
      expect(deriveTitle('')).toBe('');
    });

    it('handles whitespace-only string', () => {
      expect(deriveTitle('   \t\n  ')).toBe('');
    });

    it('handles single character', () => {
      expect(deriveTitle('x')).toBe('x');
    });

    it('truncates after collapsing whitespace', () => {
      // Build a string that's long only because of whitespace, but collapses to under 60
      const input = Array.from({ length: 10 }, () => 'hello').join('     ');
      const title = deriveTitle(input);
      // "hello hello hello hello hello hello hello hello hello hello" = 59 chars
      expect(title.length).toBeLessThanOrEqual(60);
      expect(title).not.toContain('  ');
    });

    it('preserves unicode characters', () => {
      expect(deriveTitle('How does the 日本語 API work?')).toBe(
        'How does the 日本語 API work?',
      );
    });

    it('truncates unicode correctly at character boundary', () => {
      const input = '日本語'.repeat(30); // 90 chars
      const title = deriveTitle(input);
      expect(title).toHaveLength(60);
      expect(title.endsWith('...')).toBe(true);
    });
  });

  // --- cross-cutting / integration ---

  describe('cross-cutting operations', () => {
    it('save, list, load, delete lifecycle', async () => {
      // Create
      const chat = makeChat({
        graphId: 'lifecycle',
        title: 'Lifecycle test',
        messages: [makeMessage('user', 'hello')],
      });
      await saveChat(chat);

      // List
      const listed = await listChatsForGraph('lifecycle');
      expect(listed).toHaveLength(1);
      expect(listed[0].id).toBe(chat.id);

      // Load
      const loaded = await loadChat(chat.id);
      expect(loaded!.messages).toHaveLength(1);

      // Update
      chat.messages.push(makeMessage('assistant', 'hi'));
      chat.title = 'Updated lifecycle';
      chat.updatedAt = Date.now() + 1000;
      await saveChat(chat);

      const reloaded = await loadChat(chat.id);
      expect(reloaded!.messages).toHaveLength(2);
      expect(reloaded!.title).toBe('Updated lifecycle');

      // Delete
      await deleteChat(chat.id);
      expect(await loadChat(chat.id)).toBeUndefined();
      expect(await listChatsForGraph('lifecycle')).toEqual([]);
    });

    it('operations across multiple graphs are isolated', async () => {
      const chatsA = [
        makeChat({ graphId: 'tldraw', title: 'tldraw 1' }),
        makeChat({ graphId: 'tldraw', title: 'tldraw 2' }),
      ];
      const chatsB = [makeChat({ graphId: 'treck', title: 'treck 1' })];

      for (const c of [...chatsA, ...chatsB]) {
        await saveChat(c);
      }

      // Delete one from tldraw
      await deleteChat(chatsA[0].id);

      // Verify tldraw has 1 remaining
      const tldraw = await listChatsForGraph('tldraw');
      expect(tldraw).toHaveLength(1);
      expect(tldraw[0].title).toBe('tldraw 2');

      // Verify treck is unaffected
      const treck = await listChatsForGraph('treck');
      expect(treck).toHaveLength(1);
      expect(treck[0].title).toBe('treck 1');
    });

    it('DB connection is reused across operations', async () => {
      // Multiple rapid operations should all succeed (tests connection pooling)
      const results = await Promise.all([
        saveChat(makeChat({ graphId: 'g', title: 'a' })),
        saveChat(makeChat({ graphId: 'g', title: 'b' })),
        saveChat(makeChat({ graphId: 'g', title: 'c' })),
      ]);

      // All should resolve without error
      expect(results).toHaveLength(3);

      const chats = await listChatsForGraph('g');
      expect(chats).toHaveLength(3);
    });
  });
});
