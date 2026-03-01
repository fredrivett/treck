import { describe, expect, it } from 'vitest';
import type { SymbolInfo } from '../extractors/types.js';
import { nextjsMatcher } from './nextjs.js';

/** Helper to create a minimal SymbolInfo for testing */
function makeSymbol(overrides: Partial<SymbolInfo>): SymbolInfo {
  return {
    name: 'test',
    kind: 'function',
    filePath: 'test.ts',
    params: '',
    body: '',
    fullText: '',
    startLine: 1,
    endLine: 1,
    ...overrides,
  };
}

describe('nextjsMatcher', () => {
  // ═══════════════════════════════════════════════════════════════════════
  // detectEntryPoint
  // ═══════════════════════════════════════════════════════════════════════

  describe('detectEntryPoint', () => {
    describe('API routes', () => {
      it('should detect GET handler in route file', () => {
        const symbol = makeSymbol({ name: 'GET', kind: 'function' });
        const result = nextjsMatcher.detectEntryPoint(symbol, 'src/app/api/analyze/route.ts');

        expect(result).toEqual({
          entryType: 'api-route',
          metadata: { httpMethod: 'GET', route: '/api/analyze' },
        });
      });

      it('should detect POST handler in route file', () => {
        const symbol = makeSymbol({ name: 'POST', kind: 'function' });
        const result = nextjsMatcher.detectEntryPoint(symbol, 'src/app/api/users/route.ts');

        expect(result).toEqual({
          entryType: 'api-route',
          metadata: { httpMethod: 'POST', route: '/api/users' },
        });
      });

      it('should detect all HTTP methods', () => {
        for (const method of ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']) {
          const symbol = makeSymbol({ name: method, kind: 'function' });
          const result = nextjsMatcher.detectEntryPoint(symbol, 'src/app/api/test/route.ts');

          expect(result?.entryType).toBe('api-route');
          expect(result?.metadata?.httpMethod).toBe(method);
        }
      });

      it('should handle nested API routes', () => {
        const symbol = makeSymbol({ name: 'GET', kind: 'function' });
        const result = nextjsMatcher.detectEntryPoint(symbol, 'src/app/api/v1/users/[id]/route.ts');

        expect(result).toEqual({
          entryType: 'api-route',
          metadata: { httpMethod: 'GET', route: '/api/v1/users/[id]' },
        });
      });

      it('should handle .tsx route files', () => {
        const symbol = makeSymbol({ name: 'POST', kind: 'function' });
        const result = nextjsMatcher.detectEntryPoint(symbol, 'app/api/upload/route.tsx');

        expect(result?.entryType).toBe('api-route');
      });

      it('should handle .js route files', () => {
        const symbol = makeSymbol({ name: 'GET', kind: 'function' });
        const result = nextjsMatcher.detectEntryPoint(symbol, 'app/api/health/route.js');

        expect(result?.entryType).toBe('api-route');
      });

      it('should return null for non-HTTP-method symbols in route files', () => {
        const symbol = makeSymbol({ name: 'helper', kind: 'function' });
        const result = nextjsMatcher.detectEntryPoint(symbol, 'src/app/api/test/route.ts');

        expect(result).toBeNull();
      });

      it('should return null for HTTP method names outside route files', () => {
        const symbol = makeSymbol({ name: 'GET', kind: 'function' });
        const result = nextjsMatcher.detectEntryPoint(symbol, 'src/lib/http.ts');

        expect(result).toBeNull();
      });
    });

    describe('page components', () => {
      it('should detect default export in page file', () => {
        const symbol = makeSymbol({ name: 'default', kind: 'function' });
        const result = nextjsMatcher.detectEntryPoint(symbol, 'src/app/dashboard/page.tsx');

        expect(result).toEqual({
          entryType: 'page',
          metadata: { route: '/dashboard' },
        });
      });

      it('should handle nested page routes', () => {
        const symbol = makeSymbol({ name: 'default', kind: 'function' });
        const result = nextjsMatcher.detectEntryPoint(symbol, 'src/app/settings/profile/page.tsx');

        expect(result).toEqual({
          entryType: 'page',
          metadata: { route: '/settings/profile' },
        });
      });

      it('should handle dynamic page routes', () => {
        const symbol = makeSymbol({ name: 'default', kind: 'function' });
        const result = nextjsMatcher.detectEntryPoint(symbol, 'app/blog/[slug]/page.tsx');

        expect(result).toEqual({
          entryType: 'page',
          metadata: { route: '/blog/[slug]' },
        });
      });

      it('should return null for non-default exports in page files', () => {
        const symbol = makeSymbol({ name: 'PageHeader', kind: 'function' });
        const result = nextjsMatcher.detectEntryPoint(symbol, 'src/app/about/page.tsx');

        expect(result).toBeNull();
      });
    });

    describe('middleware', () => {
      it('should detect middleware function', () => {
        const symbol = makeSymbol({ name: 'middleware', kind: 'function' });
        const result = nextjsMatcher.detectEntryPoint(symbol, 'src/middleware.ts');

        expect(result).toEqual({
          entryType: 'middleware',
          metadata: {},
        });
      });

      it('should handle .js middleware', () => {
        const symbol = makeSymbol({ name: 'middleware', kind: 'function' });
        const result = nextjsMatcher.detectEntryPoint(symbol, 'middleware.js');

        expect(result?.entryType).toBe('middleware');
      });

      it('should return null for non-middleware functions in middleware file', () => {
        const symbol = makeSymbol({ name: 'config', kind: 'const' });
        const result = nextjsMatcher.detectEntryPoint(symbol, 'src/middleware.ts');

        expect(result).toBeNull();
      });
    });

    describe('non-matching symbols', () => {
      it('should return null for regular functions in regular files', () => {
        const symbol = makeSymbol({ name: 'processData', kind: 'function' });
        const result = nextjsMatcher.detectEntryPoint(symbol, 'src/lib/utils.ts');

        expect(result).toBeNull();
      });

      it('should return null for class symbols', () => {
        const symbol = makeSymbol({ name: 'ApiClient', kind: 'class' });
        const result = nextjsMatcher.detectEntryPoint(symbol, 'src/lib/api.ts');

        expect(result).toBeNull();
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // detectConnections
  // ═══════════════════════════════════════════════════════════════════════

  describe('detectConnections', () => {
    describe('fetch() calls', () => {
      it('should detect fetch with /api/ path using double quotes', () => {
        const symbol = makeSymbol({
          body: '{ const res = await fetch("/api/users") }',
          startLine: 5,
          endLine: 10,
        });

        const connections = nextjsMatcher.detectConnections(symbol, 'src/components/UserList.tsx');

        expect(connections).toHaveLength(1);
        expect(connections[0]).toEqual({
          type: 'fetch',
          targetHint: '/api/users',
          sourceLocation: [5, 10],
        });
      });

      it('should detect fetch with /api/ path using single quotes', () => {
        const symbol = makeSymbol({
          body: "{ const res = await fetch('/api/data') }",
        });

        const connections = nextjsMatcher.detectConnections(symbol, 'page.tsx');

        expect(connections).toHaveLength(1);
        expect(connections[0].targetHint).toBe('/api/data');
      });

      it('should detect fetch with /api/ path using backticks', () => {
        const symbol = makeSymbol({
          body: '{ const res = await fetch(`/api/items`) }',
        });

        const connections = nextjsMatcher.detectConnections(symbol, 'page.tsx');

        expect(connections).toHaveLength(1);
        expect(connections[0].targetHint).toBe('/api/items');
      });

      it('should normalize paths without leading slash', () => {
        const symbol = makeSymbol({
          body: '{ const res = await fetch("api/users") }',
        });

        const connections = nextjsMatcher.detectConnections(symbol, 'page.tsx');

        expect(connections).toHaveLength(1);
        expect(connections[0].targetHint).toBe('/api/users');
      });

      it('should detect multiple fetch calls', () => {
        const symbol = makeSymbol({
          body: `{
            const users = await fetch("/api/users")
            const posts = await fetch("/api/posts")
          }`,
        });

        const connections = nextjsMatcher.detectConnections(symbol, 'page.tsx');

        expect(connections).toHaveLength(2);
        expect(connections.map((c) => c.targetHint)).toEqual(['/api/users', '/api/posts']);
      });

      it('should not detect fetch calls to non-API paths', () => {
        const symbol = makeSymbol({
          body: '{ const res = await fetch("https://example.com/data") }',
        });

        const connections = nextjsMatcher.detectConnections(symbol, 'page.tsx');

        expect(connections).toHaveLength(0);
      });
    });

    describe('router navigation', () => {
      it('should detect router.push()', () => {
        const symbol = makeSymbol({
          body: '{ router.push("/dashboard") }',
          startLine: 1,
          endLine: 3,
        });

        const connections = nextjsMatcher.detectConnections(symbol, 'component.tsx');

        expect(connections).toHaveLength(1);
        expect(connections[0]).toEqual({
          type: 'navigation',
          targetHint: '/dashboard',
          sourceLocation: [1, 3],
        });
      });

      it('should detect router.replace()', () => {
        const symbol = makeSymbol({
          body: '{ router.replace("/login") }',
        });

        const connections = nextjsMatcher.detectConnections(symbol, 'component.tsx');

        expect(connections).toHaveLength(1);
        expect(connections[0].targetHint).toBe('/login');
        expect(connections[0].type).toBe('navigation');
      });

      it('should detect multiple router calls', () => {
        const symbol = makeSymbol({
          body: `{
            if (isAuth) router.push("/dashboard")
            else router.replace("/login")
          }`,
        });

        const connections = nextjsMatcher.detectConnections(symbol, 'component.tsx');

        expect(connections).toHaveLength(2);
        expect(connections.map((c) => c.targetHint)).toEqual(['/dashboard', '/login']);
      });
    });

    describe('mixed connections', () => {
      it('should detect both fetch and router calls in one body', () => {
        const symbol = makeSymbol({
          body: `{
            const data = await fetch("/api/users")
            router.push("/users")
          }`,
        });

        const connections = nextjsMatcher.detectConnections(symbol, 'page.tsx');

        expect(connections).toHaveLength(2);
        expect(connections[0].type).toBe('fetch');
        expect(connections[1].type).toBe('navigation');
      });
    });

    it('should return empty for bodies with no Next.js patterns', () => {
      const symbol = makeSymbol({
        body: '{ const x = 1 + 2 }',
      });

      expect(nextjsMatcher.detectConnections(symbol, 'lib.ts')).toHaveLength(0);
    });
  });
});
