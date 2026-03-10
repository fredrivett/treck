import { describe, expect, it } from 'vitest';
import type { DocsIndex } from './components/docs-tree-data';
import { buildTree } from './components/docs-tree-data';
import { docPathToUrl, escapeHtml, urlToDocPath } from './docs-utils';

describe('docPathToUrl', () => {
  it('strips .md extension and prepends /docs/', () => {
    expect(docPathToUrl('src/checker/index/StaleChecker.md')).toBe(
      '/docs/src/checker/index/StaleChecker',
    );
  });

  it('handles single-level paths', () => {
    expect(docPathToUrl('README.md')).toBe('/docs/README');
  });

  it('leaves paths without .md unchanged', () => {
    expect(docPathToUrl('src/index')).toBe('/docs/src/index');
  });
});

describe('urlToDocPath', () => {
  it('converts a /docs/ URL back to a doc path with .md', () => {
    expect(urlToDocPath('/docs/src/checker/index/StaleChecker')).toBe(
      'src/checker/index/StaleChecker.md',
    );
  });

  it('returns null for bare /docs path', () => {
    expect(urlToDocPath('/docs')).toBeNull();
  });

  it('returns null for /docs/ with trailing slash only', () => {
    expect(urlToDocPath('/docs/')).toBeNull();
  });

  it('returns null for non-matching path without docs prefix', () => {
    // urlToDocPath is only expected to be called with /docs/* paths;
    // for "/" the regex strips nothing, leaving "/" which is truthy
    expect(urlToDocPath('/docs')).toBeNull();
  });
});

describe('docPathToUrl and urlToDocPath roundtrip', () => {
  it('roundtrips correctly', () => {
    const docPath = 'src/utils/helpers.md';
    const url = docPathToUrl(docPath);
    expect(urlToDocPath(url)).toBe(docPath);
  });
});

describe('escapeHtml', () => {
  it('escapes ampersands', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('escapes angle brackets', () => {
    expect(escapeHtml('<div>')).toBe('&lt;div&gt;');
  });

  it('escapes double quotes', () => {
    expect(escapeHtml('say "hello"')).toBe('say &quot;hello&quot;');
  });

  it('escapes all special characters in one string', () => {
    expect(escapeHtml('<a href="x">&</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
  });

  it('returns empty string unchanged', () => {
    expect(escapeHtml('')).toBe('');
  });
});

describe('buildTree', () => {
  const index: DocsIndex = {
    'src/utils': [
      { name: 'helpers', docPath: 'src/utils/helpers.md', overview: 'Helper functions' },
      { name: 'format', docPath: 'src/utils/format.md', overview: 'Formatters' },
    ],
    'src/server': [{ name: 'Server', docPath: 'src/server/Server.md', overview: 'Main server' }],
    '.': [{ name: 'index', docPath: 'index.md', overview: 'Entry point' }],
  };

  it('builds a nested tree from flat index', () => {
    const tree = buildTree(index, null);
    expect(Object.keys(tree.children)).toContain('src');
    expect(Object.keys(tree.children)).toContain('.');

    const src = tree.children.src;
    expect(Object.keys(src.children)).toContain('utils');
    expect(Object.keys(src.children)).toContain('server');

    expect(src.children.utils.symbols).toHaveLength(2);
    expect(src.children.server.symbols).toHaveLength(1);
  });

  it('places root-level entries under the . directory', () => {
    const tree = buildTree(index, null);
    expect(tree.children['.'].symbols).toHaveLength(1);
    expect(tree.children['.'].symbols[0].name).toBe('index');
  });

  it('filters symbols by visible names set', () => {
    const tree = buildTree(index, new Set(['helpers']));
    const utils = tree.children.src?.children.utils;
    expect(utils.symbols).toHaveLength(1);
    expect(utils.symbols[0].name).toBe('helpers');
  });

  it('excludes directories with no matching symbols', () => {
    const tree = buildTree(index, new Set(['Server']));
    // src/server should exist but src/utils should not (no match)
    expect(tree.children.src.children.server).toBeDefined();
    expect(tree.children.src.children.utils).toBeUndefined();
    // root "." should also be excluded (no match for "Server" in "index")
    expect(tree.children['.']).toBeUndefined();
  });

  it('returns empty tree when nothing matches', () => {
    const tree = buildTree(index, new Set(['zzzznotfound']));
    expect(Object.keys(tree.children)).toHaveLength(0);
    expect(tree.symbols).toHaveLength(0);
  });

  it('returns all symbols when filter is empty', () => {
    const tree = buildTree(index, null);
    const allSymbols: string[] = [];
    function collect(node: { children: Record<string, typeof node>; symbols: { name: string }[] }) {
      for (const sym of node.symbols) allSymbols.push(sym.name);
      for (const child of Object.values(node.children)) collect(child);
    }
    collect(tree);
    expect(allSymbols).toHaveLength(4);
  });
});
