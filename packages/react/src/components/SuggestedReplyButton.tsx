import { useMessages } from '@opencx/widget-react-headless';
import React from 'react';
import { dc } from '../utils/data-component.js';
import { Button, type ButtonProps } from './lib/button.js';
import { cn } from './lib/utils/cn.js';

export function SuggestedReplyButton({
  suggestion,
  className,
  onClick,
  ...props
}: ButtonProps & { suggestion: string }) {
  const { sendMessage } = useMessages();

  const handleSend = () => {
    const trimmed = suggestion.trim();
    if (!trimmed) return;
    sendMessage({ content: trimmed });
  };

  return (
    <Button
      {...dc('chat/suggested_reply_btn')}
      size="sm"
      className={cn('rounded-xl w-fit', className)}
      {...props}
      onClick={onClick ?? handleSend}
    >
      {suggestion}
    </Button>
  );
}
