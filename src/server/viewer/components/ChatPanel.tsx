/**
 * Chat panel for AI-powered code navigation.
 *
 * Orchestrates between a chat list view (previous conversations) and an active
 * chat view (message thread). On desktop, renders as an inline sidebar that
 * pushes the graph view. On mobile, renders as a bottom drawer overlay.
 * Chats are persisted in IndexedDB and scoped to the current graph.
 */

import type { UIMessage } from 'ai';
import { MessageSquare } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useMediaQuery } from 'usehooks-ts';
import { loadChat } from '../lib/chat-store';
import { requestOpenSettingsDialog } from '../lib/settings-dialog-events';
import { ActiveChat } from './ActiveChat';
import { ChatList } from './ChatList';
import { Button } from './ui/button';
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card';
import { Kbd } from './ui/kbd';
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

interface ChatPanelProps {
  /** Called when the panel should close. */
  onClose: () => void;
  /** Showcase project slug — passed to the chat API so it can load the correct graph. */
  project?: string;
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

/** Back arrow icon. */
function BackIcon() {
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
      <path d="M19 12H5" />
      <path d="M12 19l-7-7 7-7" />
    </svg>
  );
}

/** New chat plus icon. */
function PlusIcon() {
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
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

/** AI chat panel with chat list and active conversation views. */
export function ChatPanel({ onClose, project }: ChatPanelProps) {
  const isDesktop = useMediaQuery('(min-width: 768px)', {
    defaultValue: true,
    initializeWithValue: false,
  });

  const [settings, setSettings] = useState<ChatSettings>(loadSettings);

  // Re-read settings when changed from the global settings dialog
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setSettings(loadSettings());
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // Also poll for same-tab changes (storage event only fires cross-tab)
  useEffect(() => {
    const id = setInterval(() => {
      const fresh = loadSettings();
      if (fresh.apiKey !== settings.apiKey || fresh.model !== settings.model) {
        setSettings(fresh);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [settings]);

  // Chat navigation state
  const [view, setView] = useState<'list' | 'chat'>('list');
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [activeChatCreatedAt, setActiveChatCreatedAt] = useState<number | undefined>();
  const [listRefreshKey, setListRefreshKey] = useState(0);

  const graphId = project || 'local';

  /** Start a new chat conversation. */
  const handleNewChat = useCallback(() => {
    setActiveChatId(crypto.randomUUID());
    setInitialMessages([]);
    setActiveChatCreatedAt(undefined);
    setView('chat');
  }, []);

  /** Select an existing chat from the list. */
  const handleSelectChat = useCallback(async (chatId: string) => {
    const chat = await loadChat(chatId);
    if (chat) {
      setActiveChatId(chatId);
      setInitialMessages(chat.messages);
      setActiveChatCreatedAt(chat.createdAt);
      setView('chat');
    }
  }, []);

  /** Return to the chat list. */
  const handleBack = useCallback(() => {
    setView('list');
    setActiveChatId(null);
    setInitialMessages([]);
    setActiveChatCreatedAt(undefined);
    setListRefreshKey((k) => k + 1);
  }, []);

  /** Called when a chat is saved (title update, etc). */
  const handleChatUpdated = useCallback(() => {
    // The list will refresh when we navigate back
  }, []);

  // Header varies based on current view
  const header = (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5">
        {view === 'chat' && (
          <button
            type="button"
            onClick={handleBack}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Back to chat list"
          >
            <BackIcon />
          </button>
        )}
        <h2 className="inline-flex items-center gap-1.5 font-semibold">
          <MessageSquare size={13} aria-hidden />
          Chat
        </h2>
      </div>
      <div className="flex items-center gap-1">
        {view === 'list' && settings.apiKey && (
          <button
            type="button"
            onClick={handleNewChat}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="New chat"
          >
            <PlusIcon />
          </button>
        )}
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

  // Body content: either no-API-key prompt, chat list, or active chat
  const body = (
    <>
      {/* No API key prompt */}
      {!settings.apiKey && (
        <div className="flex items-center justify-center">
          <Card className="w-full max-w-sm">
            <CardHeader className="pb-2">
              <CardTitle>Missing API key</CardTitle>
              <CardDescription>Add an API key in settings to start chatting.</CardDescription>
            </CardHeader>
            <CardFooter>
              <Button type="button" onClick={requestOpenSettingsDialog} variant="inverse">
                Open settings <Kbd mod variant="inverse">,</Kbd>
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}
      {settings.apiKey && view === 'list' && (
        <div className="flex-1 overflow-y-auto">
          <ChatList
            graphId={graphId}
            onSelectChat={handleSelectChat}
            onNewChat={handleNewChat}
            refreshKey={listRefreshKey}
          />
        </div>
      )}
    </>
  );

  // Desktop: inline panel as a flex column
  if (isDesktop) {
    return (
      <div className="w-[400px] min-w-[400px] h-full flex flex-col border-l border-border bg-background">
        <div className="flex flex-col gap-0.5 p-4 md:gap-1.5">
          {header}
          {description}
        </div>
        {view === 'chat' && activeChatId && settings.apiKey ? (
          <ActiveChat
            key={activeChatId}
            chatId={activeChatId}
            initialMessages={initialMessages}
            graphId={graphId}
            createdAt={activeChatCreatedAt}
            project={project}
            settings={settings}
            onChatUpdated={handleChatUpdated}
          />
        ) : (
          <div className="flex-1 overflow-y-auto px-4 pb-4">{body}</div>
        )}
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
        <DrawerBody>
          {view === 'chat' && activeChatId && settings.apiKey ? (
            <ActiveChat
              key={activeChatId}
              chatId={activeChatId}
              initialMessages={initialMessages}
              graphId={graphId}
              project={project}
              settings={settings}
              onChatUpdated={handleChatUpdated}
            />
          ) : (
            body
          )}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
