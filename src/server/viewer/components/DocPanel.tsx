import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import type { GraphNode } from '../../../graph/types.js';
import { DocContent } from './DocContent';
import {
  SheetOrDrawer,
  SheetOrDrawerBody,
  SheetOrDrawerClose,
  SheetOrDrawerContent,
  SheetOrDrawerDescription,
  SheetOrDrawerFooter,
  SheetOrDrawerHeader,
  SheetOrDrawerTitle,
} from './ui/sheet-or-drawer';

interface DocResponse {
  name: string;
  sourcePath: string;
  markdown: string;
  generated?: string;
  kind?: string;
  exported?: boolean;
  isAsync?: boolean;
  hasJsDoc?: boolean;
  deprecated?: string | boolean;
  lineRange?: string;
  entryType?: string;
  httpMethod?: string;
  route?: string;
  eventTrigger?: string;
  taskId?: string;
}

interface DocPanelProps {
  node: GraphNode | null;
  onClose: () => void;
}

function nodeToDocPath(node: GraphNode): string {
  const withoutExt = node.filePath.replace(/\.[^.]+$/, '');
  return `${withoutExt}/${node.name}.md`;
}

function docPathToUrl(docPath: string): string {
  return `/docs/${docPath.replace(/^\/?src\//, '').replace(/\.md$/, '')}`;
}

export function DocPanel({ node, onClose }: DocPanelProps) {
  const [doc, setDoc] = useState<DocResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!node) {
      setDoc(null);
      return;
    }

    const docPath = nodeToDocPath(node);
    setLoading(true);
    setError(null);

    fetch(`/api/doc?path=${encodeURIComponent(docPath)}`)
      .then((res) => {
        if (!res.ok) throw new Error('Doc not found');
        return res.json();
      })
      .then((data: DocResponse) => {
        setDoc(data);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, [node]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) onClose();
    },
    [onClose],
  );

  const docPath = node ? nodeToDocPath(node) : '';

  return (
    <SheetOrDrawer open={!!node} onOpenChange={handleOpenChange}>
      <SheetOrDrawerContent>
        <SheetOrDrawerHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <SheetOrDrawerTitle>{node?.name ?? ''}</SheetOrDrawerTitle>
            </div>
            <div className="flex items-center gap-1">
              {doc && (
                <button
                  type="button"
                  onClick={() => {
                    navigate(docPathToUrl(docPath));
                    onClose();
                  }}
                  className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="Open full doc"
                >
                  <span className="sr-only">Open full doc</span>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M7 17L17 7" />
                    <path d="M7 7h10v10" />
                  </svg>
                </button>
              )}
              <SheetOrDrawerClose className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M18 6L6 18" />
                  <path d="M6 6l12 12" />
                </svg>
              </SheetOrDrawerClose>
            </div>
          </div>
          <SheetOrDrawerDescription>
            {node?.filePath ?? ''}
            {node ? `:${node.lineRange[0]}-${node.lineRange[1]}` : ''}
          </SheetOrDrawerDescription>
        </SheetOrDrawerHeader>

        <SheetOrDrawerBody>
          {loading && (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>
          )}
          {error && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No documentation found for this symbol.
              <br />
              <span className="text-xs">
                Run <code className="rounded bg-muted px-1 py-0.5">treck sync</code> to generate
                docs.
              </span>
            </div>
          )}
          {doc && (
            <DocContent
              markdown={doc.markdown}
              name={doc.name}
              sourcePath={doc.sourcePath}
              generated={doc.generated}
              kind={doc.kind}
              exported={doc.exported}
              isAsync={doc.isAsync}
              deprecated={doc.deprecated}
              hasJsDoc={doc.hasJsDoc}
              lineRange={doc.lineRange}
              entryType={doc.entryType}
              httpMethod={doc.httpMethod}
              route={doc.route}
              eventTrigger={doc.eventTrigger}
              taskId={doc.taskId}
            />
          )}
        </SheetOrDrawerBody>

        {doc && (
          <SheetOrDrawerFooter>
            <button
              type="button"
              onClick={() => {
                navigate(docPathToUrl(docPath));
                onClose();
              }}
              className="flex items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted w-full"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M7 17L17 7" />
                <path d="M7 7h10v10" />
              </svg>
              Open full documentation
            </button>
          </SheetOrDrawerFooter>
        )}
      </SheetOrDrawerContent>
    </SheetOrDrawer>
  );
}
