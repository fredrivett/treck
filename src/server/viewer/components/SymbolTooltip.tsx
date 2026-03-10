/**
 * Shared rich tooltip content for symbols, used in both the sidebar and graph nodes.
 *
 * Shows the symbol name (colored by category), category badge, async/jsdoc badges,
 * source path with line range, and overview text.
 */

import { Info } from 'lucide-react';
import type { SymbolIndex } from '../../../graph/symbol-index.js';
import {
  categoryBadgeVariant,
  getCategoryColors,
  getCategorySingularLabel,
  getNodeCategory,
} from './node-categories';
import { Badge } from './ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

/** Props for SymbolTooltipContent. */
interface SymbolTooltipContentProps {
  /** Symbol name. */
  name: string;
  /** Kind of symbol (e.g. 'function', 'component'). */
  kind?: string;
  /** Entry type (e.g. 'api-route', 'page'). */
  entryType?: string;
  /** Whether the symbol is trivial (suppresses no-jsdoc badge). */
  isTrivial?: boolean;
  /** Symbol index for looking up full details. */
  symbolIndex?: SymbolIndex;
  /** Doc path for looking up the symbol in the index by path. */
  docPath?: string;
  /** When true, hides name/badges/path (for use inside graph nodes that already show them). */
  compact?: boolean;
}

/** Rich tooltip content for a symbol, showing badges, source path, and overview. */
export function SymbolTooltipContent({
  name,
  kind,
  entryType,
  isTrivial,
  symbolIndex,
  docPath,
  compact,
}: SymbolTooltipContentProps) {
  // Look up entry by docPath first, fall back to byName
  const entry = docPath ? symbolIndex?.entries.get(docPath) : symbolIndex?.byName.get(name)?.[0];
  const category = getNodeCategory({ name, kind, entryType });
  const colors = getCategoryColors(category);

  if (compact) {
    // Only show overview when used inside a graph node
    if (!entry?.overview) return null;
    return (
      <div className="max-w-[280px]">
        <div className="text-[11px] text-foreground leading-relaxed">{entry.overview}</div>
      </div>
    );
  }

  return (
    <div className="max-w-[280px] flex flex-col gap-1">
      <div className="font-semibold text-[13px]" style={{ color: colors.handle }}>
        {name}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <Badge variant={categoryBadgeVariant[category] || 'default'}>
          {getCategorySingularLabel(category)}
        </Badge>
        {entry?.isAsync && <Badge variant="async">async</Badge>}
        {entry?.hasJsDoc === false && !isTrivial && <Badge variant="no-jsdoc">no jsdoc</Badge>}
      </div>
      {entry?.sourcePath && (
        <div className="text-[11px] text-muted-foreground break-all">
          {entry.sourcePath}
          {entry.lineRange ? `:${entry.lineRange}` : ''}
        </div>
      )}
      {entry?.overview && (
        <div className="text-[11px] text-foreground leading-relaxed">{entry.overview}</div>
      )}
    </div>
  );
}

/** Info icon that shows a SymbolTooltipContent tooltip on hover with a delay. */
export function SymbolInfoIcon(props: SymbolTooltipContentProps) {
  const entry = props.docPath
    ? props.symbolIndex?.entries.get(props.docPath)
    : props.symbolIndex?.byName.get(props.name)?.[0];

  // In compact mode, only show when there's an overview to display
  if (props.compact && !entry?.overview) return null;

  const category = getNodeCategory({
    name: props.name,
    kind: props.kind,
    entryType: props.entryType,
  });
  const colors = getCategoryColors(category);
  const tooltipClasses = `${colors.bg} text-foreground border-0 p-3`;

  return (
    <Tooltip delayDuration={1000}>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center justify-center w-4 h-4 cursor-help shrink-0">
          <Info size={10} className="text-muted-foreground" />
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="right"
        className={tooltipClasses}
        arrowClassName={`${colors.bg} fill-transparent`}
        style={{
          filter: `drop-shadow(0 0 1px ${colors.borderHex}) drop-shadow(0 0 1px ${colors.borderHex}) drop-shadow(0 0 1px ${colors.borderHex})`,
        }}
      >
        <SymbolTooltipContent {...props} />
      </TooltipContent>
    </Tooltip>
  );
}
