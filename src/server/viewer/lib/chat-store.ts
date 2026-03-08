/**
 * IndexedDB-backed storage for per-graph chat conversations.
 *
 * Uses the `idb` library for a promise-based API. Chats are stored in a single
 * object store with an index on `graphId` for efficient per-graph lookups.
 */

import type { UIMessage } from 'ai';
import type { DBSchema, IDBPDatabase } from 'idb';
import { openDB } from 'idb';

/** Metadata + messages for a single chat conversation. */
export interface StoredChat {
  /** Unique chat ID (crypto.randomUUID). */
  id: string;
  /** Identifies which graph this chat belongs to (e.g. "tldraw", "my-app"). */
  graphId: string;
  /** Auto-generated title from the first user message. */
  title: string;
  /** Full message history. */
  messages: UIMessage[];
  /** Epoch ms when the chat was created. */
  createdAt: number;
  /** Epoch ms when the chat was last updated. */
  updatedAt: number;
}

/** Chat metadata without messages — used for list views. */
export type StoredChatMeta = Omit<StoredChat, 'messages'>;

/** IndexedDB schema for the treck-chat database. */
interface TreckChatDB extends DBSchema {
  chats: {
    key: string;
    value: StoredChat;
    indexes: { 'by-graph': string };
  };
}

const DB_NAME = 'treck-chat';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<TreckChatDB>> | null = null;

/** Open (or reuse) the IndexedDB connection. */
function getDb(): Promise<IDBPDatabase<TreckChatDB>> {
  if (!dbPromise) {
    dbPromise = openDB<TreckChatDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore('chats', { keyPath: 'id' });
        store.createIndex('by-graph', 'graphId');
      },
    });
  }
  return dbPromise;
}

/**
 * List chat metadata for a specific graph, sorted by updatedAt descending.
 *
 * @param graphId - The graph identifier to filter by
 * @returns Chat metadata (no messages) sorted newest-first
 */
export async function listChatsForGraph(graphId: string): Promise<StoredChatMeta[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex('chats', 'by-graph', graphId);
  all.sort((a, b) => b.updatedAt - a.updatedAt);
  return all.map(({ messages: _, ...meta }) => meta);
}

/**
 * Load a single chat by ID, including its messages.
 *
 * @param chatId - The chat's unique ID
 * @returns The full chat, or undefined if not found
 */
export async function loadChat(chatId: string): Promise<StoredChat | undefined> {
  const db = await getDb();
  return db.get('chats', chatId);
}

/**
 * Save (create or update) a chat in the store.
 *
 * @param chat - The full chat object to persist
 */
export async function saveChat(chat: StoredChat): Promise<void> {
  const db = await getDb();
  await db.put('chats', chat);
}

/**
 * Delete a chat by ID.
 *
 * @param chatId - The chat's unique ID
 */
export async function deleteChat(chatId: string): Promise<void> {
  const db = await getDb();
  await db.delete('chats', chatId);
}

/**
 * Generate a title from the first user message.
 *
 * @param text - The user's message text
 * @returns Truncated title (max 60 characters)
 */
export function deriveTitle(text: string): string {
  const cleaned = text.trim().replace(/\s+/g, ' ');
  if (cleaned.length <= 60) return cleaned;
  return `${cleaned.slice(0, 57)}...`;
}

/**
 * Close the DB connection and reset the cached promise.
 *
 * Used in tests to cleanly tear down between runs.
 */
export async function _closeDb(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise;
    db.close();
    dbPromise = null;
  }
}
