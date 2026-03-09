/**
 * Shared color definitions for node categories.
 *
 * Maps each node category to Tailwind classes for interactive badges.
 * Used by ActiveChat.tsx (chat badges) and can be referenced by
 * NodeTypes.tsx to keep colors consistent.
 */

import type { NodeCategory } from './FlowGraph';

/** Interactive badge classes (bg, text, hover) for each node category. */
const categoryBadgeMap: Record<string, string> = {
  component:
    'bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200 hover:bg-orange-200 dark:hover:bg-orange-800',
  hook: 'bg-lime-100 dark:bg-lime-900 text-lime-800 dark:text-lime-200 hover:bg-lime-200 dark:hover:bg-lime-800',
  function:
    'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 hover:bg-blue-200 dark:hover:bg-blue-800',
  'api-route':
    'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 hover:bg-blue-200 dark:hover:bg-blue-800',
  page: 'bg-violet-100 dark:bg-violet-900 text-violet-800 dark:text-violet-200 hover:bg-violet-200 dark:hover:bg-violet-800',
  'inngest-function':
    'bg-pink-100 dark:bg-pink-900 text-pink-800 dark:text-pink-200 hover:bg-pink-200 dark:hover:bg-pink-800',
  'trigger-task':
    'bg-pink-100 dark:bg-pink-900 text-pink-800 dark:text-pink-200 hover:bg-pink-200 dark:hover:bg-pink-800',
  'trigger-scheduled-task':
    'bg-pink-100 dark:bg-pink-900 text-pink-800 dark:text-pink-200 hover:bg-pink-200 dark:hover:bg-pink-800',
  middleware:
    'bg-cyan-100 dark:bg-cyan-900 text-cyan-800 dark:text-cyan-200 hover:bg-cyan-200 dark:hover:bg-cyan-800',
  'server-action':
    'bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-200 dark:hover:bg-emerald-800',
};

/** Default badge classes when category is unknown. */
const defaultBadgeClasses =
  'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 hover:bg-blue-200 dark:hover:bg-blue-800';

/**
 * Get interactive badge classes for a node category.
 *
 * Returns pill-style classes with light/dark mode backgrounds, text colors,
 * and hover states suitable for clickable chat badges.
 *
 * @param category - The node category from `getNodeCategory`
 */
export function categoryBadgeClasses(category: NodeCategory): string {
  return categoryBadgeMap[category] ?? defaultBadgeClasses;
}
