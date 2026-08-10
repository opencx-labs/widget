import React, { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Minimal same-origin iframe portal used by companion mode instead of
 * @uiw/react-iframe. That library recreates its internal iframe callback
 * ref on every render; React 19 re-attaches changed refs each commit, and
 * the attach calls setState — under companion's re-render frequency this
 * spirals into "Maximum update depth exceeded" (setState in refContent via
 * commitAttachRef). Here the ref callback is stable (useCallback, no deps),
 * so it runs exactly once per DOM node lifecycle and cannot loop.
 */
export function CompanionFrame({
  initialContent,
  title,
  style,
  iframeRef,
  children,
}: {
  /** Full HTML document written once into the frame (styles in <head>) */
  initialContent: string;
  title: string;
  style: React.CSSProperties;
  /** Receives the iframe element (shared widget contentIframeRef) */
  iframeRef?: React.MutableRefObject<HTMLIFrameElement | null>;
  children: React.ReactNode;
}) {
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);

  const handleRef = useCallback(
    (node: HTMLIFrameElement | null) => {
      if (iframeRef) iframeRef.current = node;
      if (!node) {
        // NO setState here. Detach runs inside React's deletion commit; a
        // setState there feeds the nested-update counter and, under remount
        // storms (HMR, error-boundary retries), stacks into "Maximum update
        // depth exceeded". It's also useless: on unmount the state dies with
        // the component, and on node replacement the attach call right after
        // sets the new mount node anyway.
        return;
      }
      const doc = node.contentDocument;
      if (!doc) return;
      doc.open();
      doc.write(initialContent);
      doc.close();
      setMountNode(doc.body);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [], // stability is the point — see component docblock
  );

  return (
    <>
      <iframe ref={handleRef} title={title} style={style} allowFullScreen />
      {mountNode && createPortal(children, mountNode)}
    </>
  );
}
