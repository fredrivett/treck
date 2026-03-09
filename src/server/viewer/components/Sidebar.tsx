import type { ReactNode } from 'react';

interface SidebarProps {
  children: ReactNode;
}

/** Left sidebar shell — width is controlled by the parent resizable panel. */
export function Sidebar({ children }: SidebarProps) {
  return <div className="bg-background h-full flex flex-col overflow-hidden">{children}</div>;
}
