/**
 * Animated ellipsis dots that cycle through opacity states,
 * used as a replacement for static "..." in loading text.
 */
export function LoadingEllipsis() {
  return (
    <span>
      <span className="loading-dot loading-dot-1">.</span>
      <span className="loading-dot loading-dot-2">.</span>
      <span className="loading-dot loading-dot-3">.</span>
    </span>
  );
}
