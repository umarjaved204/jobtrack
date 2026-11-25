/**
 * Hands a Blob to the browser as a download, the way a link with `download` would. For
 * files that need the access token (a plain link can't send it), fetched with
 * `api.download`. Blob URLs are same-origin, so this works under COEP.
 */
export function saveFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoked later, not straight away: some browsers start reading the URL after click()
  // returns.
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
}

export const REVOKE_AFTER_MS = 30_000;
