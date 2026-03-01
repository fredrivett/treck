import type { ReactNode } from 'react';

interface SidebarProps {
  children: ReactNode;
}

export function Sidebar({ children }: SidebarProps) {
  return (
    <div className="bg-background border-r border-border w-[280px] min-w-[280px] h-full flex flex-col overflow-hidden">
      {children}
    </div>
  );
}
