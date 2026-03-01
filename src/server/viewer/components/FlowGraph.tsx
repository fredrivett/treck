import {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  MiniMap,
  type Node,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';
import ELK, { type ElkNode } from 'elkjs/lib/elk.bundled.js';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import '@xyflow/react/dist/style.css';

import type { FlowGraph as FlowGraphData } from '../../../graph/types.js';
import { GRID_SIZE, snapCeil } from '../grid';
import { DocPanel } from './DocPanel';
import { defaultLayoutOptions, type LayoutOptions, LayoutSettings } from './LayoutSettings';
import { nodeTypes } from './NodeTypes';

const elk = new ELK();

const edgeStyleByType: Record<string, React.CSSProperties> = {
  'direct-call': { stroke: '#6b7280' },
  'async-dispatch': { stroke: '#ec4899' },
  'event-emit': { stroke: '#ec4899', strokeDasharray: '4 4' },
  'http-request': { stroke: '#f97316', strokeDasharray: '8 4' },
  'conditional-call': { stroke: '#f59e0b' },
  'error-handler': { stroke: '#ef4444' },
  'middleware-chain': { stroke: '#06b6d4', strokeDasharray: '4 2' },
};

function getNodeType(node: GraphNode): string {
  if (node.entryType) return 'entryPoint';
  if (node.kind === 'component') return 'componentNode';
  if (node.kind === 'function' && /^use[A-Z]/.test(node.name)) return 'hookNode';
  return 'functionNode';
}

export type NodeCategory = string;

const entryTypeCategoryLabels: Record<string, string> = {
  'api-route': 'API Routes',
  page: 'Pages',
  'inngest-function': 'Inngest Jobs',
  'trigger-task': 'Trigger Tasks',
  middleware: 'Middleware',
  'server-action': 'Server Actions',
};

const nonEntryCategoryLabels: Record<string, string> = {
  component: 'Components',
  hook: 'Hooks',
  function: 'Functions',
};

/** Returns the filter category for a graph node (entry type or kind-based). */
export function getNodeCategory(node: GraphNode): NodeCategory {
  if (node.entryType) return node.entryType;
  if (node.kind === 'component') return 'component';
  if (node.kind === 'function' && /^use[A-Z]/.test(node.name)) return 'hook';
  return 'function';
}

export function getCategoryLabel(category: NodeCategory): string {
  return entryTypeCategoryLabels[category] || nonEntryCategoryLabels[category] || category;
}

function toReactFlowNode(node: GraphNode): Node {
  return {
    id: node.id,
    type: getNodeType(node),
    position: { x: 0, y: 0 },
    data: {
      label: node.name,
      kind: node.kind,
      filePath: node.filePath,
      isAsync: node.isAsync,
      entryType: node.entryType,
      metadata: node.metadata,
      hasJsDoc: node.hasJsDoc,
    },
  };
}

function toReactFlowEdges(graphEdges: FlowGraphData['edges'], showConditionals: boolean): Edge[] {
  return graphEdges.map((edge) => {
    // When conditionals are hidden, render conditional-call edges as direct-call style
    const effectiveType =
      !showConditionals && edge.type === 'conditional-call' ? 'direct-call' : edge.type;
    const style = edgeStyleByType[effectiveType] || { stroke: '#9ca3af' };

    let label: string | undefined;
    if (showConditionals && edge.type === 'conditional-call' && edge.conditions) {
      label = edge.conditions.map((c) => c.condition).join(' \u2192 ');
    } else if (effectiveType !== 'direct-call' && effectiveType !== 'async-dispatch') {
      label = edge.label || edge.type;
    }

    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      animated: effectiveType === 'async-dispatch' || effectiveType === 'event-emit',
      label,
      style,
      labelStyle: { fontSize: 10, fill: 'var(--graph-edge-label)' },
    };
  });
}

type SizeCache = Map<string, { width: number; height: number }>;

