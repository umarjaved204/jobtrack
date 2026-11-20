import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { MODEL_DOWNLOAD_MB } from './embedding/model-cache';

/**
 * Asked once, before the first match downloads the model (ADR 0004: "the page says so
 * before downloading"). Not asked when the model is already in the browser's cache.
 */
function ModelConsentDialog({
  open,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Download the match model?</DialogTitle>
          <DialogDescription>
            The first match downloads a language model of about {MODEL_DOWNLOAD_MB} MB. Your browser
            keeps it, so later matches start straight away.
          </DialogDescription>
        </DialogHeader>
        <ul className="grid list-disc gap-2 pl-5 text-sm text-muted-foreground">
          <li>
            The model runs on this device: the texts are compared here, and nothing is sent to any
            other company.
          </li>
          <li>On a phone or a metered connection, you may prefer to wait for Wi-Fi.</li>
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Not now
          </Button>
          <Button onClick={onConfirm}>Download and match</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { ModelConsentDialog };
