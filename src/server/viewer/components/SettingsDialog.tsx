/**
 * Global settings dialog.
 *
 * Renders as a centered dialog on desktop and a bottom drawer on mobile.
 * Contains theme selection and chat API settings (key + model).
 */

import { MessageSquare, Moon, Palette, Settings, Sun, SunMoon, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { isApplePlatform } from '../keyboard';
import { OPEN_SETTINGS_DIALOG_EVENT } from '../lib/settings-dialog-events';
import type { ThemePreference } from '../lib/theme';
import { applyThemePreference, storeThemePreference } from '../lib/theme';
import { useThemePreference } from '../lib/use-theme-preference';
import {
  DialogOrDrawer,
  DialogOrDrawerBody,
  DialogOrDrawerClose,
  DialogOrDrawerContent,
  DialogOrDrawerDescription,
  DialogOrDrawerHeader,
  DialogOrDrawerTitle,
} from './ui/dialog-or-drawer';

interface ChatSettings {
  apiKey: string;
  model: string;
}

const STORAGE_KEY = 'treck-chat-settings';

/** Load chat settings from localStorage. */
function loadChatSettings(): ChatSettings {
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
function saveChatSettings(settings: ChatSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

const themes: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'auto', label: 'System', icon: SunMoon },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
];

/** Settings gear button that opens the global settings dialog. */
export function SettingsButton() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const requiresMeta = isApplePlatform();
      const hasModifier = requiresMeta ? e.metaKey : e.ctrlKey;
      if (!hasModifier || e.shiftKey || e.altKey) return;
      if (e.key !== ',' && e.code !== 'Comma') return;
      e.preventDefault();
      setOpen(true);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const handleOpenSettings = () => setOpen(true);
    window.addEventListener(OPEN_SETTINGS_DIALOG_EVENT, handleOpenSettings);
    return () => window.removeEventListener(OPEN_SETTINGS_DIALOG_EVENT, handleOpenSettings);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
        title="Settings"
      >
        <Settings size={14} aria-hidden />
      </button>
      <SettingsDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Global settings dialog with theme and chat configuration. */
function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { preference, mounted } = useThemePreference();
  const [chatSettings, setChatSettings] = useState<ChatSettings>(loadChatSettings);

  // Sync theme preference when dialog opens
  useEffect(() => {
    if (open && mounted) {
      // preference is already synced via useThemePreference
    }
  }, [open, mounted]);

  const setTheme = useCallback((next: ThemePreference) => {
    applyThemePreference(next);
    storeThemePreference(next);
  }, []);

  const updateChatSetting = useCallback(
    (key: keyof ChatSettings, value: string) => {
      const next = { ...chatSettings, [key]: value };
      setChatSettings(next);
      saveChatSettings(next);
    },
    [chatSettings],
  );

  return (
    <DialogOrDrawer open={open} onOpenChange={onOpenChange}>
      <DialogOrDrawerContent>
        <DialogOrDrawerHeader className="relative">
          <DialogOrDrawerTitle>Settings</DialogOrDrawerTitle>
          <DialogOrDrawerDescription>Configure your treck viewer</DialogOrDrawerDescription>
          <DialogOrDrawerClose asChild>
            <button
              type="button"
              aria-label="Close settings"
              className="absolute top-4 right-4 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              <X size={14} aria-hidden />
            </button>
          </DialogOrDrawerClose>
        </DialogOrDrawerHeader>
        <DialogOrDrawerBody>
          <div className="space-y-6">
            {/* Theme */}
            <div>
              <span className="inline-flex items-center gap-1.5 text-sm font-bold text-muted-foreground">
                <Palette size={13} aria-hidden />
                Theme
              </span>
              <div className="mt-2 flex gap-2">
                {themes.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTheme(value)}
                    className={`flex-1 flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
                      preference === value
                        ? 'border-foreground bg-muted text-foreground'
                        : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                  >
                    <Icon size={14} />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Chat API settings */}
            <div className="space-y-3">
              <span className="inline-flex items-center gap-1.5 text-sm font-bold text-muted-foreground">
                <MessageSquare size={13} aria-hidden />
                Chat
              </span>
              <div>
                <label htmlFor="settings-api-key" className="text-xs text-muted-foreground">
                  API Key
                </label>
                <input
                  id="settings-api-key"
                  type="password"
                  value={chatSettings.apiKey}
                  onChange={(e) => updateChatSetting('apiKey', e.target.value)}
                  placeholder="sk-..."
                  className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="settings-model" className="text-xs text-muted-foreground">
                  Model (optional)
                </label>
                <input
                  id="settings-model"
                  type="text"
                  value={chatSettings.model}
                  onChange={(e) => updateChatSetting('model', e.target.value)}
                  placeholder="claude-haiku-4-5-20251001"
                  className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
          </div>
        </DialogOrDrawerBody>
      </DialogOrDrawerContent>
    </DialogOrDrawer>
  );
}
