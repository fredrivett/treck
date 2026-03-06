/**
 * Next.js framework matcher
 *
 * Detects:
 * - API route handlers (GET, POST, PUT, DELETE, PATCH in app/api/.../route.ts)
 * - Page components (default export in app/.../page.tsx)
 * - Middleware (middleware.ts)
 * - Server actions ("use server" directive)
 */

import type { ImportInfo, SymbolInfo } from '../extractors/types.js';
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

/** Cached route map (route path → file path) for O(1) lookups. */
let cachedRouteMap: Map<string, string> | null = null;
let cachedProjectFiles: string[] | null = null;

/**
 * Get or build a map from route paths to file paths.
 * Cached by reference equality on projectFiles — the graph builder passes
 * the same array for every connection, so this builds the map once per build.
 * @param projectFiles - all source file paths in the project
 */
function getRouteMap(projectFiles: string[]): Map<string, string> {
  if (cachedProjectFiles === projectFiles && cachedRouteMap) {
    return cachedRouteMap;
  }
  cachedRouteMap = new Map();
  for (const f of projectFiles) {
    if (API_ROUTE_PATTERN.test(f)) {
      cachedRouteMap.set(extractRoutePath(f), f);
    }
  }
  cachedProjectFiles = projectFiles;
  return cachedRouteMap;
}

export const nextjsMatcher: FrameworkMatcher = {
  name: 'nextjs',

  /** Detect Next.js API routes, page components, middleware, and server actions. */
  detectEntryPoint(
    symbol: SymbolInfo,
    filePath: string,
    _imports?: ImportInfo[],
  ): EntryPointMatch | null {
    if (API_ROUTE_PATTERN.test(filePath) && HTTP_METHODS.includes(symbol.name)) {
      return {
        entryType: 'api-route',
        metadata: {
          httpMethod: symbol.name,
          route: extractRoutePath(filePath),
        },
      };
    }

    // Page components (default export — check name first, then fullText since the extractor
    // uses the actual function name, not "default", for named default exports)
    if (
      PAGE_PATTERN.test(filePath) &&
      (symbol.name === 'default' || symbol.fullText.trimStart().startsWith('export default'))
    ) {
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

    // Server actions — check for "use server" directive attached by the extractor
    if (
      (symbol.kind === 'function' || symbol.kind === 'const') &&
      symbol.directives?.includes('use server')
    ) {
      return {
        entryType: 'server-action',
        metadata: {},
      };
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
        type: 'fetch',
        targetHint: url,
        sourceLocation: [symbol.startLine, symbol.endLine],
        httpMethod: method,
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
   * For `fetch` connections, finds the matching API route file and targets
   * the handler matching the HTTP method. Navigation connections fall through
   * to the graph builder's metadata-based matching.
   */
  resolveConnection(
    connection: RuntimeConnection,
    projectFiles: string[],
    _projectFileSet?: Set<string>,
  ): ResolvedConnection | null {
    if (connection.type === 'fetch') {
      const routeFile = getRouteMap(projectFiles).get(connection.targetHint) ?? null;
      if (!routeFile) return null;
      return {
        targetName: connection.httpMethod ?? 'GET',
        targetFilePath: routeFile,
        edgeType: 'http-request',
      };
    }

    return null;
  },
};
