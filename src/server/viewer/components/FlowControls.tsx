import { type ChangeEvent, useEffect, useRef } from 'react';
import { isApplePlatform } from '../keyboard';
import { getCategoryLabel, type NodeCategory } from './FlowGraph';
import { Kbd } from './ui/kbd';

interface FlowControlsProps {
  loading: boolean;
  searchQuery: string;
  onSearch: (query: string) => void;
  nodeCount: number;
  edgeCount: number;
  availableTypes: Map<NodeCategory, number>;
  enabledTypes: Set<NodeCategory> | null;
  onToggleType: (category: NodeCategory) => void;
  onSoloType: (category: NodeCategory) => void;
  onResetTypes: () => void;
  showConditionals: boolean;
  onToggleConditionals: () => void;
  hasConditionalEdges: boolean;
}

/** Graph filtering controls: search, node stats, type filters, conditionals toggle. */
export function FlowControls({
  loading,
  searchQuery,
  onSearch,
  nodeCount,
  edgeCount,
  availableTypes,
  enabledTypes,
  onToggleType,
  onSoloType,
  onResetTypes,
  showConditionals,
  onToggleConditionals,
  hasConditionalEdges,
}: FlowControlsProps) {
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        const input = searchRef.current;
        if (input) {
          input.focus();
          input.setSelectionRange(input.value.length, input.value.length);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="p-4">
      <div className="relative mb-3">
        <input
          ref={searchRef}
          type="text"
          placeholder="Search nodes..."
          value={searchQuery}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') e.currentTarget.blur();
          }}
          className={`peer w-full px-2.5 py-2 ${isApplePlatform() ? 'pr-10' : 'pr-16'} focus:pr-2.5 border border-border rounded-md text-[13px] outline-none bg-background text-foreground`}
        />
        {searchQuery && (
          <button
            type="button"
            aria-label="Clear search"
            onMouseDown={(e) => {
              e.preventDefault();
              onSearch('');
            }}
            className="absolute right-2 inset-y-0 items-center bg-transparent border-none p-0 cursor-pointer text-muted-foreground hover:text-foreground hidden peer-focus:flex"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        )}
        <div className="absolute right-2 inset-y-0 flex items-center pointer-events-none peer-focus:hidden">
          <Kbd mod>K</Kbd>
        </div>
      </div>

      {!loading && (
        <div className="text-[11px] text-muted-foreground mb-3">
          {nodeCount} nodes, {edgeCount} edges
        </div>
      )}

      {!loading && availableTypes.size > 0 && (
        <div className="mb-3">
          <div className="text-xs font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
            <span>Node Types</span>
            {enabledTypes && (
              <button
                type="button"
                onClick={onResetTypes}
                className="bg-transparent border-none p-0 text-[11px] text-muted-foreground cursor-pointer font-normal"
              >
                reset
              </button>
            )}
          </div>
          <div className="flex flex-col gap-1">
            {Array.from(availableTypes.entries()).map(([category, count]) => {
              const checked = !enabledTypes || enabledTypes.has(category);
              return (
                <div
                  key={category}
                  className="group flex items-center gap-1.5 text-xs text-foreground"
                >
                  <label className="flex items-center gap-1.5 cursor-pointer flex-1 min-w-0">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggleType(category)}
                      className="m-0 shrink-0"
                    />
                    <span>{getCategoryLabel(category)}</span>
                    <span className="text-muted-foreground text-[11px]">({count})</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => onSoloType(category)}
                    className="bg-transparent border-none px-0.5 py-0 text-[11px] text-muted-foreground cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity duration-100"
                  >
                    only
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!loading && hasConditionalEdges && (
        <div className="mb-3">
          <label className="flex items-center gap-1.5 text-xs text-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={showConditionals}
              onChange={onToggleConditionals}
              className="m-0 shrink-0"
            />
            <span>Show conditionals</span>
          </label>
        </div>
      )}
    </div>
  );
}
