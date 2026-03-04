import { Moon, Sun, SunMoon } from 'lucide-react';
import { useMemo } from 'react';
import { useThemePreference } from '../lib/use-theme-preference';

/** Theme toggle button that cycles through auto -> light -> dark. */
export function ThemeToggle() {
  const { mounted, preference, toggle } = useThemePreference();

  const icon = useMemo(() => {
    switch (preference) {
      case 'light':
        return <Sun size={14} aria-hidden />;
      case 'dark':
        return <Moon size={14} aria-hidden />;
      default:
        return <SunMoon size={14} aria-hidden />;
    }
  }, [preference]);

  const label =
    preference === 'auto' ? 'Auto theme' : preference === 'light' ? 'Light theme' : 'Dark theme';

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={!mounted}
      aria-label={`Set ${label}`}
      title={preference === 'auto' ? 'system' : preference}
      className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default"
    >
      {icon}
    </button>
  );
}
