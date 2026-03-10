import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import { isApplePlatform } from '../keyboard';
import { getCategoryColors, getCategoryLabel, type NodeCategory } from './node-categories';
import { Kbd } from './ui/kbd';

/** Debounce delay (ms) for search input updates. */
const SEARCH_DEBOUNCE_MS = 150;

/** Summary counts for the diff toggle display. */
export interface DiffSummary {
  modified: number;
  added: number;
  removed: number;
}

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
  diffEnabled: boolean;
  onToggleDiff: () => void;
  baseRef: string | null;
  diffSummary: DiffSummary | null;
  diffDepth: number;
  diffMaxDepth: number;
  onDiffDepthChange: (depth: number) => void;
  focusDepth: number;
  focusMaxDepth: number;
  onFocusDepthChange: (depth: number) => void;
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
  diffEnabled,
  onToggleDiff,
  baseRef,
  diffSummary,
  diffDepth,
  diffMaxDepth,
  onDiffDepthChange,
  focusDepth,
  focusMaxDepth,
  onFocusDepthChange,
}: FlowControlsProps) {
  const searchRef = useRef<HTMLInputElement>(null);
  const [localQuery, setLocalQuery] = useState(searchQuery);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Sync local state when the prop changes externally (e.g. URL navigation)
  useEffect(() => {
    setLocalQuery(searchQuery);
  }, [searchQuery]);

  /** Update local state immediately and debounce the expensive onSearch callback. */
  const handleSearchChange = (value: string) => {
    setLocalQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onSearch(value), SEARCH_DEBOUNCE_MS);
  };

  /** Clear search immediately (no debounce needed). */
  const handleClear = () => {
    setLocalQuery('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    onSearch('');
  };

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

  // Unified depth slider — picks whichever source is active (diff takes priority)
  const activeDepth = diffEnabled && diffMaxDepth > 0
    ? { value: diffDepth, max: diffMaxDepth, onChange: onDiffDepthChange, id: 'diff-depth' }
    : focusMaxDepth > 0
      ? { value: focusDepth, max: focusMaxDepth, onChange: onFocusDepthChange, id: 'focus-depth' }
      : null;

  const depthSlider = activeDepth && (
    <div className="mb-3">
      <div className="flex items-center gap-2">
        <label className="text-[11px] text-muted-foreground shrink-0" htmlFor={activeDepth.id}>
          Depth
        </label>
        <input
          id={activeDepth.id}
          type="range"
          min={0}
          max={activeDepth.max}
          value={activeDepth.value}
          onChange={(e) => activeDepth.onChange(Number(e.target.value))}
          className="flex-1 h-1 accent-foreground"
        />
        <span className="text-[11px] text-muted-foreground tabular-nums w-8 text-right">
          {activeDepth.value === activeDepth.max ? 'all' : activeDepth.value}
        </span>
      </div>
    </div>
  );

  return (
    <div className="p-4">
      <div className="relative mb-3">
        <input
          ref={searchRef}
          type="text"
          placeholder="Search nodes..."
          value={localQuery}
          onChange={(e: ChangeEvent<HTMLInputElement>) => handleSearchChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') e.currentTarget.blur();
          }}
          className={`peer w-full px-2.5 py-2 ${isApplePlatform() ? 'pr-10' : 'pr-16'} focus:pr-2.5 border border-border rounded-md text-[13px] outline-none bg-background text-foreground`}
        />
        {localQuery && (
          <button
            type="button"
            aria-label="Clear search"
            onMouseDown={(e) => {
              e.preventDefault();
              handleClear();
            }}
            className="absolute right-2 inset-y-0 items-center bg-transparent border-none p-0 cursor-pointer text-muted-foreground hover:text-foreground hidden peer-focus:flex"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
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

      {!loading && depthSlider}

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
                    <span style={{ color: getCategoryColors(category).handle }}>
                      {getCategoryLabel(category)}
                    </span>
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

      {!loading && (
        <div className="mb-3">
          <label className="flex items-center gap-1.5 text-xs text-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={diffEnabled}
              onChange={onToggleDiff}
              className="m-0 shrink-0"
            />
            <span>Diff vs {baseRef ?? 'base'}</span>
          </label>
          {diffEnabled && diffSummary && (
            <div className="text-[11px] text-muted-foreground mt-1 ml-5">
              {diffSummary.modified > 0 && (
                <span className="text-amber-500">{diffSummary.modified} modified</span>
              )}
              {diffSummary.modified > 0 && (diffSummary.added > 0 || diffSummary.removed > 0) && ', '}
              {diffSummary.added > 0 && (
                <span className="text-green-500">{diffSummary.added} added</span>
              )}
              {diffSummary.added > 0 && diffSummary.removed > 0 && ', '}
              {diffSummary.removed > 0 && (
                <span className="text-red-500">{diffSummary.removed} removed</span>
              )}
              {diffSummary.modified === 0 && diffSummary.added === 0 && diffSummary.removed === 0 && (
                <span>No changes</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
