import { marked } from 'marked';
import { useMemo } from 'react';
import { MissingJsDocBanner } from './MissingJsDocBanner';
import { Badge, type BadgeVariant, variantLabels } from './ui/badge';

interface DocContentProps {
  markdown: string;
  name: string;
  sourcePath: string;
  generated?: string;
  kind?: string;
  exported?: boolean;
  isAsync?: boolean;
  deprecated?: string | boolean;
  lineRange?: string;
  hasJsDoc?: boolean;
  entryType?: string;
  httpMethod?: string;
  route?: string;
  eventTrigger?: string;
  taskId?: string;
}

/** Maps a node kind to a badge variant. */
function kindToVariant(kind: string, name: string): BadgeVariant {
  if (kind === 'component') return 'component';
  if (kind === 'function' && /^use[A-Z]/.test(name)) return 'hook';
  return 'default';
}

/** Maps an entry type to a badge variant. */
function entryTypeToVariant(entryType: string): BadgeVariant {
  const map: Record<string, BadgeVariant> = {
    'api-route': 'api-route',
    page: 'page',
    'inngest-function': 'job',
    'trigger-task': 'job',
    middleware: 'middleware',
    'server-action': 'server-action',
  };
  return map[entryType] ?? 'default';
}

/** Maps an HTTP method to a badge variant. */
function httpMethodToVariant(method: string): BadgeVariant {
  const map: Record<string, BadgeVariant> = {
    GET: 'get',
    POST: 'post',
    PUT: 'put',
    PATCH: 'patch',
    DELETE: 'delete',
  };
  return map[method] ?? 'default';
}

/** Renders doc content with structured badge metadata and parsed markdown body. */
export function DocContent({
  markdown,
  name,
  sourcePath,
  generated,
  kind,
  exported,
  isAsync,
  deprecated,
  hasJsDoc,
  lineRange,
  entryType,
  httpMethod,
}: DocContentProps) {
  const html = useMemo(() => marked.parse(markdown, { async: false }) as string, [markdown]);

  // Build badges from structured metadata
  const badges: Array<{ variant: BadgeVariant; label: string }> = [];

  if (entryType) {
    const variant = entryTypeToVariant(entryType);
    badges.push({ variant, label: variantLabels[variant] || entryType });
  }

  if (httpMethod) {
    const variant = httpMethodToVariant(httpMethod);
    badges.push({ variant, label: httpMethod });
  }

  if (kind) {
    const variant = kindToVariant(kind, name);
    const label = variant === 'default' ? kind : variantLabels[variant];
    badges.push({ variant, label });
  }

  if (exported) {
    badges.push({ variant: 'default', label: 'exported' });
  }

  if (isAsync) {
    badges.push({ variant: 'async', label: 'async' });
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        {sourcePath}
        {lineRange && `:${lineRange}`}
        {generated && ` \u00b7 ${new Date(generated).toLocaleDateString()}`}
      </div>
      {badges.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {badges.map((b) => (
            <Badge key={b.label} variant={b.variant}>
              {b.label}
            </Badge>
          ))}
        </div>
      )}
      {deprecated && (
        <div className="rounded border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800 dark:border-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300">
          <strong>Deprecated</strong>
          {typeof deprecated === 'string' && `: ${deprecated}`}
        </div>
      )}
      {hasJsDoc === false && exported && <MissingJsDocBanner />}
      <div
        className="prose prose-sm max-w-none prose-headings:text-foreground prose-p:text-muted-foreground prose-a:text-blue-600 dark:prose-a:text-blue-400 prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:text-sm prose-code:before:content-none prose-code:after:content-none prose-pre:bg-muted prose-pre:text-sm prose-td:text-sm prose-th:text-sm prose-td:text-muted-foreground prose-th:text-foreground prose-strong:text-foreground prose-li:text-muted-foreground"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: rendered from markdown via marked
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