async function runElkLayout(
  currentNodes: Node[],
  graphEdges: FlowGraphData['edges'],
  layoutOptions: LayoutOptions,
  sizeCache?: SizeCache,
): Promise<Map<string, { x: number; y: number }>> {
  const elkGraph: ElkNode = {
    id: 'root',
    layoutOptions: { ...layoutOptions },
    children: currentNodes.map((node) => {
      const cached = sizeCache?.get(node.id);
      return {
        id: node.id,
        width: snapCeil(cached?.width || node.measured?.width || 150),
        height: snapCeil(cached?.height || node.measured?.height || 60),
      };
    }),
    edges: graphEdges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  };

  const layout = await elk.layout(elkGraph);
  const positions = new Map<string, { x: number; y: number }>();
  for (const child of layout.children || []) {
    positions.set(child.id, {
      x: Math.round((child.x || 0) / GRID_SIZE) * GRID_SIZE,
      y: Math.round((child.y || 0) / GRID_SIZE) * GRID_SIZE,
    });
  }
  return positions;
}

interface FlowGraphProps {
  graph: FlowGraphData;
  onLayoutReady?: () => void;
  searchQuery: string;
  enabledTypes: Set<NodeCategory> | null;
  showConditionals: boolean;
  /** When true, ReactFlow renders with its built-in dark colour scheme. */
  darkMode?: boolean;
}

