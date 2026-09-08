import React from 'react';

/** The host portal sits outside the iframe stylesheet; reuse Button's Wobble variables there. */
export function CompanionControlStyles() {
  return (
    <style>{`
    [data-companion-action] {
      transition: transform 150ms ease-out, background-color 150ms ease-out, color 150ms ease-out, opacity 100ms ease-out;
    }
    @media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference) {
      [data-companion-action] { transform: translate(var(--wobble-x, 0px), var(--wobble-y, 0px)); }
      [data-companion-action]:hover { transform: translate(var(--wobble-x, 0px), var(--wobble-y, 0px)) scale(var(--scale, .98)); }
      [data-companion-action]:hover:active { transform: translate(var(--wobble-x, 0px), var(--wobble-y, 0px)) scale(calc(var(--scale, .98) - .02)); }
    }
    @media (prefers-reduced-motion: reduce), (pointer: coarse) {
      [data-companion-action] { transform: none !important; transition: none; }
    }
  `}</style>
  );
}
