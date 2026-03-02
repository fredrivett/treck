import { useCallback, useMemo } from 'react';
import type { FlowGraph as FlowGraphData } from '../../../graph/types.js';
import { getNodeCategory, type NodeCategory } from '../components/FlowGraph';

/** Options for the {@link useGraphFilters} hook. */
interface UseGraphFiltersOptions {
  /** The full graph data (may be null while loading). */
  graph: FlowGraphData | null;
  /** Current search query string. */
  searchQuery: string;
  /** Currently enabled node categories, or null for "all". */
  enabledTypes: Set<NodeCategory> | null;
  /** Callback to update enabled types. Receives the new set or null for "all". */
  setEnabledTypes: (types: Set<NodeCategory> | null) => void;
}

/** Return value of the {@link useGraphFilters} hook. */
interface UseGraphFiltersResult {
  /** Map of node categories to their counts in the full graph. */
  availableTypes: Map<NodeCategory, number>;
  /** Whether the graph contains any conditional edges. */
  hasConditionalEdges: boolean;
  /** The graph after applying search and type filters. */
  filteredGraph: Pick<FlowGraphData, 'nodes' | 'edges'>;
  /** Toggle a single node category on/off. */
  onToggleType: (category: NodeCategory) => void;
  /** Solo a single node category (disable all others). */
  onSoloType: (category: NodeCategory) => void;
  /** Reset type filters to show all categories. */
  onResetTypes: () => void;
}

/**
 * Shared graph filtering logic used by both the server viewer and showcase viewer.
 *
 * Computes available types, filtered graph data, and provides callbacks for
 * toggling/soloing/resetting type filters. State persistence (URL params vs
 * React state) is left to the consumer via {@link UseGraphFiltersOptions.setEnabledTypes}.
 */
export function useGraphFilters({
  graph,
  searchQuery,
  enabledTypes,
  setEnabledTypes,
}: UseGraphFiltersOptions): UseGraphFiltersResult {
  const availableTypes = useMemo(() => {
    if (!graph) return new Map<NodeCategory, number>();
    const counts = new Map<NodeCategory, number>();
    for (const node of graph.nodes) {
      const cat = getNodeCategory(node);
      counts.set(cat, (counts.get(cat) || 0) + 1);
    }
    return counts;
  }, [graph]);

  const hasConditionalEdges = useMemo(
    () => !!graph?.edges.some((e) => e.type === 'conditional-call'),
    [graph],
  );

  const filteredGraph = useMemo(() => {
    if (!graph) return { nodes: [], edges: [] };
    let filtered: Pick<FlowGraphData, 'nodes' | 'edges'> = graph;

    if (enabledTypes) {
      const typeMatchIds = new Set(
        filtered.nodes.filter((n) => enabledTypes.has(getNodeCategory(n))).map((n) => n.id),
      );
      filtered = {
        nodes: filtered.nodes.filter((n) => typeMatchIds.has(n.id)),
        edges: filtered.edges.filter(
          (e) => typeMatchIds.has(e.source) && typeMatchIds.has(e.target),
        ),
      };
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchingIds = new Set(
        filtered.nodes
          .filter(
            (n) =>
              n.name.toLowerCase().includes(q) ||
              n.filePath.toLowerCase().includes(q) ||
              n.metadata?.route?.toLowerCase().includes(q) ||
              n.metadata?.eventTrigger?.toLowerCase().includes(q) ||
              n.metadata?.taskId?.toLowerCase().includes(q),
          )
          .map((n) => n.id),
      );
      filtered = {
        nodes: filtered.nodes.filter((n) => matchingIds.has(n.id)),
        edges: filtered.edges.filter((e) => matchingIds.has(e.source) && matchingIds.has(e.target)),
      };
    }

    return filtered;
  }, [graph, searchQuery, enabledTypes]);

  const onToggleType = useCallback(
    (category: NodeCategory) => {
      const current = enabledTypes;
      let next: Set<NodeCategory> | null;
      if (!current) {
        const all = new Set(availableTypes.keys());
        all.delete(category);
        next = all;
      } else {
        next = new Set(current);
        if (next.has(category)) {
          next.delete(category);
        } else {
          next.add(category);
        }
        if (next.size === availableTypes.size) next = null;
      }
      setEnabledTypes(next);
    },
    [enabledTypes, availableTypes, setEnabledTypes],
  );

  const onSoloType = useCallback(
    (category: NodeCategory) => setEnabledTypes(new Set([category])),
    [setEnabledTypes],
  );

  const onResetTypes = useCallback(() => setEnabledTypes(null), [setEnabledTypes]);

  return {
    availableTypes,
    hasConditionalEdges,
    filteredGraph,
    onToggleType,
    onSoloType,
    onResetTypes,
  };
}
