import { CircleAlert, CircleCheck, Info } from 'lucide-react';
import { Toaster as SonnerToaster } from 'sonner';

import { useTheme } from '@/lib/theme';

/**
 * App-wide toasts (Sonner), styled with the design tokens and following the chosen theme.
 * Mounted once in AppProviders; call `toast(...)` / `toast.error(...)` from 'sonner'.
 * Sonner renders a labelled region with polite announcements.
 */
function Toaster() {
  const { theme } = useTheme();
  return (
    <SonnerToaster
      theme={theme}
      position="bottom-right"
      containerAriaLabel="Notifications"
      icons={{
        error: <CircleAlert aria-hidden="true" className="size-4 text-destructive" />,
        success: <CircleCheck aria-hidden="true" className="size-4 text-forest" />,
        info: <Info aria-hidden="true" className="size-4 text-cobalt" />,
      }}
      toastOptions={{
        classNames: {
          toast:
            'group !rounded-md !border !border-border !bg-popover !font-sans !text-popover-foreground !shadow-lg',
          title: '!text-sm !font-semibold',
          description: '!text-sm !text-muted-foreground',
          actionButton: '!bg-primary !text-primary-foreground',
        },
      }}
    />
  );
}

export { Toaster };
