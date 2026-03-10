import { toast } from 'sonner';

/**
 * Show a persistent toast informing the user that a new version is available.
 * The toast stays on screen until dismissed or the user clicks "Refresh".
 */
export function showUpdateToast(onRefresh) {
  toast('Update available', {
    description: 'A new version of Etendo is ready.',
    duration: Infinity,
    action: {
      label: 'Refresh',
      onClick: onRefresh,
    },
  });
}
