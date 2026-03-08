/**
 * Active chat conversation view.
 *
 * Renders the message thread, input area, and handles the useChat hook.
 * Extracted from ChatPanel to allow keyed remounting when switching chats.
 * Persists messages to IndexedDB after each completed exchange.
 */

import { useChat } from '@ai-sdk/react';
import type { UIMessage } from 'ai';
import { DefaultChatTransport } from 'ai';
import { marked } from 'marked';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { deriveTitle, type StoredChat, saveChat } from '../lib/chat-store';
import { LoadingEllipsis } from './LoadingEllipsis';
import { Card } from './ui/card';

interface ChatSettings {
  apiKey: string;
  model: string;
}

interface ActiveChatProps {
  /** Unique ID for this chat conversation. */
  chatId: string;
  /** Initial messages to populate (when resuming a saved chat). */
  initialMessages: UIMessage[];
  /** Graph identifier for persistence. */
  graphId: string;
  /** Showcase project slug — passed to the chat API. */
  project?: string;
  /** Current chat settings (API key, model). */
  settings: ChatSettings;
  /** Called when the chat's title or messages change (for parent list updates). */
  onChatUpdated?: (meta: { id: string; title: string }) => void;
}

/** Renders markdown content from assistant messages. */
function ChatMarkdown({ content }: { content: string }) {
  const html = marked.parse(content, { async: false }) as string;
  return (
    <div
      className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: rendered from markdown via marked
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** Active chat conversation with message thread and input. */
export function ActiveChat({
  chatId,
  initialMessages,
  graphId,
  project,
  settings,
  onChatUpdated,
}: ActiveChatProps) {
  const [, setSearchParams] = useSearchParams();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const createdAtRef = useRef(Date.now());

  // Refs to avoid stale closures in transport body function
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const projectRef = useRef(project);
  projectRef.current = project;

  // Stable transport instance — body is resolved per-request via refs
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        body: () => ({
          apiKey: settingsRef.current.apiKey,
          model: settingsRef.current.model || undefined,
          project: projectRef.current ?? undefined,
        }),
      }),
    [],
  );

  /** Apply selected node IDs to the URL params (same as clicking nodes). */
  const applySelection = useCallback(
    (nodeIds: string[]) => {
      if (nodeIds.length === 0) return;
      setSearchParams((prev) => {
        const encoded = nodeIds.map(encodeURIComponent).join(',');
        prev.set('selected', encoded);
        prev.set('focused', encoded);
        return prev;
      });
    },
    [setSearchParams],
  );

  const { messages, sendMessage, status } = useChat({
    transport,
    messages: initialMessages,
  });

  const isLoading = status === 'submitted' || status === 'streaming';

  // Apply node selection when select_nodes tool results arrive
  const appliedToolCallsRef = useRef(new Set<string>());
  useEffect(() => {
    for (const msg of messages) {
      if (msg.role !== 'assistant') continue;
      for (const part of msg.parts) {
        const typedPart = part as {
          type: string;
          toolCallId?: string;
          state?: string;
          output?: unknown;
        };
        if (
          typedPart.type === 'tool-select_nodes' &&
          typedPart.state === 'output-available' &&
          typedPart.toolCallId &&
          !appliedToolCallsRef.current.has(typedPart.toolCallId)
        ) {
          appliedToolCallsRef.current.add(typedPart.toolCallId);
          const output = typedPart.output as { selected?: string[] };
          if (output?.selected && output.selected.length > 0) {
            applySelection(output.selected);
          }
        }
      }
    }
  }, [messages, applySelection]);

  // Persist messages to IndexedDB after each completed exchange
  const onChatUpdatedRef = useRef(onChatUpdated);
  onChatUpdatedRef.current = onChatUpdated;
  useEffect(() => {
    if (status !== 'ready' || messages.length === 0) return;

    const firstUserMsg = messages.find((m) => m.role === 'user');
    const firstUserText = firstUserMsg?.parts
      .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join(' ');
    const title = deriveTitle(firstUserText || 'New chat');

    const chat: StoredChat = {
      id: chatId,
      graphId,
      title,
      messages,
      createdAt: createdAtRef.current,
      updatedAt: Date.now(),
    };
    saveChat(chat);
    onChatUpdatedRef.current?.({ id: chatId, title });
  }, [status, messages, chatId, graphId]);

  // Auto-scroll to bottom when messages change
  // biome-ignore lint/correctness/useExhaustiveDependencies: messages triggers the scroll intentionally
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when panel mounts
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  /** Send the current input as a message. */
  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput('');
    sendMessage({ text });
  }, [input, isLoading, sendMessage]);

  /** Handle keyboard shortcuts in the input. */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  /** Extract selected node IDs from a message's tool parts. */
  const getSelectedNodeIds = useCallback((msg: UIMessage): string[] => {
    const ids: string[] = [];
    for (const part of msg.parts) {
      const typedPart = part as { type: string; state?: string; output?: unknown };
      if (typedPart.type === 'tool-select_nodes' && typedPart.state === 'output-available') {
        const output = typedPart.output as { selected?: string[] };
        if (output?.selected) {
          ids.push(...output.selected);
        }
      }
    }
    return ids;
  }, []);

  return (
    <>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="space-y-4">
          {messages.length === 0 && !isLoading && (
            <Card className="p-3 text-center text-sm text-muted-foreground">
              Ask a question about your codebase to get started.
            </Card>
          )}
          {messages.map((msg) => {
            const selectedNodeIds = msg.role === 'assistant' ? getSelectedNodeIds(msg) : [];
            const textContent = msg.parts
              .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
              .map((p) => p.text)
              .join('\n');

            if (!textContent && selectedNodeIds.length === 0) return null;

            return (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-muted text-foreground'
                  }`}
                >
                  {textContent &&
                    (msg.role === 'user' ? (
                      <div className="whitespace-pre-wrap">{textContent}</div>
                    ) : (
                      <ChatMarkdown content={textContent} />
                    ))}
                  {selectedNodeIds.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {selectedNodeIds.map((id) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => applySelection([id])}
                          className="inline-flex items-center rounded-full bg-blue-100 dark:bg-blue-900 px-2 py-0.5 text-xs text-blue-800 dark:text-blue-200 hover:bg-blue-200 dark:hover:bg-blue-800"
                          title={id}
                        >
                          {id.split(':').pop()}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {status === 'submitted' && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                Thinking
                <LoadingEllipsis />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="border-t border-border p-4">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your code..."
            rows={1}
            className="flex-1 resize-none rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
            disabled={isLoading}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground">
          Press Enter to send, Shift+Enter for newline
        </div>
      </div>
    </>
  );
}
