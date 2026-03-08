import type * as React from 'react';
import { useMediaQuery } from 'usehooks-ts';
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './dialog';
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from './drawer';

interface DialogOrDrawerProps {
  children?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/** Renders a Dialog on md+ screens, Drawer on mobile. */
function DialogOrDrawer({ children, ...props }: DialogOrDrawerProps) {
  const isDesktop = useMediaQuery('(min-width: 768px)', {
    defaultValue: true,
    initializeWithValue: false,
  });

  if (isDesktop) {
    return <Dialog {...props}>{children}</Dialog>;
  }

  return <Drawer {...props}>{children}</Drawer>;
}

/** Content wrapper — Dialog on md+, Drawer on mobile. */
function DialogOrDrawerContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogContent>) {
  const isDesktop = useMediaQuery('(min-width: 768px)', {
    defaultValue: true,
    initializeWithValue: false,
  });

  if (isDesktop) {
    return (
      <DialogContent className={className} {...props}>
        {children}
      </DialogContent>
    );
  }

  return (
    <DrawerContent className={className} {...props}>
      {children}
    </DrawerContent>
  );
}

/** Header — Dialog on md+, Drawer on mobile. */
function DialogOrDrawerHeader({ className, ...props }: React.ComponentProps<'div'>) {
  const isDesktop = useMediaQuery('(min-width: 768px)', {
    defaultValue: true,
    initializeWithValue: false,
  });

  if (isDesktop) {
    return <DialogHeader className={className} {...props} />;
  }

  return <DrawerHeader className={className} {...props} />;
}

/** Body — scrollable content area. */
function DialogOrDrawerBody({ className, ...props }: React.ComponentProps<'div'>) {
  const isDesktop = useMediaQuery('(min-width: 768px)', {
    defaultValue: true,
    initializeWithValue: false,
  });

  if (isDesktop) {
    return <DialogBody className={className} {...props} />;
  }

  return <DrawerBody className={className} {...props} />;
}

/** Title — Dialog on md+, Drawer on mobile. */
function DialogOrDrawerTitle({ className, ...props }: React.ComponentProps<typeof DialogTitle>) {
  const isDesktop = useMediaQuery('(min-width: 768px)', {
    defaultValue: true,
    initializeWithValue: false,
  });

  if (isDesktop) {
    return <DialogTitle className={className} {...props} />;
  }

  return <DrawerTitle className={className} {...props} />;
}

/** Description — Dialog on md+, Drawer on mobile. */
function DialogOrDrawerDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogDescription>) {
  const isDesktop = useMediaQuery('(min-width: 768px)', {
    defaultValue: true,
    initializeWithValue: false,
  });

  if (isDesktop) {
    return <DialogDescription className={className} {...props} />;
  }

  return <DrawerDescription className={className} {...props} />;
}

/** Close button — Dialog on md+, Drawer on mobile. */
function DialogOrDrawerClose({ className, ...props }: React.ComponentProps<typeof DialogClose>) {
  const isDesktop = useMediaQuery('(min-width: 768px)', {
    defaultValue: true,
    initializeWithValue: false,
  });

  if (isDesktop) {
    return <DialogClose className={className} {...props} />;
  }

  return <DrawerClose className={className} {...props} />;
}

export {
  DialogOrDrawer,
  DialogOrDrawerBody,
  DialogOrDrawerClose,
  DialogOrDrawerContent,
  DialogOrDrawerDescription,
  DialogOrDrawerHeader,
  DialogOrDrawerTitle,
};
