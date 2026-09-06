import type { Agent } from '@opencx/widget-core';
import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from './lib/avatar';
import type { AvatarProps } from '@radix-ui/react-avatar';

export function AgentAvatar({
  agent,
  ...props
}: AvatarProps & {
  agent: Agent | undefined;
}) {
  return (
    <Avatar {...props}>
      <AvatarImage
        src={agent?.avatarUrl || agent?.avatar || ''}
        alt="Agent Icon"
      />
      {agent?.name && (
        <AvatarFallback>
          {agent?.name?.slice(0, 1)?.toUpperCase()}
        </AvatarFallback>
      )}
    </Avatar>
  );
}
