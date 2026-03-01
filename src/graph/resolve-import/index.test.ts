/**
 * Tests for import path resolution
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearTsconfigCache, resolveImportPath } from './index.js';

const TEST_DIR = join(process.cwd(), '.test-resolve');
const SRC_DIR = join(TEST_DIR, 'src');
const LIB_DIR = join(SRC_DIR, 'lib');

describe('resolveImportPath', () => {
  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(LIB_DIR, { recursive: true });
    clearTsconfigCache();
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    clearTsconfigCache();
  });

  describe('relative imports', () => {
    it('should resolve relative .ts imports without extension', () => {
      const fromFile = join(SRC_DIR, 'main.ts');
      const targetFile = join(SRC_DIR, 'utils.ts');
      writeFileSync(fromFile, '');
      writeFileSync(targetFile, 'export function foo() {}');

      const result = resolveImportPath(fromFile, './utils');

      expect(result).toBe(targetFile);
    });

    it('should resolve relative .tsx imports without extension', () => {
      const fromFile = join(SRC_DIR, 'main.ts');
      const targetFile = join(SRC_DIR, 'component.tsx');
      writeFileSync(fromFile, '');
      writeFileSync(targetFile, 'export default function Component() {}');

      const result = resolveImportPath(fromFile, './component');

      expect(result).toBe(targetFile);
    });

    it('should resolve directory imports to index.ts, not the directory itself', () => {
      const fromFile = join(SRC_DIR, 'main.ts');
      const indexDir = join(SRC_DIR, 'components');
      mkdirSync(indexDir, { recursive: true });
      const indexFile = join(indexDir, 'index.ts');
      writeFileSync(fromFile, '');
      writeFileSync(indexFile, 'export class Button {}');

      const result = resolveImportPath(fromFile, './components');

      // Must resolve to index.ts file, not the directory path
      expect(result).toBe(indexFile);
    });

    it('should resolve ../ parent directory imports', () => {
      const fromFile = join(LIB_DIR, 'helper.ts');
      const targetFile = join(SRC_DIR, 'config.ts');
      writeFileSync(fromFile, '');
      writeFileSync(targetFile, 'export const config = {}');

      const result = resolveImportPath(fromFile, '../config');

      expect(result).toBe(targetFile);
    });

    it('should handle .js extension swapping to .ts', () => {
      const fromFile = join(SRC_DIR, 'main.ts');
      const targetFile = join(SRC_DIR, 'utils.ts');
      writeFileSync(fromFile, '');
      writeFileSync(targetFile, 'export function foo() {}');

      const result = resolveImportPath(fromFile, './utils.js');

      expect(result).toBe(targetFile);
    });

    it('should handle .jsx extension swapping to .tsx', () => {
      const fromFile = join(SRC_DIR, 'main.ts');
      const targetFile = join(SRC_DIR, 'button.tsx');
      writeFileSync(fromFile, '');
      writeFileSync(targetFile, 'export default function Button() {}');

      const result = resolveImportPath(fromFile, './button.jsx');

      expect(result).toBe(targetFile);
    });

    it('should return null for unresolvable relative import', () => {
      const fromFile = join(SRC_DIR, 'main.ts');
      writeFileSync(fromFile, '');

      const result = resolveImportPath(fromFile, './does-not-exist');

      expect(result).toBeNull();
    });
  });

  describe('tsconfig path aliases', () => {
    it('should resolve @/ alias', () => {
      const tsconfig = {
        compilerOptions: {
          paths: { '@/*': ['./src/*'] },
        },
      };
      writeFileSync(join(TEST_DIR, 'tsconfig.json'), JSON.stringify(tsconfig));

      const fromFile = join(TEST_DIR, 'trigger', 'task.ts');
      mkdirSync(join(TEST_DIR, 'trigger'), { recursive: true });
      writeFileSync(fromFile, '');

      const targetFile = join(SRC_DIR, 'lib', 'vision.ts');
      writeFileSync(targetFile, 'export function analyzeImage() {}');

      const result = resolveImportPath(fromFile, '@/lib/vision');

      expect(result).toBe(targetFile);
    });

    it('should resolve multiple path aliases', () => {
      const tsconfig = {
        compilerOptions: {
          paths: {
            '@/*': ['./src/*'],
            '@app/*': ['./*'],
          },
        },
      };
      writeFileSync(join(TEST_DIR, 'tsconfig.json'), JSON.stringify(tsconfig));

      const fromFile = join(SRC_DIR, 'main.ts');
      writeFileSync(fromFile, '');

      // @app/ alias
      const triggerDir = join(TEST_DIR, 'trigger');
      mkdirSync(triggerDir, { recursive: true });
      const triggerFile = join(triggerDir, 'task.ts');
      writeFileSync(triggerFile, 'export const myTask = {}');

      const result = resolveImportPath(fromFile, '@app/trigger/task');

      expect(result).toBe(triggerFile);
    });

    it('should resolve @/ alias to index.ts when path is a directory', () => {
      const tsconfig = {
        compilerOptions: {
          paths: { '@/*': ['./src/*'] },
        },
      };
      writeFileSync(join(TEST_DIR, 'tsconfig.json'), JSON.stringify(tsconfig));

      const fromFile = join(SRC_DIR, 'main.ts');
      writeFileSync(fromFile, '');

      // Create a directory with an index.ts barrel file
      const searchDir = join(SRC_DIR, 'lib', 'search');
      mkdirSync(searchDir, { recursive: true });
      const indexFile = join(searchDir, 'index.ts');
      writeFileSync(indexFile, 'export { useSearch } from "./use-search"');

      const result = resolveImportPath(fromFile, '@/lib/search');

      // Must resolve to index.ts, not the directory
      expect(result).toBe(indexFile);
    });

    it('should handle tsconfig with comments', () => {
      const tsconfigContent = `{
  // This is a comment
  "compilerOptions": {
    /* Block comment */
    "paths": { "@/*": ["./src/*"] }
  }
}`;
      writeFileSync(join(TEST_DIR, 'tsconfig.json'), tsconfigContent);

      const fromFile = join(SRC_DIR, 'main.ts');
      writeFileSync(fromFile, '');

      const targetFile = join(SRC_DIR, 'lib', 'db.ts');
      writeFileSync(targetFile, 'export default {}');

      const result = resolveImportPath(fromFile, '@/lib/db');

      expect(result).toBe(targetFile);
    });
  });

  describe('bare package imports', () => {
    it('should return null for npm packages', () => {
      const fromFile = join(SRC_DIR, 'main.ts');
      writeFileSync(fromFile, '');

      expect(resolveImportPath(fromFile, 'react')).toBeNull();
      expect(resolveImportPath(fromFile, '@prisma/client')).toBeNull();
      expect(resolveImportPath(fromFile, '@trigger.dev/sdk')).toBeNull();
    });

    it('should return null for node builtins', () => {
      const fromFile = join(SRC_DIR, 'main.ts');
      writeFileSync(fromFile, '');

      expect(resolveImportPath(fromFile, 'node:fs')).toBeNull();
      expect(resolveImportPath(fromFile, 'node:path')).toBeNull();
    });
  });
});
