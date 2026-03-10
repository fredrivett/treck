import { Handle, type NodeProps, Position, useStore } from '@xyflow/react';
import { useGraphExplorer } from './GraphExplorerContext';
import { categoryBadgeVariant, DIMMED_CLASSES, getCategoryColors } from './node-categories';
import { SymbolInfoIcon } from './SymbolTooltip';
import { Badge, type BadgeVariant, variantLabels } from './ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

/** Max width (px) for all graph node shapes — used by ELK layout cap. */
export const NODE_MAX_WIDTH = 160;

/**
 * Display a file path, truncating from the start when it overflows.
 *
 * During measurement, renders as a non-breaking space so the path
 * contributes height but not width to the node sizing.
 * Shows the full path in a native tooltip on hover.
 *
 * @param path - The full file path to display
 * @param measuring - Whether the node is being measured for layout
 */
function FilePath({ path, measuring }: { path: string; measuring?: boolean }) {
  const zoom = useStore((s) => s.transform[2]);
  if (measuring) {
    return <div className="text-[10px] text-muted-foreground mt-0.5">{'\u00A0'}</div>;
  }

  const tooZoomedOut = zoom < 0.5;

  return (
    <Tooltip delayDuration={1000} open={tooZoomedOut ? false : undefined}>
      <TooltipTrigger asChild>
        <div
          className="text-[10px] text-muted-foreground mt-0.5 truncate"
          style={{ direction: 'rtl', textAlign: 'left' }}
        >
          {path}
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom">{path}</TooltipContent>
    </Tooltip>
  );
}

interface NodeData {
  label: string;
  kind: string;
  filePath: string;
  isAsync: boolean;
  entryType?: string;
  metadata?: {
    httpMethod?: string;
    route?: string;
    eventTrigger?: string;
    taskId?: string;
  };
  dimmed?: boolean;
  selected?: boolean;
  hasJsDoc?: boolean;
  measuring?: boolean;
}

const BASE_NODE_CLASSES =
  'h-full flex flex-col justify-center transition-all duration-200 overflow-hidden';

function nodeClass(d: NodeData, ...classes: string[]) {
  return `${BASE_NODE_CLASSES} ${d.isAsync ? 'border-dashed' : ''} ${d.dimmed ? DIMMED_CLASSES : ''} ${classes.join(' ')}`;
}

/** Resolve entry type config from shared category colors. */
function entryTypeConfig(entryType: string) {
  const c = getCategoryColors(entryType);
  return { border: c.border, bg: c.bg, ring: c.ring, handle: c.handle };
}

const entryTypeImpl: Record<string, { label: string; variant: BadgeVariant }> = {
  'inngest-function': { label: 'Inngest', variant: 'inngest' },
  'trigger-task': { label: 'Trigger', variant: 'trigger' },
};

const defaultConfig = {
  border: 'border-gray-400',
  bg: 'bg-gray-50 dark:bg-gray-900',
  ring: 'ring-gray-400/25',
  handle: '#6b7280',
};

function EntryPointNode({ data }: NodeProps) {
  const d = data as unknown as NodeData;
  const ctx = useGraphExplorer();
  const config = d.entryType ? entryTypeConfig(d.entryType) : defaultConfig;
  const badgeVariant = d.entryType ? categoryBadgeVariant[d.entryType] || 'default' : 'default';
  const typeLabel = d.entryType ? variantLabels[badgeVariant] || d.entryType : '';
  const impl = d.entryType ? entryTypeImpl[d.entryType] : undefined;
  const httpMethod = d.metadata?.httpMethod;
  const route = d.metadata?.route;
  const eventTrigger = d.metadata?.eventTrigger;
  const taskId = d.metadata?.taskId;
  return (
    <div
      className={nodeClass(
        d,
        `border-2 ${config.border} rounded-xl px-3.5 py-2.5 ${config.bg} shadow-md`,
        d.selected ? `ring-2 ${config.ring}` : '',
      )}
    >
      <Handle type="target" position={Position.Top} style={{ background: config.handle }} />
      <div className="flex items-center gap-1.5 mb-1">
        <Badge variant={badgeVariant}>{typeLabel}</Badge>
        {impl && <Badge variant={impl.variant}>{impl.label}</Badge>}
        {httpMethod && (
          <Badge variant={(httpMethod.toLowerCase() as BadgeVariant) || 'default'}>
            {httpMethod}
          </Badge>
        )}
        {d.isAsync && <Badge variant="async">async</Badge>}
        {d.hasJsDoc === false && <Badge variant="no-jsdoc">no jsdoc</Badge>}
        {d.measuring ? (
          <span className="inline-flex items-center justify-center w-4 h-4 shrink-0" />
        ) : (
          <SymbolInfoIcon
            name={d.label}
            kind={d.kind}
            entryType={d.entryType}
            symbolIndex={ctx?.symbolIndex}
            compact
          />
        )}
      </div>
      <div className="font-semibold text-[13px] text-foreground">{d.label}</div>
      {(route || eventTrigger || taskId) && (
        <div className="text-[11px] text-muted-foreground mt-0.5">
          {route || eventTrigger || taskId}
        </div>
      )}
      <FilePath path={d.filePath} measuring={d.measuring} />
      <Handle type="source" position={Position.Bottom} style={{ background: config.handle }} />
    </div>
  );
}

