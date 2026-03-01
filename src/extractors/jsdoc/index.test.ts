/**
 * Unit tests for JSDoc extraction helper
 */

import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { extractJsDoc } from './index.js';

/**
 * Parse source code and return the first statement's JSDoc info.
 * Sets setParentNodes: true so JSDoc is attached to AST nodes.
 */
function extractFromCode(code: string): ReturnType<typeof extractJsDoc> {
  const sourceFile = ts.createSourceFile('test.ts', code, ts.ScriptTarget.Latest, true);
  const firstStatement = sourceFile.statements[0];
  if (!firstStatement) return undefined;

  // For variable statements, pass the variable declaration (to test parent traversal)
  if (ts.isVariableStatement(firstStatement)) {
    const decl = firstStatement.declarationList.declarations[0];
    return extractJsDoc(decl, sourceFile);
  }

  return extractJsDoc(firstStatement, sourceFile);
}

describe('extractJsDoc', () => {
  describe('Description extraction', () => {
    it('should extract single-line description', () => {
      const result = extractFromCode(`
/** Adds two numbers. */
function add(a: number, b: number) { return a + b }
`);
      expect(result?.description).toBe('Adds two numbers.');
    });

    it('should extract multi-line description', () => {
      const result = extractFromCode(`
/**
 * Processes data from the input stream.
 * Handles both binary and text formats.
 */
function process(data: Buffer) { return data }
`);
      expect(result?.description).toContain('Processes data from the input stream.');
      expect(result?.description).toContain('Handles both binary and text formats.');
    });

    it('should extract description with inline code', () => {
      const result = extractFromCode(`
/** Returns the value of \`x * 2\`. */
function double(x: number) { return x * 2 }
`);
      expect(result?.description).toContain('`x * 2`');
    });

    it('should return undefined for empty JSDoc', () => {
      const result = extractFromCode(`
/** */
function empty() { return 1 }
`);
      expect(result).toBeUndefined();
    });

    it('should return undefined for regular line comment', () => {
      const result = extractFromCode(`
// not jsdoc
function f() { return 1 }
`);
      expect(result).toBeUndefined();
    });

    it('should return undefined for block comment (not JSDoc)', () => {
      const result = extractFromCode(`
/* not jsdoc */
function f() { return 1 }
`);
      expect(result).toBeUndefined();
    });

    it('should return undefined description when only tags present', () => {
      const result = extractFromCode(`
/**
 * @param x - The number
 */
function f(x: number) { return x }
`);
      expect(result?.description).toBeUndefined();
      expect(result?.params).toHaveLength(1);
    });
  });

  describe('@param extraction', () => {
    it('should extract basic @param with dash separator', () => {
      const result = extractFromCode(`
/**
 * @param name - The user name
 */
function greet(name: string) { return name }
`);
      expect(result?.params).toEqual([{ name: 'name', description: 'The user name' }]);
    });

    it('should extract @param without dash separator', () => {
      const result = extractFromCode(`
/**
 * @param name The user name
 */
function greet(name: string) { return name }
`);
      expect(result?.params[0].name).toBe('name');
      expect(result?.params[0].description).toContain('The user name');
    });

    it('should ignore JSDoc type annotation in @param', () => {
      const result = extractFromCode(`
/**
 * @param {string} name - The user name
 */
function greet(name: string) { return name }
`);
      expect(result?.params[0].name).toBe('name');
      expect(result?.params[0].description).toBe('The user name');
      // Should NOT contain the {string} type
      expect(result?.params[0].description).not.toContain('{string}');
    });

    it('should ignore complex JSDoc type in @param', () => {
      const result = extractFromCode(`
/**
 * @param {Object} config - The configuration
 */
function init(config: Config) { return config }
`);
      expect(result?.params[0].name).toBe('config');
      expect(result?.params[0].description).toBe('The configuration');
    });

    it('should extract multiple @param tags', () => {
      const result = extractFromCode(`
/**
 * @param first - First value
 * @param second - Second value
 * @param third - Third value
 */
function f(first: number, second: string, third: boolean) { return first }
`);
      expect(result?.params).toHaveLength(3);
      expect(result?.params[0]).toEqual({ name: 'first', description: 'First value' });
      expect(result?.params[1]).toEqual({ name: 'second', description: 'Second value' });
      expect(result?.params[2]).toEqual({ name: 'third', description: 'Third value' });
    });

    it('should handle @param with no description', () => {
      const result = extractFromCode(`
/**
 * @param x
 */
function f(x: number) { return x }
`);
      expect(result?.params[0].name).toBe('x');
      expect(result?.params[0].description).toBe('');
    });
  });

  describe('@returns extraction', () => {
    it('should extract @returns description', () => {
      const result = extractFromCode(`
/**
 * @returns The sum of a and b
 */
function add(a: number, b: number) { return a + b }
`);
      expect(result?.returns).toBe('The sum of a and b');
    });

    it('should extract @return alias', () => {
      const result = extractFromCode(`
/**
 * @return The computed value
 */
function compute() { return 42 }
`);
      expect(result?.returns).toBe('The computed value');
    });

    it('should ignore JSDoc type in @returns', () => {
      const result = extractFromCode(`
/**
 * @returns {number} The sum
 */
function add(a: number, b: number) { return a + b }
`);
      expect(result?.returns).toBe('The sum');
    });

    it('should return undefined when no @returns tag', () => {
      const result = extractFromCode(`
/** A simple function. */
function f() { return 1 }
`);
      expect(result?.returns).toBeUndefined();
    });
  });

  describe('@example extraction', () => {
    it('should extract single @example block', () => {
      const result = extractFromCode(`
/**
 * @example
 * add(1, 2) // returns 3
 */
function add(a: number, b: number) { return a + b }
`);
      expect(result?.examples).toHaveLength(1);
      expect(result?.examples[0]).toContain('add(1, 2)');
    });

    it('should extract multiple @example blocks', () => {
      const result = extractFromCode(`
/**
 * @example
 * add(1, 2)
 * @example
 * add(3, 4)
 */
function add(a: number, b: number) { return a + b }
`);
      expect(result?.examples).toHaveLength(2);
      expect(result?.examples[0]).toContain('add(1, 2)');
      expect(result?.examples[1]).toContain('add(3, 4)');
    });

    it('should extract multi-line @example', () => {
      const result = extractFromCode(`
/**
 * @example
 * const result = add(1, 2)
 * console.log(result) // 3
 */
function add(a: number, b: number) { return a + b }
`);
      expect(result?.examples).toHaveLength(1);
      expect(result?.examples[0]).toContain('const result = add(1, 2)');
      expect(result?.examples[0]).toContain('console.log(result)');
    });

    it('should skip @example with empty content', () => {
      const result = extractFromCode(`
/**
 * A function.
 * @example
 */
function f() { return 1 }
`);
      // The example tag has no content, so examples should be empty
      expect(result?.examples).toHaveLength(0);
    });
  });

  describe('@deprecated extraction', () => {
    it('should return true for @deprecated with no reason', () => {
      const result = extractFromCode(`
/**
 * @deprecated
 */
function old() { return 1 }
`);
      expect(result?.deprecated).toBe(true);
    });

    it('should return reason string for @deprecated with reason', () => {
      const result = extractFromCode(`
/**
 * @deprecated Use newFunction instead.
 */
function old() { return 1 }
`);
      expect(result?.deprecated).toBe('Use newFunction instead.');
    });

    it('should return undefined when no @deprecated tag', () => {
      const result = extractFromCode(`
/** A function. */
function f() { return 1 }
`);
      expect(result?.deprecated).toBeUndefined();
    });
  });

  describe('@throws extraction', () => {
    it('should extract @throws with description', () => {
      const result = extractFromCode(`
/**
 * @throws {Error} When input is invalid
 */
function validate(input: string) { if (!input) throw new Error('bad') }
`);
      expect(result?.throws).toHaveLength(1);
      expect(result?.throws[0]).toContain('When input is invalid');
    });

    it('should extract multiple @throws tags', () => {
      const result = extractFromCode(`
/**
 * @throws {TypeError} When type is wrong
 * @throws {RangeError} When out of bounds
 */
function check(x: number) { return x }
`);
      expect(result?.throws).toHaveLength(2);
    });

    it('should return empty array when no @throws', () => {
      const result = extractFromCode(`
/** A function. */
function f() { return 1 }
`);
      expect(result?.throws ?? []).toHaveLength(0);
    });
  });

  describe('@see extraction', () => {
    it('should extract @see reference', () => {
      const result = extractFromCode(`
/**
 * @see otherFunction
 */
function f() { return 1 }
`);
      expect(result?.see).toHaveLength(1);
      expect(result?.see[0]).toBe('otherFunction');
    });

    it('should extract @see URL', () => {
      const result = extractFromCode(`
/**
 * @see https://example.com/docs
 */
function f() { return 1 }
`);
      expect(result?.see).toHaveLength(1);
      expect(result?.see[0]).toContain('https://example.com/docs');
    });

    it('should extract multiple @see tags', () => {
      const result = extractFromCode(`
/**
 * @see functionA
 * @see functionB
 */
function f() { return 1 }
`);
      expect(result?.see).toHaveLength(2);
    });

    it('should return empty array when no @see', () => {
      const result = extractFromCode(`
/** A function. */
function f() { return 1 }
`);
      expect(result?.see ?? []).toHaveLength(0);
    });
  });

  describe('Node type handling', () => {
    it('should extract JSDoc from FunctionDeclaration', () => {
      const result = extractFromCode(`
/** A function. */
function f() { return 1 }
`);
      expect(result?.description).toBe('A function.');
    });

    it('should extract JSDoc from arrow function (VariableDeclaration)', () => {
      const result = extractFromCode(`
/** An arrow function. */
const f = () => 1
`);
      expect(result?.description).toBe('An arrow function.');
    });

    it('should extract JSDoc from ClassDeclaration', () => {
      const result = extractFromCode(`
/** A class. */
class MyClass { }
`);
      expect(result?.description).toBe('A class.');
    });

    it('should extract JSDoc from exported function', () => {
      const result = extractFromCode(`
/** An exported function. */
export function f() { return 1 }
`);
      expect(result?.description).toBe('An exported function.');
    });

    it('should extract JSDoc from exported arrow function', () => {
      const result = extractFromCode(`
/** Exported arrow. */
export const f = () => 1
`);
      expect(result?.description).toBe('Exported arrow.');
    });

    it('should handle function with all tags combined', () => {
      const result = extractFromCode(`
/**
 * Processes and validates user input.
 * @param input - The raw input string
 * @param strict - Enable strict mode
 * @returns The validated result
 * @throws {Error} When validation fails
 * @see validateInput
 * @deprecated Use processV2 instead
 * @example
 * process("hello", true)
 */
function process(input: string, strict: boolean) { return input }
`);
      expect(result?.description).toBe('Processes and validates user input.');
      expect(result?.params).toHaveLength(2);
      expect(result?.params[0]).toEqual({ name: 'input', description: 'The raw input string' });
      expect(result?.params[1]).toEqual({ name: 'strict', description: 'Enable strict mode' });
      expect(result?.returns).toBe('The validated result');
      expect(result?.throws).toHaveLength(1);
      expect(result?.see).toHaveLength(1);
      expect(result?.deprecated).toBe('Use processV2 instead');
      expect(result?.examples).toHaveLength(1);
    });
  });
});
