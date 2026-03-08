import { describe, expect, it } from 'vitest';

import type { FlowGraph } from '../../../graph/types.js';
import { expandConditionals } from './condition-expansion';

function makeGraph(): FlowGraph {
  return {
    version: '1.0',
    generatedAt: new Date().toISOString(),
    nodes: [
      {
        id: 'TreeDir',
        name: 'TreeDir',
        kind: 'component',
        filePath: 'DocsTree.tsx',
        isAsync: false,
        hash: 'a',
        lineRange: [1, 1],
        hasJsDoc: false,
      },
      {
        id: 'Guides',
        name: 'Guides',
        kind: 'component',
        filePath: 'DocsTree.tsx',
        isAsync: false,
        hash: 'b',
        lineRange: [1, 1],
        hasJsDoc: false,
      },
      {
        id: 'RecursiveTreeDir',
        name: 'TreeDir',
        kind: 'component',
        filePath: 'DocsTree.tsx',
        isAsync: false,
        hash: 'c',
        lineRange: [1, 1],
        hasJsDoc: false,
      },
      {
        id: 'docPathToUrl',
        name: 'docPathToUrl',
        kind: 'function',
        filePath: 'docs-utils.ts',
        isAsync: false,
        hash: 'd',
        lineRange: [1, 1],
        hasJsDoc: false,
      },
    ],
    edges: [
      {
        id: 'TreeDir->Guides',
        source: 'TreeDir',
        target: 'Guides',
        type: 'conditional-call',
        conditions: [
          { condition: '!isCollapsed &&', branch: '&&', branchGroup: 'branch:133' },
        ],
        label: '!isCollapsed &&',
        isAsync: false,
      },
      {
        id: 'TreeDir->RecursiveTreeDir',
        source: 'TreeDir',
        target: 'RecursiveTreeDir',
        type: 'conditional-call',
        conditions: [
          { condition: '!isCollapsed &&', branch: '&&', branchGroup: 'branch:133' },
          {
            condition: "if (item.type === 'dir')",
            branch: 'then',
            branchGroup: 'branch:136',
          },
        ],
        label: "!isCollapsed && → if (item.type === 'dir')",
        isAsync: false,
      },
      {
        id: 'TreeDir->docPathToUrl',
        source: 'TreeDir',
        target: 'docPathToUrl',
        type: 'conditional-call',
        conditions: [
          { condition: '!isCollapsed &&', branch: '&&', branchGroup: 'branch:133' },
        ],
        label: '!isCollapsed &&',
        isAsync: false,
      },
    ],
  };
}

describe('expandConditionals', () => {
  it('shares outer condition nodes and preserves nested condition chains', () => {
    const graph = makeGraph();

    const { rfNodes, rfEdges } = expandConditionals(graph.nodes, graph.edges);

    const outerNode = rfNodes.find(
      (node) => node.id === 'cond::TreeDir::branch:133::&&::!isCollapsed &&',
    );
    const nestedNode = rfNodes.find(
      (node) =>
        node.id ===
        "cond::TreeDir::branch:133::&&::!isCollapsed &&>>branch:136::then::if (item.type === 'dir')",
    );

    expect(outerNode?.data).toMatchObject({ label: '!isCollapsed' });
    expect(nestedNode?.data).toMatchObject({ label: "item.type === 'dir'" });

    expect(
      rfEdges.find((edge) => edge.id === 'TreeDir->cond::TreeDir::branch:133::&&::!isCollapsed &&'),
    ).toBeDefined();
    expect(
      rfEdges.find(
        (edge) =>
          edge.id ===
          "cond::TreeDir::branch:133::&&::!isCollapsed &&->cond::TreeDir::branch:133::&&::!isCollapsed &&>>branch:136::then::if (item.type === 'dir')",
      ),
    ).toBeDefined();

    expect(
      rfEdges.find(
        (edge) =>
          edge.id ===
          'cond::TreeDir::branch:133::&&::!isCollapsed &&->Guides::TreeDir->Guides',
      ),
    ).toBeDefined();
    expect(
      rfEdges.find(
        (edge) =>
          edge.id ===
          'cond::TreeDir::branch:133::&&::!isCollapsed &&->docPathToUrl::TreeDir->docPathToUrl',
      ),
    ).toBeDefined();
    expect(
      rfEdges.find(
        (edge) =>
          edge.id ===
          "cond::TreeDir::branch:133::&&::!isCollapsed &&>>branch:136::then::if (item.type === 'dir')->RecursiveTreeDir::TreeDir->RecursiveTreeDir",
      ),
    ).toBeDefined();
  });
});
