import { isExhaustive, type IconNameU } from '@opencx/widget-core';
import {
  AtSignIcon,
  BotIcon,
  BookIcon,
  BookOpenIcon,
  Building2Icon,
  CalendarIcon,
  CreditCardIcon,
  DatabaseIcon,
  FileTextIcon,
  FolderIcon,
  GlobeIcon,
  LinkIcon,
  MailIcon,
  PackageIcon,
  PlugIcon,
  SettingsIcon,
  ShoppingCartIcon,
  TagIcon,
  TicketIcon,
  UserIcon,
  UsersIcon,
  WorkflowIcon,
  ZapIcon,
  CheckCheckIcon,
  CheckIcon,
  CircleCheckBigIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  CircleXIcon,
  ExpandIcon,
  Maximize2Icon,
  MaximizeIcon,
  Minimize2Icon,
  MinimizeIcon,
  ShrinkIcon,
  SquareCheckBigIcon,
  SquareCheckIcon,
  SquareXIcon,
  XIcon,
  type LucideIcon,
} from 'lucide-react';
import React from 'react';
import { cn } from './utils/cn';

const FallbackIcon = CircleDashedIcon;

export function DynamicIcon({
  name,
  className,
}: {
  name: IconNameU | undefined;
  className?: string;
}) {
  const Icon: LucideIcon = (() => {
    switch (name) {
      case 'Check':
        return CheckIcon;
      case 'CheckCheck':
        return CheckCheckIcon;
      case 'CircleCheck':
        return CircleCheckIcon;
      case 'CircleCheckBig':
        return CircleCheckBigIcon;
      case 'CircleX':
        return CircleXIcon;
      case 'Expand':
        return ExpandIcon;
      case 'Maximize':
        return MaximizeIcon;
      case 'Maximize2':
        return Maximize2Icon;
      case 'Minimize':
        return MinimizeIcon;
      case 'Minimize2':
        return Minimize2Icon;
      case 'Shrink':
        return ShrinkIcon;
      case 'SquareCheck':
        return SquareCheckIcon;
      case 'SquareCheckBig':
        return SquareCheckBigIcon;
      case 'SquareX':
        return SquareXIcon;
      case 'X':
        return XIcon;
      case 'AtSign':
        return AtSignIcon;
      case 'Bot':
        return BotIcon;
      case 'Book':
        return BookIcon;
      case 'BookOpen':
        return BookOpenIcon;
      case 'Building2':
        return Building2Icon;
      case 'Calendar':
        return CalendarIcon;
      case 'CreditCard':
        return CreditCardIcon;
      case 'Database':
        return DatabaseIcon;
      case 'FileText':
        return FileTextIcon;
      case 'Folder':
        return FolderIcon;
      case 'Globe':
        return GlobeIcon;
      case 'Link':
        return LinkIcon;
      case 'Mail':
        return MailIcon;
      case 'Package':
        return PackageIcon;
      case 'Plug':
        return PlugIcon;
      case 'Settings':
        return SettingsIcon;
      case 'ShoppingCart':
        return ShoppingCartIcon;
      case 'Tag':
        return TagIcon;
      case 'Ticket':
        return TicketIcon;
      case 'User':
        return UserIcon;
      case 'Users':
        return UsersIcon;
      case 'Workflow':
        return WorkflowIcon;
      case 'Zap':
        return ZapIcon;

      case undefined:
        return FallbackIcon;

      default:
        isExhaustive(name, DynamicIcon.name);
        return FallbackIcon;
    }
  })();

  return <Icon className={cn('size-4', className)} />;
}
