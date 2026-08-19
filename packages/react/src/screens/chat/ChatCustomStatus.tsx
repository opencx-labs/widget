import { useSessions } from '@opencx/widget-react-headless';
import { AnimatePresence } from 'framer-motion';
import React from 'react';
import {
  CustomStatusBadge,
  CustomStatusIcon,
} from '../../components/CustomStatus';
import {
  Dialoger,
  DialogerBody,
  DialogerContent,
  DialogerDescription,
  DialogerHeader,
  DialogerTitle,
} from '../../components/Dialoger';
import { Button } from '../../components/lib/button';
import { MotionDiv } from '../../components/lib/MotionDiv';

export function ChatCustomStatus() {
  const {
    sessionState: { session },
  } = useSessions();
  const customStatus = session?.customStatus;

  return (
    <AnimatePresence mode="wait">
      {customStatus && (
        <MotionDiv
          key={customStatus.id}
          className="sticky top-2 z-10 self-center max-w-full"
          snapExit
        >
          <Dialoger
            trigger={
              <Button variant="ghost" size="selfless" className="rounded-full">
                <CustomStatusBadge customStatus={customStatus} />
              </Button>
            }
          >
            <DialogerContent withClose>
              <DialogerHeader>
                <CustomStatusIcon
                  customStatus={customStatus}
                  className="size-8 mx-auto"
                  dotClassName="size-3 mx-auto"
                />
                <DialogerTitle>{customStatus.name}</DialogerTitle>
              </DialogerHeader>
              {customStatus.description && (
                <DialogerBody>
                  <DialogerDescription>
                    {customStatus.description}
                  </DialogerDescription>
                </DialogerBody>
              )}
            </DialogerContent>
          </Dialoger>
        </MotionDiv>
      )}
    </AnimatePresence>
  );
}
