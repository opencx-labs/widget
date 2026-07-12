import { XIcon } from 'lucide-react';
import React from 'react';
import { cn } from '../components/lib/utils/cn';
import { Tooltippy } from '../components/lib/tooltip';
import { dc } from '../utils/data-component';
import { useTranslation } from '../hooks/useTranslation';
import { FrameIconButton } from './FrameIconButton';
import { LayoutPicker } from './LayoutPicker';
import type { PanelLayout } from './types';

/**
 * Chat-panel corner controls: a single macOS-style layout picker + Close.
 * Overlaid at the panel's top inline-end corner, inside the content iframe —
 * identical in every layout, so the header reads the same as the compact
 * panel. Layout-switching lives entirely in the picker; Close is its own
 * control so the two never read as doing the same thing.
 */
export function PanelControls({
  layout,
  onSelectLayout,
  onClose,
  className,
}: {
  layout: PanelLayout;
  onSelectLayout: (layout: PanelLayout) => void;
  onClose: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div
      {...dc('companion/controls/root')}
      className={cn('absolute top-2 z-10 flex items-center gap-1', className)}
      style={{ insetInlineEnd: 8 }}
    >
      <LayoutPicker current={layout} onSelect={onSelectLayout} />
      <Tooltippy content={t('companion_close')} side="bottom">
        <FrameIconButton
          {...dc('companion/close_btn')}
          label={t('companion_close')}
          title=""
          onClick={onClose}
          className="size-7"
        >
          <XIcon className="size-4" />
        </FrameIconButton>
      </Tooltippy>
    </div>
  );
}
