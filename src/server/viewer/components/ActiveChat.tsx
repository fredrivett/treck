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

/** Typed tool part from the AI SDK message stream. */
interface ToolPart {
  type: string;
  toolCallId: string;
  state: 'call' | 'partial-call' | 'result' | 'output-available';
  args?: Record<string, unknown>;
  output?: unknown;
}

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
  /** Original creation timestamp (when resuming a saved chat). Defaults to now. */
  createdAt?: number;
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

/** Small inline spinner for in-progress tool calls. */
function InlineSpinner() {
  return (
    <div className="w-3 h-3 border-[1.5px] border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin shrink-0" />
  );
}

/** Standalone tool call indicator rendered outside chat bubbles. */
function ToolCallIndicator({
  part,
  onSelectNode,
}: {
  part: ToolPart;
  onSelectNode: (ids: string[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLoading = part.state === 'call' || part.state === 'partial-call';
  const toolName = part.type.replace(/^tool-/, '');

  if (toolName === 'search_nodes') {
    const query = (part.args as { query?: string })?.query;
    if (isLoading) {
      return (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground px-2 py-1">
          <InlineSpinner />
          <span>Searching for &ldquo;{query}&rdquo;&hellip;</span>
        </div>
      );
    }
    const results = (part.output as Array<{ id: string; name: string; filePath: string }>) ?? [];
    const count = results.length;
    return (
      <div className="px-2 py-1">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <span className={`transition-transform ${expanded ? 'rotate-90' : ''}`}>&#9656;</span>
          Found {count} result{count !== 1 ? 's' : ''}
          {query ? ` for "${query}"` : ''}
        </button>
        {expanded && results.length > 0 && (
          <div className="mt-1 ml-3 space-y-0.5">
            {results.slice(0, 10).map((r) => (
              <div key={r.id} className="text-xs text-muted-foreground truncate" title={r.id}>
                <span className="text-foreground/70">{r.name}</span>
                <span className="ml-1 opacity-50">{r.filePath}</span>
              </div>
            ))}
            {results.length > 10 && (
              <div className="text-xs text-muted-foreground opacity-50">
                +{results.length - 10} more
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  if (toolName === 'select_nodes') {
    if (isLoading) {
      const nodeIds = (part.args as { node_ids?: string[] })?.node_ids;
      return (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground px-2 py-1">
          <InlineSpinner />
          <span>
            Selecting {nodeIds?.length ?? ''} node{nodeIds?.length !== 1 ? 's' : ''}&hellip;
          </span>
        </div>
      );
    }
    const output = part.output as { selected?: string[] } | undefined;
    const selected = output?.selected ?? [];
    if (selected.length === 0) return null;
    return (
      <div className="px-2 py-1 flex flex-wrap gap-1">
        {selected.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => onSelectNode([id])}
            className="inline-flex items-center rounded-full bg-blue-100 dark:bg-blue-900 px-2 py-0.5 text-xs text-blue-800 dark:text-blue-200 hover:bg-blue-200 dark:hover:bg-blue-800"
            title={id}
          >
            {id.split(':').pop()}
          </button>
        ))}
      </div>
    );
  }

  // Unknown tool — show generic indicator
  if (isLoading) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground px-2 py-1">
        <InlineSpinner />
        <span>{toolName}&hellip;</span>
      </div>
    );
  }
  return <div className="text-xs text-muted-foreground px-2 py-1">{toolName} complete</div>;
}

/** A segment of an assistant message — either consecutive text or a single tool call. */
type MessageSegment =
  | { kind: 'text'; key: string; text: string }
  | { kind: 'tool'; key: string; part: ToolPart };

/**
 * Split an assistant message's parts into segments for rendering.
 *
 * Groups consecutive text parts into a single text segment; each tool
 * part becomes its own segment. This allows text to render in bubbles
 * and tool calls to render as standalone indicators between them.
 */
function segmentAssistantParts(msgId: string, parts: UIMessage['parts']): MessageSegment[] {
  const segments: MessageSegment[] = [];
  let pendingText = '';

  const flushText = () => {
    if (pendingText) {
      segments.push({ kind: 'text', key: `${msgId}-text-${segments.length}`, text: pendingText });
      pendingText = '';
    }
  };

  for (const part of parts) {
    if (part.type === 'text') {
      const textPart = part as { type: 'text'; text: string };
      if (textPart.text) {
        if (pendingText) pendingText += '\n';
        pendingText += textPart.text;
      }
    } else if (part.type.startsWith('tool-')) {
      flushText();
      const toolPart = part as unknown as ToolPart;
      segments.push({ kind: 'tool', key: toolPart.toolCallId, part: toolPart });
    }
  }
  flushText();

  return segments;
}

/** Active chat conversation with message thread and input. */
export function ActiveChat({
  chatId,
  initialMessages,
  graphId,
  createdAt,
  project,
  settings,
  onChatUpdated,
}: ActiveChatProps) {
  const [, setSearchParams] = useSearchParams();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const createdAtRef = useRef(createdAt ?? Date.now());

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
            if (msg.role === 'user') {
              const textContent = msg.parts
                .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
                .map((p) => p.text)
                .join('\n');
              if (!textContent) return null;
              return (
                <div key={msg.id} className="flex justify-end">
                  <div className="max-w-[85%] rounded-lg px-3 py-2 text-sm bg-blue-600 text-white">
                    <div className="whitespace-pre-wrap">{textContent}</div>
                  </div>
                </div>
              );
            }

            // Assistant: split into segments (text bubbles + tool indicators)
            const segments = segmentAssistantParts(msg.id, msg.parts);
            if (segments.length === 0) return null;

            return (
              <div key={msg.id} className="space-y-2">
                {segments.map((seg) => {
                  if (seg.kind === 'tool') {
                    return (
                      <ToolCallIndicator
                        key={seg.key}
                        part={seg.part}
                        onSelectNode={applySelection}
                      />
                    );
                  }
                  return (
                    <div key={seg.key} className="flex justify-start">
                      <div className="max-w-[85%] rounded-lg px-3 py-2 text-sm bg-muted text-foreground">
                        <ChatMarkdown content={seg.text} />
                      </div>
                    </div>
                  );
                })}
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
