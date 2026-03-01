import type { ChangeEvent } from 'react';
import { getCategoryLabel, type NodeCategory } from './FlowGraph';

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
  return (
    <div className="p-4">
      <input
        type="text"
        placeholder="Search nodes..."
        value={searchQuery}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onSearch(e.target.value)}
        className="w-full px-2.5 py-2 border border-border rounded-md text-[13px] outline-none mb-3 bg-background text-foreground"
      />

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
