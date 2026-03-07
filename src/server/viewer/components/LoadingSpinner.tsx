import { LoadingEllipsis } from './LoadingEllipsis';

/** Full-area centered loading spinner with animated ellipsis text. */
export function LoadingSpinner() {
  return (
    <div className="flex flex-col items-center justify-center h-full w-full font-sans text-muted-foreground gap-3">
      <div className="w-6 h-6 border-[2.5px] border-border border-t-muted-foreground rounded-full animate-spin" />
      <div className="text-sm">
        Loading
        <LoadingEllipsis />
      </div>
    </div>
  );
}
