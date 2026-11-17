import {
  CalendarDays,
  FileText,
  LayoutDashboard,
  type LucideIcon,
  Settings,
  Sparkles,
  SquareKanban,
} from 'lucide-react';

export type NavItem = { to: string; label: string; icon: LucideIcon };

/** Masthead sections, in display order. */
export const navItems: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/applications', label: 'Applications', icon: SquareKanban },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/resumes', label: 'Resumes', icon: FileText },
  { to: '/match', label: 'Match', icon: Sparkles },
  { to: '/settings', label: 'Settings', icon: Settings },
];