function FlowGraphInner({
  graph,
  onLayoutReady,
  searchQuery,
  enabledTypes,
  showConditionals,
  darkMode,
}: FlowGraphProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(() => {
    const param = searchParams.get('selected');
    return param ? new Set(param.split(',').map(decodeURIComponent)) : new Set<string>();
  });
  const [focusedEntries, setFocusedEntries] = useState<Set<string>>(() => {
    const param = searchParams.get('focused');
    return param ? new Set(param.split(',').map(decodeURIComponent)) : new Set<string>();
  });
  const [layoutOptions, setLayoutOptions] = useState<LayoutOptions>(defaultLayoutOptions);
  const [needsLayout, setNeedsLayout] = useState(false);
  const { fitView } = useReactFlow();
  const nodesInitialized = useNodesInitialized();
  const visibleGraphRef = useRef<FlowGraphData | null>(null);
  const sizeCache = useRef<SizeCache>(new Map());
  const [initialMeasureDone, setInitialMeasureDone] = useState(false);

  // Sync selection state to URL query params
  useEffect(() => {
    setSearchParams((prev) => {
      if (selectedEntries.size > 0) {
        prev.set('selected', [...selectedEntries].map(encodeURIComponent).join(','));
      } else {
        prev.delete('selected');
      }
      if (focusedEntries.size > 0) {
        prev.set('focused', [...focusedEntries].map(encodeURIComponent).join(','));
      } else {
        prev.delete('focused');
      }
      return prev;
    });
  }, [selectedEntries, focusedEntries, setSearchParams]);

  // Shared helper: apply ELK positions to nodes and fit the view
  const applyPositionsAndFit = useCallback(
    (positions: Map<string, { x: number; y: number }>, initialNodes?: Node[]) => {
      const apply = (node: Node): Node => {
        const pos = positions.get(node.id);
        if (!pos) return node;
        const cached = sizeCache.current.get(node.id);
        return {
          ...node,
          position: pos,
          ...(cached && { width: cached.width, height: cached.height }),
        };
      };
      if (initialNodes) {
        setNodes(initialNodes.map(apply));
      } else {
        setNodes((prev) => prev.map(apply));
      }
      requestAnimationFrame(() => {
        fitView({ padding: 0.15 });
        requestAnimationFrame(() => {
          onLayoutReady?.();
        });
      });
    },
    [setNodes, fitView, onLayoutReady],
  );

  // Compute visible node IDs: union of connected subgraphs from all focused entries
  const visibleIds = useMemo(() => {
    if (focusedEntries.size === 0) return null;
    const connected = new Set<string>(focusedEntries);

    // BFS downward from all focused entries (callees)
    const downQueue = [...focusedEntries];
    while (downQueue.length > 0) {
      const current = downQueue.shift() as string;
      for (const edge of graph.edges) {
        if (edge.source === current && !connected.has(edge.target)) {
          connected.add(edge.target);
          downQueue.push(edge.target);
        }
      }
    }

    // BFS upward from all focused entries (callers)
    const upQueue = [...focusedEntries];
    while (upQueue.length > 0) {
      const current = upQueue.shift() as string;
      for (const edge of graph.edges) {
        if (edge.target === current && !connected.has(edge.source)) {
          connected.add(edge.source);
          upQueue.push(edge.source);
        }
      }
    }

    return connected;
  }, [focusedEntries, graph.edges]);

  // Apply type and search filters
  const filteredGraph = useMemo(() => {
    let filtered = graph;

    // Type filter
    if (enabledTypes) {
      const typeMatchIds = new Set(
        filtered.nodes.filter((n) => enabledTypes.has(getNodeCategory(n))).map((n) => n.id),
      );
      filtered = {
        ...filtered,
        nodes: filtered.nodes.filter((n) => typeMatchIds.has(n.id)),
        edges: filtered.edges.filter(
          (e) => typeMatchIds.has(e.source) && typeMatchIds.has(e.target),
        ),
      };
    }

    // Search filter
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
        ...filtered,
        nodes: filtered.nodes.filter((n) => matchingIds.has(n.id)),
        edges: filtered.edges.filter((e) => matchingIds.has(e.source) && matchingIds.has(e.target)),
      };
    }

    return filtered;
  }, [graph, searchQuery, enabledTypes]);

  // Filter to only focused subgraph
  const focusFilteredGraph = useMemo(() => {
    if (!visibleIds) return filteredGraph;
    return {
      ...filteredGraph,
      nodes: filteredGraph.nodes.filter((n) => visibleIds.has(n.id)),
      edges: filteredGraph.edges.filter(
        (e) => visibleIds.has(e.source) && visibleIds.has(e.target),
      ),
    };
  }, [filteredGraph, visibleIds]);

  // First render: measure ALL nodes (behind loading screen). After: render filtered view.
  const renderGraph = initialMeasureDone ? focusFilteredGraph : graph;

  // When renderGraph changes: use cached sizes for instant layout, or fall back to two-pass measurement
  useEffect(() => {
    visibleGraphRef.current = renderGraph;
    const rfNodes = renderGraph.nodes.map((n) => toReactFlowNode(n));
    setEdges(toReactFlowEdges(renderGraph.edges, showConditionals));

    const allCached = renderGraph.nodes.every((n) => sizeCache.current.has(n.id));
    if (allCached && renderGraph.nodes.length > 0) {
      // Fast path: compute positions before rendering so nodes never appear at origin
      runElkLayout(rfNodes, renderGraph.edges, layoutOptions, sizeCache.current).then((positions) =>
        applyPositionsAndFit(positions, rfNodes),
      );
    } else {
      // Slow path: render at origin so React Flow can measure, then layout in Pass 2
      setNodes(rfNodes);
      setNeedsLayout(true);
    }
  }, [renderGraph, setNodes, setEdges, layoutOptions, applyPositionsAndFit, showConditionals]);

  // Update node data (selected/dimmed) without triggering re-layout
  useEffect(() => {
    setNodes((prev) =>
      prev.map((node) => {
        const isSelected = selectedEntries.has(node.id);
        const dimmed = selectedEntries.size > 0 ? !isSelected : false;
        return {
          ...node,
          data: { ...node.data, selected: isSelected, dimmed },
        };
      }),
    );
  }, [selectedEntries, setNodes]);

  // Pass 2: once nodes are measured, cache sizes and run ELK with real dimensions
  // biome-ignore lint/correctness/useExhaustiveDependencies: initialMeasureDone is write-only here
  useEffect(() => {
    if (!needsLayout || !nodesInitialized || !visibleGraphRef.current) return;
    setNeedsLayout(false);

    // Cache measured sizes for future fast-path layouts
    for (const node of nodes) {
      if (node.measured?.width && node.measured?.height) {
        sizeCache.current.set(node.id, {
          width: snapCeil(node.measured.width),
          height: snapCeil(node.measured.height),
        });
      }
    }

    if (!initialMeasureDone) setInitialMeasureDone(true);

    const currentGraph = visibleGraphRef.current;
    runElkLayout(nodes, currentGraph.edges, layoutOptions, sizeCache.current).then((positions) =>
      applyPositionsAndFit(positions),
    );
  }, [needsLayout, nodesInitialized, nodes, layoutOptions, applyPositionsAndFit]);

  // Re-layout when layout options change (without re-measuring)
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally only re-run on layoutOptions change
  useEffect(() => {
    if (!visibleGraphRef.current || needsLayout) return;
    runElkLayout(nodes, visibleGraphRef.current.edges, layoutOptions, sizeCache.current).then(
      (positions) => applyPositionsAndFit(positions),
    );
  }, [layoutOptions]);

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    const isMultiSelect = event.metaKey || event.ctrlKey;

    if (isMultiSelect) {
      setSelectedEntries((prev) => {
        const next = new Set(prev);
        if (next.has(node.id)) {
          next.delete(node.id);
        } else {
          next.add(node.id);
        }
        return next;
      });
    } else {
      setSelectedEntries((prev) => {
        if (prev.size === 1 && prev.has(node.id)) {
          setFocusedEntries(new Set());
          return new Set();
        }
        const next = new Set([node.id]);
        setFocusedEntries(next);
        return next;
      });
    }
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedEntries(new Set());
    setFocusedEntries(new Set());
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearSelection();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clearSelection]);

  return (
    <div className="w-full h-full relative">
      <LayoutSettings options={layoutOptions} onChange={setLayoutOptions} />
      {(selectedEntries.size > 0 || focusedEntries.size > 0) && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-background/90 backdrop-blur border border-border rounded-full px-3 py-1.5 shadow-sm text-xs text-muted-foreground">
          <span>{selectedEntries.size} selected</span>
          {(selectedEntries.size !== focusedEntries.size ||
            [...selectedEntries].some((id) => !focusedEntries.has(id))) && (
            <button
              type="button"
              onClick={() => setFocusedEntries(new Set(selectedEntries))}
              className="text-blue-600 hover:text-blue-800 font-medium"
            >
              Focus
            </button>
          )}
          <button
            type="button"
            onClick={clearSelection}
            className="text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        </div>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        colorMode={darkMode ? 'dark' : 'light'}
        fitView
        minZoom={0.1}
        maxZoom={2}
        snapToGrid
        snapGrid={[GRID_SIZE, GRID_SIZE]}
        defaultEdgeOptions={{
          type: 'smoothstep',
        }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          color="var(--graph-bg-dot)"
          gap={GRID_SIZE}
          size={1}
        />
        <Controls position="bottom-right" />
        <MiniMap
          position="bottom-right"
          style={{ border: '1px solid var(--graph-minimap-border)', borderRadius: 8 }}
          maskColor="var(--graph-minimap-mask)"
        />
      </ReactFlow>
      <DocPanel node={null} onClose={() => {}} />
    </div>
  );
}

/** ReactFlow-based graph visualization with ELK layout. */
export function FlowGraph({
  graph,
  onLayoutReady,
  searchQuery,
  enabledTypes,
  showConditionals,
  darkMode,
}: FlowGraphProps) {
  return (
    <ReactFlowProvider>
      <FlowGraphInner
        graph={graph}
        onLayoutReady={onLayoutReady}
        searchQuery={searchQuery}
        enabledTypes={enabledTypes}
        showConditionals={showConditionals}
        darkMode={darkMode}
      />
    </ReactFlowProvider>
  );
}
