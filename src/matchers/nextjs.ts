/**
 * Next.js framework matcher
 *
 * Detects:
 * - API route handlers (GET, POST, PUT, DELETE, PATCH in app/api/.../route.ts)
 * - Page components (default export in app/.../page.tsx)
 * - Middleware (middleware.ts)
 * - Server actions ("use server" directive)
 */

import { readFileSync } from 'node:fs';
import type { SymbolInfo } from '../extractors/types.js';
import type {
  EntryPointMatch,
  FrameworkMatcher,
  ResolvedConnection,
  RuntimeConnection,
} from './types.js';

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

const API_ROUTE_PATTERN = /app\/api\/(.+)\/route\.(ts|tsx|js|jsx)$/;
const PAGE_PATTERN = /app\/(.+)\/page\.(ts|tsx|js|jsx)$/;
const MIDDLEWARE_PATTERN = /middleware\.(ts|tsx|js|jsx)$/;

/**
 * Extract route path from file path.
 * e.g. "src/app/api/analyze/route.ts" -> "/api/analyze"
 */
function extractRoutePath(filePath: string): string {
  const match = filePath.match(/app\/(.*?)\/route\.(ts|tsx|js|jsx)$/);
  if (!match) return '';
  return `/${match[1]}`;
}

/**
 * Extract page path from file path.
 * e.g. "src/app/dashboard/page.tsx" -> "/dashboard"
 */
function extractPagePath(filePath: string): string {
  const match = filePath.match(/app\/(.*?)\/page\.(ts|tsx|js|jsx)$/);
  if (!match) return '/';
  return `/${match[1]}`;
}

export const nextjsMatcher: FrameworkMatcher = {
  name: 'nextjs',

  /** Detect Next.js API routes, page components, middleware, and server actions. */
  detectEntryPoint(symbol: SymbolInfo, filePath: string): EntryPointMatch | null {
    if (API_ROUTE_PATTERN.test(filePath) && HTTP_METHODS.includes(symbol.name)) {
      return {
        entryType: 'api-route',
        metadata: {
          httpMethod: symbol.name,
          route: extractRoutePath(filePath),
        },
      };
    }

    // Page components (default export)
    if (PAGE_PATTERN.test(filePath) && symbol.name === 'default') {
      return {
        entryType: 'page',
        metadata: {
          route: extractPagePath(filePath),
        },
      };
    }

    // Middleware
    if (MIDDLEWARE_PATTERN.test(filePath) && symbol.name === 'middleware') {
      return {
        entryType: 'middleware',
        metadata: {},
      };
    }

    // Server actions — check for "use server" directive in the file
    if (symbol.kind === 'function' || symbol.kind === 'const') {
      try {
        const content = readFileSync(filePath, 'utf-8');
        const hasUseServer =
          content.trimStart().startsWith("'use server'") ||
          content.trimStart().startsWith('"use server"');
        if (hasUseServer) {
          return {
            entryType: 'server-action',
            metadata: {},
          };
        }
      } catch {
        // File read error, skip
      }
    }

    return null;
  },

  /** Detect `fetch("/api/...")` and `router.push()` calls as runtime connections. */
  detectConnections(symbol: SymbolInfo, _filePath: string): RuntimeConnection[] {
    const connections: RuntimeConnection[] = [];
    const fetchPattern = /fetch\s*\(\s*['"`](\/?api\/[^'"`]+)['"`]/g;
    let match: RegExpExecArray | null;
    match = fetchPattern.exec(symbol.body);
    while (match !== null) {
      connections.push({
        type: 'fetch',
        targetHint: match[1].startsWith('/') ? match[1] : `/${match[1]}`,
        sourceLocation: [symbol.startLine, symbol.endLine],
      });
      match = fetchPattern.exec(symbol.body);
    }

    // Detect router.push("/path") and router.replace("/path")
    const routerPattern = /router\.(push|replace)\s*\(\s*['"`]([^'"`]+)['"`]/g;
    match = routerPattern.exec(symbol.body);
    while (match !== null) {
      connections.push({
        type: 'navigation',
        targetHint: match[2],
        sourceLocation: [symbol.startLine, symbol.endLine],
      });
      match = routerPattern.exec(symbol.body);
    }

    return connections;
  },

  /** Resolve a Next.js runtime connection to a concrete graph edge. Not yet implemented. */
  resolveConnection(
    _connection: RuntimeConnection,
    _projectFiles: string[],
  ): ResolvedConnection | null {
    return null;
  },
};
