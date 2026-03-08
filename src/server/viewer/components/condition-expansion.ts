import type React from 'react';
import type { Edge, Node } from '@xyflow/react';

import type { FlowGraph as FlowGraphData, GraphNode } from '../../../graph/types.js';

export const edgeStyleByType: Record<string, React.CSSProperties> = {
  'direct-call': { stroke: '#6b7280' },
  'async-dispatch': { stroke: '#ec4899' },
  'event-emit': { stroke: '#ec4899', strokeDasharray: '4 4' },
  'http-request': { stroke: '#f97316', strokeDasharray: '8 4' },
  'conditional-call': { stroke: '#eab308' },
  'error-handler': { stroke: '#ef4444' },
  'middleware-chain': { stroke: '#06b6d4', strokeDasharray: '4 2' },
};

function getNodeType(node: GraphNode): string {
  if (node.entryType) return 'entryPoint';
  if (node.kind === 'component') return 'componentNode';
  if (node.kind === 'function' && /^use[A-Z]/.test(node.name)) return 'hookNode';
  return 'functionNode';
}

export function toReactFlowNode(node: GraphNode): Node {
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

/**
 * Strip `if (...)` wrapper, trailing `&&`/`||`, and other noise from a
 * condition string to produce a clean expression for display.
 *
 * For `else (expr)` conditions (else-only branches), negates the expression
 * so the condition node reads as the actual guard, e.g. `staleDocs.length > 0`.
 */
export function cleanConditionText(raw: string): string {
  let text = raw.trim();
  // Handle "else (expr)" — negate the expression
  const elseMatch = text.match(/^else\s+\((.+)\)$/s);
  if (elseMatch) return negateExpression(elseMatch[1].trim());
  // Strip "if (...)" or "else if (...)" wrapper
  const ifMatch = text.match(/^(?:else\s+)?if\s*\((.+)\)$/s);
  if (ifMatch) return ifMatch[1].trim();
  // Strip trailing && or ||
  text = text.replace(/\s*[&|]{2}\s*$/, '').trim();
  return text;
}

/** Negate a simple comparison expression, or wrap in `!(...)`. */
function negateExpression(expr: string): string {
  // Strip leading ! or unwrap !(...)
  if (expr.startsWith('!')) return expr.slice(1).replace(/^\((.+)\)$/, '$1');
  // Only flip comparisons in simple expressions (no logical operators that
  // could cause greedy regex to match an inner comparison incorrectly)
  if (!/&&|\|\|/.test(expr)) {
    const comparisons: [RegExp, string][] = [
      [/^(.+)\s*===\s*(.+)$/, '!=='],
      [/^(.+)\s*!==\s*(.+)$/, '==='],
      [/^(.+)\s*==\s*(.+)$/, '!='],
      [/^(.+)\s*!=\s*(.+)$/, '=='],
      [/^(.+)\s*>=\s*(.+)$/, '<'],
      [/^(.+)\s*<=\s*(.+)$/, '>'],
      [/^(.+)\s*>\s*(.+)$/, '<='],
      [/^(.+)\s*<\s*(.+)$/, '>='],
    ];
    for (const [pattern, operator] of comparisons) {
      const match = expr.match(pattern);
      if (match) {
        return `${match[1].trim()} ${operator} ${match[2].trim()}`;
      }
    }
  }
  return `!(${expr})`;
}

/**
 * Expand conditional edges into condition-node chains that preserve nested
 * branch paths while still sharing common prefixes.
 */
export function expandConditionals(
  graphNodes: FlowGraphData['nodes'],
  graphEdges: FlowGraphData['edges'],
): { rfNodes: Node[]; rfEdges: Edge[] } {
  const rfNodes: Node[] = graphNodes.map(toReactFlowNode);
  const rfEdges: Edge[] = [];
  const seenNodeIds = new Set(rfNodes.map((node) => node.id));
  const seenEdgeIds = new Set<string>();

  const pushEdge = (edge: Edge) => {
    if (!seenEdgeIds.has(edge.id)) {
      seenEdgeIds.add(edge.id);
      rfEdges.push(edge);
    }
  };

  for (const edge of graphEdges) {
    if (edge.type === 'conditional-call' && edge.conditions?.length) {
      let currentSource = edge.source;
      const prefixParts: string[] = [];

      for (const condition of edge.conditions) {
        prefixParts.push(
          [condition.branchGroup, condition.branch, condition.condition].join('::'),
        );
        const condNodeId = `cond::${edge.source}::${prefixParts.join('>>')}`;

        if (!seenNodeIds.has(condNodeId)) {
          seenNodeIds.add(condNodeId);
          rfNodes.push({
            id: condNodeId,
            type: 'conditionNode',
            position: { x: 0, y: 0 },
            data: { label: cleanConditionText(condition.condition) },
          });
        }

        pushEdge({
          id: `${currentSource}->${condNodeId}`,
          source: currentSource,
          target: condNodeId,
          style: edgeStyleByType['conditional-call'],
        });

        currentSource = condNodeId;
      }

      pushEdge({
        id: `${currentSource}->${edge.target}::${edge.id}`,
        source: currentSource,
        target: edge.target,
        style: edgeStyleByType['conditional-call'],
      });
      continue;
    }

    const style = edgeStyleByType[edge.type] || { stroke: '#9ca3af' };
    let label: string | undefined;
    if (edge.type !== 'direct-call' && edge.type !== 'async-dispatch') {
      label = edge.label || edge.type;
    }
    pushEdge({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      animated: edge.type === 'async-dispatch' || edge.type === 'event-emit',
      label,
      style,
      labelStyle: { fontSize: 10, fill: 'var(--graph-edge-label)' },
    });
  }

  return { rfNodes, rfEdges };
}
