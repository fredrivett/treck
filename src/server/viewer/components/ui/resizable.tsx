/**
 * Resizable panel primitives built on react-resizable-panels.
 *
 * Provides ResizablePanelGroup, ResizablePanel, and ResizableHandle
 * for creating drag-to-resize layouts with optional localStorage persistence.
 */

import { type ComponentProps, forwardRef } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';

import { cn } from '@/lib/utils';

/** Container that groups resizable panels in a horizontal or vertical layout. */
function ResizablePanelGroup({ className, ...props }: ComponentProps<typeof Group>) {
  return (
    <Group
      className={cn('flex h-full w-full data-[direction=vertical]:flex-col', className)}
      {...props}
    />
  );
}

/** Individual resizable panel within a group. */
const ResizablePanel = Panel;

/** Drag handle between two resizable panels. */
const ResizableHandle = forwardRef<HTMLDivElement, ComponentProps<typeof Separator>>(
  ({ className, ...props }, ref) => (
    <Separator
      className={cn(
        'relative flex w-px items-center justify-center bg-border after:absolute after:inset-y-0 after:-left-1 after:-right-1 after:content-[""] after:transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 data-[direction=vertical]:h-px data-[direction=vertical]:w-full data-[direction=vertical]:after:left-0 data-[direction=vertical]:after:right-0 data-[direction=vertical]:after:-top-1 data-[direction=vertical]:after:-bottom-1 data-[separator=hover]:after:bg-border data-[separator=active]:after:bg-primary/20',
        className,
      )}
      {...props}
    />
  ),
);
ResizableHandle.displayName = 'ResizableHandle';

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
