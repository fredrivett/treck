import { marked } from 'marked';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { docPathToUrl, escapeHtml, urlToDocPath } from '../docs-utils';
import { MissingJsDocBanner, TrivialSymbolInfo } from './MissingJsDocBanner';
import { Badge, type BadgeVariant, variantLabels } from './ui/badge';

interface DocData {
  name: string;
  sourcePath: string;
  markdown: string;
  treckVersion?: string;
  generated?: string;
  dependencyGraph?: string;
  related?: Array<{ name: string; docPath: string | null }>;
  kind?: string;
  exported?: boolean;
  isAsync?: boolean;
  hasJsDoc?: boolean;
  isTrivial?: boolean;
  deprecated?: string | boolean;
  lineRange?: string;
  entryType?: string;
  httpMethod?: string;
  route?: string;
  eventTrigger?: string;
  taskId?: string;
}

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

export function DocsViewer() {
  const [doc, setDoc] = useState<DocData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();

  const docPath = useMemo(() => urlToDocPath(location.pathname), [location.pathname]);

  useEffect(() => {
    if (!docPath) {
      setDoc(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    fetch(`/api/doc?path=${encodeURIComponent(docPath)}`)
      .then((res) => {
        if (!res.ok) throw new Error('Document not found');
        return res.json();
      })
      .then((data: DocData) => {
        setDoc(data);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, [docPath]);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full font-sans text-muted-foreground gap-2">
        <div className="font-semibold text-base">Document not found</div>
        <div className="text-sm">
          Run <code className="bg-muted px-1.5 rounded">treck sync</code> to generate documentation.
        </div>
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
        <h1>{doc.name}</h1>
        {doc.sourcePath && (
          <div className="source-path">
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
        <div className="doc-meta">
          {metaParts.map((part) => (
            <span key={part}>{part}</span>
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
