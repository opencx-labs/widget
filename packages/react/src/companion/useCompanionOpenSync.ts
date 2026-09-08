import { useEffect, useRef } from 'react';

/** Sync shell visibility with the public trigger without treating callback changes as external requests. */
export function useCompanionOpenSync({
  panelOpen,
  isOpen,
  setIsOpen,
  onOpen,
  onClose,
}: {
  panelOpen: boolean;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onOpen: () => void;
  onClose: () => void;
}) {
  const lastPushed = useRef(isOpen);
  const actions = useRef({ onOpen, onClose });
  actions.current = { onOpen, onClose };
  useEffect(() => {
    lastPushed.current = panelOpen;
    setIsOpen(panelOpen);
  }, [panelOpen, setIsOpen]);
  useEffect(() => {
    if (isOpen === lastPushed.current) return;
    lastPushed.current = isOpen;
    if (isOpen) actions.current.onOpen();
    else actions.current.onClose();
    // Changing conversations changes onOpen, but is not an external toggle.
  }, [isOpen]);
}
