import { FileTextIcon, XIcon } from 'lucide-react';
import React from 'react';
import { cn } from '../components/lib/utils/cn';
import { useTranslation } from '../hooks/useTranslation';
import { dc } from '../utils/data-component';
import { CONTEXT_CHIP_REMOVE } from '../screens/chat/composer-styles';
import type { PageEntity } from './usePageEntity';

/**
 * The composer's page-context pill: the one thing on the host page the
 * visitor is looking at (Linear-style), so they can see what "this" will
 * mean to the agent before they send. Removable for a message that is not
 * about it.
 *
 * Flat, with no surface of its own: it sits in the composer's attached-context
 * tray, and the tray is already a surface. A chip's own background and ring on
 * top of that read as a second card and broke the "one unit" the tray exists
 * to make. Mark pills keep their frame — those carry an image.
 */
export function PageContextPill({
  entity,
  onRemove,
}: {
  entity: PageEntity;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      {...dc('chat/input_box/page_context_pill')}
      className={cn(
        'flex items-center gap-1.5 max-w-full',
        'rounded-full py-0.5 pe-1',
        'text-xs text-foreground',
      )}
      title={`${entity.type}: ${entity.title}`}
    >
      <FileTextIcon className="size-3 shrink-0 text-primary" />
      <span className="truncate max-w-48 font-medium">{entity.title}</span>
      <button
        type="button"
        aria-label={t('page_context_remove')}
        className={CONTEXT_CHIP_REMOVE}
        onClick={onRemove}
      >
        <XIcon className="size-3" />
      </button>
    </div>
  );
}
