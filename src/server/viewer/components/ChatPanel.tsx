/**
 * Chat panel for AI-powered code navigation.
 *
 * On desktop, renders as an inline sidebar that pushes the graph view.
 * On mobile, renders as a bottom drawer overlay. Uses the Vercel AI SDK's
 * useChat hook for streaming responses. When the AI selects nodes via
 * tool calls, the graph view updates to highlight them.
 */

import { useChat } from '@ai-sdk/react';
import type { UIMessage } from 'ai';
import { DefaultChatTransport } from 'ai';
import { marked } from 'marked';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useMediaQuery } from 'usehooks-ts';
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
} from './ui/drawer';

interface ChatSettings {
  apiKey: string;
  model: string;
}

const STORAGE_KEY = 'treck-chat-settings';

/** Load chat settings from localStorage. */
function loadSettings(): ChatSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { apiKey: '', model: '', ...JSON.parse(stored) };
    }
  } catch {
    // ignore
  }
  return { apiKey: '', model: '' };
}

/** Save chat settings to localStorage. */
function saveSettings(settings: ChatSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

interface ChatPanelProps {
  /** Called when the panel should close. */
  onClose: () => void;
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

/** Settings gear icon button. */
function SettingsButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
      title="Settings"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    </button>
  );
}

/** Close X icon. */
function CloseIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </svg>
  );
}

/** AI chat panel for code navigation questions. */
export function ChatPanel({ onClose }: ChatPanelProps) {
  const isDesktop = useMediaQuery('(min-width: 768px)', {
    defaultValue: true,
    initializeWithValue: false,
  });

  const [, setSearchParams] = useSearchParams();
  const [input, setInput] = useState('');
  const [settings, setSettings] = useState<ChatSettings>(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Ref to avoid stale closures in transport body function
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Stable transport instance — body is resolved per-request via ref
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        body: () => ({
          apiKey: settingsRef.current.apiKey,
          model: settingsRef.current.model || undefined,
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

    if (!settings.apiKey) {
      setShowSettings(true);
      return;
    }

    setInput('');
    sendMessage({ text });
  }, [input, isLoading, settings.apiKey, sendMessage]);

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

  /** Update and persist a settings field. */
  const updateSetting = useCallback(
    (key: keyof ChatSettings, value: string) => {
      const next = { ...settings, [key]: value };
      setSettings(next);
      saveSettings(next);
    },
    [settings],
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

  // Shared inner content (used by both desktop and mobile)
  const header = (
    <div className="flex items-center justify-between">
      <h2 className="font-semibold">Chat</h2>
      <div className="flex items-center gap-1">
        <SettingsButton onClick={() => setShowSettings(!showSettings)} />
        {isDesktop ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <CloseIcon />
          </button>
        ) : (
          <DrawerClose className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
            <CloseIcon />
          </DrawerClose>
        )}
      </div>
    </div>
  );

  const description = (
    <p className="text-muted-foreground text-sm">Ask questions about your codebase</p>
  );

  const body = (
    <>
      {/* Settings panel */}
      {showSettings && (
        <div className="mb-4 space-y-3 rounded-md border border-border p-3">
          <div>
            <label htmlFor="chat-api-key" className="text-xs font-medium text-muted-foreground">
              API Key
            </label>
            <input
              id="chat-api-key"
              type="password"
              value={settings.apiKey}
              onChange={(e) => updateSetting('apiKey', e.target.value)}
              placeholder="sk-..."
              className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="chat-model" className="text-xs font-medium text-muted-foreground">
              Model (optional)
            </label>
            <input
              id="chat-model"
              type="text"
              value={settings.model}
              onChange={(e) => updateSetting('model', e.target.value)}
              placeholder="claude-haiku-4-5-20251001"
              className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>
      )}

      {/* No API key prompt */}
      {!settings.apiKey && !showSettings && (
        <div className="flex flex-col items-center justify-center py-12 text-center text-sm text-muted-foreground">
          <p className="mb-2">Enter an API key to start chatting.</p>
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            Open settings
          </button>
        </div>
      )}

      {/* Messages */}
      {settings.apiKey && (
        <div className="space-y-4">
          {messages.length === 0 && !isLoading && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Ask a question about your codebase to get started.
            </div>
          )}
          {messages.map((msg) => {
            const selectedNodeIds = msg.role === 'assistant' ? getSelectedNodeIds(msg) : [];
            const textContent = msg.parts
              .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
              .map((p) => p.text)
              .join('\n');

            // Skip messages with no visible content
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
                Thinking...
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}
    </>
  );

  const inputArea = settings.apiKey && (
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
  );

  // Desktop: inline panel as a flex column
  if (isDesktop) {
    return (
      <div className="w-[400px] min-w-[400px] h-full flex flex-col border-l border-border bg-background">
        <div className="flex flex-col gap-0.5 p-4 md:gap-1.5">
          {header}
          {description}
        </div>
        <div className="flex-1 overflow-y-auto p-4">{body}</div>
        {inputArea}
      </div>
    );
  }

  // Mobile: drawer overlay
  return (
    <Drawer open onOpenChange={(v) => !v && onClose()}>
      <DrawerContent>
        <DrawerHeader>
          {header}
          <DrawerDescription>Ask questions about your codebase</DrawerDescription>
        </DrawerHeader>
        <DrawerBody>{body}</DrawerBody>
        {inputArea}
      </DrawerContent>
    </Drawer>
  );
}
