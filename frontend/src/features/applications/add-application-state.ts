/*
 * "Open the add form" as navigation state: `navigate('/applications', { state:
 * addApplicationState })` (the ⌘K palette does this). The Applications page reads it while
 * rendering and clears it when the form closes, so Back doesn't reopen the form.
 */

export const addApplicationState = { addApplication: true } as const;

export function wantsAddApplication(state: unknown): boolean {
  return (
    typeof state === 'object' &&
    state !== null &&
    'addApplication' in state &&
    state.addApplication === true
  );
}