function ComponentNode({ data }: NodeProps) {
  const d = data as unknown as NodeData;
  const ctx = useGraphExplorer();
  const c = getCategoryColors('component');

  return (
    <div
      className={nodeClass(
        d,
        `border-[1.5px] rounded-[10px] px-3 py-2 ${c.border} ${c.bg} shadow`,
        d.selected ? `ring-2 ${c.ring}` : '',
      )}
    >
      <Handle type="target" position={Position.Top} style={{ background: c.handle }} />
      <div className="flex items-center gap-1 mb-0.5">
        <Badge variant="component">Component</Badge>
        {d.isAsync && <Badge variant="async">async</Badge>}
        {d.hasJsDoc === false && <Badge variant="no-jsdoc">no jsdoc</Badge>}
        {d.measuring ? (
          <span className="inline-flex items-center justify-center w-4 h-4 shrink-0" />
        ) : (
          <SymbolInfoIcon
            name={d.label}
            kind={d.kind}
            entryType={d.entryType}
            symbolIndex={ctx?.symbolIndex}
            compact
          />
        )}
      </div>
      <div className="font-medium text-[13px] text-foreground">{d.label}</div>
      <FilePath path={d.filePath} measuring={d.measuring} />
      <Handle type="source" position={Position.Bottom} style={{ background: c.handle }} />
    </div>
  );
}

function HookNode({ data }: NodeProps) {
  const d = data as unknown as NodeData;
  const ctx = useGraphExplorer();
  const c = getCategoryColors('hook');

  return (
    <div
      className={nodeClass(
        d,
        `border-[1.5px] rounded-[10px] px-3 py-2 ${c.border} ${c.bg} shadow`,
        d.selected ? `ring-2 ${c.ring}` : '',
      )}
    >
      <Handle type="target" position={Position.Top} style={{ background: c.handle }} />
      <div className="flex items-center gap-1 mb-0.5">
        <Badge variant="hook">Hook</Badge>
        {d.isAsync && <Badge variant="async">async</Badge>}
        {d.hasJsDoc === false && <Badge variant="no-jsdoc">no jsdoc</Badge>}
        {d.measuring ? (
          <span className="inline-flex items-center justify-center w-4 h-4 shrink-0" />
        ) : (
          <SymbolInfoIcon
            name={d.label}
            kind={d.kind}
            entryType={d.entryType}
            symbolIndex={ctx?.symbolIndex}
            compact
          />
        )}
      </div>
      <div className="font-medium text-[13px] text-foreground">{d.label}</div>
      <FilePath path={d.filePath} measuring={d.measuring} />
      <Handle type="source" position={Position.Bottom} style={{ background: c.handle }} />
    </div>
  );
}

/** Angled-corner condition node (hexagonal shape via CSS clip-path on a background layer). */
function ConditionNode({ data }: NodeProps) {
  const d = data as unknown as NodeData;

  return (
    <div
      className={`relative ${d.dimmed ? DIMMED_CLASSES : ''} transition-all duration-200`}
      style={{ minWidth: 80, maxWidth: 300 }}
    >
      <Handle type="target" position={Position.Top} style={{ background: '#eab308' }} />
      {/* Outer shape (border) */}
      <div
        className="absolute inset-0 bg-yellow-500"
        style={{
          clipPath:
            'polygon(12px 0%, calc(100% - 12px) 0%, 100% 50%, calc(100% - 12px) 100%, 12px 100%, 0% 50%)',
        }}
      />
      {/* Inner shape (fill) inset by 2px for border effect */}
      <div
        className="absolute bg-yellow-50 dark:bg-yellow-950/80"
        style={{
          inset: 2,
          clipPath:
            'polygon(11px 0%, calc(100% - 11px) 0%, 100% 50%, calc(100% - 11px) 100%, 11px 100%, 0% 50%)',
        }}
      />
      <div
        className="relative z-10 py-1.5 text-[11px] text-foreground font-medium text-center leading-tight"
        style={{ paddingLeft: 20, paddingRight: 20 }}
      >
        {d.label}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: '#eab308' }} />
    </div>
  );
}

function FunctionNode({ data }: NodeProps) {
  const d = data as unknown as NodeData;
  const ctx = useGraphExplorer();
  const c = getCategoryColors('function');

  return (
    <div
      className={nodeClass(
        d,
        `border rounded-lg px-3 py-2 ${c.border} ${c.bg} shadow`,
        d.selected ? `ring-2 ${c.ring}` : '',
      )}
    >
      <Handle type="target" position={Position.Top} style={{ background: c.handle }} />
      <div className="flex items-center gap-1 mb-0.5">
        <span className="text-[10px] text-muted-foreground">{d.kind}</span>
        {d.isAsync && <Badge variant="async">async</Badge>}
        {d.hasJsDoc === false && <Badge variant="no-jsdoc">no jsdoc</Badge>}
        {d.measuring ? (
          <span className="inline-flex items-center justify-center w-4 h-4 shrink-0" />
        ) : (
          <SymbolInfoIcon
            name={d.label}
            kind={d.kind}
            entryType={d.entryType}
            symbolIndex={ctx?.symbolIndex}
            compact
          />
        )}
      </div>
      <div className="font-medium text-[13px] text-foreground">{d.label}</div>
      <FilePath path={d.filePath} measuring={d.measuring} />
      <Handle type="source" position={Position.Bottom} style={{ background: c.handle }} />
    </div>
  );
}

export const nodeTypes = {
  entryPoint: EntryPointNode,
  componentNode: ComponentNode,
  hookNode: HookNode,
  functionNode: FunctionNode,
  conditionNode: ConditionNode,
};
