import { getModifierKeySymbol } from '../../keyboard';

/** Keyboard shortcut hint badge — renders a styled `<kbd>` element. */
export function Kbd({ children, mod }: { children: React.ReactNode; mod?: boolean }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[1.25rem] h-[1.125rem] px-1 rounded border border-border bg-muted text-[10px] font-mono text-muted-foreground leading-none">
      {mod && getModifierKeySymbol()}
      {children}
    </kbd>
  );
}
