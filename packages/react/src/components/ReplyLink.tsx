import React from 'react';
import { WorkspaceDownloadLink } from './WorkspaceDownloadLink';

/** Both text and structured replies use the same private report handler. */
export function ReplyLink({
  href,
  children,
  ...props
}: React.ComponentProps<'a'>) {
  if (href?.includes('/backend/widget/v5/workspace/')) {
    return (
      <WorkspaceDownloadLink href={href} className={props.className}>
        {children}
      </WorkspaceDownloadLink>
    );
  }
  return (
    <a href={href} {...props}>
      {children}
    </a>
  );
}
