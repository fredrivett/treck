/**
 * Tests for TypeScript/JavaScript symbol extractor
 */

import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TypeScriptExtractor } from './index.js';

const TEST_DIR = join(process.cwd(), '.test-tmp');
const TEST_FILE = join(TEST_DIR, 'test.ts');
const TEST_TSX_FILE = join(TEST_DIR, 'test.tsx');

describe('TypeScriptExtractor', () => {
  let extractor: TypeScriptExtractor;

  beforeEach(() => {
    extractor = new TypeScriptExtractor();
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    try {
      if (existsSync(TEST_FILE)) unlinkSync(TEST_FILE);
      if (existsSync(TEST_TSX_FILE)) unlinkSync(TEST_TSX_FILE);
    } catch (_e) {
      // Ignore cleanup errors
    }
  });

  describe('Function Declarations', () => {
    it('should extract basic function declaration', () => {
      const code = `
function add(a: number, b: number): number {
  return a + b
}
`;
      writeFileSync(TEST_FILE, code);

      const result = extractor.extractSymbols(TEST_FILE);

      expect(result.symbols).toHaveLength(1);
      expect(result.symbols[0]).toMatchObject({
        name: 'add',
        kind: 'function',
        params: 'a: number, b: number',
      });
      expect(result.symbols[0].body).toContain('return a + b');
    });

    it('should extract async function', () => {
      const code = `
async function fetchData(url: string) {
  const response = await fetch(url)
  return response.json()
}
`;
      writeFileSync(TEST_FILE, code);

      const result = extractor.extractSymbols(TEST_FILE);

      expect(result.symbols).toHaveLength(1);
      expect(result.symbols[0]).toMatchObject({
        name: 'fetchData',
        kind: 'function',
        params: 'url: string',
      });
    });

    it('should extract exported function', () => {
      const code = `
export function greet(name: string): string {
  return \`Hello, \${name}!\`
}
`;
      writeFileSync(TEST_FILE, code);

      const result = extractor.extractSymbols(TEST_FILE);

      expect(result.symbols).toHaveLength(1);
      expect(result.symbols[0].name).toBe('greet');
    });

    it('should extract function with no parameters', () => {
      const code = `
function getCurrentTime() {
  return Date.now()
}
`;
      writeFileSync(TEST_FILE, code);

      const result = extractor.extractSymbols(TEST_FILE);

      expect(result.symbols).toHaveLength(1);
      expect(result.symbols[0]).toMatchObject({
        name: 'getCurrentTime',
        params: '',
      });
    });

    it('should extract function with complex parameters', () => {
      const code = `
function process(
  data: string[],
  options: { timeout: number; retry: boolean } = { timeout: 5000, retry: true }
): Promise<void> {
  // processing
}
`;
      writeFileSync(TEST_FILE, code);

      const result = extractor.extractSymbols(TEST_FILE);

      expect(result.symbols).toHaveLength(1);
      expect(result.symbols[0].params).toContain('data: string[]');
      expect(result.symbols[0].params).toContain('options');
    });
  });

  describe('Arrow Functions', () => {
    it('should extract const arrow function', () => {
      const code = `
const multiply = (a: number, b: number) => {
  return a * b
}
`;
      writeFileSync(TEST_FILE, code);

      const result = extractor.extractSymbols(TEST_FILE);

      expect(result.symbols).toHaveLength(1);
      expect(result.symbols[0]).toMatchObject({
        name: 'multiply',
        kind: 'const',
        params: 'a: number, b: number',
      });
      expect(result.symbols[0].body).toContain('return a * b');
    });

    it('should extract arrow function with implicit return', () => {
      const code = `
const square = (x: number) => x * x
`;
      writeFileSync(TEST_FILE, code);

      const result = extractor.extractSymbols(TEST_FILE);

      expect(result.symbols).toHaveLength(1);
      expect(result.symbols[0]).toMatchObject({
        name: 'square',
        kind: 'const',
        params: 'x: number',
      });
      // Implicit return should be wrapped in block
      expect(result.symbols[0].body).toContain('return');
      expect(result.symbols[0].body).toContain('x * x');
    });

    it('should extract async arrow function', () => {
      const code = `
const fetchUser = async (id: string) => {
  const response = await fetch(\`/api/users/\${id}\`)
  return response.json()
}
`;
      writeFileSync(TEST_FILE, code);

      const result = extractor.extractSymbols(TEST_FILE);

      expect(result.symbols).toHaveLength(1);
      expect(result.symbols[0].name).toBe('fetchUser');
    });

    it('should extract arrow function with no parameters', () => {
      const code = `
const getTimestamp = () => Date.now()
`;
      writeFileSync(TEST_FILE, code);

      const result = extractor.extractSymbols(TEST_FILE);

      expect(result.symbols).toHaveLength(1);
      expect(result.symbols[0]).toMatchObject({
        name: 'getTimestamp',
        params: '',
      });
    });
  });

  describe('Function Expressions', () => {
    it('should extract function expression', () => {
      const code = `
const divide = function(a: number, b: number): number {
  if (b === 0) throw new Error('Division by zero')
  return a / b
}
`;
      writeFileSync(TEST_FILE, code);

      const result = extractor.extractSymbols(TEST_FILE);

      expect(result.symbols).toHaveLength(1);
      expect(result.symbols[0]).toMatchObject({
        name: 'divide',
        kind: 'const',
        params: 'a: number, b: number',
      });
    });
  });

  describe('Classes', () => {
    it('should extract basic class', () => {
      const code = `
class Calculator {
  add(a: number, b: number): number {
    return a + b
  }

  subtract(a: number, b: number): number {
    return a - b
  }
}
`;
      writeFileSync(TEST_FILE, code);

      const result = extractor.extractSymbols(TEST_FILE);

      expect(result.symbols).toHaveLength(1);
      expect(result.symbols[0]).toMatchObject({
        name: 'Calculator',
        kind: 'class',
        params: '',
      });
      expect(result.symbols[0].body).toContain('add');
      expect(result.symbols[0].body).toContain('subtract');
    });

    it('should extract exported class', () => {
      const code = `
export class UserService {
  private users: User[] = []

  addUser(user: User): void {
    this.users.push(user)
  }
}
`;
      writeFileSync(TEST_FILE, code);

      const result = extractor.extractSymbols(TEST_FILE);

      expect(result.symbols).toHaveLength(1);
      expect(result.symbols[0].name).toBe('UserService');
    });

    it('should extract class with constructor', () => {
      const code = `
class Person {
  constructor(public name: string, public age: number) {}

  greet(): string {
    return \`Hello, I'm \${this.name}\`
  }
}
`;
      writeFileSync(TEST_FILE, code);

      const result = extractor.extractSymbols(TEST_FILE);

      expect(result.symbols).toHaveLength(1);
      expect(result.symbols[0].body).toContain('constructor');
      expect(result.symbols[0].body).toContain('greet');
    });
  });

  describe('Multiple Symbols', () => {
    it('should extract all symbols from a file', () => {
      const code = `
function regularFunc() {
  return 'regular'
}

const arrowFunc = () => 'arrow'

class MyClass {
  method() {}
}

export function exportedFunc() {
  return 'exported'
}
`;
      writeFileSync(TEST_FILE, code);

      const result = extractor.extractSymbols(TEST_FILE);

      expect(result.symbols).toHaveLength(4);
      expect(result.symbols.map((s) => s.name)).toEqual([
        'regularFunc',
        'arrowFunc',
        'MyClass',
        'exportedFunc',
      ]);
    });
  });

  describe('extractSymbol (single symbol)', () => {
    it('should extract specific symbol by name', () => {
      const code = `
function first() { return 1 }
function second() { return 2 }
function third() { return 3 }
`;
      writeFileSync(TEST_FILE, code);

      const symbol = extractor.extractSymbol(TEST_FILE, 'second');

      expect(symbol).not.toBeNull();
      expect(symbol?.name).toBe('second');
      expect(symbol?.body).toContain('return 2');
    });

    it('should return null for non-existent symbol', () => {
      const code = `
function exists() { return true }
`;
      writeFileSync(TEST_FILE, code);

      const symbol = extractor.extractSymbol(TEST_FILE, 'doesNotExist');

      expect(symbol).toBeNull();
    });
  });

  describe('Line Numbers', () => {
    it('should track correct line numbers', () => {
      const code = `// Line 1
// Line 2
function myFunc() {
  // Line 4
  return 'hello'
  // Line 6
}
`;
      writeFileSync(TEST_FILE, code);

      const result = extractor.extractSymbols(TEST_FILE);

      expect(result.symbols).toHaveLength(1);
      expect(result.symbols[0].startLine).toBeGreaterThan(0);
      expect(result.symbols[0].endLine).toBeGreaterThan(result.symbols[0].startLine);
    });
  });

  describe('Error Handling', () => {
    it('should handle file with syntax errors gracefully', () => {
      const code = `
function broken( {
  // Syntax error: missing closing paren
  return 'oops'
}
`;
      writeFileSync(TEST_FILE, code);

      // Should not throw, but might return empty or partial results
      const result = extractor.extractSymbols(TEST_FILE);

      expect(result.symbols).toBeDefined();
      expect(Array.isArray(result.symbols)).toBe(true);
    });

    it('should throw ExtractionError for non-existent file', () => {
      expect(() => {
        extractor.extractSymbols('/non/existent/file.ts');
      }).toThrow();
    });
  });

  describe('Real-world Examples', () => {
    it('should extract from complex real-world code', () => {
      const code = `
import { useState, useEffect } from 'react'

export const useDebounce = <T>(value: T, delay: number): T => {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  return debouncedValue
}

export function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount)
}
`;
      writeFileSync(TEST_FILE, code);

      const result = extractor.extractSymbols(TEST_FILE);

      expect(result.symbols).toHaveLength(2);
      expect(result.symbols[0].name).toBe('useDebounce');
      expect(result.symbols[1].name).toBe('formatCurrency');
    });
  });

  describe('extractCallSites', () => {
    it('should find direct function calls', () => {
      const code = `
function helper() { return 1 }
function main() {
  const x = helper()
  return x
}
`;
      writeFileSync(TEST_FILE, code);

      const calls = extractor.extractCallSites(TEST_FILE, 'main');

      expect(calls).toHaveLength(1);
      expect(calls[0].name).toBe('helper');
      expect(calls[0].expression).toBe('helper');
    });

    it('should find method calls', () => {
      const code = `
function process(items: any[]) {
  items.map(x => x)
  items.filter(Boolean)
  console.log('done')
}
`;
      writeFileSync(TEST_FILE, code);

      const calls = extractor.extractCallSites(TEST_FILE, 'process');
      const names = calls.map((c) => c.name);

      expect(names).toContain('map');
      expect(names).toContain('filter');
      expect(names).toContain('log');
    });

    it('should not duplicate calls to the same function', () => {
      const code = `
function helper() { return 1 }
function main() {
  helper()
  helper()
  helper()
}
`;
      writeFileSync(TEST_FILE, code);

      const calls = extractor.extractCallSites(TEST_FILE, 'main');

      expect(calls).toHaveLength(1);
      expect(calls[0].name).toBe('helper');
    });

    it('should return empty for functions with no calls', () => {
      const code = `
function simple() {
  return 42
}
`;
      writeFileSync(TEST_FILE, code);

      const calls = extractor.extractCallSites(TEST_FILE, 'simple');

      expect(calls).toHaveLength(0);
    });

    it('should return empty for non-existent symbol', () => {
      const code = `function exists() { return 1 }`;
      writeFileSync(TEST_FILE, code);

      const calls = extractor.extractCallSites(TEST_FILE, 'doesNotExist');

      expect(calls).toHaveLength(0);
    });

    it('should find calls in arrow functions', () => {
      const code = `
function doWork() { return 'work' }
const main = () => {
  return doWork()
}
`;
      writeFileSync(TEST_FILE, code);

      const calls = extractor.extractCallSites(TEST_FILE, 'main');

      expect(calls).toHaveLength(1);
      expect(calls[0].name).toBe('doWork');
    });

    it('should find calls in class methods', () => {
      const code = `
function validate() { return true }
class Processor {
  run() {
    const valid = validate()
    this.cleanup()
  }
  cleanup() {}
}
`;
      writeFileSync(TEST_FILE, code);

      const calls = extractor.extractCallSites(TEST_FILE, 'Processor');
      const names = calls.map((c) => c.name);

      expect(names).toContain('validate');
      expect(names).toContain('cleanup');
    });

    it('should find calls inside call expression initializers (e.g. task())', () => {
      const code = `
function analyzeImage() { return 'result' }
function getConfig() { return {} }
const analyzeImageTask = task({
  id: "analyze-image",
  run: async () => {
    const config = getConfig()
    const result = analyzeImage()
    return result
  }
})
`;
      writeFileSync(TEST_FILE, code);

      const calls = extractor.extractCallSites(TEST_FILE, 'analyzeImageTask');
      const names = calls.map((c) => c.name);

      expect(names).toContain('task');
      expect(names).toContain('getConfig');
      expect(names).toContain('analyzeImage');
    });
  });

  describe('extractImports', () => {
    it('should extract named imports', () => {
      const code = `
import { foo, bar } from './utils'
`;
      writeFileSync(TEST_FILE, code);

      const imports = extractor.extractImports(TEST_FILE);

      expect(imports).toHaveLength(2);
      expect(imports[0]).toMatchObject({
        name: 'foo',
        originalName: 'foo',
        source: './utils',
        isDefault: false,
      });
      expect(imports[1]).toMatchObject({
        name: 'bar',
        originalName: 'bar',
        source: './utils',
        isDefault: false,
      });
    });

    it('should extract default imports', () => {
      const code = `
import MyModule from './my-module'
`;
      writeFileSync(TEST_FILE, code);

      const imports = extractor.extractImports(TEST_FILE);

      expect(imports).toHaveLength(1);
      expect(imports[0]).toMatchObject({
        name: 'MyModule',
        originalName: 'MyModule',
        source: './my-module',
        isDefault: true,
      });
    });

    it('should extract both default and named imports from same declaration', () => {
      const code = `
import React, { useState, useEffect } from 'react'
`;
      writeFileSync(TEST_FILE, code);

      const imports = extractor.extractImports(TEST_FILE);

      expect(imports).toHaveLength(3);
      expect(imports[0]).toMatchObject({ name: 'React', isDefault: true });
      expect(imports[1]).toMatchObject({ name: 'useState', isDefault: false });
      expect(imports[2]).toMatchObject({ name: 'useEffect', isDefault: false });
    });

    it('should skip type-only imports', () => {
      const code = `
import type { Foo } from './types'
import { bar } from './utils'
`;
      writeFileSync(TEST_FILE, code);

      const imports = extractor.extractImports(TEST_FILE);

      expect(imports).toHaveLength(1);
      expect(imports[0].name).toBe('bar');
    });

    it('should skip individual type-only elements', () => {
      const code = `
import { type Foo, bar, type Baz } from './mixed'
`;
      writeFileSync(TEST_FILE, code);

      const imports = extractor.extractImports(TEST_FILE);

      expect(imports).toHaveLength(1);
      expect(imports[0].name).toBe('bar');
    });

    it('should handle renamed imports with originalName', () => {
      const code = `
import { originalName as localName } from './module'
`;
      writeFileSync(TEST_FILE, code);

      const imports = extractor.extractImports(TEST_FILE);

      expect(imports).toHaveLength(1);
      expect(imports[0]).toMatchObject({
        name: 'localName',
        originalName: 'originalName',
        source: './module',
        isDefault: false,
      });
    });

    it('should skip side-effect imports', () => {
      const code = `
import './side-effect'
import { foo } from './utils'
`;
      writeFileSync(TEST_FILE, code);

      const imports = extractor.extractImports(TEST_FILE);

      expect(imports).toHaveLength(1);
      expect(imports[0].name).toBe('foo');
    });

    it('should handle imports from multiple sources', () => {
      const code = `
import { a } from './file-a'
import { b } from './file-b'
import { c } from '@/lib/file-c'
`;
      writeFileSync(TEST_FILE, code);

      const imports = extractor.extractImports(TEST_FILE);

      expect(imports).toHaveLength(3);
      expect(imports[0]).toMatchObject({ name: 'a', source: './file-a' });
      expect(imports[1]).toMatchObject({ name: 'b', source: './file-b' });
      expect(imports[2]).toMatchObject({ name: 'c', source: '@/lib/file-c' });
    });

    it('should return empty array for file with no imports', () => {
      const code = `
function standalone() { return 42 }
`;
      writeFileSync(TEST_FILE, code);

      const imports = extractor.extractImports(TEST_FILE);

      expect(imports).toHaveLength(0);
    });
  });

  describe('extractReExports', () => {
    it('should extract named re-exports', () => {
      const code = `
export { useSearch } from "./use-search"
export { parseParams, createFilter } from "./types"
`;
      writeFileSync(TEST_FILE, code);

      const reExports = extractor.extractReExports(TEST_FILE);

      expect(reExports).toHaveLength(3);
      expect(reExports[0]).toMatchObject({
        localName: 'useSearch',
        originalName: 'useSearch',
        source: './use-search',
      });
      expect(reExports[1]).toMatchObject({
        localName: 'parseParams',
        originalName: 'parseParams',
        source: './types',
      });
    });

    it('should handle renamed re-exports', () => {
      const code = `
export { internalFn as publicFn } from "./internal"
`;
      writeFileSync(TEST_FILE, code);

      const reExports = extractor.extractReExports(TEST_FILE);

      expect(reExports).toHaveLength(1);
      expect(reExports[0]).toMatchObject({
        localName: 'publicFn',
        originalName: 'internalFn',
        source: './internal',
      });
    });

    it('should skip type-only re-exports', () => {
      const code = `
export type { SearchState } from "./types"
export { useSearch } from "./use-search"
`;
      writeFileSync(TEST_FILE, code);

      const reExports = extractor.extractReExports(TEST_FILE);

      expect(reExports).toHaveLength(1);
      expect(reExports[0].localName).toBe('useSearch');
    });

    it('should skip individual type-only elements in re-exports', () => {
      const code = `
export { type SearchState, useSearch } from "./use-search"
`;
      writeFileSync(TEST_FILE, code);

      const reExports = extractor.extractReExports(TEST_FILE);

      expect(reExports).toHaveLength(1);
      expect(reExports[0].localName).toBe('useSearch');
    });

    it('should return empty for files with no re-exports', () => {
      const code = `
export function foo() { return 1 }
import { bar } from "./bar"
`;
      writeFileSync(TEST_FILE, code);

      const reExports = extractor.extractReExports(TEST_FILE);

      expect(reExports).toHaveLength(0);
    });

    it('should handle mixed exports and re-exports', () => {
      const code = `
export * from "./api"
export { useSearch } from "./use-search"
export function localHelper() { return 1 }
`;
      writeFileSync(TEST_FILE, code);

      const reExports = extractor.extractReExports(TEST_FILE);

      // Only named re-exports, not star or local exports
      expect(reExports).toHaveLength(1);
      expect(reExports[0].localName).toBe('useSearch');
    });
  });

  describe('React component detection', () => {
    it('should detect function declaration component in .tsx file', () => {
      const code = `
export function UserAvatar({ name }: { name: string }) {
  return <div className="avatar">{name}</div>
}
`;
      writeFileSync(TEST_TSX_FILE, code);

      const result = extractor.extractSymbols(TEST_TSX_FILE);

      expect(result.symbols).toHaveLength(1);
      expect(result.symbols[0].kind).toBe('component');
    });

    it('should detect arrow function component in .tsx file', () => {
      const code = `
const ProfileCard = ({ user }: Props) => {
  return <div><span>{user.name}</span></div>
}
`;
      writeFileSync(TEST_TSX_FILE, code);

      const result = extractor.extractSymbols(TEST_TSX_FILE);

      expect(result.symbols).toHaveLength(1);
      expect(result.symbols[0].kind).toBe('component');
    });

    it('should detect component with JSX fragment', () => {
      const code = `
export function Layout({ children }: Props) {
  return <><header />{children}<footer /></>
}
`;
      writeFileSync(TEST_TSX_FILE, code);

      const result = extractor.extractSymbols(TEST_TSX_FILE);

      expect(result.symbols).toHaveLength(1);
      expect(result.symbols[0].kind).toBe('component');
    });

    it('should NOT detect lowercase function as component', () => {
      const code = `
export function renderItem({ name }: Props) {
  return <div>{name}</div>
}
`;
      writeFileSync(TEST_TSX_FILE, code);

      const result = extractor.extractSymbols(TEST_TSX_FILE);

      expect(result.symbols).toHaveLength(1);
      expect(result.symbols[0].kind).toBe('function');
    });

    it('should NOT detect PascalCase function in .ts file as component', () => {
      const code = `
export function CreateUser(name: string) {
  return { id: '1', name }
}
`;
      writeFileSync(TEST_FILE, code);

      const result = extractor.extractSymbols(TEST_FILE);

      expect(result.symbols).toHaveLength(1);
      expect(result.symbols[0].kind).toBe('function');
    });

    it('should NOT detect PascalCase function without JSX as component', () => {
      const code = `
export function FormatName(first: string, last: string) {
  return first + ' ' + last
}
`;
      writeFileSync(TEST_TSX_FILE, code);

      const result = extractor.extractSymbols(TEST_TSX_FILE);

      expect(result.symbols).toHaveLength(1);
      expect(result.symbols[0].kind).toBe('function');
    });
  });

  describe('Conditional Call Sites', () => {
    it('should detect calls in if/else branches', () => {
      const code = `
function handleRequest(req: any) {
  if (req.type === 'image') {
    processImage(req)
  } else {
    processDocument(req)
  }
}
`;
      writeFileSync(TEST_FILE, code);

      const calls = extractor.extractCallSites(TEST_FILE, 'handleRequest');

      expect(calls).toHaveLength(2);
      const imageCall = calls.find((c) => c.name === 'processImage');
      const docCall = calls.find((c) => c.name === 'processDocument');

      expect(imageCall?.conditions).toHaveLength(1);
      expect(imageCall?.conditions?.[0].branch).toBe('then');
      expect(imageCall?.conditions?.[0].condition).toContain('if (');

      expect(docCall?.conditions).toHaveLength(1);
      expect(docCall?.conditions?.[0].branch).toBe('else');

      // Both should share the same branchGroup
      expect(imageCall?.conditions?.[0].branchGroup).toBe(docCall?.conditions?.[0].branchGroup);
    });

    it('should detect calls in if without else', () => {
      const code = `
function maybeProcess(req: any) {
  if (req.urgent) {
    prioritize(req)
  }
  finalize(req)
}
`;
      writeFileSync(TEST_FILE, code);

      const calls = extractor.extractCallSites(TEST_FILE, 'maybeProcess');

      const prioritizeCall = calls.find((c) => c.name === 'prioritize');
      const finalizeCall = calls.find((c) => c.name === 'finalize');

      expect(prioritizeCall?.conditions).toHaveLength(1);
      expect(prioritizeCall?.conditions?.[0].branch).toBe('then');

      expect(finalizeCall?.conditions).toBeUndefined();
    });

    it('should handle else if chains as flat (same branchGroup)', () => {
      const code = `
function route(req: any) {
  if (req.method === 'GET') {
    handleGet(req)
  } else if (req.method === 'POST') {
    handlePost(req)
  } else {
    handleOther(req)
  }
}
`;
      writeFileSync(TEST_FILE, code);

      const calls = extractor.extractCallSites(TEST_FILE, 'route');

      expect(calls).toHaveLength(3);
      const getCall = calls.find((c) => c.name === 'handleGet');
      const postCall = calls.find((c) => c.name === 'handlePost');
      const otherCall = calls.find((c) => c.name === 'handleOther');

      // All should have exactly 1 condition (flat, not nested)
      expect(getCall?.conditions).toHaveLength(1);
      expect(postCall?.conditions).toHaveLength(1);
      expect(otherCall?.conditions).toHaveLength(1);

      // All should share the same branchGroup
      const group = getCall?.conditions?.[0].branchGroup;
      expect(postCall?.conditions?.[0].branchGroup).toBe(group);
      expect(otherCall?.conditions?.[0].branchGroup).toBe(group);

      // Check branch types
      expect(getCall?.conditions?.[0].branch).toBe('then');
      expect(postCall?.conditions?.[0].branch).toBe('else-if');
      expect(postCall?.conditions?.[0].condition).toContain('else if (');
      expect(otherCall?.conditions?.[0].branch).toBe('else');
    });

    it('should handle else if chains with 3+ branches', () => {
      const code = `
function classify(item: any) {
  if (item.type === 'a') {
    handleA(item)
  } else if (item.type === 'b') {
    handleB(item)
  } else if (item.type === 'c') {
    handleC(item)
  } else {
    handleDefault(item)
  }
}
`;
      writeFileSync(TEST_FILE, code);

      const calls = extractor.extractCallSites(TEST_FILE, 'classify');

      expect(calls).toHaveLength(4);
      const handleA = calls.find((c) => c.name === 'handleA');
      const handleB = calls.find((c) => c.name === 'handleB');
      const handleC = calls.find((c) => c.name === 'handleC');
      const handleDefault = calls.find((c) => c.name === 'handleDefault');

      const group = handleA?.conditions?.[0].branchGroup;

      // All should share the same branchGroup and have 1 condition
      for (const call of calls) {
        expect(call.conditions).toHaveLength(1);
        expect(call.conditions?.[0].branchGroup).toBe(group);
      }

      // Check branch types and condition strings
      expect(handleA?.conditions?.[0].branch).toBe('then');
      expect(handleA?.conditions?.[0].condition).toBe("if (item.type === 'a')");
      expect(handleB?.conditions?.[0].branch).toBe('else-if');
      expect(handleB?.conditions?.[0].condition).toContain('else if (');
      expect(handleC?.conditions?.[0].branch).toBe('else-if');
      expect(handleC?.conditions?.[0].condition).toContain('else if (');
      expect(handleDefault?.conditions?.[0].branch).toBe('else');
      expect(handleDefault?.conditions?.[0].condition).toBe('else');
    });

    it('should handle nested if inside if with condition chain', () => {
      const code = `
function process(req: any) {
  if (req.type === 'image') {
    if (req.size > 1000) {
      compress(req)
    }
    transform(req)
  }
}
`;
      writeFileSync(TEST_FILE, code);

      const calls = extractor.extractCallSites(TEST_FILE, 'process');

      const compressCall = calls.find((c) => c.name === 'compress');
      const transformCall = calls.find((c) => c.name === 'transform');

      // compress has 2 conditions (outer if + inner if)
      expect(compressCall?.conditions).toHaveLength(2);
      expect(compressCall?.conditions?.[0].condition).toContain('req.type');
      expect(compressCall?.conditions?.[1].condition).toContain('req.size');

      // Different branchGroups for different if statements
      expect(compressCall?.conditions?.[0].branchGroup).not.toBe(
        compressCall?.conditions?.[1].branchGroup,
      );

      // transform has 1 condition (only outer if)
      expect(transformCall?.conditions).toHaveLength(1);
    });

    it('should handle deeply nested conditionals (3+ levels)', () => {
      const code = `
function deep(req: any) {
  if (req.a) {
    if (req.b) {
      if (req.c) {
        handle(req)
      }
    }
  }
}
`;
      writeFileSync(TEST_FILE, code);

      const calls = extractor.extractCallSites(TEST_FILE, 'deep');
      const handleCall = calls.find((c) => c.name === 'handle');

      expect(handleCall?.conditions).toHaveLength(3);
    });

    it('should detect switch/case with shared branchGroup', () => {
      const code = `
function handleAction(action: string) {
  switch (action) {
    case 'create':
      doCreate()
      break
    case 'update':
      doUpdate()
      break
    default:
      doDefault()
  }
}
`;
      writeFileSync(TEST_FILE, code);

      const calls = extractor.extractCallSites(TEST_FILE, 'handleAction');

      expect(calls).toHaveLength(3);
      const createCall = calls.find((c) => c.name === 'doCreate');
      const updateCall = calls.find((c) => c.name === 'doUpdate');
      const defaultCall = calls.find((c) => c.name === 'doDefault');

      // All share same branchGroup
      const group = createCall?.conditions?.[0].branchGroup;
      expect(updateCall?.conditions?.[0].branchGroup).toBe(group);
      expect(defaultCall?.conditions?.[0].branchGroup).toBe(group);

      expect(createCall?.conditions?.[0].branch).toBe("case 'create'");
      expect(defaultCall?.conditions?.[0].branch).toBe('default');
    });

    it('should handle switch with default case', () => {
      const code = `
function handleStatus(status: string) {
  switch (status) {
    case 'ok':
      logSuccess()
      break
    default:
      logError()
  }
}
`;
      writeFileSync(TEST_FILE, code);

      const calls = extractor.extractCallSites(TEST_FILE, 'handleStatus');

      const defaultCall = calls.find((c) => c.name === 'logError');
      expect(defaultCall?.conditions?.[0].branch).toBe('default');
      expect(defaultCall?.conditions?.[0].condition).toContain('default');
    });

    it('should handle switch fall-through (empty cases)', () => {
      const code = `
function handleType(type: string) {
  switch (type) {
    case 'jpg':
    case 'png':
    case 'gif':
      processImage()
      break
    case 'pdf':
      processDocument()
      break
  }
}
`;
      writeFileSync(TEST_FILE, code);

      const calls = extractor.extractCallSites(TEST_FILE, 'handleType');

      const imageCall = calls.find((c) => c.name === 'processImage');
      expect(imageCall?.conditions?.[0].condition).toContain("'jpg' | 'png' | 'gif'");
    });

    it('should detect ternary conditionals', () => {
      const code = `
function choose(flag: boolean) {
  const result = flag ? getPositive() : getNegative()
  return result
}
`;
      writeFileSync(TEST_FILE, code);

      const calls = extractor.extractCallSites(TEST_FILE, 'choose');

      const posCall = calls.find((c) => c.name === 'getPositive');
      const negCall = calls.find((c) => c.name === 'getNegative');

      expect(posCall?.conditions).toHaveLength(1);
      expect(posCall?.conditions?.[0].branch).toBe('then');

      expect(negCall?.conditions).toHaveLength(1);
      expect(negCall?.conditions?.[0].branch).toBe('else');

      // Same branchGroup
      expect(posCall?.conditions?.[0].branchGroup).toBe(negCall?.conditions?.[0].branchGroup);
    });

    it('should detect && guard', () => {
      const code = `
function maybeLog(verbose: boolean) {
  verbose && logDetails()
  finish()
}
`;
      writeFileSync(TEST_FILE, code);

      const calls = extractor.extractCallSites(TEST_FILE, 'maybeLog');

      const logCall = calls.find((c) => c.name === 'logDetails');
      const finishCall = calls.find((c) => c.name === 'finish');

      expect(logCall?.conditions).toHaveLength(1);
      expect(logCall?.conditions?.[0].branch).toBe('&&');
      expect(logCall?.conditions?.[0].condition).toContain('&&');

      expect(finishCall?.conditions).toBeUndefined();
    });

    it('should detect || guard', () => {
      const code = `
function ensureValue(val: any) {
  val || setDefault()
  process(val)
}
`;
      writeFileSync(TEST_FILE, code);

      const calls = extractor.extractCallSites(TEST_FILE, 'ensureValue');

      const defaultCall = calls.find((c) => c.name === 'setDefault');
      expect(defaultCall?.conditions).toHaveLength(1);
      expect(defaultCall?.conditions?.[0].branch).toBe('||');
    });

    // Dedup / coexistence tests

    it('should mark as unconditional when called both conditionally and unconditionally', () => {
      const code = `
function process(req: any) {
  if (req.fast) {
    validate(req)
  }
  validate(req)
}
`;
      writeFileSync(TEST_FILE, code);

      const calls = extractor.extractCallSites(TEST_FILE, 'process');

      const validateCall = calls.find((c) => c.name === 'validate');
      expect(validateCall?.conditions).toBeUndefined();
    });

    it('should mark as unconditional when called in both if and else', () => {
      const code = `
function process(req: any) {
  if (req.type === 'a') {
    log(req)
  } else {
    log(req)
  }
}
`;
      writeFileSync(TEST_FILE, code);

      const calls = extractor.extractCallSites(TEST_FILE, 'process');

      expect(calls).toHaveLength(1);
      const logCall = calls.find((c) => c.name === 'log');
      expect(logCall?.conditions).toBeUndefined();
    });

    it('should NOT promote to unconditional when only in some branches of 3+ chain', () => {
      const code = `
function route(req: any) {
  if (req.type === 'a') {
    foo(req)
  } else if (req.type === 'b') {
    bar(req)
  } else {
    foo(req)
  }
}
`;
      writeFileSync(TEST_FILE, code);

      const calls = extractor.extractCallSites(TEST_FILE, 'route');

      // foo() is in then + else but NOT else-if — it's still conditional
      const fooCalls = calls.filter((c) => c.name === 'foo');
      expect(fooCalls).toHaveLength(1);
      expect(fooCalls[0].conditions).toBeDefined();
      expect(fooCalls[0].conditions?.length).toBeGreaterThan(0);

      // bar is also conditional
      const barCall = calls.find((c) => c.name === 'bar');
      expect(barCall?.conditions).toBeDefined();
    });

    it('should promote to unconditional when called in ALL branches of 3+ chain', () => {
      const code = `
function route(req: any) {
  if (req.type === 'a') {
    log(req)
  } else if (req.type === 'b') {
    log(req)
  } else {
    log(req)
  }
}
`;
      writeFileSync(TEST_FILE, code);

      const calls = extractor.extractCallSites(TEST_FILE, 'route');

      // log() is in ALL 3 branches — should be unconditional
      const logCall = calls.find((c) => c.name === 'log');
      expect(logCall?.conditions).toBeUndefined();
    });

    it('should keep first occurrence when same function in different if blocks', () => {
      const code = `
function process(req: any) {
  if (req.a) {
    handle(req)
  }
  if (req.b) {
    handle(req)
  }
}
`;
      writeFileSync(TEST_FILE, code);

      const calls = extractor.extractCallSites(TEST_FILE, 'process');

      // Should be deduped to 1 call
      const handleCalls = calls.filter((c) => c.name === 'handle');
      expect(handleCalls).toHaveLength(1);
      // Should keep the first conditional occurrence
      expect(handleCalls[0].conditions).toHaveLength(1);
      expect(handleCalls[0].conditions?.[0].condition).toContain('req.a');
    });

    it('should promote ternary to unconditional when called in both branches', () => {
      const code = `
function process(flag: boolean) {
  const result = flag ? handle('a') : handle('b')
  return result
}
`;
      writeFileSync(TEST_FILE, code);

      const calls = extractor.extractCallSites(TEST_FILE, 'process');

      const handleCall = calls.find((c) => c.name === 'handle');
      expect(handleCall?.conditions).toBeUndefined();
    });

    it('should handle unconditional calls alongside conditional ones', () => {
      const code = `
function handleRequest(req: any) {
  validate(req)
  if (req.type === 'image') {
    processImage(req)
  }
  save(req)
}
`;
      writeFileSync(TEST_FILE, code);

      const calls = extractor.extractCallSites(TEST_FILE, 'handleRequest');

      const validateCall = calls.find((c) => c.name === 'validate');
      const imageCall = calls.find((c) => c.name === 'processImage');
      const saveCall = calls.find((c) => c.name === 'save');

      expect(validateCall?.conditions).toBeUndefined();
      expect(imageCall?.conditions).toHaveLength(1);
      expect(saveCall?.conditions).toBeUndefined();
    });

    // Edge cases

    it('should truncate long condition text', () => {
      const longCondition = 'a'.repeat(100);
      const code = `
function check(req: any) {
  if (req.${longCondition}) {
    handle(req)
  }
}
`;
      writeFileSync(TEST_FILE, code);

      const calls = extractor.extractCallSites(TEST_FILE, 'check');
      const handleCall = calls.find((c) => c.name === 'handle');

      // The condition inside "if (...)" should be truncated to 60 chars
      // The full condition text is "if (<truncated>)"
      expect(handleCall?.conditions?.[0].condition.length).toBeLessThanOrEqual(65);
    });

    it('should detect calls inside callbacks within conditionals', () => {
      const code = `
function process(items: any[], flag: boolean) {
  if (flag) {
    items.map((item: any) => transform(item))
  }
}
`;
      writeFileSync(TEST_FILE, code);

      const calls = extractor.extractCallSites(TEST_FILE, 'process');
      const transformCall = calls.find((c) => c.name === 'transform');

      expect(transformCall?.conditions).toHaveLength(1);
      expect(transformCall?.conditions?.[0].branch).toBe('then');
    });
  });

  describe('TypeScript-specific Features', () => {
    it('should handle generic functions', () => {
      const code = `
function identity<T>(arg: T): T {
  return arg
}
`;
      writeFileSync(TEST_FILE, code);

      const result = extractor.extractSymbols(TEST_FILE);

      expect(result.symbols).toHaveLength(1);
      expect(result.symbols[0].name).toBe('identity');
    });

    it('should handle type annotations', () => {
      const code = `
const processUser = (user: { id: string; name: string }): string => {
  return user.name
}
`;
      writeFileSync(TEST_FILE, code);

      const result = extractor.extractSymbols(TEST_FILE);

      expect(result.symbols).toHaveLength(1);
      expect(result.symbols[0].params).toContain('user');
    });
  });

  describe('JSDoc extraction', () => {
    it('should extract JSDoc description from function declaration', () => {
      const code = `
/** Adds two numbers together. */
function add(a: number, b: number): number {
  return a + b
}
`;
      writeFileSync(TEST_FILE, code);
      const result = extractor.extractSymbols(TEST_FILE);
      expect(result.symbols[0].jsDoc?.description).toBe('Adds two numbers together.');
    });

    it('should extract multi-line JSDoc description', () => {
      const code = `
/**
 * Processes data from the input stream.
 * Handles both binary and text formats.
 */
function process(data: string) { return data }
`;
      writeFileSync(TEST_FILE, code);
      const result = extractor.extractSymbols(TEST_FILE);
      expect(result.symbols[0].jsDoc?.description).toContain('Processes data');
      expect(result.symbols[0].jsDoc?.description).toContain('binary and text');
    });

    it('should extract JSDoc from arrow function', () => {
      const code = `
/** Multiplies two numbers. */
const multiply = (a: number, b: number) => a * b
`;
      writeFileSync(TEST_FILE, code);
      const result = extractor.extractSymbols(TEST_FILE);
      expect(result.symbols[0].jsDoc?.description).toBe('Multiplies two numbers.');
    });

    it('should extract JSDoc from function expression', () => {
      const code = `
/** Divides two numbers. */
const divide = function(a: number, b: number) { return a / b }
`;
      writeFileSync(TEST_FILE, code);
      const result = extractor.extractSymbols(TEST_FILE);
      expect(result.symbols[0].jsDoc?.description).toBe('Divides two numbers.');
    });

    it('should extract JSDoc from class declaration', () => {
      const code = `
/** A utility calculator. */
class Calculator {
  add(a: number, b: number) { return a + b }
}
`;
      writeFileSync(TEST_FILE, code);
      const result = extractor.extractSymbols(TEST_FILE);
      expect(result.symbols[0].jsDoc?.description).toBe('A utility calculator.');
    });

    it('should extract JSDoc from call expression initializer', () => {
      const code = `
/** The main processing task. */
const analyzeTask = task({
  id: "analyze",
  run: async () => { return 'done' }
})
`;
      writeFileSync(TEST_FILE, code);
      const result = extractor.extractSymbols(TEST_FILE);
      expect(result.symbols[0].jsDoc?.description).toBe('The main processing task.');
    });

    it('should return undefined jsDoc when no comment present', () => {
      const code = `function noDoc() { return 1 }`;
      writeFileSync(TEST_FILE, code);
      const result = extractor.extractSymbols(TEST_FILE);
      expect(result.symbols[0].jsDoc).toBeUndefined();
    });

    it('should return undefined jsDoc for regular // comment', () => {
      const code = `
// This is not JSDoc
function f() { return 1 }
`;
      writeFileSync(TEST_FILE, code);
      const result = extractor.extractSymbols(TEST_FILE);
      expect(result.symbols[0].jsDoc).toBeUndefined();
    });

    it('should merge @param descriptions into jsDoc.params and structuredParams', () => {
      const code = `
/**
 * Greets a user.
 * @param name - The user name
 * @param greeting - Custom greeting text
 */
function greet(name: string, greeting: string): string {
  return greeting + ', ' + name
}
`;
      writeFileSync(TEST_FILE, code);
      const result = extractor.extractSymbols(TEST_FILE);
      // jsDoc.params
      expect(result.symbols[0].jsDoc?.params).toEqual([
        { name: 'name', description: 'The user name' },
        { name: 'greeting', description: 'Custom greeting text' },
      ]);
      // structuredParams should also have descriptions
      expect(result.symbols[0].structuredParams?.[0].description).toBe('The user name');
      expect(result.symbols[0].structuredParams?.[1].description).toBe('Custom greeting text');
    });

    it('should ignore JSDoc type annotation in @param', () => {
      const code = `
/**
 * @param {string} name - The name
 */
function greet(name: string) { return name }
`;
      writeFileSync(TEST_FILE, code);
      const result = extractor.extractSymbols(TEST_FILE);
      expect(result.symbols[0].jsDoc?.params[0].description).toBe('The name');
      expect(result.symbols[0].jsDoc?.params[0].description).not.toContain('{string}');
    });

    it('should include @param in jsDoc even without matching actual param', () => {
      const code = `
/**
 * @param ghost - Not a real param
 */
function f(x: number) { return x }
`;
      writeFileSync(TEST_FILE, code);
      const result = extractor.extractSymbols(TEST_FILE);
      expect(result.symbols[0].jsDoc?.params).toEqual([
        { name: 'ghost', description: 'Not a real param' },
      ]);
      // But structuredParams won't have the ghost description since it doesn't match
      expect(result.symbols[0].structuredParams?.[0].name).toBe('x');
      expect(result.symbols[0].structuredParams?.[0].description).toBeUndefined();
    });

    it('should extract @returns description', () => {
      const code = `
/**
 * @returns The computed sum
 */
function add(a: number, b: number) { return a + b }
`;
      writeFileSync(TEST_FILE, code);
      const result = extractor.extractSymbols(TEST_FILE);
      expect(result.symbols[0].jsDoc?.returns).toBe('The computed sum');
    });

    it('should extract @example content', () => {
      const code = `
/**
 * @example
 * add(1, 2) // returns 3
 */
function add(a: number, b: number) { return a + b }
`;
      writeFileSync(TEST_FILE, code);
      const result = extractor.extractSymbols(TEST_FILE);
      expect(result.symbols[0].jsDoc?.examples).toHaveLength(1);
      expect(result.symbols[0].jsDoc?.examples[0]).toContain('add(1, 2)');
    });

    it('should extract multiple @example blocks', () => {
      const code = `
/**
 * @example
 * add(1, 2)
 * @example
 * add(3, 4)
 */
function add(a: number, b: number) { return a + b }
`;
      writeFileSync(TEST_FILE, code);
      const result = extractor.extractSymbols(TEST_FILE);
      expect(result.symbols[0].jsDoc?.examples).toHaveLength(2);
    });

    it('should extract @deprecated without reason', () => {
      const code = `
/**
 * @deprecated
 */
function old() { return 1 }
`;
      writeFileSync(TEST_FILE, code);
      const result = extractor.extractSymbols(TEST_FILE);
      expect(result.symbols[0].jsDoc?.deprecated).toBe(true);
    });

    it('should extract @deprecated with reason', () => {
      const code = `
/**
 * @deprecated Use newFunction instead.
 */
function old() { return 1 }
`;
      writeFileSync(TEST_FILE, code);
      const result = extractor.extractSymbols(TEST_FILE);
      expect(result.symbols[0].jsDoc?.deprecated).toBe('Use newFunction instead.');
    });

    it('should extract @throws', () => {
      const code = `
/**
 * @throws {Error} When input is invalid
 */
function validate(input: string) { if (!input) throw new Error('bad') }
`;
      writeFileSync(TEST_FILE, code);
      const result = extractor.extractSymbols(TEST_FILE);
      expect(result.symbols[0].jsDoc?.throws).toHaveLength(1);
      expect(result.symbols[0].jsDoc?.throws[0]).toContain('When input is invalid');
    });

    it('should extract @see', () => {
      const code = `
/**
 * @see otherFunction
 */
function f() { return 1 }
`;
      writeFileSync(TEST_FILE, code);
      const result = extractor.extractSymbols(TEST_FILE);
      expect(result.symbols[0].jsDoc?.see).toHaveLength(1);
      expect(result.symbols[0].jsDoc?.see[0]).toBe('otherFunction');
    });

    it('should extract all tags combined correctly', () => {
      const code = `
/**
 * Validates and transforms user input.
 * @param input - Raw input string
 * @param strict - Enable strict mode
 * @returns The validated result
 * @throws {Error} When validation fails
 * @see validateInput
 * @deprecated Use processV2 instead
 * @example
 * process("hello", true)
 */
function process(input: string, strict: boolean): string { return input }
`;
      writeFileSync(TEST_FILE, code);
      const result = extractor.extractSymbols(TEST_FILE);
      const jsDoc = result.symbols[0].jsDoc;
      expect(jsDoc?.description).toBe('Validates and transforms user input.');
      expect(jsDoc?.params).toHaveLength(2);
      expect(jsDoc?.returns).toBe('The validated result');
      expect(jsDoc?.throws).toHaveLength(1);
      expect(jsDoc?.see).toHaveLength(1);
      expect(jsDoc?.deprecated).toBe('Use processV2 instead');
      expect(jsDoc?.examples).toHaveLength(1);
    });

    it('should extract both isExported and jsDoc on exported arrow function', () => {
      const code = `
/** Exported and documented. */
export const greet = (name: string) => name
`;
      writeFileSync(TEST_FILE, code);
      const result = extractor.extractSymbols(TEST_FILE);
      expect(result.symbols[0].isExported).toBe(true);
      expect(result.symbols[0].jsDoc?.description).toBe('Exported and documented.');
    });
  });

  describe('Structured parameters', () => {
    it('should extract structured params with types', () => {
      const code = `
function process(name: string, count: number) { return name }
`;
      writeFileSync(TEST_FILE, code);
      const result = extractor.extractSymbols(TEST_FILE);
      expect(result.symbols[0].structuredParams).toEqual([
        { name: 'name', type: 'string', isOptional: false, isRest: false },
        { name: 'count', type: 'number', isOptional: false, isRest: false },
      ]);
    });

    it('should detect optional parameter with ?', () => {
      const code = `
function greet(name: string, title?: string) { return name }
`;
      writeFileSync(TEST_FILE, code);
      const result = extractor.extractSymbols(TEST_FILE);
      expect(result.symbols[0].structuredParams?.[0].isOptional).toBe(false);
      expect(result.symbols[0].structuredParams?.[1].isOptional).toBe(true);
    });

    it('should detect default value and mark as optional', () => {
      const code = `
function format(amount: number, currency: string = 'USD') { return '' }
`;
      writeFileSync(TEST_FILE, code);
      const result = extractor.extractSymbols(TEST_FILE);
      const currencyParam = result.symbols[0].structuredParams?.[1];
      expect(currencyParam?.isOptional).toBe(true);
      expect(currencyParam?.defaultValue).toBe("'USD'");
    });

    it('should detect object default value', () => {
      const code = `
function init(opts: { a: number } = { a: 1 }) { return opts }
`;
      writeFileSync(TEST_FILE, code);
      const result = extractor.extractSymbols(TEST_FILE);
      const param = result.symbols[0].structuredParams?.[0];
      expect(param?.isOptional).toBe(true);
      expect(param?.defaultValue).toBe('{ a: 1 }');
    });

    it('should detect rest parameter', () => {
      const code = `
function sum(...numbers: number[]) { return 0 }
`;
      writeFileSync(TEST_FILE, code);
      const result = extractor.extractSymbols(TEST_FILE);
      expect(result.symbols[0].structuredParams?.[0].isRest).toBe(true);
      expect(result.symbols[0].structuredParams?.[0].name).toBe('numbers');
    });

    it('should return empty array for no params', () => {
      const code = `function noParams() { return 1 }`;
      writeFileSync(TEST_FILE, code);
      const result = extractor.extractSymbols(TEST_FILE);
      expect(result.symbols[0].structuredParams).toEqual([]);
    });

    it('should expand destructured object param into individual params', () => {
      const code = `
function f({ name, age }: { name: string; age: number }) { return name }
`;
      writeFileSync(TEST_FILE, code);
      const result = extractor.extractSymbols(TEST_FILE);
      expect(result.symbols[0].structuredParams).toEqual([
        { name: 'name', type: 'string', isOptional: false, isRest: false },
        { name: 'age', type: 'number', isOptional: false, isRest: false },
      ]);
    });

    it('should detect optional properties in destructured object param', () => {
      const code = `
function f({ name, title }: { name: string; title?: string }) { return name }
`;
      writeFileSync(TEST_FILE, code);
      const result = extractor.extractSymbols(TEST_FILE);
      expect(result.symbols[0].structuredParams).toEqual([
        { name: 'name', type: 'string', isOptional: false, isRest: false },
        { name: 'title', type: 'string', isOptional: true, isRest: false },
      ]);
    });

    it('should handle destructured param with default values', () => {
      const code = `
function f({ name, count = 0 }: { name: string; count?: number }) { return name }
`;
      writeFileSync(TEST_FILE, code);
      const result = extractor.extractSymbols(TEST_FILE);
      expect(result.symbols[0].structuredParams?.[1]).toMatchObject({
        name: 'count',
        type: 'number',
        isOptional: true,
        defaultValue: '0',
      });
    });

    it('should handle destructured param with named type reference', () => {
      const code = `
interface Props { name: string; age: number }
function f({ name, age }: Props) { return name }
`;
      writeFileSync(TEST_FILE, code);
      const result = extractor.extractSymbols(TEST_FILE);
      expect(result.symbols[0].structuredParams).toEqual([
        { name: 'name', type: 'unknown', isOptional: false, isRest: false },
        { name: 'age', type: 'unknown', isOptional: false, isRest: false },
      ]);
    });

    it('should merge JSDoc descriptions into destructured params', () => {
      const code = `
/**
 * @param name - The user name
 * @param age - The user age
 */
function f({ name, age }: { name: string; age: number }) { return name }
`;
      writeFileSync(TEST_FILE, code);
      const result = extractor.extractSymbols(TEST_FILE);
      expect(result.symbols[0].structuredParams?.[0].description).toBe('The user name');
      expect(result.symbols[0].structuredParams?.[1].description).toBe('The user age');
    });

    it('should preserve complex generic type', () => {
      const code = `
function process(items: Map<string, number[]>) { return items }
`;
      writeFileSync(TEST_FILE, code);
      const result = extractor.extractSymbols(TEST_FILE);
      expect(result.symbols[0].structuredParams?.[0].type).toBe('Map<string, number[]>');
    });

    it('should preserve union type param', () => {
      const code = `
function handle(value: string | number) { return value }
`;
      writeFileSync(TEST_FILE, code);
      const result = extractor.extractSymbols(TEST_FILE);
      expect(result.symbols[0].structuredParams?.[0].type).toBe('string | number');
    });

    it('should use "unknown" for param with no type annotation', () => {
      const code = `
function f(x) { return x }
`;
      writeFileSync(TEST_FILE, code);
      const result = extractor.extractSymbols(TEST_FILE);
      expect(result.symbols[0].structuredParams?.[0].type).toBe('unknown');
    });

    it('should handle mixed optional/required/rest params', () => {
      const code = `
function f(required: string, optional?: number, ...rest: boolean[]) { return required }
`;
      writeFileSync(TEST_FILE, code);
      const result = extractor.extractSymbols(TEST_FILE);
      expect(result.symbols[0].structuredParams).toEqual([
        { name: 'required', type: 'string', isOptional: false, isRest: false },
        { name: 'optional', type: 'number', isOptional: true, isRest: false },
        { name: 'rest', type: 'boolean[]', isOptional: false, isRest: true },
      ]);
    });

    it('should extract structured params from arrow function', () => {
      const code = `
const add = (a: number, b: number) => a + b
`;
      writeFileSync(TEST_FILE, code);
      const result = extractor.extractSymbols(TEST_FILE);
      expect(result.symbols[0].structuredParams).toEqual([
        { name: 'a', type: 'number', isOptional: false, isRest: false },
        { name: 'b', type: 'number', isOptional: false, isRest: false },
      ]);
    });

    it('should extract structured params from function expression', () => {
      const code = `
const divide = function(a: number, b: number) { return a / b }
`;
      writeFileSync(TEST_FILE, code);
      const result = extractor.extractSymbols(TEST_FILE);
      expect(result.symbols[0].structuredParams).toEqual([
        { name: 'a', type: 'number', isOptional: false, isRest: false },
        { name: 'b', type: 'number', isOptional: false, isRest: false },
      ]);
    });

    it('should merge JSDoc @param descriptions into structuredParams by name', () => {
      const code = `
/**
 * @param name - The user name
 * @param age - The user age
 */
function createUser(name: string, age: number) { return { name, age } }
`;
      writeFileSync(TEST_FILE, code);
      const result = extractor.extractSymbols(TEST_FILE);
      expect(result.symbols[0].structuredParams?.[0].description).toBe('The user name');
      expect(result.symbols[0].structuredParams?.[1].description).toBe('The user age');
    });

    it('should not attach JSDoc description when param name mismatches', () => {
      const code = `
/**
 * @param wrong - Wrong name
 */
function f(actual: string) { return actual }
`;
      writeFileSync(TEST_FILE, code);
      const result = extractor.extractSymbols(TEST_FILE);
      expect(result.symbols[0].structuredParams?.[0].name).toBe('actual');
      expect(result.symbols[0].structuredParams?.[0].description).toBeUndefined();
    });
  });

  describe('Return type extraction', () => {
    it('should extract explicit return type', () => {
      const code = `
function add(a: number, b: number): number { return a + b }
`;
      writeFileSync(TEST_FILE, code);
      const result = extractor.extractSymbols(TEST_FILE);
      expect(result.symbols[0].returnType).toBe('number');
    });

    it('should extract Promise return type', () => {
      const code = `
async function fetchData(url: string): Promise<Response> {
  return fetch(url)
}
`;
      writeFileSync(TEST_FILE, code);
      const result = extractor.extractSymbols(TEST_FILE);
      expect(result.symbols[0].returnType).toBe('Promise<Response>');
    });

    it('should extract void return type', () => {
      const code = `
function log(msg: string): void { console.log(msg) }
`;
      writeFileSync(TEST_FILE, code);
      const result = extractor.extractSymbols(TEST_FILE);
      expect(result.symbols[0].returnType).toBe('void');
    });

    it('should extract complex object return type', () => {
      const code = `
function getUser(): { id: string; name: string } { return { id: '1', name: 'test' } }
`;
      writeFileSync(TEST_FILE, code);
      const result = extractor.extractSymbols(TEST_FILE);
      expect(result.symbols[0].returnType).toBe('{ id: string; name: string }');
    });

    it('should extract union return type', () => {
      const code = `
function find(id: string): string | null { return null }
`;
      writeFileSync(TEST_FILE, code);
      const result = extractor.extractSymbols(TEST_FILE);
      expect(result.symbols[0].returnType).toBe('string | null');
    });

    it('should return undefined when no explicit return type', () => {
      const code = `
function add(a: number, b: number) { return a + b }
`;
      writeFileSync(TEST_FILE, code);
      const result = extractor.extractSymbols(TEST_FILE);
      expect(result.symbols[0].returnType).toBeUndefined();
    });

    it('should extract return type from arrow function', () => {
      const code = `
const add = (a: number, b: number): number => a + b
`;
      writeFileSync(TEST_FILE, code);
      const result = extractor.extractSymbols(TEST_FILE);
      expect(result.symbols[0].returnType).toBe('number');
    });

    it('should return undefined for arrow function without return type', () => {
      const code = `
const add = (a: number, b: number) => a + b
`;
      writeFileSync(TEST_FILE, code);
      const result = extractor.extractSymbols(TEST_FILE);
      expect(result.symbols[0].returnType).toBeUndefined();
    });

    it('should extract generic return type', () => {
      const code = `
function identity<T>(x: T): T { return x }
`;
      writeFileSync(TEST_FILE, code);
      const result = extractor.extractSymbols(TEST_FILE);
      expect(result.symbols[0].returnType).toBe('T');
    });
  });

  describe('Export detection', () => {
    it('should detect exported function declaration', () => {
      const code = `
export function greet(name: string) { return name }
`;
      writeFileSync(TEST_FILE, code);
      const result = extractor.extractSymbols(TEST_FILE);
      expect(result.symbols[0].isExported).toBe(true);
    });

    it('should detect non-exported function', () => {
      const code = `
function internal() { return 1 }
`;
      writeFileSync(TEST_FILE, code);
      const result = extractor.extractSymbols(TEST_FILE);
      expect(result.symbols[0].isExported).toBe(false);
    });

    it('should detect exported arrow function', () => {
      const code = `
export const multiply = (a: number, b: number) => a * b
`;
      writeFileSync(TEST_FILE, code);
      const result = extractor.extractSymbols(TEST_FILE);
      expect(result.symbols[0].isExported).toBe(true);
    });

    it('should detect non-exported arrow function', () => {
      const code = `
const multiply = (a: number, b: number) => a * b
`;
      writeFileSync(TEST_FILE, code);
      const result = extractor.extractSymbols(TEST_FILE);
      expect(result.symbols[0].isExported).toBe(false);
    });

    it('should detect exported class', () => {
      const code = `
export class UserService {
  getUser() { return null }
}
`;
      writeFileSync(TEST_FILE, code);
      const result = extractor.extractSymbols(TEST_FILE);
      expect(result.symbols[0].isExported).toBe(true);
    });

    it('should detect non-exported class', () => {
      const code = `
class Internal {
  run() { return null }
}
`;
      writeFileSync(TEST_FILE, code);
      const result = extractor.extractSymbols(TEST_FILE);
      expect(result.symbols[0].isExported).toBe(false);
    });

    it('should detect export default function', () => {
      const code = `
export default function handler() { return 'ok' }
`;
      writeFileSync(TEST_FILE, code);
      const result = extractor.extractSymbols(TEST_FILE);
      expect(result.symbols[0].isExported).toBe(true);
    });

    it('should detect exported call expression', () => {
      const code = `
export const myTask = task({
  id: "my-task",
  run: async () => { return 'done' }
})
`;
      writeFileSync(TEST_FILE, code);
      const result = extractor.extractSymbols(TEST_FILE);
      expect(result.symbols[0].isExported).toBe(true);
    });

    it('should correctly identify export status for multiple symbols', () => {
      const code = `
export function exported() { return 1 }
function internal() { return 2 }
export const exportedArrow = () => 3
const internalArrow = () => 4
`;
      writeFileSync(TEST_FILE, code);
      const result = extractor.extractSymbols(TEST_FILE);
      expect(result.symbols[0].isExported).toBe(true); // exported
      expect(result.symbols[1].isExported).toBe(false); // internal
      expect(result.symbols[2].isExported).toBe(true); // exportedArrow
      expect(result.symbols[3].isExported).toBe(false); // internalArrow
    });

    it('should detect export async function', () => {
      const code = `
export async function fetchData() { return fetch('/api') }
`;
      writeFileSync(TEST_FILE, code);
      const result = extractor.extractSymbols(TEST_FILE);
      expect(result.symbols[0].isExported).toBe(true);
    });
  });
});
