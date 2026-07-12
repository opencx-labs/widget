import React from 'react';
import { CompanionFaceIcon } from './CompanionFaceIcon';

/**
 * The companion's identity mark: the embedder's icon when configured
 * (companion.icon, falling back to their existing trigger icon), the
 * animated face otherwise. Inline-styled so it renders identically in the
 * host DOM (pill, dock) and inside the content iframe (input bar).
 */
export function CompanionIcon({
  icon,
  pillBackground,
  size,
  style,
}: {
  icon: string | undefined;
  pillBackground: string;
  size: number;
  style?: React.CSSProperties;
}) {
  if (icon) {
    return (
      <img
        src={icon}
        alt=""
        style={{
          width: size,
          height: size,
          objectFit: 'cover',
          borderRadius: 999,
          flexShrink: 0,
          ...style,
        }}
      />
    );
  }
  return (
    <CompanionFaceIcon
      size={size}
      headColor={pillBackground}
      eyeColor="hsl(var(--opencx-primary-foreground))"
    />
  );
}
