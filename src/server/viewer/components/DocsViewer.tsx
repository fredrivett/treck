import { marked } from 'marked';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { buildDocResponse } from '../../../graph/symbol-index.js';
import { docPathToUrl, escapeHtml, urlToDocPath } from '../docs-utils';
import { useGraphExplorer } from './GraphExplorerContext';
import { MissingJsDocBanner, TrivialSymbolInfo } from './MissingJsDocBanner';
import { Badge, type BadgeVariant, variantLabels } from './ui/badge';

/** Shape of a resolved doc response. */
type DocData = NonNullable<ReturnType<typeof buildDocResponse>>;

function makeRelatedLinksClickable(
  container: HTMLElement,
  related: DocData['related'],
  navigate: (path: string) => void,
) {
  if (!related || related.length === 0) return;
  const relatedMap = new Map(
    related.filter((r) => r.docPath).map((r) => [r.name, r.docPath as string]),
  );

  container.querySelectorAll('#doc-content code').forEach((codeEl) => {
    const text = codeEl.textContent?.replace(/\(\)$/, '') ?? '';
    const docPath = relatedMap.get(text);
    if (docPath) {
      const link = document.createElement('a');
      link.className = 'related-link';
      const url = docPathToUrl(docPath);
      link.href = url;
      link.textContent = codeEl.textContent ?? '';
      link.addEventListener('click', (e) => {
        e.preventDefault();
        navigate(url);
      });
      codeEl.replaceWith(link);
    }
  });
}

/** Full-page documentation reader, computing docs client-side from graph context. */
export function DocsViewer() {
  const ctx = useGraphExplorer();
  const containerRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();

  const docPath = useMemo(() => urlToDocPath(location.pathname), [location.pathname]);

  // Compute doc data client-side from graph context
  const doc = useMemo<DocData | null>(() => {
    if (!docPath || !ctx) return null;
    return buildDocResponse(docPath, ctx.symbolIndex, ctx.graph);
  }, [docPath, ctx]);

  // Post-process rendered HTML (related links, auto-expand)
  useEffect(() => {
    if (!containerRef.current || !doc) return;
    const container = containerRef.current;

    makeRelatedLinksClickable(container, doc.related, navigate);

    // Auto-expand the Visual Flow details section
    container.querySelectorAll('#doc-content details > summary').forEach((summary) => {
      if (summary.textContent?.trim() === 'Visual Flow') {
        summary.parentElement?.setAttribute('open', '');
      }
    });

    // Scroll to top
    mainRef.current?.scrollTo(0, 0);
  }, [doc, navigate]);

  // Intercept clicks on internal doc links for SPA navigation
  const handleContentClick = useCallback(
    (e: React.MouseEvent) => {
      const link = (e.target as HTMLElement).closest('a[href^="/docs/"]');
      if (!link) return;
      const href = (link as HTMLAnchorElement).getAttribute('href');
      if (!href) return;
      e.preventDefault();
      navigate(href);
    },
    [navigate],
  );

  if (!docPath) {
    return (
      <div className="flex flex-col items-center justify-center h-full font-sans text-muted-foreground gap-2">
        <div className="font-semibold text-base">treck viewer</div>
        <div className="text-sm">Select a symbol from the sidebar to view its documentation.</div>
      </div>
    );
  }

  if (!doc) return null;

  // Build the HTML content (markdown body + dependency graph)
  const renderedMarkdown = marked.parse(doc.markdown, { async: false }) as string;

  let bodyHtml = '';
  if (doc.dependencyGraph) {
    bodyHtml += '<div class="dep-graph">';
    bodyHtml += '<h3>Dependencies</h3>';
    bodyHtml += `<div class="dep-graph-svg">${doc.dependencyGraph}</div>`;
    bodyHtml += '</div>';
  }
  bodyHtml += `<div id="doc-content">${renderedMarkdown}</div>`;

  // Build badges from structured metadata
  const badges: Array<{ variant: BadgeVariant; label: string }> = [];
  if (doc.entryType) {
    const entryMap: Record<string, BadgeVariant> = {
      'api-route': 'api-route',
      page: 'page',
      'inngest-function': 'job',
      'trigger-task': 'job',
      middleware: 'middleware',
      'server-action': 'server-action',
    };
    const variant = entryMap[doc.entryType] ?? 'default';
    badges.push({ variant, label: variantLabels[variant] || doc.entryType });
  }
  if (doc.httpMethod) {
    const methodMap: Record<string, BadgeVariant> = {
      GET: 'get',
      POST: 'post',
      PUT: 'put',
      PATCH: 'patch',
      DELETE: 'delete',
    };
    badges.push({ variant: methodMap[doc.httpMethod] ?? 'default', label: doc.httpMethod });
  }
  if (doc.kind) {
    const kindVariant: BadgeVariant =
      doc.kind === 'component'
        ? 'component'
        : doc.kind === 'function' && /^use[A-Z]/.test(doc.name)
          ? 'hook'
          : 'default';
    badges.push({
      variant: kindVariant,
      label: kindVariant === 'default' ? doc.kind : variantLabels[kindVariant],
    });
  }
  if (doc.exported) badges.push({ variant: 'default', label: 'exported' });
  if (doc.isAsync) badges.push({ variant: 'async', label: 'async' });

  const metaParts: string[] = [];
  metaParts.push(`treck v${doc.treckVersion ? escapeHtml(doc.treckVersion) : ': unknown'}`);
  if (doc.generated) {
    const date = new Date(doc.generated);
    const formatted = `${date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })} ${date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
    metaParts.push(`Generated ${formatted}`);
  }

  return (
    <div ref={mainRef} className="doc-viewer h-full overflow-y-auto">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: click handler delegates to internal doc links */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: links inside rendered HTML are keyboard-accessible */}
      <div
        ref={containerRef}
        className="doc-view px-12 py-8 max-w-[900px]"
        onClick={handleContentClick}
      >
        <h1 className="text-[28px] font-semibold mb-1">{doc.name}</h1>
        {doc.sourcePath && (
          <div className="text-[13px] text-muted-foreground mb-1 font-mono">
            {doc.sourcePath}
            {doc.lineRange && `:${doc.lineRange}`}
          </div>
        )}
        {badges.length > 0 && (
          <div className="flex flex-wrap gap-1 my-3">
            {badges.map((b) => (
              <Badge key={b.label} variant={b.variant}>
                {b.label}
              </Badge>
            ))}
          </div>
        )}
        {doc.deprecated && (
          <div className="rounded border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800 my-3 dark:border-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300">
            <strong>Deprecated</strong>
            {typeof doc.deprecated === 'string' && `: ${doc.deprecated}`}
          </div>
        )}
        {doc.hasJsDoc === false &&
          doc.exported &&
          (doc.isTrivial ? <TrivialSymbolInfo /> : <MissingJsDocBanner />)}
        <div className="text-xs text-muted-foreground mb-4 flex gap-4">
          {metaParts.map((part) => (
            <span key={part} className="whitespace-nowrap">
              {part}
            </span>
          ))}
        </div>
        <div
          // biome-ignore lint/security/noDangerouslySetInnerHtml: rendered from markdown via marked
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />
      </div>
    </div>
  );
}
