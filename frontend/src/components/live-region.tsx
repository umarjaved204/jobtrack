/**
 * Visually hidden polite live region. Screen readers announce `message` when it changes;
 * set it to the same text again with a different `id` to repeat an announcement.
 */
function LiveRegion({ message }: { message: { id: number; text: string } | null }) {
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {message && <span key={message.id}>{message.text}</span>}
    </div>
  );
}

export { LiveRegion };
