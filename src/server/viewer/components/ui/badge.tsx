import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import type * as React from 'react';

import { cn } from '@/lib/utils';

type BadgeVariant =
  // Entry point solid badges
  | 'api-route'
  | 'page'
  | 'job'
  | 'server-action'
  | 'middleware'
  // HTTP method solid badges
  | 'get'
  | 'post'
  | 'put'
  | 'patch'
  | 'delete'
  // Implementation solid badges
  | 'inngest'
  | 'trigger'
  // Mid-tier soft badges
  | 'component'
  | 'hook'
  | 'async'
  | 'no-jsdoc'
  | 'default';

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold transition-colors',
  {
    variants: {
      variant: {
        // Solid entry point badges
        'api-route': 'border-transparent bg-blue-500 text-white uppercase tracking-wide font-bold',
        page: 'border-transparent bg-violet-500 text-white uppercase tracking-wide font-bold',
        job: 'border-transparent bg-pink-500 text-white uppercase tracking-wide font-bold',
        'server-action':
          'border-transparent bg-emerald-500 text-white uppercase tracking-wide font-bold',
        middleware: 'border-transparent bg-cyan-500 text-white uppercase tracking-wide font-bold',
        // Solid HTTP method badges
        get: 'border-transparent bg-green-500 text-white',
        post: 'border-transparent bg-blue-500 text-white',
        put: 'border-transparent bg-amber-500 text-white',
        patch: 'border-transparent bg-amber-500 text-white',
        delete: 'border-transparent bg-red-500 text-white',
        // Solid implementation badges
        inngest: 'border-transparent bg-pink-500 text-white',
        trigger: 'border-transparent bg-pink-500 text-white',
        // Soft mid-tier badges
        component:
          'border-transparent bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
        hook: 'border-transparent bg-lime-100 text-lime-700 dark:bg-lime-900/30 dark:text-lime-300',
        async: 'border-transparent bg-muted text-muted-foreground',
        'no-jsdoc':
          'border-transparent bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300',
        default: 'border-transparent bg-muted text-muted-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

/** Default display labels for each badge variant. */
const variantLabels: Record<BadgeVariant, string> = {
  'api-route': 'API',
  page: 'Page',
  job: 'Job',
  'server-action': 'Action',
  middleware: 'Middleware',
  get: 'GET',
  post: 'POST',
  put: 'PUT',
  patch: 'PATCH',
  delete: 'DELETE',
  inngest: 'Inngest',
  trigger: 'Trigger',
  component: 'Component',
  hook: 'Hook',
  async: 'async',
  'no-jsdoc': 'no jsdoc',
  default: '',
};

interface BadgeProps extends React.ComponentProps<'span'> {
  variant?: BadgeVariant;
  asChild?: boolean;
}

/** Renders a styled badge component. */
function Badge({ className, variant, asChild = false, ...props }: BadgeProps) {
  const Comp = asChild ? Slot : 'span';
  return (
    <Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants, variantLabels };
export type { BadgeVariant };
