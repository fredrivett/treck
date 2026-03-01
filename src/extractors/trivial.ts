/**
 * Triviality detection for function bodies.
 *
 * Determines whether a function body is trivial (just a return, no logic).
 * Used by the graph builder to mark trivial nodes and by JSDoc coverage
 * to exclude trivial symbols from coverage requirements.
 */

/**
 * Check whether a function body is trivial (just a return, no logic).
 *
 * A trivial body contains only a single return statement with no preceding
 * declarations, hooks, control flow, or side effects. Examples: icon components
 * that return JSX, or pass-through wrappers that forward props.
 *
 * @param body - The function body text as produced by the TypeScript extractor
 */
export function isTrivialBody(body: string): boolean {
  const inner = body.replace(/^\{/, '').replace(/\}$/, '').trim();
  if (!inner) return false;
  return /^return\s/s.test(inner);
}
