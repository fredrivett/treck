/**
 * Chat panel for AI-powered code navigation.
 *
 * Renders a right-side Sheet panel where users can ask questions about their
 * codebase. Sends messages to the treck server's /api/chat endpoint, which
 * proxies to an OpenAI-compatible LLM API. When the AI selects nodes, the
 * graph view updates to highlight them.
 */

import { marked } from 'marked';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  SheetOrDrawer,
  SheetOrDrawerBody,
  SheetOrDrawerClose,
  SheetOrDrawerContent,
  SheetOrDrawerDescription,
  SheetOrDrawerHeader,
  SheetOrDrawerTitle,
} from './ui/sheet-or-drawer';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  selectedNodeIds?: string[];
}

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
  /** Whether the panel is open. */
  open: boolean;
  /** Called when the panel should close. */
  onOpenChange: (open: boolean) => void;
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

/** AI chat panel for code navigation questions. */
export function ChatPanel({ open, onOpenChange }: ChatPanelProps) {
  const [, setSearchParams] = useSearchParams();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<ChatSettings>(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when messages change
  // biome-ignore lint/correctness/useExhaustiveDependencies: messages triggers the scroll intentionally
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

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

  /** Send a message to the chat API. */
  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    if (!settings.apiKey) {
      setShowSettings(true);
      return;
    }

    const userMessage: ChatMessage = { role: 'user', content: text };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
          apiKey: settings.apiKey,
          model: settings.model || undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        setMessages([
          ...newMessages,
          { role: 'assistant', content: `Error: ${error.error || 'Request failed'}` },
        ]);
        return;
      }

      const data = await response.json();
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: data.message,
        selectedNodeIds: data.selectedNodeIds?.length > 0 ? data.selectedNodeIds : undefined,
      };
      setMessages([...newMessages, assistantMessage]);

      // Apply node selection to the graph
      if (data.selectedNodeIds?.length > 0) {
        applySelection(data.selectedNodeIds);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setMessages([...newMessages, { role: 'assistant', content: `Error: ${errorMsg}` }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, settings, applySelection]);

  /** Handle keyboard shortcuts in the input. */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage],
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

  return (
    <SheetOrDrawer open={open} onOpenChange={onOpenChange}>
      <SheetOrDrawerContent>
        <SheetOrDrawerHeader>
          <div className="flex items-center justify-between">
            <SheetOrDrawerTitle>Chat</SheetOrDrawerTitle>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShowSettings(!showSettings)}
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
              <SheetOrDrawerClose className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
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
              </SheetOrDrawerClose>
            </div>
          </div>
          <SheetOrDrawerDescription>Ask questions about your codebase</SheetOrDrawerDescription>
        </SheetOrDrawerHeader>

        <SheetOrDrawerBody>
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
              {messages.length === 0 && !loading && (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  Ask a question about your codebase to get started.
                </div>
              )}
              {messages.map((msg, i) => (
                <div
                  key={`${msg.role}-${i}`}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                      msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-muted text-foreground'
                    }`}
                  >
                    {msg.role === 'user' ? (
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                    ) : (
                      <ChatMarkdown content={msg.content} />
                    )}
                    {msg.selectedNodeIds && msg.selectedNodeIds.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {msg.selectedNodeIds.map((id) => (
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
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                    Thinking...
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </SheetOrDrawerBody>

        {/* Input */}
        {settings.apiKey && (
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
                disabled={loading}
              />
              <button
                type="button"
                onClick={sendMessage}
                disabled={loading || !input.trim()}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Send
              </button>
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              Press Enter to send, Shift+Enter for newline
            </div>
          </div>
        )}
      </SheetOrDrawerContent>
    </SheetOrDrawer>
  );
}
