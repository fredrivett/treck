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
import '@xyflow/react/dist/style.css';

import type { GraphDiff } from '../../../graph/diff.js';
import { connectedSubgraphWithDepths } from '../../../graph/graph-query.js';
import type { FlowGraph as FlowGraphData } from '../../../graph/types.js';
import { GRID_SIZE, snapCeil } from '../grid';
import { edgeStyleByType, expandConditionals, toReactFlowNode } from './condition-expansion';
import { DocPanel } from './DocPanel';
import { defaultLayoutOptions, type LayoutOptions, LayoutSettings } from './LayoutSettings';
import { nodeTypes } from './NodeTypes';
import { getCategoryLabel, getNodeCategory, type NodeCategory } from './node-categories';
import { Kbd } from './ui/kbd';
import { useNodeSelection } from './useNodeSelection';

export { type NodeCategory, getCategoryLabel, getNodeCategory };

const elk = new ELK();

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

/** Minimal edge shape needed for ELK layout. */
interface LayoutEdge {
  id: string;
  source: string;
  target: string;
}

async function runElkLayout(
  currentNodes: Node[],
  edges: LayoutEdge[],
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
    edges: edges.map((edge) => ({
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
  /** Diff data for annotating nodes with change status. Null when diff is inactive. */
  diffData?: GraphDiff | null;
  /** Current focus depth limit. Nodes farther than this from focused nodes are hidden. */
  focusDepth: number;
  /** Called when the maximum available focus depth changes (e.g. new focused nodes). */
  onFocusMaxDepthChange?: (maxDepth: number) => void;
  onLayoutReady?: () => void;
  searchQuery: string;
  enabledTypes: Set<NodeCategory> | null;
  showConditionals: boolean;
  /** Ref that receives a function to recenter the viewport on the current nodes. */
  recenterRef?: React.RefObject<(() => void) | null>;
  /** Called when the viewport drifts away from (or snaps back to) the fitted view. */
  onOffCenterChange?: (offCenter: boolean) => void;
}

/**
 * Detect dark mode by checking for a `.dark` class on the document root.
 *
 * Observes class mutations on `<html>` so the value updates when the
 * theme is toggled at runtime.
 */
function useDarkMode(): boolean {
  const [isDark, setIsDark] = useState(
    () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'),
  );

  useEffect(() => {
    const root = document.documentElement;
    const check = () => setIsDark(root.classList.contains('dark'));
    check();

    const observer = new MutationObserver(check);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

function FlowGraphInner({
  graph,
  diffData,
  focusDepth,
  onFocusMaxDepthChange,
  onLayoutReady,
  searchQuery,
  enabledTypes,
  showConditionals,
  recenterRef,
  onOffCenterChange,
}: FlowGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const darkMode = useDarkMode();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const {
    selected: selectedEntries,
    focused: focusedEntries,
    setFocused: setFocusedEntries,
    clickNode,
    clear: clearSelection,
  } = useNodeSelection();
  const [layoutOptions, setLayoutOptions] = useState<LayoutOptions>(defaultLayoutOptions);
  const [needsLayout, setNeedsLayout] = useState(false);
  const { fitView, getViewport, setViewport } = useReactFlow();
  const fittedViewportRef = useRef<{ x: number; y: number; zoom: number } | null>(null);
  const lastContainerSizeRef = useRef<{ width: number; height: number } | null>(null);
  const nodesInitialized = useNodesInitialized();
  const currentNodesRef = useRef<Node[]>([]);
  const visibleGraphRef = useRef<FlowGraphData | null>(null);
  const visualEdgesRef = useRef<Edge[]>([]);
  const displayNodeIdsRef = useRef<Set<string>>(new Set());
  const sizeCache = useRef<SizeCache>(new Map());
  const [initialMeasureDone, setInitialMeasureDone] = useState(false);

  // Refs for current selection state (used in async layout callbacks)
  const selectedEntriesRef = useRef(selectedEntries);
  selectedEntriesRef.current = selectedEntries;
  const focusedEntriesRef = useRef(focusedEntries);
  focusedEntriesRef.current = focusedEntries;

  useEffect(() => {
    currentNodesRef.current = nodes;
  }, [nodes]);

  // Shared helper: apply ELK positions to nodes and fit the view
  const applyPositionsAndFit = useCallback(
    (positions: Map<string, { x: number; y: number }>, initialNodes?: Node[]) => {
      const sel = selectedEntriesRef.current;
      const hasSelected = sel.size > 0;
      const apply = (node: Node): Node => {
        const pos = positions.get(node.id);
        if (!pos) return node;
        const cached = sizeCache.current.get(node.id);
        const isSelected = sel.has(node.id);
        const dimmed = hasSelected ? !isSelected : false;
        return {
          ...node,
          position: pos,
          ...(cached && { width: cached.width, height: cached.height }),
          data: { ...node.data, selected: isSelected, dimmed },
        };
      };

      const nextNodes = (initialNodes ?? currentNodesRef.current).map(apply);
      currentNodesRef.current = nextNodes;
      setNodes(nextNodes);

      requestAnimationFrame(() => {
        void fitView({ padding: 0.15, nodes: nextNodes }).then(() => {
          fittedViewportRef.current = getViewport();
          onOffCenterChange?.(false);
          onLayoutReady?.();
        });
      });
    },
    [setNodes, fitView, getViewport, onLayoutReady, onOffCenterChange],
  );

  /** Recenter the viewport on the current nodes. */
  const recenter = useCallback(() => {
    const currentNodes = currentNodesRef.current;
    void fitView({ padding: 0.15, duration: 250, nodes: currentNodes }).then(() => {
      fittedViewportRef.current = getViewport();
      onOffCenterChange?.(false);
    });
  }, [fitView, getViewport, onOffCenterChange]);

  // Expose recenter function to parent
  useEffect(() => {
    if (recenterRef) {
      recenterRef.current = recenter;
    }
  }, [recenter, recenterRef]);

  // Show recenter when the React Flow panel size changes after initial mount.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      const height = entry.contentRect.height;
      const prev = lastContainerSizeRef.current;
      lastContainerSizeRef.current = { width, height };

      if (!prev) return;
      if (Math.abs(width - prev.width) < 1 && Math.abs(height - prev.height) < 1) return;
      if (!fittedViewportRef.current) return;

      onOffCenterChange?.(true);
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [onOffCenterChange]);

  /** Detect when the user pans or zooms away from the fitted viewport. */
  const handleMoveEnd = useCallback(() => {
    const fitted = fittedViewportRef.current;
    if (!fitted) return;
    const current = getViewport();
    const offCenter =
      Math.abs(current.x - fitted.x) > 1 ||
      Math.abs(current.y - fitted.y) > 1 ||
      Math.abs(current.zoom - fitted.zoom) > 0.01;
    onOffCenterChange?.(offCenter);
  }, [getViewport, onOffCenterChange]);

  // Compute visible node IDs with depth info from focused entries
  const focusSubgraph = useMemo(() => {
    if (focusedEntries.size === 0) return null;
    return connectedSubgraphWithDepths(graph, [...focusedEntries]);
  }, [focusedEntries, graph]);

  // Report focus max depth changes to parent
  const focusMaxDepth = focusSubgraph?.maxDepth ?? 0;
  const prevFocusMaxDepthRef = useRef(-1);
  useEffect(() => {
    if (prevFocusMaxDepthRef.current !== focusMaxDepth) {
      prevFocusMaxDepthRef.current = focusMaxDepth;
      onFocusMaxDepthChange?.(focusMaxDepth);
    }
  }, [focusMaxDepth, onFocusMaxDepthChange]);

  // Filter visible IDs by focus depth
  const visibleIds = useMemo(() => {
    if (!focusSubgraph) return null;
    const depths = focusSubgraph.nodeDepths;
    const visible = new Set<string>();
    for (const [id, d] of Object.entries(depths)) {
      if (d <= focusDepth) visible.add(id);
    }
    return visible;
  }, [focusSubgraph, focusDepth]);

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

  // Build diff status sets when diff is active
  const diffSets = useMemo(() => {
    if (!diffData) return null;
    return {
      modified: new Set(diffData.changes.modified),
      added: new Set(diffData.changes.added),
      removed: new Set(diffData.changes.removed),
    };
  }, [diffData]);

  // When diff status changes, clear size cache so nodes are re-measured with/without badges
  const prevDiffSetsRef = useRef(diffSets);
  useEffect(() => {
    if (prevDiffSetsRef.current !== diffSets) {
      sizeCache.current.clear();
      prevDiffSetsRef.current = diffSets;
    }
  }, [diffSets]);

  // Derive ReactFlow nodes and edges from the render graph + conditionals toggle.
  // This memo ensures toggling conditionals produces a new reference, following
  // the same pattern as the focus/filter pipeline above.
  const { rfNodes, rfEdges } = useMemo(() => {
    let nodes: Node[];
    let edges: Edge[];
    if (showConditionals) {
      const expanded = expandConditionals(renderGraph.nodes, renderGraph.edges);
      nodes = expanded.rfNodes;
      edges = expanded.rfEdges;
    } else {
      nodes = renderGraph.nodes.map((n) => toReactFlowNode(n));
      edges = toReactFlowEdges(renderGraph.edges, false);
    }

    // Annotate nodes with diff status when diff is active
    if (diffSets) {
      nodes = nodes.map((node) => {
        let diffStatus: string | undefined;
        if (diffSets.modified.has(node.id)) diffStatus = 'modified';
        else if (diffSets.added.has(node.id)) diffStatus = 'added';
        else if (diffSets.removed.has(node.id)) diffStatus = 'removed';
        else diffStatus = 'context';
        return { ...node, data: { ...node.data, diffStatus } };
      });
    }

    return { rfNodes: nodes, rfEdges: edges };
  }, [renderGraph, showConditionals, diffSets]);

  // When the derived nodes/edges change: use cached sizes for instant layout,
  // or fall back to two-pass measurement.
  useEffect(() => {
    visibleGraphRef.current = renderGraph;
    visualEdgesRef.current = rfEdges;
    displayNodeIdsRef.current = new Set(rfNodes.map((n) => n.id));
    setEdges(rfEdges);

    // Fast path: all display nodes have cached sizes — skip measurement entirely.
    const allCached = rfNodes.length > 0 && rfNodes.every((n) => sizeCache.current.has(n.id));
    if (allCached && initialMeasureDone) {
      runElkLayout(rfNodes, rfEdges, layoutOptions, sizeCache.current).then((positions) =>
        applyPositionsAndFit(positions, rfNodes),
      );
      return;
    }
    // Slow path: build measurement-mode nodes (measuring: true hides file paths
    // for consistent sizing) and render them so React Flow can measure.
    let measuringNodes = showConditionals
      ? expandConditionals(renderGraph.nodes, renderGraph.edges, true).rfNodes
      : renderGraph.nodes.map((node) => toReactFlowNode(node, true));

    // Annotate measuring nodes with diff status so badges are included in sizing.
    if (diffSets) {
      measuringNodes = measuringNodes.map((node) => {
        let diffStatus: string;
        if (diffSets.modified.has(node.id)) diffStatus = 'modified';
        else if (diffSets.added.has(node.id)) diffStatus = 'added';
        else if (diffSets.removed.has(node.id)) diffStatus = 'removed';
        else diffStatus = 'context';
        return { ...node, data: { ...node.data, diffStatus } };
      });
    }

    // Also expand conditionals so their nodes get measured and cached.
    let extraCondNodes: Node[] = [];
    if (!showConditionals) {
      const hasConditionals = renderGraph.edges.some(
        (e) => e.type === 'conditional-call' && e.conditions?.length,
      );
      if (hasConditionals) {
        const expanded = expandConditionals(renderGraph.nodes, renderGraph.edges, true);
        const existingIds = new Set(measuringNodes.map((node) => node.id));
        extraCondNodes = expanded.rfNodes.filter((n) => !existingIds.has(n.id));
      }
    }

    // When diff is active, measure ALL diff nodes (at max depth) upfront so
    // increasing the depth slider doesn't trigger re-measurement.
    let extraDiffNodes: Node[] = [];
    if (diffData && diffSets) {
      const existingIds = new Set(measuringNodes.map((node) => node.id));
      const allDiffGraphNodes = [...diffData.nodes, ...diffData.removedNodes];
      extraDiffNodes = allDiffGraphNodes
        .filter((n) => !existingIds.has(n.id))
        .map((n) => {
          const rfNode = toReactFlowNode(n, true);
          let diffStatus: string;
          if (diffSets.modified.has(n.id)) diffStatus = 'modified';
          else if (diffSets.added.has(n.id)) diffStatus = 'added';
          else if (diffSets.removed.has(n.id)) diffStatus = 'removed';
          else diffStatus = 'context';
          return { ...rfNode, data: { ...rfNode.data, diffStatus } };
        });
    }

    setNodes([...measuringNodes, ...extraCondNodes, ...extraDiffNodes]);
    setNeedsLayout(true);
  }, [
    rfNodes,
    rfEdges,
    renderGraph,
    setNodes,
    setEdges,
    layoutOptions,
    applyPositionsAndFit,
    initialMeasureDone,
    showConditionals,
    diffData,
    diffSets,
  ]);

  // Update node data (selected/dimmed) without triggering re-layout
  useEffect(() => {
    const hasSelected = selectedEntries.size > 0;
    setNodes((prev) =>
      prev.map((node) => {
        const isSelected = selectedEntries.has(node.id);
        const dimmed = hasSelected ? !isSelected : false;
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

    // Guard against stale nodesInitialized — React Flow may report true for
    // same-ID nodes before ResizeObserver has measured the updated DOM.
    const hasMeasurements = nodes.some((n) => n.measured?.width && n.measured?.height);
    if (!hasMeasurements) return;

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

    // Strip out measurement-only nodes (extra condition nodes and extra diff
    // nodes added only to cache their sizes) and restore file-path rendering.
    const displayIds = displayNodeIdsRef.current;
    const edgeNodeIds = new Set<string>();
    for (const edge of visualEdgesRef.current) {
      edgeNodeIds.add(edge.source);
      edgeNodeIds.add(edge.target);
    }
    const displayNodes = nodes
      .map((node) => ({
        ...node,
        data: { ...node.data, measuring: false },
      }))
      .filter((node) => {
        // Keep nodes that are in the current display set
        if (displayIds.has(node.id)) return true;
        // Keep condition nodes that are referenced by visual edges
        if (node.type === 'conditionNode' && edgeNodeIds.has(node.id)) return true;
        // Strip all other measurement-only nodes
        return false;
      });

    runElkLayout(displayNodes, visualEdgesRef.current, layoutOptions, sizeCache.current).then(
      (positions) => applyPositionsAndFit(positions, displayNodes),
    );
  }, [needsLayout, nodesInitialized, nodes, layoutOptions, applyPositionsAndFit]);

  // Re-layout when layout options change (without re-measuring)
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally only re-run on layoutOptions change
  useEffect(() => {
    if (!visibleGraphRef.current || needsLayout) return;
    runElkLayout(nodes, visualEdgesRef.current, layoutOptions, sizeCache.current).then(
      (positions) => applyPositionsAndFit(positions),
    );
  }, [layoutOptions]);

  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      clickNode(node.id, event);
    },
    [clickNode],
  );

  /** Pan the camera by a fixed pixel amount in the given direction. */
  const panCamera = useCallback(
    (dx: number, dy: number) => {
      const { x, y, zoom } = getViewport();
      setViewport({ x: x + dx, y: y + dy, zoom }, { duration: 150 });
    },
    [getViewport, setViewport],
  );

  useEffect(() => {
    const PAN_STEP = 80;

    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      // Arrow keys and hjkl to pan the camera
      switch (e.key) {
        case 'ArrowLeft':
        case 'h':
          e.preventDefault();
          panCamera(PAN_STEP, 0);
          return;
        case 'ArrowRight':
        case 'l':
          e.preventDefault();
          panCamera(-PAN_STEP, 0);
          return;
        case 'ArrowUp':
        case 'k':
          e.preventDefault();
          panCamera(0, PAN_STEP);
          return;
        case 'ArrowDown':
        case 'j':
          e.preventDefault();
          panCamera(0, -PAN_STEP);
          return;
      }

      if (e.key === 'Escape') {
        clearSelection();
      }
      if (e.key === 'f' && selectedEntries.size > 0) {
        e.preventDefault();
        setFocusedEntries(new Set(selectedEntries));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clearSelection, selectedEntries, setFocusedEntries, panCamera]);

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <LayoutSettings options={layoutOptions} onChange={setLayoutOptions} />
      {(selectedEntries.size > 0 || focusedEntries.size > 0) && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-background/90 backdrop-blur border border-border rounded-full px-3 py-1.5 shadow-sm text-xs text-muted-foreground">
          <span>{selectedEntries.size} selected</span>
          {(selectedEntries.size !== focusedEntries.size ||
            [...selectedEntries].some((id) => !focusedEntries.has(id))) && (
            <button
              type="button"
              onClick={() => setFocusedEntries(new Set(selectedEntries))}
              className="text-blue-600 hover:text-blue-800 font-medium inline-flex items-center gap-1"
            >
              Focus <Kbd>F</Kbd>
            </button>
          )}
          <button
            type="button"
            onClick={clearSelection}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            Clear <Kbd>Esc</Kbd>
          </button>
        </div>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onMoveEnd={handleMoveEnd}
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
  diffData,
  focusDepth,
  onFocusMaxDepthChange,
  onLayoutReady,
  searchQuery,
  enabledTypes,
  showConditionals,
  recenterRef,
  onOffCenterChange,
}: FlowGraphProps) {
  return (
    <ReactFlowProvider>
      <FlowGraphInner
        graph={graph}
        diffData={diffData}
        focusDepth={focusDepth}
        onFocusMaxDepthChange={onFocusMaxDepthChange}
        onLayoutReady={onLayoutReady}
        searchQuery={searchQuery}
        enabledTypes={enabledTypes}
        showConditionals={showConditionals}
        recenterRef={recenterRef}
        onOffCenterChange={onOffCenterChange}
      />
    </ReactFlowProvider>
  );
}
