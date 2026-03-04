import type { LucideIcon } from 'lucide-react';
import { FileText, Workflow } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { ThemeToggle } from './ThemeToggle';

function NavLink({
  to,
  label,
  icon: Icon,
  isActive,
}: {
  to: string;
  label: string;
  icon: LucideIcon;
  isActive: boolean;
}) {
  return (
    <Link
      to={to}
      className={`flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors no-underline ${
        isActive
          ? 'bg-muted text-foreground'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
      }`}
    >
      <Icon size={14} />
      {label}
    </Link>
  );
}

/** Sidebar header with project name, theme toggle, and Graph/Docs navigation. */
export function ViewNav() {
  const location = useLocation();
  const isGraph = location.pathname === '/' || location.pathname === '';
  const isDocs = location.pathname.startsWith('/docs');

  return (
    <div className="p-4 border-b border-border">
      <div className="flex items-center justify-between mb-3">
        <div className="font-bold text-sm text-foreground">treck</div>
        <ThemeToggle />
      </div>
      <div className="flex gap-1">
        <NavLink to="/" label="Graph" icon={Workflow} isActive={isGraph} />
        <NavLink to="/docs" label="Docs" icon={FileText} isActive={isDocs} />
      </div>
    </div>
  );
}
