/**
 * HTTP server for the treck documentation viewer.
 *
 * Serves the single-page React viewer app, a JSON API for the symbol index
 * and individual doc pages, and the raw graph data. Watches graph.json for
 * changes and rebuilds the index automatically.
 */

import { existsSync, readFileSync, watch } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GraphStore } from '../graph/graph-store.js';
import type { FlowGraph } from '../graph/types.js';
import { handleChatRequest } from './chat.js';
import {
  buildDocResponseWithSVG,
  buildIndexResponse,
  buildSymbolIndexFromGraph,
  type SymbolIndex,
} from './symbol-index.js';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
};

/**
 * Serve a static file with the appropriate Content-Type header.
 *
 * @param filePath - Absolute path to the file
 * @param res - HTTP response object
 * @returns `true` if the file was served, `false` if it doesn't exist
 */
function serveStaticFile(filePath: string, res: import('node:http').ServerResponse): boolean {
  if (!existsSync(filePath)) return false;
  const ext = extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const content = readFileSync(filePath);
  res.writeHead(200, { 'Content-Type': contentType });
  res.end(content);
  return true;
}

/**
 * Start the treck documentation viewer HTTP server.
 *
 * Serves the single-page viewer app, a JSON API for the symbol index and
 * individual doc pages, and the graph data. Watches graph.json for changes
 * and rebuilds the index automatically.
 *
 * If the requested port is taken, retries up to 10 consecutive ports.
 *
 * @param outputDir - Path to the treck output directory (e.g. `_treck`)
 * @param port - Preferred port number to listen on
 * @returns The running server instance and the URL it's listening on
 * @throws If no available port is found after 10 attempts
 */
export async function startServer(outputDir: string, port: number) {
  const graphStore = new GraphStore(outputDir);
  let graph = graphStore.read();
  let index: SymbolIndex = graph
    ? buildSymbolIndexFromGraph(graph)
    : { entries: new Map(), byName: new Map() };

  // Watch output directory for graph.json changes and rebuild index
  const absOutputDir = resolve(process.cwd(), outputDir);
  let rebuildTimer: ReturnType<typeof setTimeout> | null = null;
  try {
    watch(absOutputDir, { recursive: true }, (_event, filename) => {
      if (filename !== 'graph.json') return;
      if (rebuildTimer) clearTimeout(rebuildTimer);
      rebuildTimer = setTimeout(() => {
        graph = graphStore.read();
        if (graph) {
          index = buildSymbolIndexFromGraph(graph);
        }
      }, 500);
    });
  } catch {
    // Directory may not exist yet
  }

  // Resolve viewer-dist directory (relative to this file's location in dist/)
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const viewerDistDir = resolve(__dirname, 'viewer-dist');

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`);

    // Serve graph API
    if (url.pathname === '/api/graph') {
      if (!graph) {
        res.writeHead(404, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(JSON.stringify({ error: 'Graph not found. Run: treck sync' }));
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(JSON.stringify(graph));
      return;
    }

    if (url.pathname === '/api/index') {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(JSON.stringify(buildIndexResponse(index)));
      return;
    }

    // CORS preflight for POST endpoints
    if (req.method === 'OPTIONS' && url.pathname === '/api/chat') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return;
    }

    if (url.pathname === '/api/chat' && req.method === 'POST') {
      if (!graph) {
        res.writeHead(404, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(JSON.stringify({ error: 'Graph not found. Run: treck sync' }));
        return;
      }
      handleChatRequest(req, res, graph);
      return;
    }

    if (url.pathname === '/api/doc') {
      const docPath = url.searchParams.get('path');
      if (!docPath) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing path parameter' }));
        return;
      }

      if (!graph) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Graph not found. Run: treck sync' }));
        return;
      }

      const doc = buildDocResponseWithSVG(decodeURIComponent(docPath), index, graph);
      if (!doc) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Document not found' }));
        return;
      }

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(JSON.stringify(doc));
      return;
    }

    // Serve viewer assets (JS, CSS, etc.)
    if (url.pathname.startsWith('/assets/')) {
      const assetPath = resolve(viewerDistDir, url.pathname.slice(1));
      // Prevent path traversal — ensure the resolved path stays within viewerDistDir
      if (assetPath.startsWith(`${viewerDistDir}/`) && serveStaticFile(assetPath, res)) return;
    }

    // Serve viewer (SPA fallback) at root
    const indexPath = resolve(viewerDistDir, 'index.html');
    if (serveStaticFile(indexPath, res)) return;

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  });

  const maxRetries = 10;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const tryPort = port + attempt;
    try {
      const result = await new Promise<{
        server: typeof server;
        url: string;
        graph: FlowGraph | null;
      }>((resolve, reject) => {
        server.once('error', reject);
        server.listen(tryPort, () => {
          server.removeListener('error', reject);
          resolve({ server, url: `http://localhost:${tryPort}`, graph });
        });
      });
      return result;
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && err.code === 'EADDRINUSE') {
        continue;
      }
      throw err;
    }
  }
  throw new Error(`No available port found (tried ${port}-${port + maxRetries - 1})`);
}
