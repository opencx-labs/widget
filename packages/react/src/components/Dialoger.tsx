import { AnimatePresence } from 'framer-motion';
import React, {
  cloneElement,
  createContext,
  useContext,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { MotionDiv } from './lib/MotionDiv';
import { cn } from './lib/utils/cn';
import { Button } from './lib/button';
import { X } from 'lucide-react';
import { useWidget } from '@opencx/widget-react-headless';

interface DialogerProviderValue {
  open: (content: React.ReactNode) => void;
  close: () => void;
  isOpen: boolean;
  content: React.ReactNode | null;
}

const context = createContext<DialogerProviderValue | null>(null);

export function DialogerProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [content, setContent] = useState<React.ReactNode | null>(null);

  const openDialog = (content: React.ReactNode) => {
    setContent(content);
    setIsOpen(true);
  };

  const closeDialog = () => {
    setIsOpen(false);
    setTimeout(() => {
      setContent(null);
    }, 200);
  };

  return (
    <context.Provider
      value={{ open: openDialog, close: closeDialog, isOpen, content }}
    >
      <DialogerPortal />
      {children}
    </context.Provider>
  );
}

export function useDialoger(): DialogerProviderValue {
  const dialoger = useContext(context);

  if (!dialoger) {
    console.error('useDialoger must be used within a DialogerProvider');
    return {
      open: () => {},
      close: () => {},
      isOpen: false,
      content: null,
    };
  }

  return dialoger;
}

function DialogerPortal() {
  const { contentIframeRef } = useWidget();
  const { isOpen, content, close } = useDialoger();

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };

    contentIframeRef?.current?.contentWindow?.document.addEventListener(
      'keydown',
      handleEscape,
    );
    return () =>
      contentIframeRef?.current?.contentWindow?.document.removeEventListener(
        'keydown',
        handleEscape,
      );
  }, []);

  return (
    <AnimatePresence mode="wait">
      {isOpen && content && (
        <MotionDiv
          overrides={{
            initial: { y: 0 },
            exit: { y: 0 },
          }}
          key="dialog-content"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          tabIndex={-1}
          onClick={close}
        >
          {content}
        </MotionDiv>
      )}
    </AnimatePresence>
  );
}

export function DialogerContent({
  children,
  className,
  withClose = false,
}: {
  children: React.ReactNode;
  className?: string;
  withClose?: boolean;
}) {
  const { close } = useDialoger();
  return (
    <div
      className={cn(
        'fixed left-[50%] top-[50%] z-50 flex flex-col gap-4 w-full max-w-[61.8%] translate-x-[-50%] translate-y-[-50%] border bg-background p-4 rounded-3xl',
        className,
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
      {withClose && (
        <Button
          size="fit"
          className="rounded-full absolute top-4 right-4 opacity-50 hover:opacity-100"
          onClick={close}
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </Button>
      )}
    </div>
  );
}

export const DialogerHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex flex-col gap-2 text-center pt-2', className)}
    {...props}
  />
);
DialogerHeader.displayName = 'DialogerHeader';

export const DialogerBody = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex flex-col gap-2 text-center', className)}
    {...props}
  />
);
DialogerBody.displayName = 'DialogerBody';

export const DialogerFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col gap-2', className)} {...props} />
);
DialogerFooter.displayName = 'DialogerFooter';

export const DialogerTitle = React.forwardRef<
  React.ElementRef<'p'>,
  React.ComponentPropsWithoutRef<'p'>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn(
      'text-lg font-semibold leading-none tracking-tight',
      className,
    )}
    {...props}
  />
));
DialogerTitle.displayName = 'DialogerTitle';

export const DialogerDescription = React.forwardRef<
  React.ElementRef<'p'>,
  React.ComponentPropsWithoutRef<'p'>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));
DialogerDescription.displayName = 'DialogerDescription';

export function Dialoger({
  children,
  trigger,
}: {
  children: React.ReactNode;
  trigger: React.ReactElement<{ onClick: () => void }>;
}) {
  const { open } = useDialoger();
  const clonedTrigger = cloneElement(trigger, {
    onClick: () => open(children),
  });

  return clonedTrigger;
}
