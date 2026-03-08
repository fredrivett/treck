/**
 * Chat list view showing previous conversations for a specific graph.
 *
 * Displays chats sorted by most recently updated, with options to select,
 * delete, or start a new conversation.
 */

import { useCallback, useEffect, useState } from 'react';
import { deleteChat, listChatsForGraph, type StoredChatMeta } from '../lib/chat-store';
import { Card } from './ui/card';

/** Format a timestamp as a relative time string. */
function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

interface ChatListProps {
  /** Graph identifier to filter chats by. */
  graphId: string;
  /** Called when a chat is selected from the list. */
  onSelectChat: (chatId: string) => void;
  /** Called when the user wants to start a new chat. */
  onNewChat: () => void;
  /** Increment to trigger a refresh of the chat list. */
  refreshKey?: number;
}

/** List of previous chat conversations for a graph. */
export function ChatList({ graphId, onSelectChat, onNewChat, refreshKey }: ChatListProps) {
  const [chats, setChats] = useState<StoredChatMeta[]>([]);
  const [loading, setLoading] = useState(true);

  const loadChats = useCallback(async () => {
    const result = await listChatsForGraph(graphId);
    setChats(result);
    setLoading(false);
  }, [graphId]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey triggers reload
  useEffect(() => {
    loadChats();
  }, [loadChats, refreshKey]);

  const handleDelete = useCallback(async (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    await deleteChat(chatId);
    setChats((prev) => prev.filter((c) => c.id !== chatId));
  }, []);

  if (loading) {
    return <div className="py-12 text-center text-sm text-muted-foreground">Loading chats...</div>;
  }

  if (chats.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center text-sm text-muted-foreground">
        <p className="mb-3">No previous chats.</p>
        <button
          type="button"
          onClick={onNewChat}
          className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
        >
          Start a new conversation
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {chats.map((chat) => (
        <Card
          key={chat.id}
          className="group cursor-pointer hover:bg-muted/80 transition-colors"
          onClick={() => onSelectChat(chat.id)}
        >
          <div className="flex items-start justify-between gap-2 p-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-foreground truncate">{chat.title}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{timeAgo(chat.updatedAt)}</div>
            </div>
            <button
              type="button"
              onClick={(e) => handleDelete(e, chat.id)}
              className="shrink-0 rounded p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400 transition-opacity"
              title="Delete chat"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 6h18" />
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
            </button>
          </div>
        </Card>
      ))}
    </div>
  );
}
