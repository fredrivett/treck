import { getModifierKeySymbol } from '../../keyboard';

/** Keyboard shortcut hint badge — renders a styled `<kbd>` element. */
export function Kbd({
  children,
  mod,
  variant = 'default',
}: {
  children: React.ReactNode;
  mod?: boolean;
  variant?: 'default' | 'inverse';
}) {
  const styles =
    variant === 'inverse'
      ? 'border-transparent bg-background/20 text-background/70'
      : 'border-border bg-muted text-muted-foreground';

  return (
    <kbd
      className={`inline-flex items-center justify-center min-w-[1.25rem] h-[1.125rem] px-1 rounded border text-[10px] font-mono leading-none ${styles}`}
    >
      {mod && getModifierKeySymbol()}
      {children}
    </kbd>
  );
}
