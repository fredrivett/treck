/**
 * Node category definitions: derivation, labels, and colors.
 *
 * Single source of truth for how categories are determined from node/symbol
 * metadata, their display labels, and visual styling. Used across the viewer UI.
 */

/** Node category identifier (entry type or derived kind). */
export type NodeCategory = string;

/** Minimal shape needed to derive a node category. */
interface Categorisable {
  name: string;
  kind?: string;
  entryType?: string;
}

const entryTypeCategoryLabels: Record<string, string> = {
  'api-route': 'API Routes',
  page: 'Pages',
  'inngest-function': 'Inngest Jobs',
  'trigger-task': 'Trigger Tasks',
  middleware: 'Middleware',
  'server-action': 'Server Actions',
};

const nonEntryCategoryLabels: Record<string, string> = {
  component: 'Components',
  hook: 'Hooks',
  function: 'Functions',
};

/**
 * Returns the filter category for a node or symbol.
 *
 * @param node - Any object with name, kind, and optional entryType
 */
export function getNodeCategory(node: Categorisable): NodeCategory {
  if (node.entryType) return node.entryType;
  if (node.kind === 'component') return 'component';
  if (node.kind === 'function' && /^use[A-Z]/.test(node.name)) return 'hook';
  return 'function';
}

/** Returns the human-readable label for a category. */
export function getCategoryLabel(category: NodeCategory): string {
  return entryTypeCategoryLabels[category] || nonEntryCategoryLabels[category] || category;
}

/** Color config for a node category. */
export interface CategoryColors {
  /** Background classes (light + dark). */
  bg: string;
  /** Border color class. */
  border: string;
  /** Text color classes (light + dark). */
  text: string;
  /** Selection ring class. */
  ring: string;
  /** Handle hex color for ReactFlow connection handles. */
  handle: string;
}

/** Color config for each node category. */
export const categoryColors: Record<string, CategoryColors> = {
  component: {
    bg: 'bg-orange-100 dark:bg-orange-950',
    border: 'border-orange-600',
    text: 'text-orange-800 dark:text-orange-200',
    ring: 'ring-orange-500/25',
    handle: '#f97316',
  },
  hook: {
    bg: 'bg-lime-100 dark:bg-lime-950',
    border: 'border-lime-600',
    text: 'text-lime-800 dark:text-lime-200',
    ring: 'ring-lime-500/25',
    handle: '#84cc16',
  },
  function: {
    bg: 'bg-blue-100 dark:bg-blue-950',
    border: 'border-blue-500',
    text: 'text-blue-800 dark:text-blue-200',
    ring: 'ring-blue-500/25',
    handle: '#9ca3af',
  },
  'api-route': {
    bg: 'bg-blue-100 dark:bg-blue-950',
    border: 'border-blue-500',
    text: 'text-blue-800 dark:text-blue-200',
    ring: 'ring-blue-500/25',
    handle: '#3b82f6',
  },
  page: {
    bg: 'bg-violet-100 dark:bg-violet-950',
    border: 'border-violet-500',
    text: 'text-violet-800 dark:text-violet-200',
    ring: 'ring-violet-500/25',
    handle: '#8b5cf6',
  },
  'inngest-function': {
    bg: 'bg-pink-100 dark:bg-pink-950',
    border: 'border-pink-500',
    text: 'text-pink-800 dark:text-pink-200',
    ring: 'ring-pink-500/25',
    handle: '#ec4899',
  },
  'trigger-task': {
    bg: 'bg-pink-100 dark:bg-pink-950',
    border: 'border-pink-500',
    text: 'text-pink-800 dark:text-pink-200',
    ring: 'ring-pink-500/25',
    handle: '#ec4899',
  },
  'trigger-scheduled-task': {
    bg: 'bg-pink-100 dark:bg-pink-950',
    border: 'border-pink-500',
    text: 'text-pink-800 dark:text-pink-200',
    ring: 'ring-pink-500/25',
    handle: '#ec4899',
  },
  middleware: {
    bg: 'bg-cyan-100 dark:bg-cyan-950',
    border: 'border-cyan-500',
    text: 'text-cyan-800 dark:text-cyan-200',
    ring: 'ring-cyan-500/25',
    handle: '#06b6d4',
  },
  'server-action': {
    bg: 'bg-emerald-100 dark:bg-emerald-950',
    border: 'border-emerald-500',
    text: 'text-emerald-800 dark:text-emerald-200',
    ring: 'ring-emerald-500/25',
    handle: '#10b981',
  },
};

/** Tailwind classes applied to inactive (dimmed) nodes and badges. */
export const DIMMED_CLASSES = 'opacity-50';

/** Default colors when category is unknown. */
const defaultColors = categoryColors.function;

/**
 * Get the color config for a node category.
 *
 * @param category - The node category from `getNodeCategory`
 */
export function getCategoryColors(category: string): CategoryColors {
  return categoryColors[category] ?? defaultColors;
}

/**
 * Get interactive badge classes for a node category.
 *
 * Combines bg, text, and hover classes. Consumers should add `border-0`
 * to suppress the border when used as pill badges.
 *
 * @param category - The node category from `getNodeCategory`
 */
export function categoryBadgeClasses(category: NodeCategory): string {
  const c = getCategoryColors(category);
  return `${c.bg} ${c.border} ${c.text}`;
}
