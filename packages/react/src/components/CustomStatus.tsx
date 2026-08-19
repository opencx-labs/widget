import { type SessionDto } from '@opencx/widget-core';
import React from 'react';
import { svgToMaskUrl } from '../utils/svg-mask-url';
import { Badge } from './lib/badge';
import { cn } from './lib/utils/cn';

export type CustomStatus = NonNullable<SessionDto['customStatus']>;

export function CustomStatusIcon({
  customStatus,
  className,
  dotClassName,
}: {
  customStatus: CustomStatus;
  className?: string;
  dotClassName?: string;
}) {
  const maskUrl = customStatus.icon ? svgToMaskUrl(customStatus.icon) : null;
  const color = customStatus.color || 'currentColor';

  if (maskUrl) {
    return (
      <span
        aria-hidden
        className={cn('size-3.5 shrink-0', className)}
        style={{
          backgroundColor: color,
          // Sized by this element's box, not by the svg's own dimensions
          maskImage: `url("${maskUrl}")`,
          maskSize: 'contain',
          maskRepeat: 'no-repeat',
          maskPosition: 'center',
          WebkitMaskImage: `url("${maskUrl}")`,
          WebkitMaskSize: 'contain',
          WebkitMaskRepeat: 'no-repeat',
          WebkitMaskPosition: 'center',
        }}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn('size-2 shrink-0 rounded-full', dotClassName)}
      style={{ backgroundColor: color }}
    />
  );
}

export function CustomStatusBadge({
  customStatus,
  className,
}: {
  customStatus: CustomStatus;
  className?: string;
}) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        'relative isolate overflow-hidden max-w-full text-primary',
        className,
      )}
      title={customStatus.description || undefined}
      style={
        customStatus.color
          ? {
              // A stronger shade of the status color: darker on light themes,
              // lighter on dark themes. Unsupported browsers fall back to text-primary.
              color: `color-mix(in srgb, ${customStatus.color} 55%, hsl(var(--opencx-foreground)))`,
            }
          : undefined
      }
    >
      {customStatus.color && (
        // A soft uniform wash of the status color over the badge background
        <span
          aria-hidden
          className="absolute inset-0 -z-10 opacity-20"
          style={{ backgroundColor: customStatus.color }}
        />
      )}
      <CustomStatusIcon customStatus={customStatus} />
      <span className="truncate">{customStatus.name}</span>
    </Badge>
  );
}
