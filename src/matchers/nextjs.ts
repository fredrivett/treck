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
import { TypeScriptExtractor } from '../extractors/typescript/index.js';
import type { EdgeType } from '../graph/types.js';
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

/** Cache of file path → whether the file starts with "use server" directive. */
const useServerCache = new Map<string, boolean>();

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

/**
 * Find a route file among project files for a given API route path.
 * Tries `{prefix}/app/{routePath}/route.{ext}` for common prefixes.
 */
function findRouteFile(routePath: string, fileSet: Set<string>): string | null {
  for (const file of fileSet) {
    if (API_ROUTE_PATTERN.test(file) && extractRoutePath(file) === `/${routePath}`) {
      return file;
    }
  }
  return null;
}

/**
 * Find a page file among project files for a given page path.
 * Tries `{prefix}/app/{pagePath}/page.{ext}` for common prefixes.
 */
function findPageFile(pagePath: string, fileSet: Set<string>): string | null {
  for (const file of fileSet) {
    if (PAGE_PATTERN.test(file) && extractPagePath(file) === `/${pagePath}`) {
      return file;
    }
  }
  return null;
}

/**
 * Create a stub SymbolInfo used as a reference pointer for connection resolution.
 * Only the `name` field is meaningful — the graph builder uses it to look up the
 * real node in its nodeMap.
 */
function createStubSymbol(name: string, filePath: string, kind: SymbolInfo['kind']): SymbolInfo {
  return {
    name,
    kind,
    filePath,
    params: '',
    body: '',
    fullText: '',
    startLine: 0,
    endLine: 0,
  };
}

/** Shared extractor instance for resolving connections. */
let sharedExtractor: TypeScriptExtractor | null = null;

/**
 * Resolve a fetch connection to an API route handler symbol.
 * Extracts symbols from the route file and finds the matching HTTP method.
 */
function resolveRouteFile(
  routePath: string,
  fileSet: Set<string>,
  defaultMethod: string,
): ResolvedConnection | null {
  const routeFile = findRouteFile(routePath, fileSet);
  if (!routeFile) return null;

  if (!sharedExtractor) sharedExtractor = new TypeScriptExtractor();
  const { symbols } = sharedExtractor.extractSymbols(routeFile);
  const handler = symbols.find((s) => s.name === defaultMethod);
  if (!handler) return null;

  return {
    targetSymbol: handler,
    targetFilePath: routeFile,
    edgeType: 'http-request',
  };
}

/**
 * Resolve a navigation connection to a page component.
 * Extracts symbols from the page file and finds the default export.
 */
function resolvePageFile(pagePath: string, fileSet: Set<string>): ResolvedConnection | null {
  const pageFile = findPageFile(pagePath, fileSet);
  if (!pageFile) return null;

  if (!sharedExtractor) sharedExtractor = new TypeScriptExtractor();
  const { symbols } = sharedExtractor.extractSymbols(pageFile);
  const pageComponent = symbols.find((s) => s.name === 'default');
  if (!pageComponent) return null;

  return {
    targetSymbol: pageComponent,
    targetFilePath: pageFile,
    edgeType: 'http-request',
  };
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

    // Page components (default export — check fullText since the extractor
    // uses the actual function name, not "default", for named default exports)
    if (PAGE_PATTERN.test(filePath) && symbol.fullText.trimStart().startsWith('export default')) {
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
      let hasUseServer = useServerCache.get(filePath);
      if (hasUseServer === undefined) {
        try {
          const content = readFileSync(filePath, 'utf-8');
          hasUseServer =
            content.trimStart().startsWith("'use server'") ||
            content.trimStart().startsWith('"use server"');
        } catch {
          hasUseServer = false;
        }
        useServerCache.set(filePath, hasUseServer);
      }
      if (hasUseServer) {
        return {
          entryType: 'server-action',
          metadata: {},
        };
      }
    }

    return null;
  },

  /** Detect `fetch("/api/...")` and `router.push()` calls as runtime connections. */
  detectConnections(symbol: SymbolInfo, _filePath: string): RuntimeConnection[] {
    const connections: RuntimeConnection[] = [];
    // Captures the URL (group 1) and optionally the HTTP method from the options
    // object (group 2). The [^}]*? stops at the first `}`, so this works when
    // `method` appears before any nested braces — which covers the common patterns.
    const fetchPattern =
      /fetch\s*\(\s*['"`](\/?api\/[^'"`]+)['"`]\s*(?:,\s*\{[^}]*?method\s*:\s*['"`](\w+)['"`])?/g;
    let match: RegExpExecArray | null;
    match = fetchPattern.exec(symbol.body);
    while (match !== null) {
      const url = match[1].startsWith('/') ? match[1] : `/${match[1]}`;
      const detected = match[2]?.toUpperCase();
      const method = detected && HTTP_METHODS.includes(detected) ? detected : 'GET';

      connections.push({
        type: `fetch:${method}`,
        targetHint: url,
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

  /**
   * Resolve a Next.js runtime connection to a concrete graph edge.
   *
   * For `fetch` connections, finds the matching API route file and uses the
   * detected HTTP method (encoded in type as `fetch:GET`, `fetch:POST`, etc.)
   * to target the correct handler.
   * For `navigation` connections, matches to a page component.
   */
  resolveConnection(
    connection: RuntimeConnection,
    projectFiles: string[],
    projectFileSet?: Set<string>,
  ): ResolvedConnection | null {
    const fileSet = projectFileSet ?? new Set(projectFiles);

    if (connection.type.startsWith('fetch:')) {
      // Match /api/foo/bar to app/api/foo/bar/route.{ts,tsx,js,jsx}
      const routePath = connection.targetHint.replace(/^\//, '');
      const method = connection.type.split(':')[1];
      const routeFile = findRouteFile(routePath, fileSet);
      if (!routeFile) return null;
      return {
        targetSymbol: createStubSymbol(method, routeFile, 'function'),
        targetFilePath: routeFile,
        edgeType: 'http-request' as EdgeType,
      };
    }

    if (connection.type === 'navigation') {
      // Match /dashboard to app/dashboard/page.{ts,tsx,js,jsx}
      const pagePath = connection.targetHint.replace(/^\//, '');
      return resolvePageFile(pagePath, fileSet);
    }

    return null;
  },
};
