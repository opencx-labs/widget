import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { MarkInk, PageMark } from './page-mark';

type PageMarksContextValue = {
  marks: readonly PageMark[];
  isArmed: boolean;
  setArmed(armed: boolean): void;
  attach(mark: PageMark, ink: MarkInk): void;
  detach(mark: PageMark): void;
  detachAll(): void;
};

const PageMarksContext = createContext<PageMarksContextValue | null>(null);

/**
 * One page-mark owner per Widget. It sits above shell/composer swaps so marks
 * survive those swaps, but below WidgetProvider so separate Widget instances
 * never share marks or armed state.
 */
export function PageMarksProvider({ children }: { children: React.ReactNode }) {
  const [marks, setMarks] = useState<readonly PageMark[]>([]);
  const [isArmed, setIsArmed] = useState(false);
  const inksRef = useRef(new Map<PageMark, MarkInk>());

  const setArmed = useCallback((armed: boolean) => {
    setIsArmed(armed);
  }, []);

  const attach = useCallback((mark: PageMark, ink: MarkInk) => {
    inksRef.current.set(mark, ink);
    setMarks((current) => [...current, mark]);
  }, []);

  const detach = useCallback((mark: PageMark) => {
    const ink = inksRef.current.get(mark);
    if (ink) {
      inksRef.current.delete(mark);
      ink.undraw();
    }
    setMarks((current) => current.filter((candidate) => candidate !== mark));
  }, []);

  const detachAll = useCallback(() => {
    const inks = Array.from(inksRef.current.values());
    inksRef.current.clear();
    for (const ink of inks) ink.undraw();
    setMarks([]);
  }, []);

  // A Widget unmount is final ownership teardown. Remove synchronously rather
  // than playing exit ink that could outlive the Widget on the host page.
  useEffect(
    () => () => {
      inksRef.current.forEach((ink) => ink.remove());
      inksRef.current.clear();
    },
    [],
  );

  const value = useMemo<PageMarksContextValue>(
    () => ({ marks, isArmed, setArmed, attach, detach, detachAll }),
    [marks, isArmed, setArmed, attach, detach, detachAll],
  );

  return (
    <PageMarksContext.Provider value={value}>
      {children}
    </PageMarksContext.Provider>
  );
}

export function usePageMarks(): PageMarksContextValue {
  const value = useContext(PageMarksContext);
  if (!value) {
    throw new Error('usePageMarks must be used within a PageMarksProvider');
  }
  return value;
}
