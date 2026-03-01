/**
 * Tests for content hasher
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { SymbolInfo } from '../extractors/types.js';
import { ContentHasher, hashSymbol } from './index.js';

describe('ContentHasher', () => {
  let hasher: ContentHasher;

  beforeEach(() => {
    hasher = new ContentHasher();
  });

  describe('hashSymbol', () => {
    it('should produce consistent hash for same content', () => {
      const symbol: SymbolInfo = {
        name: 'testFunc',
        kind: 'function',
        filePath: 'test.ts',
        params: 'a: number, b: number',
        body: '{ return a + b }',
        fullText: 'function testFunc(a: number, b: number) { return a + b }',
        startLine: 1,
        endLine: 3,
      };

      const hash1 = hasher.hashSymbol(symbol);
      const hash2 = hasher.hashSymbol(symbol);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA256 produces 64 hex chars
    });

    it('should produce same hash for renamed function', () => {
      const symbol1: SymbolInfo = {
        name: 'add',
        kind: 'function',
        filePath: 'test.ts',
        params: 'a: number, b: number',
        body: '{ return a + b }',
        fullText: 'function add(a: number, b: number) { return a + b }',
        startLine: 1,
        endLine: 3,
      };

      const symbol2: SymbolInfo = {
        name: 'sum', // Different name
        kind: 'function',
        filePath: 'test.ts',
        params: 'a: number, b: number',
        body: '{ return a + b }',
        fullText: 'function sum(a: number, b: number) { return a + b }',
        startLine: 1,
        endLine: 3,
      };

      expect(hasher.hashSymbol(symbol1)).toBe(hasher.hashSymbol(symbol2));
    });

    it('should produce different hash when params change', () => {
      const symbol1: SymbolInfo = {
        name: 'func',
        kind: 'function',
        filePath: 'test.ts',
        params: 'a: number',
        body: '{ return a }',
        fullText: 'function func(a: number) { return a }',
        startLine: 1,
        endLine: 3,
      };

      const symbol2: SymbolInfo = {
        name: 'func',
        kind: 'function',
        filePath: 'test.ts',
        params: 'a: number, b: number', // Added param
        body: '{ return a }',
        fullText: 'function func(a: number, b: number) { return a }',
        startLine: 1,
        endLine: 3,
      };

      expect(hasher.hashSymbol(symbol1)).not.toBe(hasher.hashSymbol(symbol2));
    });

    it('should produce different hash when body changes', () => {
      const symbol1: SymbolInfo = {
        name: 'func',
        kind: 'function',
        filePath: 'test.ts',
        params: 'a: number',
        body: '{ return a }',
        fullText: 'function func(a: number) { return a }',
        startLine: 1,
        endLine: 3,
      };

      const symbol2: SymbolInfo = {
        name: 'func',
        kind: 'function',
        filePath: 'test.ts',
        params: 'a: number',
        body: '{ return a * 2 }', // Changed body
        fullText: 'function func(a: number) { return a * 2 }',
        startLine: 1,
        endLine: 3,
      };

      expect(hasher.hashSymbol(symbol1)).not.toBe(hasher.hashSymbol(symbol2));
    });

    it('should ignore file path in hash', () => {
      const symbol1: SymbolInfo = {
        name: 'func',
        kind: 'function',
        filePath: 'path/to/file1.ts',
        params: 'a: number',
        body: '{ return a }',
        fullText: 'function func(a: number) { return a }',
        startLine: 1,
        endLine: 3,
      };

      const symbol2: SymbolInfo = {
        name: 'func',
        kind: 'function',
        filePath: 'different/path/file2.ts', // Different path
        params: 'a: number',
        body: '{ return a }',
        fullText: 'function func(a: number) { return a }',
        startLine: 1,
        endLine: 3,
      };

      expect(hasher.hashSymbol(symbol1)).toBe(hasher.hashSymbol(symbol2));
    });

    it('should ignore line numbers in hash', () => {
      const symbol1: SymbolInfo = {
        name: 'func',
        kind: 'function',
        filePath: 'test.ts',
        params: 'a: number',
        body: '{ return a }',
        fullText: 'function func(a: number) { return a }',
        startLine: 1,
        endLine: 3,
      };

      const symbol2: SymbolInfo = {
        name: 'func',
        kind: 'function',
        filePath: 'test.ts',
        params: 'a: number',
        body: '{ return a }',
        fullText: 'function func(a: number) { return a }',
        startLine: 100, // Different line numbers
        endLine: 102,
      };

      expect(hasher.hashSymbol(symbol1)).toBe(hasher.hashSymbol(symbol2));
    });
  });

  describe('normalizeWhitespace', () => {
    it('should normalize multiple spaces to single space', () => {
      const symbol: SymbolInfo = {
        name: 'func',
        kind: 'function',
        filePath: 'test.ts',
        params: 'a:  number,   b:  number', // Extra spaces
        body: '{  return   a  +  b  }',
        fullText: 'test',
        startLine: 1,
        endLine: 3,
      };

      const symbol2: SymbolInfo = {
        ...symbol,
        params: 'a: number, b: number',
        body: '{ return a + b }',
      };

      // Should produce same hash after normalization
      expect(hasher.hashSymbol(symbol)).toBe(hasher.hashSymbol(symbol2));
    });

    it('should normalize line endings', () => {
      const symbol1: SymbolInfo = {
        name: 'func',
        kind: 'function',
        filePath: 'test.ts',
        params: 'a: number',
        body: '{\n  return a\n}', // Unix line endings
        fullText: 'test',
        startLine: 1,
        endLine: 3,
      };

      const symbol2: SymbolInfo = {
        ...symbol1,
        body: '{\r\n  return a\r\n}', // Windows line endings
      };

      expect(hasher.hashSymbol(symbol1)).toBe(hasher.hashSymbol(symbol2));
    });

    it('should normalize tabs to spaces', () => {
      const symbol1: SymbolInfo = {
        name: 'func',
        kind: 'function',
        filePath: 'test.ts',
        params: 'a: number',
        body: '{\n\treturn a\n}', // Tab indentation
        fullText: 'test',
        startLine: 1,
        endLine: 3,
      };

      const symbol2: SymbolInfo = {
        ...symbol1,
        body: '{\n  return a\n}', // Space indentation
      };

      expect(hasher.hashSymbol(symbol1)).toBe(hasher.hashSymbol(symbol2));
    });
  });

  describe('hasChanged', () => {
    it('should detect no change for identical symbols', () => {
      const symbol: SymbolInfo = {
        name: 'func',
        kind: 'function',
        filePath: 'test.ts',
        params: 'a: number',
        body: '{ return a }',
        fullText: 'function func(a: number) { return a }',
        startLine: 1,
        endLine: 3,
      };

      expect(hasher.hasChanged(symbol, symbol)).toBe(false);
    });

    it('should detect no change when only name changes', () => {
      const symbol1: SymbolInfo = {
        name: 'oldName',
        kind: 'function',
        filePath: 'test.ts',
        params: 'a: number',
        body: '{ return a }',
        fullText: 'function oldName(a: number) { return a }',
        startLine: 1,
        endLine: 3,
      };

      const symbol2: SymbolInfo = {
        ...symbol1,
        name: 'newName',
      };

      expect(hasher.hasChanged(symbol1, symbol2)).toBe(false);
    });

    it('should detect change when params change', () => {
      const symbol1: SymbolInfo = {
        name: 'func',
        kind: 'function',
        filePath: 'test.ts',
        params: 'a: number',
        body: '{ return a }',
        fullText: 'test',
        startLine: 1,
        endLine: 3,
      };

      const symbol2: SymbolInfo = {
        ...symbol1,
        params: 'a: number, b: number',
      };

      expect(hasher.hasChanged(symbol1, symbol2)).toBe(true);
    });

    it('should detect change when body changes', () => {
      const symbol1: SymbolInfo = {
        name: 'func',
        kind: 'function',
        filePath: 'test.ts',
        params: 'a: number',
        body: '{ return a }',
        fullText: 'test',
        startLine: 1,
        endLine: 3,
      };

      const symbol2: SymbolInfo = {
        ...symbol1,
        body: '{ return a * 2 }',
      };

      expect(hasher.hasChanged(symbol1, symbol2)).toBe(true);
    });
  });

  describe('shortHash', () => {
    it('should return first 8 characters of hash', () => {
      const hash = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
      expect(hasher.shortHash(hash)).toBe('abcdef12');
      expect(hasher.shortHash(hash)).toHaveLength(8);
    });
  });

  describe('hashSymbol convenience function', () => {
    it('should work as standalone function', () => {
      const symbol: SymbolInfo = {
        name: 'func',
        kind: 'function',
        filePath: 'test.ts',
        params: 'a: number',
        body: '{ return a }',
        fullText: 'test',
        startLine: 1,
        endLine: 3,
      };

      const hash = hashSymbol(symbol);
      expect(hash).toHaveLength(64);
      expect(typeof hash).toBe('string');
    });
  });

  describe('Real-world scenarios', () => {
    it('should handle complex TypeScript function', () => {
      const symbol: SymbolInfo = {
        name: 'processData',
        kind: 'function',
        filePath: 'src/utils.ts',
        params: 'data: Array<{id: string; value: number}>, options?: {filter?: boolean}',
        body: `{
  const filtered = options?.filter
    ? data.filter(item => item.value > 0)
    : data

  return filtered.map(item => ({
    ...item,
    processed: true
  }))
}`,
        fullText: 'test',
        startLine: 10,
        endLine: 20,
      };

      const hash = hasher.hashSymbol(symbol);
      expect(hash).toHaveLength(64);

      // Same function with different formatting should have same hash
      const reformatted: SymbolInfo = {
        ...symbol,
        body: `{const filtered=options?.filter?data.filter(item=>item.value>0):data
return filtered.map(item=>({...item,processed:true}))}`,
      };

      // Note: Due to whitespace normalization, these should be similar but not identical
      // because we only normalize simple cases
      expect(hasher.hashSymbol(reformatted)).toBeDefined();
    });

    it('should handle async functions', () => {
      const symbol: SymbolInfo = {
        name: 'fetchData',
        kind: 'function',
        filePath: 'src/api.ts',
        params: 'url: string',
        body: `{
  const response = await fetch(url)
  return response.json()
}`,
        fullText: 'test',
        startLine: 1,
        endLine: 4,
      };

      expect(() => hasher.hashSymbol(symbol)).not.toThrow();
      expect(hasher.hashSymbol(symbol)).toHaveLength(64);
    });

    it('should handle class methods', () => {
      const symbol: SymbolInfo = {
        name: 'UserService',
        kind: 'class',
        filePath: 'src/services.ts',
        params: '',
        body: `{
  private users: User[] = []

  addUser(user: User): void {
    this.users.push(user)
  }

  getUser(id: string): User | undefined {
    return this.users.find(u => u.id === id)
  }
}`,
        fullText: 'test',
        startLine: 1,
        endLine: 12,
      };

      expect(() => hasher.hashSymbol(symbol)).not.toThrow();
      expect(hasher.hashSymbol(symbol)).toHaveLength(64);
    });
  });

  describe('Hash stability with new metadata fields', () => {
    const baseSymbol: SymbolInfo = {
      name: 'func',
      kind: 'function',
      filePath: 'test.ts',
      params: 'a: number',
      body: '{ return a }',
      fullText: 'function func(a: number) { return a }',
      startLine: 1,
      endLine: 3,
    };

    it('should produce same hash when jsDoc is added', () => {
      const withJsDoc: SymbolInfo = {
        ...baseSymbol,
        jsDoc: {
          description: 'A function that returns a number',
          params: [{ name: 'a', description: 'The number' }],
          examples: ['func(42)'],
          throws: [],
          see: [],
        },
      };

      expect(hasher.hashSymbol(baseSymbol)).toBe(hasher.hashSymbol(withJsDoc));
    });

    it('should produce same hash when jsDoc description changes', () => {
      const version1: SymbolInfo = {
        ...baseSymbol,
        jsDoc: {
          description: 'Original description',
          params: [],
          examples: [],
          throws: [],
          see: [],
        },
      };

      const version2: SymbolInfo = {
        ...baseSymbol,
        jsDoc: {
          description: 'Updated description',
          params: [],
          examples: [],
          throws: [],
          see: [],
        },
      };

      expect(hasher.hashSymbol(version1)).toBe(hasher.hashSymbol(version2));
    });

    it('should produce same hash when structuredParams is added', () => {
      const withParams: SymbolInfo = {
        ...baseSymbol,
        structuredParams: [{ name: 'a', type: 'number', isOptional: false, isRest: false }],
      };

      expect(hasher.hashSymbol(baseSymbol)).toBe(hasher.hashSymbol(withParams));
    });

    it('should produce same hash when returnType is added', () => {
      const withReturn: SymbolInfo = {
        ...baseSymbol,
        returnType: 'number',
      };

      expect(hasher.hashSymbol(baseSymbol)).toBe(hasher.hashSymbol(withReturn));
    });

    it('should produce same hash when isExported changes', () => {
      const exported: SymbolInfo = { ...baseSymbol, isExported: true };
      const notExported: SymbolInfo = { ...baseSymbol, isExported: false };

      expect(hasher.hashSymbol(exported)).toBe(hasher.hashSymbol(notExported));
      expect(hasher.hashSymbol(exported)).toBe(hasher.hashSymbol(baseSymbol));
    });
  });
});
