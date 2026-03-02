import { Menu } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { useMediaQuery } from 'usehooks-ts';
import { Sidebar } from './Sidebar';
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from './ui/drawer';

/** Props for the {@link ViewerShell} component. */
interface ViewerShellProps {
  /** Content rendered inside the sidebar (desktop) or drawer (mobile). */
  sidebarContent: ReactNode;
  /** Main content area. */
  children: ReactNode;
  /** Title for the mobile drawer (screen-reader only). */
  drawerTitle?: string;
  /** Description for the mobile drawer (screen-reader only). */
  drawerDescription?: string;
  /** Additional class names on the root container. */
  className?: string;
  /** When this value changes, the mobile sidebar closes automatically (e.g. route pathname). */
  closeTrigger?: unknown;
}

/**
 * Responsive shell layout shared by the server viewer and showcase viewer.
 *
 * Renders a fixed sidebar on desktop and a slide-out drawer on mobile,
 * with a hamburger button to open it. The consumer provides sidebar content
 * and main content as children.
 */
export function ViewerShell({
  sidebarContent,
  children,
  drawerTitle = 'Navigation',
  drawerDescription = 'Sidebar navigation and graph controls',
  className,
  closeTrigger,
}: ViewerShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isDesktop = useMediaQuery('(min-width: 768px)', {
    defaultValue: true,
    initializeWithValue: false,
  });

  /** Close the mobile sidebar when closeTrigger changes (e.g. route navigation). */
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally reacts to closeTrigger changes
  useEffect(() => {
    setSidebarOpen(false);
  }, [closeTrigger]);

  return (
    <div className={className ? `flex h-full ${className}` : 'flex h-full'}>
      {isDesktop ? (
        <Sidebar>{sidebarContent}</Sidebar>
      ) : (
        <Drawer direction="left" open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <DrawerContent className="w-[280px] max-w-[80vw]">
            <DrawerTitle className="sr-only">{drawerTitle}</DrawerTitle>
            <DrawerDescription className="sr-only">{drawerDescription}</DrawerDescription>
            <div className="flex flex-col h-full overflow-hidden">{sidebarContent}</div>
          </DrawerContent>
        </Drawer>
      )}
      <main className="flex-1 relative overflow-hidden">
        {!isDesktop && (
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="absolute top-3 left-3 z-10 rounded-md p-2 bg-background border border-border text-muted-foreground hover:text-foreground hover:bg-muted"
            aria-label="Open sidebar"
          >
            <Menu size={18} />
          </button>
        )}
        {children}
      </main>
    </div>
  );
}
