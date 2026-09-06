import { icons } from 'lucide';
import type { SafeExtract } from './helpers';

export type IconNameU = SafeExtract<
  keyof typeof icons,
  /* ------------------------- <-> ------------------------ */
  | 'Maximize'
  | 'Maximize2'
  | 'Minimize'
  | 'Minimize2'
  | 'Expand'
  | 'Shrink'
  /* -------------------------- X ------------------------- */
  | 'X'
  | 'SquareX'
  | 'CircleX'
  /* -------------------------- ✅ ------------------------- */
  | 'Check'
  | 'CheckCheck'
  | 'CircleCheck'
  | 'CircleCheckBig'
  | 'SquareCheck'
  | 'SquareCheckBig'
  /* ---------------- things a visitor can @-mention --------------- */
  | 'AtSign'
  | 'Bot'
  | 'Book'
  | 'BookOpen'
  | 'Building2'
  | 'Calendar'
  | 'CreditCard'
  | 'Database'
  | 'FileText'
  | 'Folder'
  | 'Globe'
  | 'Link'
  | 'Mail'
  | 'Package'
  | 'Plug'
  | 'Settings'
  | 'ShoppingCart'
  | 'Tag'
  | 'Ticket'
  | 'User'
  | 'Users'
  | 'Workflow'
  | 'Zap'
>;
