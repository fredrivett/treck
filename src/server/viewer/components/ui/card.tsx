import type * as React from 'react';

import { cn } from '@/lib/utils';

/** Root card container. */
function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card"
      className={cn('rounded-lg border border-border bg-muted text-foreground', className)}
      {...props}
    />
  );
}

/** Card header section. */
function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn('flex flex-col gap-1.5 p-4', className)}
      {...props}
    />
  );
}

/** Card title text. */
function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="card-title" className={cn('text-sm font-semibold', className)} {...props} />
  );
}

/** Card description text. */
function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

/** Card body content wrapper. */
function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('px-4 pb-4', className)} {...props} />;
}

/** Card footer section. */
function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn('flex items-center gap-2 p-4 pt-0', className)}
      {...props}
    />
  );
}

export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
